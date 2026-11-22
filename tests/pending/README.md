# Owner-assistant quota boundary, unresolved release policy

Run `node tests/pending/assistantQuotaBoundary.repro.js` explicitly.

The probe uses synthetic in-memory MongoDB, real authentication/router/controller
code and a stub at the completion boundary. It makes no provider request.

At the current implementation, an authenticated free account already at its
customer-bot allowance (25 daily and 250 monthly messages) can obtain an owner
assistant answer. The assistant requests one completion and does not change those
counters. It is still authenticated and rate limited at 40 requests per 15 minutes;
real completions use the shared dispatcher and its usage ledger.

This demonstrates a separate accounting path, not a bypass of established
owner-assistant terms. No source found defines whether the business-owner assistant
shares customer-bot quota or has a separate allowance. That is an unresolved release
policy. Do not change quota semantics or spend money to test it without an owner
decision. This file is outside default `*.test.js` discovery, and no implementation
change is included in this branch.
