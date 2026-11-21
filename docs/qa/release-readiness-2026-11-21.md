# Release readiness snapshot — 2026-11-21 (assistant milestone)

Scope: evidence-backed readiness review of the repo on branch
`feat/owner-assistant`, plus the verification record for the new owner
assistant milestone. This is a point-in-time review from source inspection
and the local test suite; it is not a staging or production verification.

## Verified in this review (with evidence)

- **Auth & sessions**: JWT access tokens signed with the required
  `JWT_SECRET` (`server/utils/authTokens.js`, min 32 bytes enforced in
  production via `server/config/env.js`); 12h default TTL; server-side
  revocation via per-user `sessionVersion` checked on every authenticated
  request (`server/middleware/authenticate.js`); impersonation sessions are
  validated server-side per request, not just at issue time.
- **Rate limiting**: global IP limiter, stricter auth limiter, webhook
  limiter, per-account limiter on authenticated paths, and a dedicated
  40/15min limiter on the new `/api/assistant/chat`
  (`server/server.js`, `server/routes/assistant.js`).
- **Webhooks**: signature verification middleware is applied to Meta and
  Telegram webhook routes (`server/routes/webhook.js`,
  `server/routes/telegram.js`, `server/middleware/verifyWebhookSignature.js`);
  raw body is preserved for signature checks (`server/server.js`).
- **Headers/CSP/CORS**: helmet CSP with explicit allowlists, stricter
  frame rules outside `/chat/*`, CORS restricted to configured origins
  (`server/server.js`). CSP/loader contracts are enforced by
  `tests/webCsp.test.js`.
- **Secrets handling**: AI provider credentials CAN be encrypted at rest
  via `server/services/AiCredentialCrypto.js`, but ONLY when
  `CREDENTIAL_ENCRYPTION_KEY` is configured. Key resolution order is
  encrypted control plane -> legacy ProviderKey -> env
  (`server/services/aiKeyResolver.js`). `.env` is gitignored;
  `.env.example` documents required vars.
  **Release gate (explicit)**: an environment without
  `CREDENTIAL_ENCRYPTION_KEY` still accepts new AI keys through the admin
  API and stores them in PLAINTEXT ProviderKey documents (with a loud
  `provider_key_plaintext_created/updated` warning log). Encrypted at
  rest must never be advertised as unconditional. Before any production
  launch: configure `CREDENTIAL_ENCRYPTION_KEY` everywhere, verify new
  writes land as AiCredential documents, then run the migration script
  (dry-run first) and retire the plaintext read fallback.
- **Tenant scoping (new code)**: every assistant route scopes by
  `req.user.userId` set by the auth middleware; conversations, reminders,
  sales, expenses, orders, bookings and inbox tools cannot be addressed
  across tenants (covered by `tests/assistant/assistantRoutes.test.js` and
  `tests/assistant/assistantDataTools.test.js`).
- **Existing controllers**: 19 controllers reference `req.user.userId`;
  spot-checked `productController`, `orderController`, `customersController`
  all scope queries by user/store ids (17-20 userId references each).
- **i18n contract**: every user-visible string ships ar+en; enforced by
  `tests/dashboardTranslations.test.js` and
  `tests/landingTranslations.test.js` (both extended for this milestone).
- **Test suite**: full `npm test` green after the milestone (~250 test
  assertions across 80+ files); `npm run build:web` passes.
- **Visual verification**: landing card (EN LTR + AR RTL) and the dashboard
  assistant page (RTL, chat bubbles, fallback badge, conversations and
  reminders lists with status chips) rendered and inspected via headless
  Chrome against stubbed APIs; screenshots retained.

## New surface added in this milestone

- `POST/GET/DELETE /api/assistant/chat|conversations|reminders`
- Models `AssistantConversation`, `Reminder`; cron `sendDueReminders`
  (marks sent before dispatching via the existing multi-channel
  notification dispatcher; no new outbound channel).
- Dashboard page `page-assistant` (lazy chunk `dashboard-assistant.js`),
  landing page card 7.

## Verification limits (stated honestly)

- **No live MongoDB in the dev environment**: route and aggregation logic
  is verified with stubbed models, not against a real database. Query
  shapes, indexes and concurrency behavior (e.g. reminder double-send
  under two overlapping cron ticks) are not proven. The reminder flow
  mitigates double-send by marking `sent` before dispatch, but an
  atomic `findOneAndUpdate` claim would be stronger.
- **No external provider calls**: AI completion, WhatsApp/Telegram
  delivery, Meta/Instagram OAuth were not exercised; the reminder
  dispatcher path was verified only with a stubbed dispatcher.
- **Browser smoke suite** (`npm run test:browser:dashboard`) requires a
  Browserless endpoint and was not run; visual checks used local headless
  Chrome with stubbed APIs instead.
- **Service worker + GET APIs**: during harness testing, API GETs routed
  through the service worker bypassed the mock layer (SW does its own
  network fetch). Behavior is correct (network-only for `/api/`), but E2E
  harnesses must account for it.

## Findings / follow-ups

1. **Legacy plaintext `ProviderKey.apiKey`** remains a read fallback
   (`server/models/ProviderKey.js`, `server/services/aiKeyResolver.js`).
   Not selected by default (`select: false`), but plaintext at rest.
   **Triaged 2026-11-21 (later run):** new plaintext writes now log a
   security warning (`provider_key_plaintext_created/updated`) pointing to
   the encrypted control plane, and
   `scripts/migrateProviderKeysToCredentials.js` performs the migration:
   dry-run by default, writes only with `--apply` plus
   `CONFIRM_MIGRATION=MIGRATE_PROVIDER_KEYS`, encrypts each key into an
   `AiCredential`, then unsets the plaintext field and deactivates the
   legacy doc (idempotent; verified against real MongoDB 7.0.24 in
   `tests/providerKeyMigration.test.js`). It has NOT been run against any
   live database; running it in production is Hassan's call. The admin UI
   now covers the encrypted control plane (see the credential-management
   UI update below), so retiring the read fallback is blocked only on
   running the migration in production, not on missing UI.
   **Updated 2026-11-21 (later run): encrypted-on-write.** When
   `CREDENTIAL_ENCRYPTION_KEY` is configured, `POST /api/admin/keys` now
   creates an encrypted AiCredential instead of a plaintext ProviderKey
   (`server/controllers/adminKeysController.js`): no new plaintext secrets
   can be created through the admin API. The admin UI contract is
   preserved (same response fields plus `storage: 'encrypted'`; list
   merges both stores; update/delete route by a `cred_` id prefix;
   rotation re-encrypts; duplicates return 409). With the key
   unconfigured the legacy plaintext path remains with the warning log -
   that fallback is the release gate above, not a supported production
   posture. Verified in `tests/adminKeysEncryption.test.js` (real MongoDB
   7.0.24: no-plaintext-anywhere, decrypt round-trip, rotation, legacy
   fallback).
   **Updated 2026-11-21 (credential-management UI):** the superadmin
   dashboard (AI Failover Servers & Keys) now fully covers both stores:
   every row shows a storage badge (ENCRYPTED / LEGACY PLAINTEXT) and the
   masked last-4 of the secret (never the secret itself); a banner appears
   while any legacy plaintext key remains; and an edit/rotate modal allows
   metadata edits plus optional secret rotation. Rotating a legacy key's
   secret through the UI or API upgrades that key into the encrypted
   control plane (legacy document deactivated, plaintext field removed),
   matching the migration script's semantics per key; conflicts with an
   existing credential of the same name+provider return 409 without
   writes. Migration tombstones are hidden from the list so they cannot
   trip the plaintext banner. Migration script hardened: encrypt/decrypt
   preflight probe before any database access, model/priority/last4 labels
   carried into migrated credentials (previously dropped), printed
   mongodump prerequisite + rollback instructions before `--apply` writes,
   and exact apply/verify commands in dry-run output. Verified by
   `tests/adminKeysEncryption.test.js` (8 tests) and
   `tests/providerKeyMigration.test.js` (2 tests incl. label assertions),
   plus EN/AR screenshots of list, banner, badges and modal.
2. **No migrations framework**: schema evolution is implicit; no
   `server/migrations` directory. Backfill/rollback story for production
   data changes (including this milestone's new collections) is manual.
3. **Deployment wiring confirmed 2026-11-21 (read-only Coolify inspection)**:
   the Coolify app `new-zainbot` deploys `hsnshehata/new-zainbot` branch
   `master` via a GitHub-App-managed webhook (push to master = automatic
   deploy) to `new.zainbot.com`. The production `zainbot.com` is a separate
   app on a separate repo (`hsnshehata/zain-ai`, branch `main`). Repo CI
   (`.github/workflows/ci.yml`) triggers only on `master`/`main`. A push of
   the feature branch therefore triggers no CI and no deploy; merging to
   `master` auto-deploys to `new.zainbot.com` and stays gated on Hassan's
   explicit approval. Same Coolify server/network is shared infrastructure
   with production; no infra changes were made. Rollback = redeploy previous
   image; no automated mechanism in-repo.
4. **Reminder delivery semantics**: fixed with an atomic claim
   (`findOneAndUpdate` pending -> claimed), stale-claim recovery (10 min),
   bounded retries with backoff, and a terminal `failed` state with
   `lastError`; covered by real-MongoDB concurrency tests
   (`tests/assistant/assistantMongo.test.js`). Honest limit: delivery is
   **at-least-once** — a crash after a successful external send but before
   the state save can repeat one delivery; the notification dispatcher has
   no idempotency-key support, so this is documented, not eliminated.
5. **Billing is manual** (Instapay/cash wallets + subscription requests):
   expiry reminders and auto-stop crons exist; no automated payment
   reconciliation to audit here.
6. **Prior QA depth exists**: `docs/qa/reports/*` and
   `docs/qa/dashboard-release-gates.md` cover the dashboard program; this
   milestone extended those contracts rather than re-auditing them.

## Suggested acceptance path before production

Staging must be built synthetic-first. Cloning the live Coolify app
configuration would copy real credentials, webhooks, cron jobs and the
production database connection, so NONE of that may be reused.

1. Create a NEW Coolify application (not a clone) for
   `feat/owner-assistant` on a temporary subdomain:
   - fresh, empty MongoDB database used only for staging;
   - all outbound channels disabled: no WhatsApp/Telegram tokens, no
     Meta webhook secrets, notification dispatcher pointed at a
     stub/log-only endpoint;
   - all cron/scheduled jobs disabled at the env level;
   - only synthetic test credentials (a throwaway AI provider key if
     live-completion verification is separately approved, a test
     Telegram bot if webhook delivery is approved);
   - `CREDENTIAL_ENCRYPTION_KEY` set to a staging-only value so the
     encrypted-on-write path is exercised;
   - capacity and cost checked with Hassan before creation (another app
     + database on the shared Coolify server consumes real resources).
2. Seed synthetic owner/store/bot/sales data; run the full suite +
   browser smoke against staging (service worker, real Mongo, real JWT).
3. Exercise signup -> dashboard -> assistant chat -> reminder
   create/complete end to end.
4. Optional, each individually approved by Hassan: real AI completion
   with the test key, Telegram delivery to the test bot, migration
   script `--dry-run` output review against the staging DB.
5. Acceptance criteria: this document's checklist plus zero
   CSP/i18n/lazy-load regressions and the visuals already captured.
6. Only after staging passes: confirm Coolify branch/deploy mapping,
   then merge to `master` (auto-deploys `new.zainbot.com`) with
   Hassan's explicit approval.
