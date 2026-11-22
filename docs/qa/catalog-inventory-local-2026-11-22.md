# Catalog inventory, local review candidate

Status: unshipped. No merchant inventory, customer data, channel routing, production branch or deployment changed by this patch.

## Model and consequences

Imported products use the last remote snapshot as a base, minus durable local allocations. Completed reservation tokens can be cleaned without forgetting local sales. Release and cancellation restore allocations through existing token/epoch fences. A remote drop below local allocations clamps availability to zero without erasing debt. Local-only products keep their existing stock path.

This connector currently reads catalogs only. The patch does not reserve stock atomically in WooCommerce or Shopify, export local orders, or consume remote acknowledgments. Simultaneous sales elsewhere can exceed the last snapshot. Manually recording the same local sale remotely can conservatively double-count it. A reviewed, audited rebase for known balances is not included.

Untracked quantities, incomplete seeds and old imports without a baseline cannot be checked out. Public product responses expose an unconfirmed availability flag, not internal source keys or allocations. Storefront detail notices and cart guards use one active language. Existing catalog sales may therefore be blocked until the owner completes reconciliation. Do not deploy without an agreed recovery/rollout plan and independent review.

## Owner workflow

The Connections page has a legacy-inventory review button, product list and fresh source preview. The owner must settle open orders, enter the physically free-to-sell count, and check an explicit confirmation before saving. The input starts empty, with no guessed balance. The count must be a nonnegative integer no greater than the current tracked remote quantity.

The confirmation establishes only a missing baseline. It never resets known allocations or writes remote stock. Source/snapshot changes, active orders, reservation tokens, stale leases and concurrent edits prevent confirmation. A failed confirmation clears the checkbox and requires a fresh preview. A successful confirmation removes that item from the unresolved list. Reopen the review to fetch remaining items.

Legacy products with open order/reservation recovery cannot be reconciled until that work is settled. Untracked remote products need tracked quantities in the remote store. Source changes and already-known balances are not silently rebound. These are explicit limits, not automatic migration.

## Local evidence

- Real Mongo tests cover both providers: unchanged snapshot after local sale, token cleanup, repeated sync/release, clamp/debt recovery, concurrent reservation/sync, stale generations, source/variant changes, untracked quantities, incomplete seeds, explicit legacy recovery, open-order and stale-preview rejection, and imported stock-edit/invoice rejection.
- Public endpoint tests cover default/random lists, bestsellers fallback and single-product responses without ledger/source disclosure.
- Real HTTP/JWT/Mongo route tests cover ownership, non-owner/admin/impersonation rejection, discovery, preview, confirmation, lease exclusion and stale completion.
- Actual dashboard browser fixture intercepts every API and blocks outside requests. It checks empty count, explicit checkbox, no premature POST, exact confirmation body, inert hostile names, Arabic/English switching without losing input, stale-snapshot rejection, fresh preview and success. Screenshots are synthetic.
- Local real-app browser proof checks all three mobile storefront layouts, Arabic and English notices separately, and blocked cart additions. Missing image/icon fixtures are unrelated to the text proof.
- Full local suite: 1,048 passing, zero failing/skipped. This count includes held notification-dispatcher and digest work already present locally. The isolated inventory patch excludes those changes. The separate legacy-Telegram patch and historical pending regression branch are not part of this run.
- Web build succeeded. Focused inventory/stock/public-response set: 100 passing.

No claim is made that every overselling path is eliminated or that this candidate is production-ready.

## Independent-review corrections

- Imported deletion retains an inactive source row and ledger. A later explicit import can reactivate that same row, preserving allocation. Fresh checkout and reservation reject inactive products, including stale carts; cancellation/restoration still reaches the retained ledger.
- Publishing import/recovery writes contain a Mongo-time lease-expiry predicate. Claims, existing-config guards, current checks and completion use the same Mongo clock. A fresh-config race cannot upsert over a claimed connector. The guarantee relies on the route invariant that a running unexpired lease cannot be replaced or reconfigured; it is not a cross-collection transaction or a guarantee against direct database tampering.
- Complete validated snapshots retire omitted source rows without erasing allocation. A successful empty snapshot retires all matching source rows. Failed, truncated or invalid pagination does not enter missing-row retirement.
- ChatOrder has name-only items and no inventory reservation/restoration protocol. Stores containing imported records now use a deterministic protected-storefront handoff for all new chat orders and changes, including local products in mixed catalogs. No new ChatOrder is saved or confirmed through that path. This is a deliberate compatibility restriction, not full chat inventory support. Existing chat cancellation stays metadata-only and never fabricates a stock restoration. Historical stored statuses are not rewritten.
- Raw product context marks unresolved imported quantity as unconfirmed and distinguishes catalog presence from sellable stock. A valid store link is supplied by the handoff when configured; otherwise the customer is asked to get the correct link from the owner.
- Legacy name-only open ChatOrders also prevent baseline reconciliation until settled. There is no inferred SKU matching or guessed migration.
- The reviewer's original deletion, lease-gap, same-stock-edit, chat extraction/context and missing-product probes are included. Further tests cover actual database write-boundary expiry for import and recovery, application-clock skew, concurrent initial config, inactive checkout/reservation, failed pagination, empty snapshots, chat cancellation and legacy chat liabilities.

Supersedes the first inventory candidate. Still local and unshipped; independent re-review and rollout planning remain required.

## V3 transition and validation corrections

Pagination is validated before any store transition, product publication or missing-row retirement. Shopify supports strictly parsed quoted next/previous relations, unique safe cursors and expected first/last-page relation structure. Unquoted or malformed relations are rejected, never silently treated as the last page. Woo page totals must be valid and consistent across pages; a nonempty zero-page result, empty positive page, changing total or out-of-bound page is rejected. Positive valid multi-page imports are tested too.

Chat writes now acquire durable store guards before the write lifecycle. Catalog activation atomically requires no active guard, closes chat writes, then requires every existing pending/processing/confirmed ChatOrder to settle before it can activate. An in-flight native chat create/update causes activation to reject without publishing any products. Once that pre-transition chat write finishes, its open order must be settled; import does not activate and then try to undo a confirmed chat order.

The original adversarial race probe expected import to succeed while the chat create was deliberately paused. The test here uses the supported quiescence-refusal outcome instead: busy import rejection, zero published products, durable chat completion, explicit old-order settlement, successful activation, then refusal of future chat order writes. The malformed-pagination and cancellation probes keep their original assertions.

Cancellation accepts only status and note, not items/fees/totals, and does not recalculate zero totals. For imported/transitioning stores, status-only shipping/delivery may settle existing legacy obligations, but cancelled/delivered records cannot be resurrected. Ordinary product questions still continue through the normal catalog-answer path; they are not turned into order handoffs.

Transition mode and guard records are hidden from public store reads. The connector UI describes the change to chat ordering and reports active-write/open-order blockers in Arabic and English. Even a valid empty first catalog run selects the protected-storefront ordering mode.

### Remaining operational rollout blockers

All application workers must run the guard protocol before activation. A mixed-version rolling deployment cannot establish quiescence for older writers that never registered a guard. Use a reviewed maintenance/staged rollout and verify older writers are stopped before enabling catalog activation.

Guards are not expired by time. A crash-left guard keeps catalog activation blocked. Recovery must verify that the old writer cannot resume, for example after all relevant writers have been stopped/restarted under controlled maintenance, before a separately reviewed guard repair. This patch intentionally provides no unsafe timer or automatic force-unlock, and no completed owner recovery workflow for such a guard. That is a real rollout blocker, not a completed step.

No live rollout, repair, provider action or integration operation was performed. Re-review is still required.

## V4 inert-seed recovery

An expired worker can leave an inactive generation-zero Product seed if its initial upsert reaches Mongo after the application lease check. This patch does not claim that the initial upsert is write-time fenced or that no such row exists.

A legitimate current import can adopt a different-source seed only if it is provably never published under this protocol: generation0, inactive, stock0, allocation0, sales0, no reservation/restoration tokens, and no native Order references of any status. Source binding then changes with an atomic compare-and-set covering the old binding, zero-liability fields, timestamp and Mongo-time current-lease expiry predicate. It remains inactive and generation0 until the separately fenced normal publication succeeds.

Eligibility is checked in preflight, then checked again on the actual row after seeding. This handles a stale seed inserted between the fresh worker's preflight and upsert. A previously published, allocated, active, sold, tokened or referenced record is never migrated by this path. Concurrent publication/allocation invalidates the compare-and-set. Matching-source generation-zero retries also require the zero-liability proof before publishing.

The supplied stale-seed probe is adapted to this expressly selected recovery guarantee, not its original seeded-null assertion: it verifies the inert stale seed exists, then verifies a valid replacement source can publish without lockout. Additional cases cover both providers' late-seed race, every refusal category, publication/allocation at the CAS boundary, and lease expiry at the actual rebinding write even when application checks remain true.

All earlier operational and rollout holds remain. No new UI or live source changes were made for V4.
