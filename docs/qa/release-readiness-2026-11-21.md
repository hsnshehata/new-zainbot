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
- **Secrets handling**: AI provider credentials are encrypted at rest via
  `server/services/AiCredentialCrypto.js`; key resolution order is
  encrypted control plane -> legacy ProviderKey -> env
  (`server/services/aiKeyResolver.js`). `.env` is gitignored;
  `.env.example` documents required vars.
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
   live database; running it in production is Hassan's call. Fully removing
   the read fallback also needs an admin UI for the control-plane
   credentials (API-only today).
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

1. Deploy `feat/owner-assistant` to a staging resource with a test MongoDB.
2. Run the full suite + browser smoke against staging.
3. Exercise `/api/assistant/*` with a seeded tenant; confirm reminder
   delivery through a test notification recipient.
4. Confirm Coolify branch/deploy mapping, then merge to the deployed branch.
