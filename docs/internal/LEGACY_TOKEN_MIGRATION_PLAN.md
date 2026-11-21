# Legacy plaintext channel-token migration — bounded plan (for owner decision)

Status: PLAN ONLY, 2026-11-22. No migration runs without Hassan's explicit
approval. This plan changes stored data (encrypt-in-place), so it is a
write to production data and stays owner-gated.

## Baseline (observed 2026-11-22 01:22 EET, read-only prefix counts in the
prod container, no values read)

- `bots.facebookApiKey`: 0 encrypted (`chv1:`), 10 plaintext
- `bots.instagramApiKey`: 0 encrypted, 2 plaintext
- Affected documents (observed 2026-11-22 01:56 EET): 12 DISTINCT bot
  documents carry the 12 plaintext fields; no document carries both -
  exactly one plaintext field per affected document.
- `bots.whatsappApiKey`: 0 encrypted, 0 plaintext (observed 2026-11-22
  01:53 EET) - no tokens of this class exist on the test site; nothing to
  migrate. Also observed: no stored WhatsApp QR session blobs (the one
  GridFS bucket has 0 objects), so that class is currently latent too.
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

1. **Dry run (read-only)**: count plaintext per field AND distinct affected documents, list bot IDs only.
   Expected: 10 facebookApiKey, 2 instagramApiKey, 0 whatsappApiKey, across 12 distinct documents (already observed; recount anyway).
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

## Risks (explicit, none waived)

- **Key dependency**: every encrypted value is unreadable without
  `CREDENTIAL_ENCRYPTION_KEY`. The migration raises the blast radius of a
  key loss from "some tokens" to "all channel tokens". Mitigation: the key
  already lives only in Coolify env and the vault; it must never rotate;
  Hassan should confirm he holds no other copy expectation before the run.
- **Write/verification failure mid-run**: a failed document is logged by
  ID and left plaintext (the setter is idempotent; reruns are safe). A
  document can end up neither broken nor migrated; never half-encrypted,
  because each field write is a single $set.
- **Backup/rollback**: encrypt-in-place is reversible ONLY through the
  documented decrypt procedure with the same key - a code path, not a
  data rescue. Atlas point-in-time restore from the recorded pre-run
  timestamp is the disaster fallback; restoring it also restores
  plaintext, so a restore must be followed by a re-run of this batch.
- **Credential preservation**: tokens are not rotated or re-issued; the
  same secret changes only its stored form. If Meta has already expired a
  plaintext token, the migration preserves an already-dead token - the
  verification step proves decryptability, not token validity against
  Meta's API. Validating tokens against Meta is a separate, optional,
  owner-approved step (read-only API calls).

## Rollback

Per-field decrypt with the same key, documented procedure. Atlas PITR as
disaster fallback (see Risks).

## Failure handling

- Any single-document error: log botId + field, continue, report the
  remainder as the rollback/redo list. Reruns are safe (idempotent).
- If `CREDENTIAL_ENCRYPTION_KEY` is missing, `encryptChannelToken` throws
  on the first document: fail-closed, nothing half-written silently.

## Decision points for Hassan

1. Approve running the bounded batch on new.zainbot.com (test site) — yes/no.
2. Timing: any quiet window; runtime is seconds for 12+ documents.
3. whatsappApiKey is currently zero rows; keep it in the run as a no-op guard so anything added later is covered.
