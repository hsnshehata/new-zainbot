# Page inventory (A06)

Date: 2026-10-05. Auditor: Lead A. Every public page/route below carries
exactly one status: **tested** (runnable gate evidence exists),
**finding** (a proven issue with an owner + follow-up), or **deferred**
(reason recorded, explicit approval/condition named). No percentages.

Conventions: `tested` means a Node gate in-tree covers the route/shape
(browser proof is separately BLOCKED — see release gates G14–G18, never
claimed here). `finding` always names the owning follow-up, never a silent
fix. Authenticated dashboard tabs are covered via the dashboard shell +
per-workflow suites, not one row per tab.

## 1. Public HTML pages

| Route(s) | File | Status | Evidence / note |
|---|---|---|---|
| `/` | `public/index.html` | tested | serves 200 (phase0 pattern); version pins closed by F08; shell CSS untouched (B02 separate track, not-started) |
| `/dashboard` | `public/dashboard.html` | tested | G8 HTML identity+MIME; 13 previously-unversioned tags closed (F08); E04 native menu buttons + disclosure; C08 audit: no unresolved hardcoded UI in shipped scope |
| `/dashboard_new` | — (301) | tested | G8 asserts 301 → `/dashboard` |
| `/set-whatsapp` | — (301) | tested | G8 asserts 301 → `/dashboard` (WhatsApp linking lives in-dashboard now) |
| `/login` | `public/login.html` | tested | loginTranslations 2/2; C07 live-switching; E07 auth focus/forms; F08 version pins |
| `/register` | `public/register.html` | tested | same gates as `/login` |
| `/chat`, `/chat.html`, `/chat/:linkId` | `public/chat.html` | tested | serves 200; frame-ancestors `*` by design (embeddable widget) with the rest of CSP intact; chatPageCustomizer 2/2 |
| `/store/:storeLink` | `public/store.html` | tested | serves 200/404 shape (store-not-found → JSON 404, no leak); store-scoped work beyond the dashboard is **deferred** to F09/E08 conditionals (not activated) |
| `/store/:storeLink/landing` | `public/landing.html` | tested | landingTranslations 3/3; beyond-dashboard landing work **deferred** (C08: landing scope covered only for translations) |
| `/help.html` | `public/help.html` | tested | static serve; F08 version pins |
| unknown non-API path | `public/404.html` | tested | G8: 404 + HTML page with `Accept: text/html` |

## 2. System / ops endpoints

| Route | Status | Evidence / note |
|---|---|---|
| `/health` | tested | G8: 200 `{status:ok, service:zainbot}` |
| `/health/readiness` | tested | G8: 503 `not_ready/down` disconnected (real), 200 `ready/up` connected (deterministic stub+restore). Live-connected proof waits on G18 staging smoke |
| `/metrics` | tested | token-gated (503 unconfigured / 401 wrong key); no secret in repo |
| `/api/config` | tested | public plans/client-id only, no secrets |
| `/sitemap.xml`, `/robots.txt`, `/.well-known/assetlinks.json` | tested | static serve with correct MIME + 24h cache |
| `/widget.js` (customer-site embed script) | deferred | served static via `express.static`; behavior + a11y deferred to E08 (conditional, not activated) |
| `/api/auth/*` (register/login/google/verify/resend) | tested | authLifecycle suite; auth rate-limit own gate; SMTP-failure pending-signup path covered |

## 3. Dashboard-consumed API (ownership boundary)

| Route group | Status | Evidence / note |
|---|---|---|
| `/api/users/*` (`/me`, `/profile`, admin CRUD) | tested | G9 envelope + no-leak; D06b: cross-user PUT→403 zero writes, malformed id fail-closed 403 |
| `/api/bots/*` | tested | G9 malformed→404, other-user→404 indistinguishable; secrets stripped in serializers |
| `/api/rules/*` | tested | D06b: unowned-bot list→404 never unfiltered; other's rule→404 |
| `/api/messages/*` (conversations, handoff, reply) | tested (fixed + independently reviewed) | D06b FP3 fixed by D06c (`isValidObjectId`→404); fresh-reviewer Spec ✅ Approved; ownership 44/44 green |
| `/api/chat-page/*` (create/update/by-bot/public-link/feedback) | tested (fixed + independently reviewed) | D06b FP1 + FP2 + D06d FP4 fixed by D06c/D06d (caller-scoped lookups, superadmin bypass per `botAccess.js`); fresh-reviewer Spec ✅ Approved both; ownership 44/44 green |
| `/api/catalog-connectors/*` | tested | G9: 401/404-before-provider/unknown-provider 404/unconfigured-no-secrets; owner-only reference correct (D06b) |
| `/api/conversations/:botId/:userId`, `/api/feedback/*` | tested | ownership via `loadAccessibleBot`; feedback compat shape covered |
| `/api/subscriptions/*`, `/api/notifications/*`, `/api/integrations/*`, `/api/bookings/*`, `/api/chat-orders/*`, `/api/admin/*`, `/api/idea-council/*`, remaining resource routes | tested | D01/D04/D05/D07/D08/D09 suites green (orders route contracts, inbox states, locks, notification flows, subscription states, remaining flows) |

## 4. Deferred with reason (explicit conditionals — none blocks this batch)

| Item | Condition to activate | Owner of the decision |
|---|---|---|
| B07 theme (dark-only vs Light/Dark/System) | Hassan product decision first; findings only until then | Hassan |
| E08 widget/chat/store a11y pass | scope approval + this inventory as the entry record | coordinator → Hassan |
| F09 store/chat asset optimization | scope approval + F01 measures | coordinator → Hassan |
| B02 shell-CSS extraction + B03–B06 responsive/contrast patches | B01 findings F-B01-01..09 already bounded; browser proof waits on G14 | Lead B (needs `dashboard.html` lock turn) |
| C05 remaining copy, C06 locale, E05 remaining forms, E07 remaining auth forms | owner-track turns under shared-file locks | Leads C/E |
| Rules-404 `{message}`-vs-`{error}` uniformity | future cosmetic pass (D06b observation, not security) | coordinator |

## 5. Open verification (runs after merge, before any plan-complete claim)

- G10 independent reviews (D06c/D06d security fixes): DONE — fresh non-D reviewers, both Spec ✅ Approved; ownership suite 44/44 re-run green by coordinator.
- A06 independent review (this batch): DONE — fresh non-A reviewer, batch confirmed (this report).
- G14–G18 browser gates — BLOCKED on infra options 1–4 (release gates §4).
- E04/E06 browser matrices — queued on G14, code already green at Node level.
