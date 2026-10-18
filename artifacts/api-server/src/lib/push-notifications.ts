import {
  listExpoPushTokens,
  removeInvalidExpoPushToken,
} from "@workspace/db";
import { logger } from "./logger";

const EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send";
const MAX_MESSAGES_PER_REQUEST = 100;

type PushRecipientRole = "customer" | "merchant";
type ExpoPushTicket = {
  status?: string;
  message?: string;
  details?: { error?: string };
};

type ExpoPushResponse = {
  data?: ExpoPushTicket[] | ExpoPushTicket;
};

export async function sendExpoPush(input: {
  recipientId: string;
  role: PushRecipientRole;
  title: string;
  body: string;
  data: Record<string, string>;
}): Promise<void> {
  try {
    const tokens = await listExpoPushTokens(input.recipientId, input.role);
    for (let offset = 0; offset < tokens.length; offset += MAX_MESSAGES_PER_REQUEST) {
      const batch = tokens.slice(offset, offset + MAX_MESSAGES_PER_REQUEST);
      const response = await fetch(EXPO_PUSH_ENDPOINT, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(batch.map((record) => ({
          to: record.token,
          title: input.title,
          body: input.body,
          sound: "default",
          priority: "high",
          channelId: "order-updates",
          data: input.data,
        }))),
      });

      if (!response.ok) {
        logger.warn({ statusCode: response.status }, "Expo push service rejected a notification batch.");
        continue;
      }

      const result = await response.json() as ExpoPushResponse;
      const tickets = Array.isArray(result.data)
        ? result.data
        : result.data
          ? [result.data]
          : [];
      for (const [index, ticket] of tickets.entries()) {
        if (ticket.status === "error" && ticket.details?.error === "DeviceNotRegistered") {
          const record = batch[index];
          if (record) await removeInvalidExpoPushToken(record.id, record.token);
        } else if (ticket.status === "error") {
          logger.warn({ error: ticket.details?.error ?? "unknown" }, "Expo push delivery failed for a device.");
        }
      }
    }
  } catch (error) {
    // Push delivery is best-effort; the durable in-app notification remains the source of truth.
    logger.warn({ err: error }, "Unable to send an Expo push notification.");
  }
}
