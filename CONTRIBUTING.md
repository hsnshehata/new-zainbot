# Contributing to ZainBot AI

Thanks for helping! (بالعربي: مساهمتك مرحب بها — نفس القواعد تحت تنطبق على الكل.)

## Ground rules

1. **Bilingual UI (contract):** every user-visible string ships in Arabic **and** English in the same PR — `data-i18n` (+ `data-i18n-placeholder` / `data-i18n-aria`), with both `en` and `ar` entries. Run the translation tests before pushing.
2. **Tests:** `npm test` must pass. Add a test for every new API route and every new translation key.
3. **No secrets:** never commit `.env`, tokens, keys, or customer data. Use `.env.example` for new variables.
4. **Small PRs:** one feature/fix per PR, conventional commits (`fix:`, `feat:`, `docs:`, `test:`).

## Workflow

```bash
git checkout -b feat/my-change
# ... code ...
npm test
git commit -m "feat(scope): what changed"
git push origin feat/my-change   # then open a PR against master
```

## What to work on

Good first issues: translation gaps (`chat.html`, `store.html`, `landing.html` are Arabic-only today), docs, and anything labeled `good first issue`.
