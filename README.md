# Dohot Admin Telegram Bot

A production-ready Telegram bot that lets authorized admins create Dohot users directly from their iPhone via a step-by-step wizard.

```
Telegram Bot → Dohot REST API → Supabase
```

The bot never touches Supabase directly — all mutations go through the Dohot backend.

---

## Project structure

```
src/
  index.ts                   Entry point, launch + graceful shutdown
  config.ts                  Env validation and typed config object
  bot.ts                     Telegraf setup, commands, message routing
  types.ts                   All shared TypeScript interfaces
  services/
    authService.ts           Supabase JWT login, refresh, token cache
    adminApi.ts              Dohot REST API calls with 401 auto-retry
  middlewares/
    adminOnly.ts             Telegram-ID allowlist gate
  flows/
    createUserFlow.ts        7-step create-user wizard (state machine)
  utils/
    validators.ts            Username / password validation
    professionOptions.ts     Profession and role label/value maps
    dateUtils.ts             DD/MM/YYYY → YYYY-MM-DD parser
```

---

## 1 — Install dependencies

```bash
npm install
```

---

## 2 — Create the bot on BotFather

1. Open Telegram and search for **@BotFather**.
2. Send `/newbot` and follow the prompts (choose a name and username).
3. BotFather replies with your **bot token** — copy it.
4. Optionally send `/setcommands` to BotFather and paste:
	   ```
	   start - ברוך הבא
	   createuser - יצירת משתמש חדש
	   status - סטטוס מערכת
	   expiring - מנויים שפגים בקרוב
	   myid - הצגת ה-Telegram ID שלך
	   cancel - ביטול פעולה נוכחית
	   ```

---

## 3 — Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` and fill in every value:

| Variable | Description |
|---|---|
| `BOT_TOKEN` | Token from BotFather |
| `DOHOT_API_URL` | Dohot backend base URL, no trailing slash |
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anon/public key |
| `ADMIN_USERNAME` | The username part before `@dohot.app` |
| `ADMIN_PASSWORD` | Admin account password |
| `ADMIN_TELEGRAM_IDS` | Comma-separated list of authorized Telegram user IDs |

> **How to find your Telegram ID:** Send `/myid` to the bot after starting it (see step 4). The bot replies with your numeric ID. Add it to `ADMIN_TELEGRAM_IDS` and restart.

---

## 4 — Run locally

```bash
# Development (reloads on file change)
npm run dev:watch

# Or one-shot dev run
npm run dev
```

The bot uses long polling — no public URL or webhook required.

---

## 5 — Build for production

```bash
npm run build   # compiles TypeScript → dist/
npm start       # runs dist/index.js
```

---

## 6 — Deploy to Render

1. Push this repo to GitHub.
2. Go to [render.com](https://render.com) → **New → Web Service**.
3. Connect your GitHub repo.
4. Settings:
   - **Build command:** `npm install && npm run build`
   - **Start command:** `npm start`
   - **Instance type:** Free or Starter
5. Under **Environment**, add all variables from `.env`.
6. Click **Deploy**.

> Render restarts the process automatically if it crashes.

---

## 7 — Deploy to Railway

1. Install the Railway CLI: `npm i -g @railway/cli`
2. `railway login`
3. `railway init` inside the project directory.
4. `railway up`
5. In the Railway dashboard → **Variables**, add all variables from `.env`.
6. Under **Settings → Start command**, set `npm start`.

---

## 8 — Getting your Telegram ID with /myid

1. Start the bot (locally or deployed).
2. Open Telegram and send `/myid` to your bot.
3. The bot replies `Your Telegram ID is: <telegram_id>`.
4. Add that number to `ADMIN_TELEGRAM_IDS` in your `.env` and restart.

---

## Create-user wizard flow

```
/createuser
  ↓ full_name   (free text)
  ↓ username    (lowercase, no spaces)
  ↓ password    (min 6 chars)
  ↓ phone       (free text or /skip)
  ↓ profession  (inline keyboard)
  ↓ role        (inline keyboard)
  ↓ subscription_expiration_date  (DD/MM/YYYY or /skip)
  ↓ confirm     (✅ אישור / ❌ ביטול)
  ↓ POST /api/admin/users
```

Use `/cancel` at any point to abort.

---

## Security notes

- `/start` and `/myid` are public so new admins can retrieve their Telegram ID.
- Only Telegram users whose numeric ID is listed in `ADMIN_TELEGRAM_IDS` can create users, continue an active create-user flow, or run admin status/expiration commands.
- Passwords and tokens are never logged.
- The bot holds a Supabase JWT in memory; it refreshes automatically before expiry and re-logs in on failure.
- The bot never reads from or writes to Supabase directly.
