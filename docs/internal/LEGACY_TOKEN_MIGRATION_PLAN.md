# Legacy plaintext channel-token migration — bounded plan (for owner decision)

Status: PLAN ONLY, 2026-11-22. No migration runs without Hassan's explicit
approval. This plan changes stored data (encrypt-in-place), so it is a
write to production data and stays owner-gated.

## Baseline (observed 2026-11-22 01:22 EET, read-only prefix counts in the
prod container, no values read)

- `bots.facebookApiKey`: 0 encrypted (`chv1:`), 10 plaintext
- `bots.instagramApiKey`: 0 encrypted, 2 plaintext
- `bots.whatsappApiKey`: count not taken that night (setter shipped in
  6500692); same class, include in the dry run.
- The counts establish the CURRENT baseline. They cannot date when any
  ciphertext arose; they only show what is stored now.

## Why a bounded batch, not only lazy migration

Lazy migration (encrypt on next save through any write path) leaves tokens
plaintext indefinitely for merchants who never edit their settings. A
one-time bounded batch closes the class. After it, lazy migration remains
as the safety net for anything written in the gap.

## Plan

All steps run from the application (Node with the key), never a raw DB
script; encryption is `encryptChannelToken`, which is idempotent
(already-prefixed values are returned unchanged).

1. **Dry run (read-only)**: count plaintext per field, list bot IDs only.
   Expected: 10 facebookApiKey, 2 instagramApiKey, whatsappApiKey TBD.
   Output goes to logs, not to any persistent diagnostic endpoint.
2. **Backup note**: Atlas holds continuous backups; record the timestamp
   before the run so a point-in-time restore exists. No separate plaintext
   export — that would recreate the exposure.
3. **Batch encrypt**: for each Bot with a non-`chv1:` value in any of the
   three fields, `encryptChannelToken(value)` and `$set` the field.
   One document per save, no transactions needed (idempotent; a rerun is
   a no-op). Log per-document: botId, field, ok/error — never values.
4. **Verify**: prefix counts per field must read 0 plaintext afterwards,
   and one decrypt round-trip per field against the stored ciphertext
   (in-memory compare to the pre-image captured per document during the
   run; never logged).
5. **Soak**: decryption at use sites already handles both formats
   (shipped, tested), so merchants see no change.

## Rollback

Encryption is reversible with the same key: a documented decrypt procedure
can restore plaintext per field. Because the key never leaves the
environment and never rotates, rollback is a code path, not a data rescue.

## Failure handling

- Any single-document error: log botId + field, continue, report the
  remainder as the rollback/redo list. Reruns are safe (idempotent).
- If `CREDENTIAL_ENCRYPTION_KEY` is missing, `encryptChannelToken` throws
  on the first document: fail-closed, nothing half-written silently.

## Decision points for Hassan

1. Approve running the bounded batch on new.zainbot.com (test site) — yes/no.
2. Timing: any quiet window; runtime is seconds for 12+ documents.
3. Include whatsappApiKey in the same run (recommended) — yes/no.
