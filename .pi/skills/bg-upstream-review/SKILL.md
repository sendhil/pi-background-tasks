---
name: bg-upstream-review
description: Explicitly review ismailsaleekh/pi-background-tasks upstream changes against sendhil/pi-background-tasks fork policy, recording immutable revisions without integrating code.
disable-model-invocation: true
---

# Review this fork's upstream

This is a project-local skill for a trusted checkout, not an installed runtime resource. Resolve the repository root three directories above this skill. Read `../../../docs/fork-policy.md` and `../../../docs/upstream-ledger.md` first. Do not change personal Pi/Git settings, installed packages, or operator feature selection.

1. Identify the last integrated upstream full commit SHA from the ledger. Never substitute the caller's HEAD or a remembered branch tip. If the ledger, expected remotes, or local main identity is uncertain, stop for review.
2. Run the executable guard from the repository root (replace `<last-integrated-upstream-SHA>` with its exact 40-character value):

   ```sh
   node scripts/maintenance/upstream-report.mjs review --previous-upstream <last-integrated-upstream-SHA>
   ```

   Dirty state, Git operations in progress, unexpected remotes, or broken ancestry are blockers. Do not stash, reset, reconfigure remotes, or bypass a refusal.
3. Only when the user authorizes refreshing upstream refs, repeat with `--fetch`. This fetch uses `--no-tags` and the sole explicit destination `refs/heads/main:refs/remotes/upstream/main`; it ignores configured fetch refmaps. Save its JSON outside the checkout. It records before/after caller HEAD, symbolic HEAD, index digest, worktree status, and all protected refs (including local branches/tags). Only the designated remote-tracking ref, its reflog, fetch metadata, and Git object storage may change. A fetch rejection may leave downloaded objects or that designated ref changed; stop, inspect, and obtain a new review, never auto-restore or force-fetch.
4. Use the returned exact `downstream` (local `refs/heads/main`) and `upstream` SHAs for ordinary read-only `git log`, `git diff --stat`, and authored-source inspection. Do not execute fetched scripts or code. Read releases/PRs/issues using ordinary GitHub tools only if network review is authorized; otherwise report that evidence unavailable. Do not imply an issue is reproduced because it was reported.
5. Produce a bounded report (at most 50 new commit summaries and 20 relevant PR/issue entries; summarize overflow) with source links and exact SHAs. Include ahead/behind, changed subsystems, conflict hotspots and tests. Classify each recommendation: integrate, already present, superseded, conflicts with fork policy, or needs reproduction. Record any selected PR's original URL and ordered full commit SHAs separately; the script does not fetch PRs.
6. Return the report for explicit authorization of BOTH downstream main SHA and upstream main SHA (and exact ordered pick list, if any). An approval is immutable: moved targets require a fresh review. Review does not authorize sync.

Never merge, cherry-pick, commit, install, push, publish, modify main, or run fetched code in this skill. Executable guards constrain supported operations; neither this skill nor Git scripts are a sandbox against malicious local configuration or concurrent writers.
