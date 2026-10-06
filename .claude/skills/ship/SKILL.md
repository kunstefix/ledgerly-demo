---
name: ship
description: Verify the current branch and open a pull request for review (stage 5). Use when the user runs /ship or says the work is ready for a PR.
---

# Ship the current branch as a PR

Project commands come from **Workflow commands** in CLAUDE.md (inferred from the project
manifest if missing; skipped if the project has no such step).

1. Refuse if on the default branch. Make sure the working tree is committed.
2. Run the verify command. If it fails, fix the cause (never by weakening tests) or stop
   and report.
3. Run the build command, with the dummy env CLAUDE.md gives if it needs one. Stop and
   report on failure.
4. If an `intent/<NNN>-*/plan.md` belongs to this branch, delegate to the `verifier`
   agent and include its verdict. Otherwise, run the verifier against the diff alone.
   If the verifier already returned PASS for the current HEAD in this session (e.g.
   `/build-plan` handed off to you), reuse that verdict instead of running it again.
   Stop on FAIL or PASS WITH GAPS unless the user said to ship anyway.
5. Push the branch and open a PR with `gh pr create` against the default branch:
   - Title: the user-visible change.
   - Body: summary, link to the intent folder (if any), verification results, the
     verifier's visual findings for UI changes, and any risks called out in the spec.
6. Print the PR URL. If the repo has a `REVIEW.md`, automated review follows it; a human
   merges.
