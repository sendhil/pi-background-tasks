---
doc_id: fork-policy
audience: maintainer
mode: authored
review_policy: contract
stability: evolving
covers_surfaces: []
covers_sources: []
---
# Public personal fork policy

This is **sendhil/pi-background-tasks**, a public GitHub fork of [ismailsaleekh/pi-background-tasks](https://github.com/ismailsaleekh/pi-background-tasks). `private: true` in package metadata prevents accidental npm publication; it does not change repository visibility. Retain the package name, ISC license, upstream author and third-party notices. Installation, after separate approval, uses an immutable fork Git commit/tag through Pi, not an upstream npm update. Never register upstream and fork simultaneously.

## Baseline and qualification

- Upstream baseline: `799182ff65d7040732aea23b2001ea860b688531` (2.6.10).
- Implementation starting point: `ed049f468eddd31c6c58985a62fa44296a7bc53d` (plan/evidence handoff).
- Investigation toolchain: Node 26.8.1, npm 11.19.0. Node 22/24 qualification remains required; a local Node 26 pass is not evidence for those lanes.
- Required current host: exact Pi 1.1.0, loaded through manifest-declared committed `dist/extensions/*` roots using its real Git installation mechanism in an isolated agent directory. No installed-host compatibility claim follows from peer `*` or source tests with the locked development SDK.
- Keep the locked development SDK unless demonstrated API incompatibility requires a separately reviewed update. Host-provided packages belong in peers with `*`, never runtime/optional/bundled dependencies. Keep existing compiled public entrypoints.
- Unchanged baseline: typecheck passed, unit 743/747; controlled canonical-TMPDIR/serial reruns passed 89/89, components 12/12. See [baseline evidence](superpowers/plans/2026-10-17-background-tasks-baseline.md). Four initial failures are not silently waived; no full-suite or cross-platform pass is implied.
- Dev-inclusive audit had five affected packages; production-only audit had zero. This is not an audit of the installed Pi host.

## Permanent downstream behavior

- No plugin-owned updater lookup, timer, notice, warning, command or install advice. Pi package management remains separate.
- Attention-only footer: running counts and unseen failures, no successful/stopped badges or persistent command hints. Keep notification/history/seen-state semantics and other extensions' status entries.
- Theme-native UI, no fixed RGB chrome; visible selection and semantic status text.
- Stable background tools, EventBus contracts, notification delivery and reload ownership. Do not rewrite runtime behavior opportunistically during an upstream sync.
- Preserve the operator's process-only configuration without modifying personal/project Pi settings or enabling optional features. Default/full-profile testing is disposable verification, not a configuration change.
- Project-local explicit-only maintenance skills. Do not add them to `package.json.pi.skills`; installing the runtime must not advertise source-maintenance commands globally. Track only the two `.pi/skills/*/SKILL.md` files, never task logs, sessions or settings.

## Executable maintenance contracts

Run from the repository root; `--repo <root>` may select it explicitly. Commands print JSON to stdout and exit nonzero on refusal. Save reports outside the checkout. Full SHA means 40 lowercase hex characters identifying an available commit, not a branch/tag/abbreviation.

```sh
node scripts/maintenance/upstream-report.mjs review --previous-upstream <SHA> [--fetch]
node scripts/maintenance/upstream-report.mjs prepare-sync --previous-upstream <SHA> --downstream <SHA> --upstream <SHA> --branch sync/upstream-YYYY-MM-DD --worktree <new-sibling-path> [--pick <SHA> ...]
node scripts/maintenance/verify-fork.mjs [--repo <root>]
```

`review` reports local `refs/heads/main`, `refs/remotes/upstream/main`, previous integrated SHA, ahead/behind and protected before/after state. `--fetch` is explicit-only, no tags/pruning/submodules, with empty configured refmap and exactly `refs/heads/main:refs/remotes/upstream/main`. Only that remote-tracking ref/reflog, fetch metadata and Git object storage may change. Failures are not auto-rolled-back: inspect and re-review. Origin/main is neither fetched nor silently substituted for local main. Missing upstream tracking refs require separate repository setup, not an automatic bootstrap.

Both operations require exactly these effective remotes (including push destinations):

| Remote | Fetch URL | Push URL |
| --- | --- | --- |
| origin | `https://github.com/sendhil/pi-background-tasks.git` | same |
| upstream | `https://github.com/ismailsaleekh/pi-background-tasks.git` | `DISABLED` |

Alternative URL spellings are deliberately refused rather than guessed equivalent. Repository setup/remotes are outside these commands. Scripts never push. They reject dirty tracked/untracked state, in-progress Git operations, shallow/replaced history, and a previous-upstream anchor that is not ancestral to both local main and upstream. Do not run concurrent writers; the snapshots detect unexpected changes but are not an atomic lock or a malicious-Git-config sandbox.

`prepare-sync` requires approved main SHAs still equal both exact refs, creates a separate worktree from the downstream SHA, and refuses existing paths/branches/registrations and paths inside other worktrees. Caller HEAD is irrelevant to its integration base. It does not fetch, merge, cherry-pick, install, publish or alter personal settings. Its optional ordered `--pick` list must be available locally and explicitly approved. Ancestors/already-upstream, duplicate, empty/root/merge and patch-equivalent-to-downstream commits are refused. `git cherry` detects ordinary equivalent cherry-picks, not arbitrary squashes, semantic equivalence or dependency ordering; uncertainty requires manual review. No arbitrary-URL/PR fetching or generic merge engine is provided.

## Verification and integration wiring

For each committed candidate, first run `npm run verify:generated`. The artifact lane supplies that command; it must regenerate/check committed derived output in a clean disposable checkout **before** SDK/package/payload commands can repair stale artifacts. Missing freshness tooling is a blocker. Do not hand-edit generated files or accept a source-only commit with stale `dist`.

Then run `node scripts/maintenance/verify-fork.mjs` in ordinary CI and sync verification. This checks fork identity/publication/peer/entrypoint metadata, license files, the tracked `.pi` allowlist (never settings/runtime artifacts), and updater/RGB tripwires, then invokes actual footer, manager, default SDK and feature-selection runtime tests without rebuilding. It additionally runs exactly three profile-neutral SDK footer/updater cases under both default and explicit `process` selection, requiring TAP totals of three passed and zero failures/skips for each (zero-match success is rejected). It clears inherited feature selection, updater opt-outs and `PI_PACKAGE_DIR` (global-host theme assets must not leak into development-SDK tests), and canonicalizes TMPDIR. The feature-selection suite retains its own explicit profile fixtures. `--metadata-only` is a deliberately partial diagnostic, never a CI/sync replacement. Text scans are tripwires, not proof of no network traffic. Changes with renamed updater implementations must still fail the behavioral startup tests. These tests use source plus the locked development SDK; exact Pi 1.1.0 committed-Git qualification is separate.

Before integration of the other implementation lanes, the verifier is **expected to fail** on the old manifest/updater and missing new footer tests. Local fixtures model the desired fork and intentionally failing runtime assertions to prove the gate fails closed. Do not change unrelated lanes merely to turn this pre-integration state green.

The parent/integration owner must run all required gates from the [delivery plan](superpowers/plans/2026-10-17-personal-fork.md), including unit/component/SDK/RPC/package, lifecycle/EventBus, generated docs/payload, type safety and scripted/current-host checks. Clear inherited `PI_BG_FEATURES` for default tests and test process separately. No paid provider calls are necessary. Unexpected failures block qualification; distinguish baseline/environment evidence from downstream defects.

## Authorization boundaries and rollback

A skill invocation authorizes only its stated local review/candidate workflow. Pushes, PR creation, merging main, tags, npm publication, installing into personal Pi, changing settings and reloading sessions require separate explicit authorization. A tested candidate is not a release claim. After publication approval, rehearse the canonical immutable fork Git install before switching personal settings. Keep the prior package declaration and approved revision for rollback; restore that declaration and launch a fresh session rather than reload busy tasks. No rollout has been performed by this policy.
