---
name: intent
description: Capture a new feature idea, bug or change request as intent/<NNN>-<slug>/intent.md (stage 1 of the intent → spec → plan workflow). Use when the user describes something they want changed and it isn't a trivial fix.
argument-hint: <rough description of the idea>
---

# Capture an intent

Turn the user's idea ($ARGUMENTS) into an `intent.md`. This is about the **problem and
outcome**, not the implementation. Do not write code or a spec.

1. Pick the next number: list `intent/` and use max `NNN` + 1 (start at `001`). Slug is
   2–4 kebab-case words.
2. Create `intent/<NNN>-<slug>/intent.md` from `intent/_templates/intent.md` if the repo
   has one, otherwise from `template.md` next to this skill.
3. Fill it from what the user said. Ground "Who / what is affected" in the actual code
   (skim the relevant source files) so it names real screens, routes, modules and data.
4. Anything you had to guess goes under **Open questions**. Ask the user at most 3 short
   questions if the problem or outcome is genuinely unclear; otherwise leave them listed.
5. Leave `Status: draft`. Tell the user the path, and that approving it (set
   `Status: approved` in the file, or reply "approved") starts the spec automatically.
   Then stop and wait. Never approve it yourself.
6. When the user comes back, re-read `intent.md`. If they replied "approved" but the file
   still says draft, set `Status: approved` for them. If they asked for changes instead,
   make them and go back to waiting.
7. Once it's approved, chain on:
   - If on the default branch (see **Workflow commands** in CLAUDE.md, else `main` or
     `master`), `git switch -c <NNN>-<slug>` first; never commit to the default branch.
   - Commit only the intent folder: `Add intent <NNN>: <title>`.
   - Start the next stage right away by running the `spec` skill for `<NNN>`. Don't ask
     the user to type `/spec`.
