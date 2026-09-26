# Security Policy

## Reporting a vulnerability

**Do not open a public issue.** Contact the maintainer privately with:

- What you found and where (`file:line` or endpoint + method)
- Steps to reproduce (without real customer data)
- The impact you estimate

You should get a first response within 72 hours. Once fixed, we credit reporters in the release notes (unless you prefer anonymity).

## Scope notes

- Secrets (JWT, DB URIs, provider keys) are env-only: `JWT_SECRET`, `MONGODB_URI`, `CREDENTIAL_ENCRYPTION_KEY` must never appear in code, logs, or API responses — the test suite (`securityFoundation`, `webhookSecurity`) guards this.
- Public webhooks (`/api/webhook/*`, Telegram) are signature-verified; production should run behind HTTPS with restrictive `CORS_ORIGINS`.

العربية: لو لقيت ثغرة ابعتها خاص للمشرف (مش issue عامة) مع مكانها وخطوات الاستغلال من غير بيانات عملاء حقيقية.
