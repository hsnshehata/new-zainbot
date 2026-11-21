# Readiness review log — started 2026-11-21 (post-merge ownership)

Scope: ongoing code/readiness review toward primary-cutover readiness.
Method: static review on master, live read-only checks, full test suite.
Boundaries: no unapproved spending, no destructive/customer-data changes, no
external sends, no zainbot.com cutover without explicit approval.

## Status snapshot (2026-11-21 23:35 EET)
- master = 6d803ab deployed to new.zainbot.com (Coolify webhook, Success 03m24s).
- Test suite on master: green (npm test exit 0).
- CREDENTIAL_ENCRYPTION_KEY: configured in Coolify (runtime-only, literal),
  verified via in-container parse + AES-256-GCM round-trip probe. Persisted
  encrypted writes still untested (no production credential created yet).
- Production DB: zero AiCredential / ProviderKey documents; AI auth via
  OPENAI_API_KEY env var.

## Gates (open)
1. Live channel acceptance: WhatsApp / Telegram / Instagram / Facebook paths
   never exercised end-to-end on the deployed service. Needs an approved,
   bounded live test plan (test numbers/pages, no real customers).
2. Reminder delivery: at-least-once; crash-after-send can re-deliver.
   Documented limitation, not eliminated.
3. Encrypted-at-rest write path: proven only at config level until the first
   real admin key write.
4. ~~Landing/frontend alignment~~ CLOSED 2026-11-21: verified live. The
   product landing (public/index.html, served at /) presents "Card 7: Zain
   Assistant" with full Arabic+English copy (bento_card7_* in script.js);
   confirmed in the deployed HTML/JS. NOTE: my first review pass grepped
   public/landing.html (the per-store landing template) and wrongly flagged
   the feature as missing - wrong-file error, corrected here.

## Findings log
### F1 (low, cleanup): fabricated confidence leftover in landing demo API
- server/routes/landingDemo.js returns `confidence: 92 + random*7` on live
  replies. NOT displayed on the current landing (index.html shows only the
  static "Preview reply" label; script.js's confidence elements do not exist).
  Dead/misleading API field + dead frontend code. Fix: drop the field and the
  dead code; keep the honest "Chat preview" labeling.
### F2 (reviewed, OK): public endpoint surface
- /api/landing-demo/chat is public by design: demoLimiter 20 req/10min,
  message length capped, admin-disableable via config. Cost note: each live
  call spends the owner's AI provider credit (gpt-4o-mini); rate limiter
  bounds it. Confirm owner is comfortable with the demo enabled.
- /api/webhook: Meta signature verification + verify tokens present.
- All other route modules: authenticated (global authenticatedPaths and/or
  router-level authenticate; admin modules add directSuperadminOnly).
- No hardcoded secrets found in server/, public/, scripts/.

## Next review backlog
- IDOR sweep: per-route ownership checks on object ids (orders, customers,
  stores, bookings) for the store-scoped roles.
- assistant data tools: confirm store/user scoping on every query path
  (tests exist; re-verify against live-shaped data).
- Landing alignment work for Business Assistant once gate 4 is scheduled.
