---
name: build-plan
description: Interview the user and write plan.md, the implementation plan for an approved spec (stage 3 of the intent → spec → plan workflow). Use when the user runs /build-plan or wants to plan the build of an approved spec.
argument-hint: <intent number or folder, e.g. 004>
---

# Plan the build

Project commands (install, verify, build) come from **Workflow commands** in CLAUDE.md.
If a command isn't listed there, infer it from the project manifest (`package.json`
scripts, `Makefile`, `pyproject.toml`, `Cargo.toml`, `go.mod` ...) and suggest adding it
to CLAUDE.md. If the project has no such step, say so and skip it.

1. Resolve `intent/$ARGUMENTS*/`; read `intent.md` and `spec.md`. If the spec isn't
   `approved`, stop and say so.
2. Get into a worktree before writing anything, so the plan, the code and the PR all
   live on one branch:
   - Already under `.claude/worktrees/`? Stay there.
   - Otherwise note `git rev-parse HEAD` (it holds the committed intent and spec), then
     use the `EnterWorktree` tool: `path: .claude/worktrees/<NNN>-<slug>` if that
     worktree exists (`git worktree list`), else `name: <NNN>-<slug>`.
   - If the new worktree has no `intent/<NNN>-*/spec.md`, bring the commits over with
     `git merge --ff-only <noted sha>`. If that fails, stop and ask the user.
   - If uncommitted changes in the old checkout belong to this intent, stop and ask
     rather than leaving them behind.
   - Run the install command in a fresh worktree before any checks.
3. Explore the code paths the spec touches. Don't edit anything yet.
4. Interview the user: ask only the questions whose answers change the plan
   (trade-offs, ambiguous requirements, UX details). Batch them into one round.
5. Write `plan.md` from `intent/_templates/plan.md` if the repo has one, otherwise from
   `template.md` next to this skill: every file to change, the tests that prove each
   requirement, risks and rollback, and the verification checklist.
6. Show the plan summary and wait for approval. On approval set `Status: approved`,
   commit the intent folder (`Plan: <title>`), then implement in the worktree.
7. While building: if you depart from the plan, record it under **Deviations**. When
   finished, commit, run the verify command, then delegate to the `verifier` agent.
8. Act on the verdict:
   - **PASS**: set `Status: done`, commit, and run the `ship` skill right away without
     asking. Tell `ship` the verifier already passed on this HEAD.
   - **FAIL** or **PASS WITH GAPS**: stop. Show the verdict and the must-fix list and
     ask the user how to proceed. Don't ship, and don't mark the plan done.
