#!/usr/bin/env bash
# PreToolUse(Bash): block commands that touch production or shared history.
# Exit 2 = block; stderr is shown to Claude. Run these yourself if you mean it.
# Override protected branches with CLAUDE_PROTECTED_BRANCHES="main master release".
set -euo pipefail

source "$(dirname "$0")/lib.sh"
cmd=$(tool_input_field command)
[ -z "$cmd" ] && exit 0

protected=${CLAUDE_PROTECTED_BRANCHES:-main master}
branch_re="($(tr ' ' '|' <<<"$protected"))"

block() {
  echo "Blocked by .claude/hooks/production-gate.sh: $1" >&2
  echo "This needs a human. Ask the user to run it themselves if intended." >&2
  exit 2
}

# Pushing to a protected branch or rewriting remote history.
current=$(git -C "${CLAUDE_PROJECT_DIR:-$PWD}" branch --show-current 2>/dev/null || true)
while IFS= read -r push; do
  [ -z "$push" ] && continue
  grep -Eq "(^|[[:space:]:])$branch_re([[:space:]]|\$)" <<<"$push" && block "push to a protected branch"
  grep -Eq '(--force|[[:space:]]-f([[:space:]]|$)|[[:space:]]\+[^[:space:]]+)' <<<"$push" && block "force push"
  # Bare `git push` / `git push -u origin` while on a protected branch.
  if [ -n "$current" ] && grep -Eqx "$branch_re" <<<"$current" \
     && grep -Eqx 'git[[:space:]]+push([[:space:]]+(-u|--set-upstream|origin))*[[:space:]]*' <<<"$push"; then
    block "push while on protected branch $current"
  fi
done < <(grep -oE 'git[[:space:]]+push[^;&|]*' <<<"$cmd" || true)

# Production databases.
grep -Eq 'supabase[[:space:]]+(db[[:space:]]+(push|reset[^|;&]*--linked)|migration[[:space:]]+repair)' <<<"$cmd" && block "writes to a linked Supabase database"
grep -Eq 'prisma[[:space:]]+(migrate[[:space:]]+(deploy|reset)|db[[:space:]]+push)' <<<"$cmd" && block "Prisma migration against a real database"

# Deploys, releases and infrastructure.
grep -Eq 'vercel[^|;&]*(--prod|promote)' <<<"$cmd" && block "production deploy"
grep -Eq '(netlify[^|;&]*deploy[^|;&]*--prod|fly[[:space:]]+deploy|railway[[:space:]]+up|wrangler[[:space:]]+deploy)' <<<"$cmd" && block "deploy"
grep -Eq '(npm|pnpm|yarn)[[:space:]]+publish|cargo[[:space:]]+publish|twine[[:space:]]+upload|eas[[:space:]]+submit' <<<"$cmd" && block "package or app store release"
grep -Eq 'terraform[[:space:]]+(apply|destroy)|pulumi[[:space:]]+(up|destroy)|kubectl[[:space:]]+(apply|delete)' <<<"$cmd" && block "infrastructure change"

# Live-mode payments.
grep -Eq 'stripe[^|;&]*(--live|sk_live_)' <<<"$cmd" && block "live-mode Stripe"

exit 0
