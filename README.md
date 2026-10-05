# ZainBot AI

**Open-source platform for AI sales & support agents** — answer, sell, book appointments, and follow up with customers 24/7 across WhatsApp, Facebook Messenger, Instagram, Telegram, website chat, and hosted online stores. From one bilingual (Arabic/English) dashboard.

> **Live demo:** https://zainbot.com · **Arabic docs:** [README.ar.md](README.ar.md)

## Features

- **AI agents** trained on your own data (FAQs, catalog, brand voice) with BYOK provider keys (OpenAI, Gemini, Anthropic, OpenRouter) + automatic failover
- **Omnichannel inbox** — WhatsApp, Messenger, Instagram, Telegram, web widget, store chat
- **Commerce** — product catalog, in-chat orders, bookings/appointments, customers, sales & expenses
- **Message triage** — complaint / sales-intent / suggestion / inquiry / spam classification with owner alerts
- **AI Idea Council** — stress-test business ideas with 8 specialized AI critics before you build
- **Human handoff**, analytics, API keys, webhooks, manual subscriptions (Instapay / cash wallets)

## Quick start (local)

Requirements: **Node.js ≥ 22**, **MongoDB** (local or Atlas).

```bash
git clone https://github.com/hsnshehata/new-zainbot.git
cd new-zainbot
npm install
cp .env.example .env   # then fill in the values below
npm start              # or: npm run dev (auto-reload)
```

Open http://localhost:5000 — landing page at `/`, dashboard at `/dashboard`, health at `/health`.

### Minimum `.env`

| Variable | Required | Purpose |
|---|---|---|
| `MONGODB_URI` | ✅ | MongoDB connection string |
| `JWT_SECRET` | ✅ | Random string ≥ 32 bytes (auth signing) |
| `BASE_URL` | ✅ | Public URL, e.g. `http://localhost:5000` |
| `CREDENTIAL_ENCRYPTION_KEY` | ✅ | `base64:` 32-byte key (encrypts AI/channel secrets) |
| `PORT` | – | Default `5000` |
| `GOOGLE_CLIENT_ID` | – | Google login |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_WEBHOOK_SECRET` | – | Telegram channel |
| `META_*` / `FACEBOOK_*` / `INSTAGRAM_*` / `WHATSAPP_*` | – | Meta channels + webhooks |
| `SUBSCRIPTION_WHATSAPP_NUMBER` | – | Number shown on the pricing section (no `+`) |
| `INSTAGRAM_REDIRECT_URI` | – | OAuth redirect; defaults to `{BASE_URL}/dashboard` |
| `METRICS_TOKEN` | – | Protects `/metrics` (Prometheus) |

See [.env.example](.env.example) for the full list. Never commit `.env`.

## Run on a server

### Option A — Docker (recommended)

```bash
docker build -t zainbot .
docker run -d --name zainbot --restart unless-stopped \
  -p 5000:5000 --env-file .env \
  -v zainbot-data:/app/data -v zainbot-uploads:/app/uploads \
  zainbot
curl http://localhost:5000/health   # expect {"status":"ok"}
```

### Option B — Coolify / Dokploy / plain VPS

1. Point the app at this repo (`master` branch), build pack **Dockerfile**.
2. Set the env vars from the table above in the panel.
3. Attach persistent volumes for `/app/data` (WhatsApp sessions) and `/app/uploads`.
4. Deploy → verify `/health` returns 200.

### Data & backups

- MongoDB holds users, bots, conversations, stores, orders. Back it up with `mongodump` on a schedule.
- `/app/uploads` (product images, attachments) and `/app/data` (WhatsApp sessions) live on volumes — back those up too.

## Scripts & tests

| Command | What it does |
|---|---|
| `npm start` | Production server |
| `npm run dev` | Nodemon auto-reload |
| `npm test` | Full test suite (`node scripts/run-tests.js`, includes `tests/ideaCouncil/`) |
| `npm run test:browser:dashboard` | Browser smoke via remote Chromium (needs Browserless URL file; serves the app on an ephemeral port) |
| `npm run build:web` | Minified mirror of `public/` → `build/public/` (deterministic esbuild, no bundling/mangling; `build/` stays untracked) |
| `npm run build:linux` | Standalone binary via `pkg` |

CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)) installs deps and runs `npm test` on every push/PR.

## Project structure

```
server/          Express app (routes/, controllers/, models/, services/, middleware/, config/)
public/          Frontend — index.html (marketing), dashboard.html, chat/store/landing pages
scripts/         run-tests.js, auditLegacyDatabase.js (read-only legacy DB audit)
tests/           API, security, migration, i18n (incl. tests/ideaCouncil/)
docs/internal/   Internal migration & feature plans (not user docs)
Dockerfile       Production image (node:22, non-root, /health check)
```

Every user-visible string ships in Arabic **and** English (`data-i18n` + `en`/`ar` maps, covered by translation tests).

## Contributing & security

- PRs welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).
- Found a vulnerability? See [SECURITY.md](SECURITY.md) — please don't open a public issue.

## License

MIT — see [LICENSE](LICENSE).
