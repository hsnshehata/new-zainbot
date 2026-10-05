# agy session isolation — A02 read-only inspection (no live dispatch)

Date: 2026-10-05. Method: source read of `dispatch.sh` + `relay.mjs` and
`--help` output of relay + `agy`. **No live agy run was dispatched, no token
was printed or modified.**

## Verdict: PARALLEL agy BLOCKED — single session only

Two concurrent agy sessions are NOT safe with the current wrapper. All agy
work stays at the plan default: **one agy session at a time**, in parallel
with internal agents only. Unblocking parallel agy is an infra task outside
the frontend plan and needs Hassan's decision — no frontend lead changes the
skill or wrapper on their own.

## Evidence

1. **Shared login file, no per-session override.**
   `scripts/dispatch.sh` (lines 18, 34–50) hardcodes one live token path and
   copies an account file over it before EVERY run, then copies the refreshed
   token back afterward:
   `LIVE_TOKEN="/root/.gemini/antigravity-cli/antigravity-oauth-token"` (exact
   line-18 value), `cp -f "$acct" "$LIVE_TOKEN"` … run … `cp -f "$LIVE_TOKEN"
   "$acct"`. The surrounding `for acct in "$ACCT_DIR"/acct*.token` rotation
   loop (lines 34–56) strengthens the BLOCKED verdict: parallel runs not only
   share one live token path but each also writes the refreshed token back
   into a *different* account file, so sessions can swap accounts mid-run.
   There is no `HOME`, `--home`, config-dir, or token-path flag anywhere in
   `dispatch.sh`. Two parallel runs race: run B overwrites the live token run
   A is authenticated with, and the copy-back step clobbers one account file
   with the other session's refreshed token. This is exactly the failure the
   plan §6 describes.

2. **Relay supports separate workspaces and outputs, but NOT separate logins.**
   `relay.mjs --help` (read 2026-10-05) lists: `--cd`, `--add-dir`
   (repeatable), `--out-dir` (run artifacts; defaults under system temp so the
   repo stays clean), `--project` / `--conversation` / `--resume-last` /
   `--new-project` (conversation isolation), `--sandbox` / `--read-only`
   (workspace confinement). None of these isolates the OAuth token file above
   — `--out-dir` separates `result.json`/`agy.log` only, and `--project`
   separates server-side conversations, not local credentials.

3. **`agy --help` exposes no session-identity flags.**
   Flags observed (2026-10-05): `--add-dir`, `--agent`, `--continue`,
   `--conversation`, `--dangerously-skip-permissions`,
   `--disable-slash-commands`, `--effort`, `--input-format`, `--json-schema`,
   `--log-file`, `--mode`, `--model`, `--new-project`, `--output-format`,
   `--print`, `--print-timeout`, `--project`, `--prompt`, `--sandbox`.
   No `--home`, `--config`, `--config-dir`, `--token`, or `--profile` flag
   exists. HOME-override behavior is undocumented, so it cannot be assumed;
   the plan forbids inventing unsupported flags.

4. **No read-only two-session test was run** — correctly so: without login
   isolation the test itself could cross-contaminate the stored accounts,
   and the plan requires the isolation proof BEFORE any parallel use.

## Supported command shape (single session only)

After writing the brief to a file (never inline secrets — the brief rides
`ps` argv), from any directory:

```bash
export PATH="/root/.config/opencode/tools/node-v24.21.0-linux-x64/bin:$PATH"
/root/.config/opencode/skills/agy-delegate/scripts/dispatch.sh \
  --brief /tmp/opencode/<TASK>-brief.txt \
  --cd /workspace/new-zainbot \
  --model gemini-3.8-flash-high \
  --timeout 6m
```

- Always pass an explicit `--timeout` (e.g. `6m`); give the calling tool a
  larger budget (e.g. `480000ms`) so a hang becomes a loud timeout, not silence.
- One bounded piece per brief (one function/renderer/CSS group); big tasks are
  split before dispatch, never sent as «fix everything».
- Read `<out-dir>/result.json` (`result:` path on stdout): `status`,
  `finalMessage`, `touchedFiles`; re-run the gates yourself — the self-report
  is a claim, not evidence. `timeout`/`failed` without quota → redo the piece
  internally, no unbounded retries.
- `429/quota/auth` → AGENTS.md quota rule wins: Telegram Hassan (which model
  died + suggested fallback), checkpoint under `/workspace` without secrets,
  wait for «continue». Never print token contents.
- `--read-only` reviews stay sandbox-confined with no workspace writes; note
  the sandbox also confines READS to `--cd`/`--add-dir`.

## Addendum 2026-10-05 — owner ruling (Hassan, supersedes the BLOCKED cap)

Hassan ruled: **one account at a time until its tokens run out, then the
wrapper rotates to the next; multiple parallel sessions from the same
account are allowed; every session runs on `gemini-3.8-flash-high`.**

Operational consequences for all leads:

- Always pass `--model gemini-3.8-flash-high` explicitly (already the
  wrapper default; now mandatory, no model experiments).
- Max 2 parallel agy sessions (plan §6 cap stands); both use the same
  account; the wrapper's rotation loop handles exhaustion automatically.
- The copy-in/copy-back race from §Evidence(1) is a known accepted risk:
  same-account sessions copy identical content in, and a clobbered
  copy-back only loses a token refresh, never leaks across accounts.
  If sessions ever show cross-talk symptoms, stop parallel use and
  re-escalate to Hassan — do not invent wrapper flags.
- Quota rule (AGENTS.md) unchanged: on 429/quota/auth, Telegram Hassan
  immediately with the dead model + fallback, checkpoint under
  `/workspace` without secrets, and wait.
