// Vercel entry point: Telegram pushes each update to this endpoint.
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { bot } from "../src/bot.js";

// bot.init() fetches bot identity once per cold start; reuse the promise so
// concurrent updates don't trigger duplicate getMe calls.
let initPromise: Promise<void> | undefined;

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  if (req.method !== "POST") {
    res.status(200).send("NIS-Vacancy bot webhook");
    return;
  }
  const secret = process.env.WEBHOOK_SECRET;
  if (secret && req.headers["x-telegram-bot-api-secret-token"] !== secret) {
    res.status(401).send("Unauthorized");
    return;
  }
  try {
    initPromise ??= bot.init();
    await initPromise;
    await bot.handleUpdate(req.body);
  } catch (err) {
    console.error("Webhook error:", err);
  }
  // Always 200 so Telegram does not endlessly retry a poison update.
  res.status(200).send("OK");
}
