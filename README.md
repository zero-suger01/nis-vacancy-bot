# NIS-Vacancy Telegram Bot

A Telegram bot that collects job applications through a step-by-step questionnaire
and sends each completed application to an admin chat or HR group.

## Questions it asks

1. Full name
2. Phone number (typed, or shared via the contact button)
3. City / NIS school
4. Position applying for
5. Work experience
6. Education
7. CV file upload (PDF/Word, optional — `/skip` to finish without one)

When the applicant finishes, the bot sends a formatted summary (plus the CV file,
if uploaded) to the chat configured in `ADMIN_CHAT_ID`.

## Setup

1. **Create the bot** — message [@BotFather](https://t.me/BotFather), send `/newbot`,
   name it `NIS-Vacancy`, and copy the token.
2. **Configure** — copy the env file and fill in both values:

   ```bash
   cp .env.example .env
   ```

   - `BOT_TOKEN` — the token from BotFather.
   - `ADMIN_CHAT_ID` — where applications are sent:
     - your own user id for a private chat (get it from [@userinfobot](https://t.me/userinfobot)), or
     - a group id (add the bot to the group first; group ids look like `-100xxxxxxxxxx`).
3. **Install & run** (Node 20+):

   ```bash
   npm install
   npm start        # or: npm run dev (auto-restarts on file changes)
   ```

4. Open your bot in Telegram and send `/start`.

## Commands

- `/start` — begin a new application
- `/cancel` — cancel the current application

## Deploying to Vercel (24/7 hosting)

The bot has two entry points: `src/main.ts` (long polling, local) and
`api/webhook.ts` (webhook, Vercel). For Vercel you also need a free
[Upstash Redis](https://upstash.com) database so applicants' progress
survives between serverless invocations.

1. Import this GitHub repo into [Vercel](https://vercel.com/new).
2. In Vercel project settings → Environment Variables, add:
   - `BOT_TOKEN`, `ADMIN_CHAT_ID`, `SHEETS_WEBHOOK_URL` (same as `.env`)
   - `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` (from Upstash)
   - `WEBHOOK_SECRET` (any random string)
3. Deploy, then point Telegram at the deployment:

   ```bash
   curl "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook?url=https://<your-app>.vercel.app/api/webhook&secret_token=<WEBHOOK_SECRET>"
   ```

To go back to running locally, delete the webhook first:
`curl "https://api.telegram.org/bot<BOT_TOKEN>/deleteWebhook"` — Telegram
delivers updates either by webhook or by polling, never both.
