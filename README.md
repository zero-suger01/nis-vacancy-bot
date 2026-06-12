# NIS-Vacancy Telegram Bot

A Telegram bot (in Uzbek) that collects job applications for Namangan
International School (NIS) through a step-by-step questionnaire and sends each
completed application to an admin chat and a Google Sheet.

## Questions it asks

1. Full name
2. Gender (Ayol / Erkak buttons)
3. Age (validated number)
4. District (Namangan region district buttons)
5. Phone number (typed, or shared via the contact button)
6. Education (degree, university, year)
7. Specialty
8. Certificates (CEFR, SAT, IELTS, ...)
9. Work experience
10. NIS branch (Chortoq / Uychi buttons)
11. Intended work duration
12. CV file upload (PDF/Word, optional — "⏭ O'tkazib yuborish" button to skip)

The applicant then confirms the truthfulness of their answers
("✅ Tasdiqlayman") before the application is submitted. The bot sends a
formatted summary (plus the CV file, if uploaded) to the chat configured in
`ADMIN_CHAT_ID`, appends a row to the Google Sheet, and shows the applicant a
copy of what was submitted.

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
