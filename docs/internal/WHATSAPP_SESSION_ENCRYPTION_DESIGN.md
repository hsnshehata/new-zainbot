# WhatsApp QR session encryption at rest — design (not implemented)

Status: DESIGN ONLY, 2026-11-22. No code changes without owner approval.
Owner decision required before implementation (migration of stored sessions).

## Problem

WhatsApp QR pairing uses `whatsapp-web.js` `RemoteAuth` with `wwebjs-mongo`'s
`MongoStore`. The session (full account access: auth keys and tokens) is
zipped to `<session>.zip` and stored in GridFS buckets named
`whatsapp-<session>` **unencrypted**. Anyone with read access to the
database (backup, dump, mis-scoped credential) can take over the merchant's
WhatsApp account silently.

This is the last plaintext credential class on the platform:
- Meta per-page tokens (facebookApiKey/instagramApiKey/whatsappApiKey):
  encrypted at rest since bc132ca/6500692 (`channelTokenCrypto`, `chv1:`).
- AiCredential secrets: AES-256-GCM control plane.
- QR session blobs: this document.

## Constraints

- `RemoteAuth` drives the store through four calls: `sessionExists`,
  `save` (reads `<session>.zip` from disk, streams to GridFS),
  `extract` (GridFS -> path on disk), `delete`.
- No forced re-pairing: existing sessions must keep working. A lazy
  migration happens on the next scheduled save (RemoteAuth re-saves every
  `BACKUP_SYNC_INTERVAL_MS`), never by invalidating sessions.
- Same process key (`CREDENTIAL_ENCRYPTION_KEY`) via
  `AiCredentialCrypto.loadCredentialEncryptionKey`; a DIFFERENT AAD scope
  so ciphertexts are not interchangeable with channel tokens.
- Multi-worker: the existing session lock is unchanged; encryption adds no
  new concurrency surface (one writer per session at a time).

## Design

New `EncryptedMongoStore extends MongoStore` (composition over
`wwebjs-mongo`'s class, injectable for tests like today):

- **save({ session })**: read `<session>.zip` fully into memory (session
  zips are a few MB), encrypt as one blob:
  `magic 'wsv1' (4 bytes) | iv (12) | tag (16) | ciphertext`,
  AES-256-GCM, AAD = `whatsapp-session:{keyId}:{session}`.
  Upload as filename `<session>.zip` with GridFS metadata
  `{ enc: 'wsv1' }`. After the encrypted upload succeeds, delete any
  legacy plaintext objects for the same session (this is the lazy
  migration point; it only runs for sessions that already saved at least
  once under the new build).
- **extract({ session, path })**: list objects; prefer the newest.
  If metadata `enc === 'wsv1'` (or the `wsv1` magic), download, verify
  tag, decrypt, write plaintext zip to `path`. Otherwise treat as legacy
  plaintext and pass through unchanged. Wrong key or tampered blob THROWS
  (fail-closed); the session is never auto-deleted on decrypt failure —
  surface a "session unreadable, re-pair required" runtime state instead,
  so an operator mistake (key change) shows as a pairing request, not
  silent data loss.
- **sessionExists / delete**: unchanged (metadata/count based).
- **In-memory, one-shot GCM** is acceptable here: blobs are MBs, and GCM
  tag verification requires the full message anyway.

## Residual risks (accepted, documented)

- The zip on local disk (`dataPath`) stays plaintext while the container
  runs. Mitigation: container FS is ephemeral and per-service; the zip is
  deleted with the container. At-rest protection targets the DATABASE,
  which is the durable, backup-replicated copy.
- Key loss = unrecoverable sessions (re-pair needed). Same posture as
  channel tokens; `CREDENTIAL_ENCRYPTION_KEY` must never rotate without a
  re-encryption plan.
- GridFS old-object cleanup (`#deletePrevious`) keeps only the newest;
  encrypted saves must run the same cleanup so plaintext predecessors do
  not linger.

## Rollout (after owner approval)

1. Ship `EncryptedMongoStore` behind env `WHATSAPP_SESSION_ENCRYPTION=off`
   default-off, unit tests: round-trip, legacy passthrough, tamper throw,
   legacy plaintext object removed after first encrypted save.
2. Enable on the test site; verify one live bot: session keeps working
   across a redeploy (extract path), GridFS object carries `enc: 'wsv1'`
   metadata, no plaintext copy remains.
3. Default-on in a later release after a soak period; remove the flag.

## Explicitly out of scope

- No forced re-QR / session invalidation.
- No change to WhatsApp Cloud (platform env token) or Telegram paths.
- No bulk migration job; lazy re-save only.
