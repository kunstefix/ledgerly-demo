#!/usr/bin/env bash
# PreToolUse(Edit|Write|MultiEdit): protect secrets, applied migrations and generated output.
# Exit 2 = block; stderr is shown to Claude.
# Extra project-specific generated paths: one glob per line in .claude/hooks/generated-paths.
set -euo pipefail

source "$(dirname "$0")/lib.sh"
path=$(tool_input_field file_path)
[ -z "$path" ] && exit 0
root=${CLAUDE_PROJECT_DIR:-$PWD}
rel=${path#"$root/"}
name=$(basename "$rel")

block() {
  echo "Blocked by .claude/hooks/guard-files.sh: $1" >&2
  exit 2
}

# Secrets. Example/template env files are fine.
case "$name" in
  *.example|*.sample|*.template) ;;
  .env|.env.*|.dev.vars|*.pem|*.key|*.p12|credentials.json|service-account*.json)
    block "$rel holds secrets — ask the user to edit it." ;;
esac

# Applied migrations: add a new one instead of editing history. A migration counts as
# applied once it is committed; new, uncommitted ones can still be edited while authoring.
case "$rel" in
  */migrations/*|migrations/*|*/db/migrate/*|db/migrate/*|*/alembic/versions/*|alembic/versions/*|drizzle/*)
    # Ask the file's own repository (it may be a worktree of the project, not the root).
    if [ -e "$path" ] && git -C "$(dirname "$path")" cat-file -e "HEAD:./$(basename "$path")" 2>/dev/null; then
      block "$rel is a committed migration. Add a new migration instead of editing an applied one."
    fi
    ;;
esac

# Lockfiles and generated output: change the source and regenerate.
case "$name" in
  package-lock.json|pnpm-lock.yaml|yarn.lock|bun.lock|bun.lockb|Cargo.lock|poetry.lock|uv.lock|Gemfile.lock|go.sum|Podfile.lock)
    block "$rel is a lockfile. Change the manifest and run the package manager instead." ;;
esac
case "$rel" in
  node_modules/*|*/node_modules/*|.next/*|dist/*|build/*|out/*|coverage/*|.turbo/*|.expo/*|__pycache__/*|*/__pycache__/*|target/*)
    block "$rel is generated output. Change the source and rebuild instead." ;;
esac

extra="$root/.claude/hooks/generated-paths"
if [ -f "$extra" ]; then
  while IFS= read -r glob; do
    case "$glob" in ''|\#*) continue ;; esac
    # shellcheck disable=SC2254
    case "$rel" in $glob) block "$rel is generated ($glob in generated-paths). Change the source and regenerate instead." ;; esac
  done <"$extra"
fi

exit 0
