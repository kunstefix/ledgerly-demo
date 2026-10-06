---
name: security-checklist
description: Security and money-safety checklist for a change. Apply whenever a change touches auth or sessions, data access rules, admin/service credentials, payments or webhooks, API routes, AI prompts or tools, secrets/env vars, PII or analytics, or anything listed under Sensitive areas in CLAUDE.md.
---

# Security checklist

Check each item that applies to the diff and report concrete findings (file:line), not
generic advice. Also apply any project-specific rules under **Sensitive areas** in
CLAUDE.md.

**Auth and access**
- Every new route, action or query checks who the caller is and that they may touch
  *this* record (no IDOR: IDs from the client are never trusted as proof of ownership).
- Data access rules (row-level security, policies, middleware) cover new tables/columns.
- Admin or service-role credentials are only used in trusted server code, never shipped
  to the client.

**Input and output**
- All external input is validated server-side (type, length, range, enum).
- No string-built SQL, shell commands or HTML; use parameters and escaping.
- Errors don't leak stack traces, secrets or other users' data.

**Secrets and config**
- No secrets in code, logs, client bundles or public env prefixes
  (`NEXT_PUBLIC_`, `VITE_`, `EXPO_PUBLIC_` ...).
- New env vars are documented in the example env file.

**Payments and webhooks**
- Webhook signatures are verified on the raw body; handlers are idempotent.
- Prices, amounts and entitlements come from the server or the provider, never the
  client. Test-mode keys only in non-production code paths.

**AI features**
- User input can't override system instructions to reach tools or data it shouldn't.
- Tool calls are authorised as the user, and model output is treated as untrusted.
- Cost limits: rate limiting, max tokens, no unbounded loops.

**Privacy**
- PII is collected only when needed, not logged, and not sent to analytics.

**Abuse**
- Public endpoints that cost money or send messages are rate-limited.
