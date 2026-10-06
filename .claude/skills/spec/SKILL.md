---
name: spec
description: Generate spec.md from an approved intent.md (stage 2 of the intent → spec → plan workflow). Use when the user runs /spec or asks to spec out an approved intent.
argument-hint: <intent number or folder, e.g. 004>
---

# Write a spec from an approved intent

1. Resolve the folder `intent/$ARGUMENTS*/` (or the most recent one if no argument).
   Read `intent.md`. If its status isn't `approved`, stop and say so.
2. Read the code the change touches — enough to design against what actually exists
   (core types, the relevant components/routes/modules, schema and migrations).
3. Write `spec.md` next to it from `intent/_templates/spec.md` if the repo has one,
   otherwise from `template.md` next to this skill:
   - Requirements are numbered (R1, R2 ...) and each one is testable.
   - Design covers UX flow, state and data changes, API shape, migrations.
   - **Risks & concerns**: if the change touches anything in the `security-checklist`
     skill's scope (or the **Sensitive areas** in CLAUDE.md), apply that checklist and
     list concrete concerns.
   - Acceptance checks map every requirement to an automated test or a manual check.
4. Keep `Status: draft`. Summarise the spec in a few lines, list any concerns, and tell
   the user that approving it (set `Status: approved`, or reply "approved") starts
   `/build-plan` automatically. Then stop and wait. Never approve it yourself.
5. When the user comes back, re-read `spec.md`. If they replied "approved" but the file
   still says draft, set `Status: approved` for them. If they asked for changes, make
   them and go back to waiting.
6. Once it's approved, chain on:
   - If on the default branch, `git switch -c <NNN>-<slug>` first; never commit to it.
   - Commit only the intent folder: `Spec <NNN>: <title>`.
   - Start the next stage right away by running the `build-plan` skill for `<NNN>`.
     Don't ask the user to type `/build-plan`.
