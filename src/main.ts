// Local entry point: long polling, for running the bot on your own machine.
// On Vercel the bot runs through api/webhook.ts instead.
import { bot, registerBotCommands } from "./bot.js";

void registerBotCommands();
console.log("NIS-Vacancy bot is running...");
void bot.start();
