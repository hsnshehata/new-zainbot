# Staging acceptance proposal - feat/owner-assistant

Date: 2026-11-21. Status: PROPOSED, awaiting Hassan's approval. Nothing in
this document has been executed. Creating any resource below is a billable
infrastructure decision and stays gated on his explicit yes.

## Purpose

Run the real deployed application (service worker, real MongoDB, real JWT
flow, real build output) against fully synthetic data and credentials, so the
owner-assistant milestone is verified in deployment conditions before any
merge to `master` (which auto-deploys `new.zainbot.com`).

## Resources to create (new, never cloned from production)

| Resource | Spec | Notes |
| --- | --- | --- |
| Coolify application | New app, repo `hsnshehata/new-zainbot`, branch `feat/owner-assistant`, same build pack as the `new-zainbot` app | NOT a clone of the live app: no env vars, domains, webhooks, or deploy keys are copied |
| Domain | Coolify-generated preview domain (preferred) or `staging-new.zainbot.com` | Preview domain avoids touching DNS entirely |
| MongoDB | NEW MongoDB service in Coolify (small), one fresh empty database | Not a database on the production Mongo server: full data isolation |
| Capacity | ~512 MB-1 GB RAM for the Node app, ~256-512 MB for MongoDB (same server as production: shared-infrastructure caveat already documented) | Confirm free capacity on the Coolify server before creation |
| Cost | No paid external services by default (see env table). The only optional paid step is a live AI completion check, which requires a separately approved test key with a Hassan-set spend cap | Server electricity/time is the only marginal cost |

## Environment variables for the staging app

| Variable | Staging value | Why |
| --- | --- | --- |
| `NODE_ENV` | `production` | Exercise the real production code path |
| `MONGODB_URI` | the NEW Mongo service only | Data isolation |
| `JWT_SECRET` | new random 32+ bytes | No secret reuse from any environment |
| `CREDENTIAL_ENCRYPTION_KEY` | new random staging-only key (hex/base64) | Exercises encrypted-on-write; prod key never copied |
| `CRON_JOBS_ENABLED` | `false` | No scheduled sends, recovery runs, or subscription sweeps at all (guard added in this branch, `tests/backgroundJobsToggle.test.js`) |
| `CORS_ORIGINS` / `BASE_URL` / `API_BASE_URL` | the staging domain only | No cross-environment calls |
| `OPENAI_API_KEY` and all other provider keys | UNSET initially | No paid/ live provider calls by default |
| `FACEBOOK_*`, `INSTAGRAM_*`, `WHATSAPP_*`, `TELEGRAM_*`, `META_*` | UNSET | No outbound messages, no webhook registration, no channel sends |
| `EMAIL_USER` / `EMAIL_PASS` | UNSET | No email sends |
| `IMGBB_API_KEY`, `LEMONFOX_API_KEY` | UNSET | No third-party uploads/calls |
| `METRICS_TOKEN` | new random value | No shared observability credentials |
| `SUBSCRIPTION_*` | UNSET or synthetic placeholders | No real payment-contact exposure |

## No-production-effects controls

1. Fresh empty MongoDB on a new service: zero production data reachable.
2. `CRON_JOBS_ENABLED=false`: the app starts zero crons/workers, so nothing
   runs unattended against the staging DB.
3. All channel/provider/email credentials unset: every outbound integration
   fails closed (missing config) rather than reaching a real service.
4. WhatsApp session restore runs against the empty staging DB and finds no
   sessions, so no WhatsApp connections are opened.
5. Synthetic seed data only (synthetic owner account, store, bot, sales).
6. No DNS changes if the Coolify preview domain is used.
7. The production `new-zainbot` app, the separate `zain-ai` production app,
   and the `master` branch are untouched throughout.

## Acceptance steps (after Hassan approves creation)

1. Deploy the branch; confirm boot logs show `background_jobs_disabled`.
2. Register a synthetic owner account through the real signup flow.
3. Seed synthetic store/bot/sales/expense data.
4. Exercise: login -> dashboard load (service worker active) -> assistant
   chat (fallback path, no AI key) -> reminder create/complete -> admin keys
   UI shows ENCRYPTED badge for a key added through the UI (encrypted-on-write
   verified in deployment).
5. Run the full test suite + browser smoke against the staging URL.
6. Optional, each individually approved: real AI completion with the test
   key; Telegram delivery to a test bot; migration script `--dry-run` against
   the staging DB.
7. Acceptance criteria: the release-readiness checklist, zero
   CSP/i18n/lazy-load regressions, and the captured visuals.

## Teardown

After acceptance (or rejection), delete the staging app and its MongoDB
service. Nothing persists; no migration or cleanup touches production.
