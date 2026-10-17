---
name: bg-upstream-sync
description: Explicitly prepare and validate an isolated upstream integration candidate for sendhil/pi-background-tasks from approved immutable downstream and upstream commits; never publish or update the live plugin.
disable-model-invocation: true
---

# Integrate an approved upstream review

Resolve this repository three directories above this skill. Read `../../../docs/fork-policy.md`, `../../../docs/upstream-ledger.md`, and the approved review. This skill is explicit-only. Invocation authorizes a candidate only, not push/PR creation, merging to main, release tags, npm publication, personal settings changes, package installation into Pi, or live reload.

1. Require explicit approval of the exact downstream **local main** SHA, upstream main SHA, last integrated upstream SHA, and (only for selective integration) the ordered full commit list and PR provenance. Each SHA must already exist locally and be 40 lowercase hex characters. Never use caller HEAD as the downstream base. Never resolve a moved symbolic target again and silently treat it as approved. Fetch only through a separately authorized upstream review; sync never fetches.
2. Run the executable preparation guard from the caller repository root. Choose a new sibling path whose parent already exists; do not reuse an empty directory or occupied registration:

   ```sh
   node scripts/maintenance/upstream-report.mjs prepare-sync \
     --previous-upstream <last-integrated-upstream-SHA> \
     --downstream <approved-downstream-SHA> \
     --upstream <approved-upstream-main-SHA> \
     --branch sync/upstream-YYYY-MM-DD \
     --worktree <new-absolute-sibling-path>
   ```

   For an explicitly approved selective integration only, append one `--pick <approved-commit-SHA>` per commit, in approved order. The guard rejects duplicate, missing, ancestor/already-upstream, empty/root/merge, and patch-equivalent-to-downstream selections. It is not a dependency/order solver and does not prove differently squashed or conflict-resolved patches absent: if provenance or equivalence is uncertain, stop for human review.
3. A guard failure blocks all integration. Never auto-stash, reset, reuse branches/paths, or repair unexpected history. On success retain its JSON outside the caller checkout. It creates only a new branch/worktree from the exact downstream base, preserving caller HEAD/index/files, main and tags. Do not run concurrent Git writers. The guard does not merge or run fetched code.
4. In the returned candidate worktree only, default to `git -c core.hooksPath=/dev/null merge --no-ff --no-edit <approved-upstream-main-SHA>`. For an approved pick list instead, run `git -c core.hooksPath=/dev/null cherry-pick -x <SHA>...` in that exact order. Do not combine implicit picks with the main merge. Inspect fetched code before executing any of it. Resolve authored source/policy first; never globally choose ours/theirs. Rebuild `dist` and regenerate docs instead of hand-merging derived bytes.
5. Update `docs/upstream-ledger.md` with source SHAs/PR URLs, decision, local resolution/provenance, required tests and patch-retirement conditions. Install only locked development dependencies **inside the disposable candidate** as needed (`npm ci --ignore-scripts`). Do not change installed Pi packages or feature settings. Commit authored and regenerated changes to a candidate; record its full SHA externally. Editing is allowed to be dirty, validation is not a license to hide uncommitted fixes.
6. In the candidate worktree, activate a supported Node toolchain (24.22.0 or 22.19.0) with npm 11.19.0 for this shell only; do not change global installations. Resolve the committed candidate once, then run the freshness gate **before any other rebuild-capable verification**:

   ```sh
   set -eu
   CANDIDATE=$(git rev-parse HEAD)
   NODE_VERSION=24.22.0 # Use 22.19.0 instead when that is the activated toolchain.
   npm run verify:generated -- \
     --candidate "$CANDIDATE" \
     --node-version "$NODE_VERSION" \
     --npm-version 11.19.0
   node scripts/maintenance/verify-fork.mjs
   ```

   `scripts/maintenance/verify-generated.mjs` checks the actual Node/npm versions against those exact pins and inspects the committed candidate in a clean disposable checkout. Do not substitute a newly moved HEAD midway through qualification. If absent or failing, stop; do not replace it with a local rebuild or `npm pack`. `--metadata-only` is NOT acceptable qualification. The fork gate runs real source/runtime contracts in addition to metadata tripwires; it does not certify installed Pi 1.1.0 or prove absence of all network traffic. Then run relevant baseline/full gates and exact-current-host Git-install qualification specified in fork policy, including default and process profiles. No paid provider calls.
7. Any unexpected failure blocks the candidate. A fix creates a new candidate commit and restarts freshness-first validation. Record evidence externally with candidate SHA; do not commit a validation-only ledger edit after qualification and call the old SHA certified. Return authored/generated diff summaries, exact parents and picks, conflicts, commands/results, residual risks and patch-retirement decisions for human approval. Keep the isolated candidate for review; do not mutate main or the live checkout.
