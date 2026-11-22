# Pending catalog stock regression

Run `node tests/pending/catalogReservation.repro.js` explicitly.

The two cases currently fail intentionally. They are not part of the default
`*.test.js` discovery, and a passing default suite does not mean inventory is
safe to launch. The WooCommerce and Shopify fixtures use in-memory Mongo and
stub every remote catalog response. No live accounts or provider calls are used.

Current result for each provider:

- Import a tracked remote stock of 10.
- Reserve 2 locally. Available stock is 8 and one reservation is recorded.
- Import the unchanged remote stock of 10 again.
- Available stock becomes 10 while the reservation remains.

The failing assertion expects 8 so the reservation is not offered for sale again.
That expectation identifies the unsafe overwrite, not a selected reconciliation
algorithm. The owner has not yet chosen local versus remote inventory authority.
Do not alter merchant stock semantics, infer unlimited stock, or adopt a delta
algorithm merely to make this reproduction pass. Concurrent/stale snapshots,
local-versus-remote sale overlap and sync fencing still need design and review.

The separate untracked-stock checkout mismatch is also not fixed by this test.
