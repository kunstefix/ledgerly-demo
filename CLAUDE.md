# ledgerly-demo

Ledgerly is a small, deliberately imperfect invoicing SaaS. It exists only as the demo
customer of [Loopback](https://github.com/kunstefix/loopback), an open-source AI support
platform. Loopback connects to it exactly as it would to a real company: it indexes this
public repository, reads Ledgerly's database through a read-only role and allowlisted
views, imports its markdown help center, and is embedded in its UI as a chat widget.

Everything here is fake: customers, payments and card data are seed fixtures. The bugs
listed in `PLANTED_BUGS.md` are intentional; do not fix them.

## Workflow

Changes that aren't trivial go through `intent → spec → build-plan → ship`
(skills in `.claude/skills/`). Each stage writes to `intent/<NNN>-<slug>/` and waits for
approval before the next one starts. The `verifier` agent checks the work before a PR.

## Workflow commands

- Default branch: `main`
- Install: `pnpm install --frozen-lockfile`
- Verify (lint + typecheck + tests + format check): `pnpm verify`
- Build: `pnpm build`; images: `docker compose build`
- UI check: none

## Sensitive areas

- The integration contract with Loopback (`loopback/`, the `support` schema views, the
  widget token) is public API: changing it breaks Loopback's demo profile.
- Never put real secrets in this repo. Demo passwords are published on purpose.

## Conventions

- Node 24, pnpm via corepack, TypeScript strict, ESM with `.js` relative imports.
