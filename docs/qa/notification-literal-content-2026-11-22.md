# Notification text boundary check, 2026-11-22

The dispatcher treats dynamic values as text. Telegram templates retain only
static bold tags. Plain-channel values decode once after removing those static
tags. Original entity spellings and tag-looking customer text remain literal.
Persisted in-app snippets keep the existing 500-character slice, and titles
remain original plain-text data.

## Current frontend boundary

Repository search of public frontend assets found no consumer of persisted
notification rows from GET /api/notifications. Current dashboard notification
UI manages recipient settings and creates admin broadcasts. Transient feedback
is a different component, not proof of persisted-row rendering. Future consumers
must render both title and message through textContent or equivalent text
binding, never innerHTML. No claim is made about clients outside this repository.

## Telegram length and failure limits

Official API source: https://core.telegram.org/bots/api/methods/sendmessage.md
specifies 1-4096 characters after entity parsing. Escaping can increase wire
length without increasing decoded text length. The focused local tests cover
entity-heavy formatted bodies at 4096 and 4097 decoded code points, entity
spellings, tag-looking text and preservation without wire-length slicing.
These are local boundary tests, not live Telegram acceptance or exhaustive
Unicode counting proof.

The current service has no split/truncate mechanism, no parse-error retry and
no fallback that resends malformed HTML as plain text. Provider rejections
return ok:false. A decoded body above Telegram's limit is an existing unsolved
delivery limit. This formatter change does not fix oversized notifications,
change routing or add sends. Real channel acceptance is still untested.
