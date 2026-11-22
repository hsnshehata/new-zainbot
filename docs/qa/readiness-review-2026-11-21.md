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
- ~~IDOR sweep~~ DONE 2026-11-22: orders, customers, stores, bookings,
  sales, expenses, suppliers, categories, products, chatOrders,
  chatCustomers, notifications, uploads, rules, messages, ideaCouncil all
  verify tenant scoping (ownership checks, loadAccessibleBot/Rule, or the
  global auth gate). One real gap found and fixed: authenticated
  getProduct returned FULL product docs (costPrice, lowStockThreshold,
  barcode, generatedCodes) for any store to any authenticated user;
  non-owners now get the public projection only (test-pinned in
  tests/tenantIsolationScope.test.js).
- ~~F1 fabricated landing-demo confidence~~ CLOSED 2026-11-22: random
  92-98% confidence field removed from /api/landing-demo/chat and the
  dead frontend confidence UI/code dropped.
- assistant data tools: confirm store/user scoping on every query path
  (tests exist; re-verify against live-shaped data).
- Landing alignment work for Business Assistant once gate 4 is scheduled.

## 2026-11-22 security hardening batch (deployed to new.zainbot.com)
All commits on master; each deploy verified Success on Coolify + /health 200.
Suite: 778 pass / 0 fail (controller-level; not HTTP middleware proof).

- bfef0cc: outbound-webhook SSRF guard (webhookUrlGuard): https-only,
  private/special-range IP blocking incl. IPv4-mapped hex form, DNS
  all-addresses-public check, fail closed, connect-time IP pinning with
  TLS SNI/hostname verification intact, maxRedirects 0, stored response
  bodies trimmed 1500 to 300 chars. 12 guard tests. Blocker CLOSED.
- 218a01b + dd4d23b: anonymous public customer phone lookup REMOVED.
  Exact-match + throttling (218a01b) was still a PII oracle for anyone
  knowing a full number, so the endpoint and handler are gone; checkout
  prefill uses the shopper's own device cache only. Reintroduction
  requires proof of customer control. Test guard asserts removal.
- 9eff391: metadata-only logging on webhook/message paths (fb/ig bodies,
  whatsapp message text, signed media URLs, botEngine processing logs).
  Existing logs untouched (no purge).
- e715a41: botController.getSettings ownership gate (IDOR via mounts
  lacking loadAccessibleBot). +3 tests.
- 11a2a49: landing gains storefront/checkout and bookings/alerts cards
  (shipped features only, bilingual, landingTranslations tests pass).
- 96be647: FUNCTIONAL FIX - the app-level authenticate gate shadowed the
  intentionally public storefront routes (store-by-link, products,
  bestsellers, categories, order creation) since V2; anonymous shoppers
  got 401 and storefront landings could not load. The five routes are
  now mounted explicitly before the gate. Also: order creation post-save
  steps (stock update, in-app notification) are guarded so a post-commit
  failure no longer surfaces a 500 for an order that exists
  (duplicate-order risk). Verified end-to-end on a local seeded harness
  (rendered screenshots: storefront, cart, manual checkout form, 201
  order submit, no lookup call, no console errors).

### Storefront public surface (intended, anonymous)
- GET /api/stores/store/:storeLink, GET /api/products/:storeId/products,
  GET /api/products/:storeId/products/bestsellers,
  GET /api/categories/:storeId/categories, POST /api/orders/:storeId/orders.
- Anonymous order creation is by design (guest checkout) and bounded by
  the global limiter; watch for spam if abuse appears.

## Gates (still open)
- Live channel acceptance test session (owner-approved numbers/pages).
- Landing demo AI spend confirmation (owner).
- Owner acceptance pass on new.zainbot.com.
- Encrypted-at-rest write path proven at first real admin key write only.
