# D02-blob — fetchBlob contract extension (status: done)

## Scope
- `public/js/dashboard-request.js`: added `ZainBotRequest.fetchBlob(url, options?, policy?) → { blob, filename }` (+ `DEFAULT_BLOB_FILENAME = 'download'`).
- `tests/dashboardRequest.test.js`: 6 new `fetchBlob` tests; extended the contract-exposure test.
- No other files touched. No git add/commit (per instruction).

## Contract
- Same transport as `requestJson`: Bearer injection (caller header wins), read timeout defaults to 15000ms, mutations untimed unless explicit, exactly one `fetch` (no auto-retry).
- 401 ONLY fires `policy.onUnauthorized` (once, before body read); 403 never does.
- `filename` from `Content-Disposition` (RFC 5987 `filename*` preferred, then `filename`); basename-only, quotes/control-chars stripped; fallback `'download'`.
- Failures throw `RequestError`: `http` (outcomeUnknown:false) on `!ok`, `network`/`timeout` with outcomeUnknown per operation (read:false, mutation:true), `parse` when `blob()` is unreadable.
- Deliberately NO default `Accept: application/json` (blob endpoints answer markdown/html/octet-stream).

## Gates
- Extended file green: `node --test tests/dashboardRequest.test.js` → 22 pass / 0 fail (16 pre-existing + 6 new).
- Full `npm test` → 460 ✔, 0 failures in every suite.

## Unblocks
- F04 council move: `exportIdeaReport` can switch from raw `fetch`+`getToken` to `fetchBlob` with identical auth/session behavior.
