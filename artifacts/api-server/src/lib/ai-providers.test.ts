import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import {
  AiProvidersUnavailableError,
  generateStructuredResponse,
  transcribeShoppingAudio,
} from "./ai-providers";
import {
  inventoryAssistantOutputSchema,
  shoppingAssistantOutputSchema,
} from "./assistant-schemas";

const allowedProductIds = new Set(["catalog-product-1"]);
const shoppingSchema = shoppingAssistantOutputSchema(allowedProductIds);
const validShoppingResponse = {
  reply: "Here is a nearby option.",
  productIds: ["catalog-product-1"],
  needsClarification: false,
};
const validShoppingText = JSON.stringify(validShoppingResponse);

function geminiResponse(text: string, status = 200) {
  return new Response(JSON.stringify({
    candidates: [{ content: { parts: [{ text }] } }],
  }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function chatResponse(text: string, status = 200) {
  return new Response(JSON.stringify({
    choices: [{ message: { content: text } }],
  }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("returns a valid Gemini response without calling fallback providers", async () => {
  let calls = 0;
  const result = await generateStructuredResponse(
    "system instructions",
    "typed shopping request",
    shoppingSchema,
    {
      env: { GEMINI_API_KEY: "test-gemini-key" },
      fetcher: async () => {
        calls += 1;
        return geminiResponse(validShoppingText);
      },
    },
  );

  assert.equal(result.provider, "gemini");
  assert.deepEqual(result.value, validShoppingResponse);
  assert.equal(calls, 1);
});

test("falls back to Groq when Gemini times out", async () => {
  let geminiAborted = false;
  const result = await generateStructuredResponse(
    "system instructions",
    "typed shopping request",
    shoppingSchema,
    {
      env: { GEMINI_API_KEY: "test-gemini-key", GROQ_API_KEY: "test-groq-key" },
      providerTimeoutMs: 10,
      overallDeadlineMs: 500,
      fetcher: async (input, init) => {
        if (String(input).includes("generativelanguage.googleapis.com")) {
          return new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              geminiAborted = true;
              reject(new Error("aborted"));
            }, { once: true });
          });
        }
        return chatResponse(validShoppingText);
      },
    },
  );

  assert.equal(geminiAborted, true);
  assert.equal(result.provider, "groq");
  assert.deepEqual(result.value, validShoppingResponse);
});

test("falls back after provider rate limiting", async () => {
  const requestedHosts: string[] = [];
  const result = await generateStructuredResponse(
    "system instructions",
    "typed shopping request",
    shoppingSchema,
    {
      env: { GEMINI_API_KEY: "test-gemini-key", GROQ_API_KEY: "test-groq-key" },
      fetcher: async (input) => {
        requestedHosts.push(String(input));
        return requestedHosts.length === 1
          ? new Response("rate limited", { status: 429 })
          : chatResponse(validShoppingText);
      },
    },
  );

  assert.equal(result.provider, "groq");
  assert.equal(requestedHosts.length, 2);
  assert.match(requestedHosts[0], /generativelanguage\.googleapis\.com/);
  assert.match(requestedHosts[1], /api\.groq\.com/);
});

test("falls back after a provider network error without retrying it", async () => {
  const requestedHosts: string[] = [];
  const result = await generateStructuredResponse(
    "system instructions",
    "typed shopping request",
    shoppingSchema,
    {
      env: { GEMINI_API_KEY: "test-gemini-key", GROQ_API_KEY: "test-groq-key" },
      fetcher: async (input) => {
        requestedHosts.push(String(input));
        if (requestedHosts.length === 1) throw new Error("simulated network failure");
        return chatResponse(validShoppingText);
      },
    },
  );

  assert.equal(result.provider, "groq");
  assert.equal(requestedHosts.length, 2);
  assert.match(requestedHosts[0], /generativelanguage\.googleapis\.com/);
  assert.match(requestedHosts[1], /api\.groq\.com/);
});

test("falls back when a provider returns invalid structured output", async () => {
  const result = await generateStructuredResponse(
    "system instructions",
    "typed shopping request",
    shoppingSchema,
    {
      env: { GEMINI_API_KEY: "test-gemini-key", GROQ_API_KEY: "test-groq-key" },
      fetcher: async (input) => String(input).includes("generativelanguage")
        ? geminiResponse("not valid JSON")
        : chatResponse(validShoppingText),
    },
  );

  assert.equal(result.provider, "groq");
  assert.deepEqual(result.value, validShoppingResponse);
});

test("rejects invented catalog IDs and accepts a valid fallback recommendation", async () => {
  const inventedProduct = JSON.stringify({
    ...validShoppingResponse,
    productIds: ["made-up-product-id"],
  });
  const result = await generateStructuredResponse(
    "system instructions",
    "typed shopping request",
    shoppingSchema,
    {
      env: { GEMINI_API_KEY: "test-gemini-key", GROQ_API_KEY: "test-groq-key" },
      fetcher: async (input) => String(input).includes("generativelanguage")
        ? geminiResponse(inventedProduct)
        : chatResponse(validShoppingText),
    },
  );

  assert.equal(result.provider, "groq");
  assert.deepEqual(result.value.productIds, ["catalog-product-1"]);
});

test("rejects inventory changes that target an ID outside the supplied inventory", async () => {
  const inventorySchema = inventoryAssistantOutputSchema(allowedProductIds);
  const inventedUpdate = JSON.stringify({
    reply: "I will prepare the update.",
    action: "update",
    preview: {
      productId: "made-up-product-id",
      name: "Milk",
      category: "Dairy",
      unit: "litre",
      price: 200,
      stock: 4,
    },
  });
  const validUpdate = JSON.stringify({
    reply: "Review the update before saving.",
    action: "update",
    preview: {
      productId: "catalog-product-1",
      name: "Milk",
      category: "Dairy",
      unit: "litre",
      price: 200,
      stock: 4,
    },
  });
  const result = await generateStructuredResponse(
    "system instructions",
    "update a product",
    inventorySchema,
    {
      env: { GEMINI_API_KEY: "test-gemini-key", GROQ_API_KEY: "test-groq-key" },
      fetcher: async (input) => String(input).includes("generativelanguage")
        ? geminiResponse(inventedUpdate)
        : chatResponse(validUpdate),
    },
  );

  assert.equal(result.provider, "groq");
  assert.equal(result.value.preview.productId, "catalog-product-1");
});

test("missing optional provider keys do not block the configured primary", async () => {
  let calls = 0;
  const result = await generateStructuredResponse(
    "system instructions",
    "typed shopping request",
    shoppingSchema,
    {
      env: { GEMINI_API_KEY: "test-gemini-key" },
      fetcher: async () => {
        calls += 1;
        return geminiResponse(validShoppingText);
      },
    },
  );

  assert.equal(result.provider, "gemini");
  assert.equal(calls, 1);
});

test("reports all configured providers unavailable without exposing response bodies", async () => {
  const result = generateStructuredResponse(
    "system instructions",
    "typed shopping request",
    shoppingSchema,
    {
      env: {
        GEMINI_API_KEY: "test-gemini-key",
        GROQ_API_KEY: "test-groq-key",
        XAI_API_KEY: "test-xai-key",
      },
      fetcher: async () => new Response("private provider response", { status: 503 }),
    },
  );

  await assert.rejects(result, (error: unknown) => {
    assert.ok(error instanceof AiProvidersUnavailableError);
    assert.deepEqual(
      error.failures.map((failure) => failure.provider),
      ["gemini", "groq", "xai"],
    );
    assert.deepEqual(
      error.failures.map((failure) => failure.reason),
      ["provider_unavailable", "provider_unavailable", "provider_unavailable"],
    );
    assert.equal(error.message.includes("private provider response"), false);
    return true;
  });
});

test("uses Groq Whisper after Gemini transcription fails and keeps upload in memory", async () => {
  const audioBase64 = "QUJD".repeat(40);
  const result = await transcribeShoppingAudio(audioBase64, "audio/mp4", {
    env: { GEMINI_API_KEY: "test-gemini-key", GROQ_API_KEY: "test-groq-key" },
    fetcher: async (input, init) => {
      if (String(input).includes("generativelanguage")) {
        return new Response("temporary failure", { status: 503 });
      }
      assert.match(String(input), /api\.groq\.com\/openai\/v1\/audio\/transcriptions/);
      assert.equal(init?.method, "POST");
      assert.equal(new Headers(init?.headers).has("content-type"), false);
      assert.ok(init?.body instanceof FormData);
      const form = init.body as FormData;
      assert.equal(form.get("model"), "whisper-large-v3-turbo");
      assert.match(String(form.get("prompt")), /Roman Urdu/);
      assert.ok(form.get("file") instanceof Blob);
      return new Response(JSON.stringify({ text: "Mujhe doodh chahiye" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });

  assert.equal(result.provider, "groq");
  assert.equal(result.value, "Mujhe doodh chahiye");
});

test("falls back when transcription output is empty", async () => {
  const result = await transcribeShoppingAudio("QUJD".repeat(40), "audio/webm", {
    env: { GEMINI_API_KEY: "test-gemini-key", GROQ_API_KEY: "test-groq-key" },
    fetcher: async (input) => String(input).includes("generativelanguage")
      ? geminiResponse("")
      : new Response(JSON.stringify({ text: "aik kilo chawal" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
  });

  assert.equal(result.provider, "groq");
  assert.equal(result.value, "aik kilo chawal");
});

test("fails clearly when no providers are configured", async () => {
  await assert.rejects(
    generateStructuredResponse(
      "system instructions",
      "typed shopping request",
      z.object({ reply: z.string() }),
      { env: {}, fetcher: async () => { throw new Error("must not be called"); } },
    ),
    (error: unknown) => error instanceof AiProvidersUnavailableError,
  );
});
