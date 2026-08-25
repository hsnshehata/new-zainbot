# ZainBot Platform V2 Master Plan

## Objective

Ship the new ZainBot experience without losing legacy users, password hashes,
bots, conversations, stores, orders, or related object identifiers. The new
platform must add a secure super-admin console, auditable user impersonation,
subscription-aware AI model routing, and durable channel connections.

The directory named:

```text
المنصة القديمة مش هنعدل فيها حاجة هنقتبص منها
```

is a read-only reference. No implementation work may modify it.

## Verified baseline

- The marketing page is `public/index.html`.
- `public/landing.html` is the per-store landing page, not the product marketing
  page.
- The current root `MONGODB_URI` matches the legacy application's database URI.
  The compatibility alias `MONGO_URI` currently differs and must not override
  the canonical value.
- All 22 legacy Mongoose models exist in the new application.
- Nineteen legacy models are byte-for-byte identical.
- `User`, `Bot`, and `Conversation` only have additive fields in the new app.
- The new app adds `ApiKey`, `ProviderKey`, `WebhookConfig`, and `WebhookLog`.
- Legacy WhatsApp Web sessions were stored on a filesystem path by the desktop
  build. The production Coolify volume and any remote session store have not
  yet been inspected, so the absence of a local checkout directory is not
  evidence that production sessions are lost.
- The current WhatsApp QR endpoint is a placeholder and does not instantiate a
  `whatsapp-web.js` client.
- The current dashboard has multiple frontend/backend contract mismatches and
  no user-management or impersonation UI.
- The current provider-key API stores and returns raw secrets.
- Cross-tenant authorization is missing from multiple bot, conversation,
  analytics, and rule endpoints.
- A dependency-light security foundation test suite now exists. Broader API,
  migration, channel-restoration, and browser coverage is still required.

## Non-negotiable rules

1. Preserve legacy `_id` values and relationship fields.
2. Use additive, idempotent migrations. Never recreate users to migrate them.
3. Never expose password hashes, channel credentials, or AI credentials in an
   API response.
4. Never impersonate by learning a user's password or by minting an
   indistinguishable ordinary user token.
5. Record the real admin actor on every impersonated write.
6. Keep secrets encrypted at rest and redacted in logs.
7. Enforce ownership and subscription entitlements on the server. The browser
   is not an authorization boundary.
8. Count successful billable AI work atomically and record every provider
   attempt.
9. Do not claim a channel is connected until a real health check succeeds.
10. Do not cut production traffic over until backup, reconciliation, rollback,
    and smoke checks all pass.
11. Do not perform the production cutover unless every currently connected
    channel is either restored from its existing durable session or explicitly
    identified and approved for a one-time relink.

## Confirmed migration decisions

- Preserve every legacy user, password hash, object identifier, bot,
  conversation, order, store, and channel relationship.
- Preserve the `role` field exactly. In particular, a `superadmin` remains a
  `superadmin`.
- Convert every account to `subscriptionType: free` and
  `subscriptionTier: free`, irrespective of stale legacy subscription values.
- Clear `subscriptionEndDate` and reset usage counters at cutover.
- Record the previous subscription fields in the migration audit collection so
  the conversion remains reversible and explainable.
- Treat channel-session preservation as a release gate, not a best-effort task.

## Target architecture

### Authentication context

Every authenticated request has:

```text
actorUserId
subjectUserId
role
sessionVersion
impersonationSessionId
isImpersonating
scopes
```

For normal sessions, actor and subject are the same user. During
impersonation, the actor remains the super-admin and the subject is the target
user.

### Admin impersonation

Collections:

```text
AdminImpersonationSession
AuditEvent
```

The session is short-lived, revocable, reason-bound, and visible through a
persistent warning banner. Sensitive administration remains available through
explicit admin endpoints, not through a disguised user session.

### AI control plane

Secrets, model metadata, routing, entitlements, overrides, and usage are
separate concerns:

```text
AiCredential
AiModelCatalog
AiCredentialPool
AiRoutingPolicy
AiTierEntitlement
AiUserOverride
AiUsageEvent
```

The user-facing `Auto` choice is a virtual model option. It resolves on the
server to the published policy for the user's subscription tier, then applies a
per-user or per-bot override when one exists.

Routing order:

```text
bot override
user override
subscription-tier policy
global default policy
```

Fallback is allowed only for retryable failures such as timeouts, rate limits,
network errors, and provider server errors. Invalid requests, entitlement
failures, and safety refusals are not blindly retried across every provider.

### Message triage and notification routing

Every incoming message is classified before the agent replies. The platform
owner defines, per agent, where each classified message type is delivered.

Classification categories:

```text
complaint      (شكوى)
sales_intent   (طلب / نية شراء)
suggestion     (اقتراح)
inquiry        (استفسار عادي - AI replies, no alert)
spam           (سبام - silently ignored or muted)
```

Routing destinations per category:

```text
whatsapp       any phone number chosen by the owner (sent from the bot session)
telegram       linked chat
inbox          in-app notification (always recorded)
```

Rules:

1. Classification starts deterministic (keyword and pattern rules), with an
   optional cheap-model AI pass only for ambiguous messages.
2. Destinations are a configurable list; one event may notify several numbers.
3. WhatsApp sends are rate-limited (per-message delay and hourly cap) and
   repeated events are coalesced into digest notifications to avoid bans.
4. Telegram remains the primary trusted channel; WhatsApp alerts degrade
   gracefully when the bot session is down.
5. Quiet hours and per-category enable flags are enforced server-side.

### Channel control plane

All channel state is represented by:

```text
ChannelConnection
```

It stores ownership, status, external account identifiers, a reference to an
encrypted credential or durable session, webhook health, capabilities, and the
last safe error summary.

WhatsApp uses `whatsapp-web.js` with `RemoteAuth` and `wwebjs-mongo`, one stable
client ID per bot, a distributed lock, durable health state, and restart
restoration.

Facebook Messenger and Instagram initially support a guided manual setup with
credential validation and webhook subscription. This does not bypass Meta's
permission or Advanced Access requirements.

Telegram keeps the central-bot linking design, with cryptographically secure,
single-use, expiring link codes and a verified webhook secret.

## Product surfaces

### User workspace

```text
Overview
Unified inbox
Customers and leads
Orders and bookings
Automations and follow-ups
AI agent
  - identity and instructions
  - knowledge and FAQs
  - products and catalog
  - model selection
  - testing
Channels
Analytics
Developer integrations
Plan and billing
Settings
```

### Super-admin workspace

```text
System overview
Users and subscriptions
User detail
Bots and channels
Impersonation sessions
AI credentials
Model catalog
Routing policies
Tier entitlements
Per-user overrides
Usage and cost
Channel/session health
Audit log
Incidents and alerts
System settings
```

## Delivery phases

### Phase 0 - Reproducible baseline

- [x] Remove machine-specific module-resolution code.
- [x] Protect `.env`, logs, uploads, sessions, and generated files.
- [x] Add a sanitized `.env.example`.
- [x] Add health and readiness endpoints.
- [x] Add a repeatable test command that does not need production data.
- [x] Fix broken `/dashboard_new.html` and extensionless page routes.
- [x] Consolidate active frontend asset paths.

Exit criteria:

- The app starts from a clean dependency install.
- No source path points to a developer's home directory.
- Syntax checks and baseline tests pass.

### Phase 1 - Security and tenancy gate

- [x] Require a configured JWT secret and remove all fallback secrets.
- [x] Reload the user on authentication and enforce account/session state.
- [x] Hide password hashes and secret fields by default.
- [x] Add centralized `requireRole`, `requireBotAccess`, and store ownership.
- [x] Fix cross-tenant bot, conversation, rule, analytics, and order access.
- [x] Protect or remove public test, raw conversation, upload, and metrics
      endpoints.
- [x] Add webhook signature verification and safe log redaction.
- [x] Restrict CORS and request-body limits by endpoint.

Exit criteria:

- User A cannot read or mutate User B's resources.
- Secret fields never appear in responses or logs.
- Public webhooks remain usable and signature-verified.

### Phase 2 - Legacy migration

- [ ] Obtain read-only access to the actual legacy database.
- [ ] Record collection counts, indexes, subscription distribution, duplicate
      conversation keys, orphan references, and largest documents.
- [ ] Back up the legacy database and `uploads/`.
- [ ] Restore into a staging copy while preserving every identifier.
- [ ] Audit old subscription values, record them, then normalize every account
      to the free plan while preserving roles.
- [ ] Reconcile `User.bots` from `Bot.userId`.
- [ ] Validate user, bot, conversation, message, store, product, and order
      invariants.
- [ ] Run a final delta copy during a short write freeze.

Exit criteria:

- Count and relationship reconciliation passes.
- Legacy password and Google login tests pass.
- Rollback restoration has been rehearsed.

### Phase 3 - Super-admin and impersonation

- [ ] Add admin user search, filters, pagination, and safe detail responses.
- [ ] Add subscription, quota, status, verification, and bot administration.
- [ ] Add short-lived impersonation sessions with start/end APIs.
- [ ] Add a persistent impersonation banner and immediate exit.
- [x] Add redacted, queryable audit events for all admin and impersonated
      mutations.

Exit criteria:

- Every impersonated write identifies both actor and subject.
- Expired or revoked impersonation tokens fail immediately.
- Direct admin actions and impersonated user actions are distinguishable.

### Phase 4 - AI model and key control plane

- [x] Encrypt platform and user AI credentials.
- [ ] Add model catalog and health-tested credential pools.
- [ ] Add draft/published versioned routing policies.
- [ ] Add tier entitlements and user/bot overrides.
- [x] Expose only `Auto` and permitted manual models to each user.
- [ ] Add retry classification, circuit breaking, cooldown, and bounded
      attempts.
- [ ] Add atomic quota reservation/settlement and attempt-level usage records.
- [x] Preserve compatibility with legacy provider-key and bot-key fields during
      migration.

Exit criteria:

- The admin can assign visible models and an `Auto` policy per tier.
- A disallowed manual model is rejected server-side.
- A retryable primary failure reaches the next configured step once.
- Secrets are never returned after creation.

### Phase 5 - Durable channels

- [ ] Implement real WhatsApp QR and pairing-code flows.
- [ ] Persist WhatsApp sessions through `RemoteAuth` and restore after restart.
- [ ] Prevent duplicate workers for the same bot.
- [ ] Add Facebook and Instagram manual setup validation and webhook
      subscription.
- [ ] Add Instagram Login as the preferred future approval-backed path.
- [ ] Secure and align Telegram linking.
- [ ] Add Website Chat with a real widget artifact and authenticated bot scope.

Exit criteria:

- Channel status comes from a real connection health check.
- WhatsApp survives process restart without a new QR.
- Incoming webhooks are authentic, idempotent, and tenant-scoped.

### Phase 6 - Product workflows

- [ ] Align analytics response contracts and remove fixed dashboard metrics.
- [ ] Complete unified inbox reply and human-handoff flows.
- [ ] Align FAQ/training contracts and persist agent instructions.
- [ ] Align orders/bookings contracts.
- [ ] Implement Shopify and WooCommerce only when real connectors are ready;
      otherwise label them accurately as planned integrations.
- [ ] Replace placeholder links, testimonials, counters, and connection status
      with verified content or clearly marked examples.

Exit criteria:

- Every visible control has a working success, empty, loading, and failure
  state.
- The landing page makes no unverified production claims.

### Phase 6b - Message triage and notification routing

- [ ] Add deterministic message classification (complaint, sales_intent,
      suggestion, inquiry, spam) in the bot engine pipeline.
- [ ] Add optional AI-assisted classification for ambiguous messages using a
      cheap routed model.
- [ ] Add per-agent routing configuration: category -> destinations list
      (whatsapp numbers, telegram chat, inbox).
- [ ] Implement WhatsApp outbound owner alerts through the existing session
      manager with per-message delay, hourly cap, and digest coalescing.
- [ ] Enforce quiet hours, per-category toggles, and server-side rate limits.
- [ ] Ship bilingual agent settings UI for filters and notification routes.

Exit criteria:

- A complaint-classified message reaches the configured WhatsApp number once,
  not repeatedly, and is always visible in the inbox.
- Spam never triggers outbound notifications.
- Rate limits hold under burst traffic without WhatsApp session bans.

### Phase 7 - Release

- [ ] Desktop and mobile browser smoke tests in Arabic and English.
- [ ] API contract, tenancy, migration, failover, and session-restoration tests.
- [ ] Dependency and secret scans.
- [ ] Production-like staging migration.
- [ ] Backup and rollback rehearsal.
- [ ] Deploy, verify health/readiness, then run live smoke tests.

## Decisions still required

1. Inspect the production Coolify application, volumes, container environment,
   and any remote WhatsApp session collections before selecting the session
   import path.
2. Decide whether marketing placeholders remain as labeled examples or are
   hidden until verified customer metrics exist.
3. Confirm the production host and database cutover window only after staging
   reconciliation passes.
