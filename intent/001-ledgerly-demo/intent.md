# Intent: Ledgerly demo app

Status: approved <!-- draft | approved | rejected -->
Owner: @kunstefix
Date: 2026-10-05

Approved as part of Loopback's phase 1 intent (`kunstefix/loopback`,
`intent/001-loopback-phase-1/intent.md`, decision "Ledgerly", and brief §6), and by the
owner's go-ahead to create this repo on 2026-10-05.

## Problem
Loopback's demo needs a believable software company to support. Without one, its agent
can't be shown answering from a real help center, real code and a real customer's data,
and Loopback would be tempted to carry demo-only code. A demo that connects through
public integration points only also proves that real installs work.

## Proposed outcome
- A small invoicing SaaS, Ledgerly, with seeded customers, plans, subscriptions,
  invoices, payments and failed-payment retries, that a visitor can click through as one
  of its customers.
- Every page embeds Loopback's chat widget with one `<script>` tag and a signed token
  for the signed-in customer.
- Loopback can index this public repository, query the signed-in customer's data
  through a read-only role and allowlisted views, and import the help center as
  markdown.
- 3–5 planted bugs, documented in `PLANTED_BUGS.md`, give customers something real to
  report and Loopback's agent something real to find in the code.
- Public Docker images (app and seeded database) that Loopback's `demo` Compose profile
  pulls anonymously.

## Who / what is affected
- **Loopback** (`kunstefix/loopback`): its `demo` profile and `demo-setup` (spec M3,
  R24–R27) consume this repo, its images, its help export and its named queries.
- **Demo visitors**: sign in as a seeded customer and chat with support.
- **GitHub and GHCR**: a public repo and two public images under `kunstefix`.

## Constraints
- No dependency on Loopback's code: only its widget script URL and token format
  (HS256 JWT, `sub`, `email`, `name`, `exp` ≤ 24 h; Loopback ADR-0009).
- Small and readable: the code is what Loopback's agent reads and summarizes.
- No real secrets, payments or personal data. Demo credentials are published.
- MIT licence.

## Open questions
None.
