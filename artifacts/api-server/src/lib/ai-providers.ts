import { Buffer } from "node:buffer";
import { z } from "zod";

export type AiProviderName = "gemini" | "groq" | "xai";

export type AiProviderFailureReason =
  | "timeout"
  | "rate_limited"
  | "invalid_credentials"
  | "provider_unavailable"
  | "provider_rejected"
  | "invalid_response"
  | "network_error";

export interface AiProviderFailure {
  provider: AiProviderName;
  reason: AiProviderFailureReason;
  statusCode?: number;
}

export interface AiProviderRuntimeOptions {
  env?: NodeJS.ProcessEnv;
  fetcher?: typeof fetch;
  providerTimeoutMs?: number;
  overallDeadlineMs?: number;
  onProviderFailure?: (failure: AiProviderFailure) => void;
}

export interface AiProviderResult<T> {
  provider: AiProviderName;
  value: T;
}

interface ProviderAttempt {
  name: AiProviderName;
  request: (signal: AbortSignal) => Promise<string>;
}

const DEFAULT_PROVIDER_TIMEOUT_MS = 5_500;
const DEFAULT_OVERALL_DEADLINE_MS = 15_000;
const GEMINI_DEFAULT_MODEL = "gemini-3.8-flash";
const GROQ_DEFAULT_CHAT_MODEL = "openai/gpt-oss-20b";
const GROQ_DEFAULT_TRANSCRIPTION_MODEL = "whisper-large-v3-turbo";
const XAI_DEFAULT_CHAT_MODEL = "grok-4.7";
const GEMINI_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models";
const GROQ_CHAT_ENDPOINT =
  "https://api.groq.com/openai/v1/chat/completions";
const GROQ_TRANSCRIPTION_ENDPOINT =
  "https://api.groq.com/openai/v1/audio/transcriptions";
const XAI_CHAT_ENDPOINT = "https://api.x.ai/v1/chat/completions";

class ProviderHttpError extends Error {
  constructor(readonly statusCode: number) {
    super("AI provider returned an unsuccessful HTTP status.");
    this.name = "ProviderHttpError";
  }
}

class ProviderTimeoutError extends Error {
  constructor() {
    super("AI provider request timed out.");
    this.name = "ProviderTimeoutError";
  }
}

class InvalidProviderResponseError extends Error {
  constructor() {
    super("AI provider returned an unusable response.");
    this.name = "InvalidProviderResponseError";
  }
}

export class AiProvidersUnavailableError extends Error {
  constructor(readonly failures: readonly AiProviderFailure[]) {
    super("All configured AI providers failed.");
    this.name = "AiProvidersUnavailableError";
  }
}

function configuredKey(value: string | undefined) {
  return value?.trim() ?? "";
}

function objectOf(value: unknown): Record<string, unknown> | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

async function readJsonResponse(response: Response): Promise<unknown> {
  if (!response.ok) throw new ProviderHttpError(response.status);
  try {
    return await response.json();
  } catch {
    throw new InvalidProviderResponseError();
  }
}

function geminiText(response: unknown): string {
  const candidates = objectOf(response)?.candidates;
  const firstCandidate = Array.isArray(candidates)
    ? objectOf(candidates[0])
    : undefined;
  const parts = objectOf(firstCandidate?.content)?.parts;
  const text = Array.isArray(parts)
    ? parts
      .map((part) => objectOf(part)?.text)
      .filter((part): part is string => typeof part === "string")
      .join("")
    : "";
  if (!text.trim()) throw new InvalidProviderResponseError();
  return text;
}

function chatCompletionText(response: unknown): string {
  const choices = objectOf(response)?.choices;
  const firstChoice = Array.isArray(choices)
    ? objectOf(choices[0])
    : undefined;
  const message = objectOf(firstChoice?.message);
  const content = message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new InvalidProviderResponseError();
  }
  return content;
}

function transcriptionText(response: unknown): string {
  const text = objectOf(response)?.text;
  if (typeof text !== "string" || !text.trim()) {
    throw new InvalidProviderResponseError();
  }
  return text;
}

async function requestGemini(
  apiKey: string,
  model: string,
  contents: unknown[],
  fetcher: typeof fetch,
  signal: AbortSignal,
  options: { systemInstruction?: string; jsonResponse?: boolean; maxOutputTokens: number },
): Promise<string> {
  const response = await fetcher(
    `${GEMINI_ENDPOINT}/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        ...(options.systemInstruction
          ? { systemInstruction: { parts: [{ text: options.systemInstruction }] } }
          : {}),
        contents,
        generationConfig: {
          ...(options.jsonResponse ? { responseMimeType: "application/json" } : {}),
          maxOutputTokens: options.maxOutputTokens,
          temperature: 0.2,
        },
      }),
      signal,
    },
  );
  return geminiText(await readJsonResponse(response));
}

function makeGeminiTextAttempt(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  env: NodeJS.ProcessEnv,
  fetcher: typeof fetch,
): ProviderAttempt {
  const model = configuredKey(env.GEMINI_CHAT_MODEL || env.GEMINI_MODEL)
    || GEMINI_DEFAULT_MODEL;
  return {
    name: "gemini",
    request: (signal) => requestGemini(
      apiKey,
      model,
      [{ role: "user", parts: [{ text: userPrompt }] }],
      fetcher,
      signal,
      {
        systemInstruction: systemPrompt,
        jsonResponse: true,
        maxOutputTokens: 1200,
      },
    ),
  };
}

function makeChatAttempt(
  name: "groq" | "xai",
  apiKey: string,
  endpoint: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  fetcher: typeof fetch,
): ProviderAttempt {
  return {
    name,
    request: async (signal) => {
      const response = await fetcher(endpoint, {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          response_format: { type: "json_object" },
          max_tokens: 1200,
          temperature: 0.2,
        }),
        signal,
      });
      return chatCompletionText(await readJsonResponse(response));
    },
  };
}

function structuredTextProviders(
  systemPrompt: string,
  userPrompt: string,
  env: NodeJS.ProcessEnv,
  fetcher: typeof fetch,
): ProviderAttempt[] {
  const providers: ProviderAttempt[] = [];
  const geminiKey = configuredKey(env.GEMINI_API_KEY);
  const groqKey = configuredKey(env.GROQ_API_KEY);
  const xaiKey = configuredKey(env.XAI_API_KEY);

  if (geminiKey) {
    providers.push(makeGeminiTextAttempt(
      geminiKey,
      systemPrompt,
      userPrompt,
      env,
      fetcher,
    ));
  }
  if (groqKey) {
    providers.push(makeChatAttempt(
      "groq",
      groqKey,
      GROQ_CHAT_ENDPOINT,
      configuredKey(env.GROQ_CHAT_MODEL) || GROQ_DEFAULT_CHAT_MODEL,
      systemPrompt,
      userPrompt,
      fetcher,
    ));
  }
  if (xaiKey) {
    providers.push(makeChatAttempt(
      "xai",
      xaiKey,
      XAI_CHAT_ENDPOINT,
      configuredKey(env.XAI_CHAT_MODEL) || XAI_DEFAULT_CHAT_MODEL,
      systemPrompt,
      userPrompt,
      fetcher,
    ));
  }
  return providers;
}

function parseStructuredText<T>(text: string, schema: z.ZodType<T>): T {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const json = fenced?.[1] ?? trimmed;
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    throw new InvalidProviderResponseError();
  }
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new InvalidProviderResponseError();
  return parsed.data;
}

function failureFor(
  provider: AiProviderName,
  error: unknown,
): AiProviderFailure {
  if (error instanceof ProviderHttpError) {
    if (error.statusCode === 429) {
      return { provider, reason: "rate_limited", statusCode: error.statusCode };
    }
    if (error.statusCode === 401 || error.statusCode === 403) {
      return { provider, reason: "invalid_credentials", statusCode: error.statusCode };
    }
    if (error.statusCode >= 500) {
      return { provider, reason: "provider_unavailable", statusCode: error.statusCode };
    }
    return { provider, reason: "provider_rejected", statusCode: error.statusCode };
  }
  if (
    error instanceof ProviderTimeoutError ||
    (error instanceof Error && error.name === "TimeoutError")
  ) {
    return { provider, reason: "timeout" };
  }
  if (
    error instanceof InvalidProviderResponseError ||
    error instanceof SyntaxError ||
    error instanceof z.ZodError
  ) {
    return { provider, reason: "invalid_response" };
  }
  return { provider, reason: "network_error" };
}

async function runWithFallback<T>(
  providers: ProviderAttempt[],
  normalize: (raw: string) => T,
  options: AiProviderRuntimeOptions,
): Promise<AiProviderResult<T>> {
  const failures: AiProviderFailure[] = [];
  if (providers.length === 0) throw new AiProvidersUnavailableError(failures);

  const startedAt = Date.now();
  const overallDeadlineMs = options.overallDeadlineMs ?? DEFAULT_OVERALL_DEADLINE_MS;
  const providerTimeoutMs = options.providerTimeoutMs ?? DEFAULT_PROVIDER_TIMEOUT_MS;

  for (const provider of providers) {
    const remainingMs = overallDeadlineMs - (Date.now() - startedAt);
    if (remainingMs <= 0) break;
    const timeoutMs = Math.max(1, Math.min(providerTimeoutMs, remainingMs));
    const controller = new AbortController();
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timeoutHandle = setTimeout(() => {
        controller.abort();
        reject(new ProviderTimeoutError());
      }, timeoutMs);
    });

    try {
      const raw = await Promise.race([
        Promise.resolve().then(() => provider.request(controller.signal)),
        timeout,
      ]);
      return { provider: provider.name, value: normalize(raw) };
    } catch (error) {
      const failure = controller.signal.aborted
        ? { provider: provider.name, reason: "timeout" as const }
        : failureFor(provider.name, error);
      failures.push(failure);
      options.onProviderFailure?.(failure);
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
    }
  }

  throw new AiProvidersUnavailableError(failures);
}

export async function generateStructuredResponse<T>(
  systemPrompt: string,
  userPrompt: string,
  schema: z.ZodType<T>,
  options: AiProviderRuntimeOptions = {},
): Promise<AiProviderResult<T>> {
  const env = options.env ?? process.env;
  const fetcher = options.fetcher ?? fetch;
  return runWithFallback(
    structuredTextProviders(systemPrompt, userPrompt, env, fetcher),
    (text) => parseStructuredText(text, schema),
    options,
  );
}

export async function transcribeShoppingAudio(
  audioBase64: string,
  mimeType: string,
  options: AiProviderRuntimeOptions = {},
): Promise<AiProviderResult<string>> {
  const env = options.env ?? process.env;
  const fetcher = options.fetcher ?? fetch;
  const providers: ProviderAttempt[] = [];
  const geminiKey = configuredKey(env.GEMINI_API_KEY);
  const groqKey = configuredKey(env.GROQ_API_KEY);

  if (geminiKey) {
    const model = configuredKey(env.GEMINI_TRANSCRIPTION_MODEL || env.GEMINI_MODEL)
      || GEMINI_DEFAULT_MODEL;
    providers.push({
      name: "gemini",
      request: (signal) => requestGemini(
        geminiKey,
        model,
        [{
          role: "user",
          parts: [
            {
              text: "Transcribe this short shopping voice note exactly. The speaker may use Urdu, Roman Urdu, or English. Preserve the spoken language and script; return only the transcript, with no commentary.",
            },
            { inlineData: { mimeType, data: audioBase64 } },
          ],
        }],
        fetcher,
        signal,
        { maxOutputTokens: 512 },
      ),
    });
  }

  if (groqKey) {
    providers.push({
      name: "groq",
      request: async (signal) => {
        const audioBytes = Buffer.from(audioBase64, "base64");
        if (audioBytes.length === 0) throw new InvalidProviderResponseError();
        const audio = new Blob([new Uint8Array(audioBytes)], { type: mimeType });
        const extension = mimeType === "audio/webm"
          ? "webm"
          : mimeType === "audio/wav"
            ? "wav"
            : "m4a";
        const form = new FormData();
        form.set(
          "model",
          configuredKey(env.GROQ_TRANSCRIPTION_MODEL)
            || GROQ_DEFAULT_TRANSCRIPTION_MODEL,
        );
        form.set(
          "prompt",
          "Transcribe exactly in the language and script spoken. The voice note may contain Urdu, Roman Urdu, or English. Do not translate or add words.",
        );
        form.set("response_format", "json");
        form.set("temperature", "0");
        form.append("file", audio, `shopping-note.${extension}`);

        const response = await fetcher(GROQ_TRANSCRIPTION_ENDPOINT, {
          method: "POST",
          headers: { authorization: `Bearer ${groqKey}` },
          body: form,
          signal,
        });
        return transcriptionText(await readJsonResponse(response));
      },
    });
  }

  return runWithFallback(
    providers,
    (text) => {
      const parsed = z.string().trim().min(1).max(4000).safeParse(text);
      if (!parsed.success) throw new InvalidProviderResponseError();
      return parsed.data;
    },
    options,
  );
}
