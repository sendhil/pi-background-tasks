---
doc_id: superpowers/plans/2026-10-17-personal-fork
audience: maintainer
mode: authored
review_policy: contract
stability: evolving
covers_surfaces: []
covers_sources: []
---
# Personal Background Tasks Fork: Investigation and Delivery Plan

**Date:** 2026-10-17
**Status:** Revised after three independent adversarial reviews and supervisor rebuttal/second passes. Accepted corrections incorporated by the parent; no separate reviewer sign-off on the final edited text. No plugin implementation, installation changes, commits, or pushes performed.
**Goal:** Keep the useful background-task runtime, permanently remove package update nags, make the UI quiet and theme-native, and make upstream maintenance repeatable with native Pi skills.
**Architecture:** Maintain a small downstream patch set on the existing public fork. Keep upstream runtime and API boundaries intact; isolate footer policy from rendering and enforce downstream preferences with regression tests. Upstream integration is an explicit Git workflow, not plugin startup behavior.
**Tech stack:** TypeScript, Node test runner via tsx, Pi extension/TUI APIs, compiled JavaScript distribution, Git/GitHub, native Markdown Pi skills.

This is an investigation-backed delivery/design plan, not a claim that every candidate bug has been reproduced. Implement each phase with failing regression tests first, then minimal changes, verification, and a separate commit. Re-read installed Pi extension/TUI documentation before implementation. Implementation delegation is not implicitly authorized by this plan. The user separately authorized the completed adversarial review.

## Confirmed user decisions

- Keep `sendhil/pi-background-tasks` **public**. “Private fork” meant a personalized version, not confidential source.
- Default footer: **running tasks and unseen failures only**.
- No colored background, update notices, persistent command hints, or successful-completion badges.
- `/tasks` continues to provide the full manager; notifications and task history remain functional.
- Investigation and planning only in this session; rollout needs separate approval.

## 1. Evidence and scope

### Repository and local installation

| Item | Observation |
|---|---|
| Fork | https://github.com/sendhil/pi-background-tasks |
| Upstream | https://github.com/ismailsaleekh/pi-background-tasks |
| Inspected revision | `799182ff65d7040732aea23b2001ea860b688531`, release `2.6.10` |
| Fork divergence | `git rev-list --left-right --count HEAD...FETCH_HEAD` returned `0 0` after fetching upstream main |
| Visibility | GitHub API reports `private: false` |
| License | ISC; retain LICENSE and third-party notices |
| Local project directory | Initially contained `.pi/`, but no checkout or `.git` directory |
| Inspection checkout | `/tmp/pi-background-tasks-investigation`; no live plugin code edited |
| Configured installed source | `npm:pi-background-tasks@2.6.9` in personal Pi settings |
| Installed Pi package | `1.1.0` |
| Investigation Node/npm | Node `26.8.1`, npm `11.19.0`; not the upstream Node 22/24 CI matrix |
| Current feature selection | Inherited `PI_BG_FEATURES=process` |

The screenshots show the extension's own cyan footer, not a problem with the user's global Pi theme. The fork being at 2.6.10 does not update the separately installed, pinned npm package.

### What was examined

- Both screenshots, fork/upstream metadata and history, all 14 open issue/PR titles and relevant bodies/comments.
- Startup/config/update flow, footer and task-manager rendering, shutdown hooks, shell-policy prompt integration.
- Package manifest, compiled distribution build, CI/release certification, compatibility harness, existing SDK/component tests, documentation ownership/generation rules.
- Installed Pi skills, packages, CLI, theme and settings documentation.
- Selected local settings only to identify this package; no credentials inspected.

Not a full security audit of every Fusion, delegation, attribution or registry path. Those subsystems are substantial: `registry.ts` is ~4,081 lines and `anthropic-attribution.ts` ~3,644 lines. Avoid expanding a UI fork into a wholesale runtime rewrite.

## 2. Root causes of the reported UX

### Update notice: there is an existing opt-out, but removal is cleaner here

`src/extension.ts:682–703` starts one npm lookup per activation after `session_start`. It skips checks if `PI_BG_DISABLE_UPDATE_CHECK=1`, `PI_OFFLINE=1`, or the package version is unavailable. The opt-out is documented in `docs/commands/bg-update.md` and subsystem/configuration docs, although it is not exposed through the main config parser or a user command.

The installed 2.6.9 compiled entry also contains this check. An immediate non-code workaround for a new Pi process is:

```sh
PI_BG_DISABLE_UPDATE_CHECK=1 pi
```

This was **not** applied to the user's shell or Pi configuration. A persistent environment setting must reach the actual Pi launcher and requires a new activation; typing it into an unrelated shell does not change an already-running Pi process.

`latestKnownVersion` stays in memory and `updateUi()` keeps rendering it. `/bg-clear` only marks finished task notices seen; it does not dismiss updates. Package version is captured at module import, explaining the stale running-versus-installed report in upstream #44. The checker compares against upstream npm even when the operator intentionally pins a version.

The plugin does not actually self-install: `/bg-update` prints installation advice. Its Git target is hard-coded to the upstream repository. That advice is particularly wrong for a personalized fork.

**Recommendation:** remove automatic registry lookup, update footer segment, and `/bg-update` entirely. Let Pi package commands own installation. Do not replace the checker with another flag, timer, or fork-specific network poll. Keep useful package-version reading only if another feature still needs it.

### Styling: hard-coded truecolor, independent of the Pi theme

Both `src/extension.ts:84–89` and `src/ui/background-tasks-manager.ts:35–38` define literal RGB ANSI sequences:

- background: `(183,223,255)`;
- foreground: `(11,70,110)`;
- manager border: `(83,160,215)`.

The footer wraps its entire label in these colors. The manager uses them for headers, borders and selected rows. Other text already uses Pi theme roles, so the fixed colors can clash with both the terminal palette and nested theme styling.

**Recommendation:** remove these constants and wrappers, not merely change their RGB values. Use Pi theme roles for all chrome. Do not change the user's global theme.

## 3. Proposed UI contract

### Footer

Default policy is `attention`: running count plus unseen failed count. Successful completions and user-stopped jobs remain available in history but do not keep a footer badge alive. Existing timeout/output-cap classifications remain unchanged; do not relabel runtime failures just to fit the display.

```text
Idle / all successful       [no background-task footer]
Work running                bg 2 running
Unseen failure              bg 1 failed
Mixed                       bg 2 running · 1 failed
```

- `bg`, separators and running count: subdued theme foreground, no background fill.
- Failure count: theme `error`; text says `failed` so color is not the only signal.
- No version, arrow, `/bg-update`, `/bg-clear`, `Shift↓`, or `focused` suffix in the persistent footer.
- Keep shortcuts and commands working; show their help inside the manager.
- Preserve unseen/seen state. Hiding successful badges must not mark all completed tasks seen or suppress their notifications.
- Opening a failed task's detail view or `/bg-clear` clears its badge, as today.
- Preserve other extensions' status entries; only update the `background-tasks` key.

**First release is attention-only.** Do not add display modes, `/bg-display`, a footer environment variable, or preference persistence. The user chose a behavior, not a settings subsystem. PR #39 remains a design reference, not a patch to import. Additional modes require a later explicit requirement.

### Manager

- Terminal background; theme `borderMuted` for frame; ordinary text for titles.
- Selection indicated by a pointer and theme-native selected styling; keyboard focus must remain obvious.
- If using `selectedBg`, extend `TaskManagerTheme` to include the required `bg` capability and update test doubles. A foreground-only pointer is a simpler first implementation.
- Keep semantic status text; reserve stronger colors for errors and genuinely actionable warnings.
- Retain current keyboard behavior, output scrolling/follow mode, stop confirmation, history and rerun restrictions.
- Keep existing layout initially. Do not combine the palette fix with wholesale table or telemetry redesign.
- Verify actual host overlays at 80/120 columns, long names, Unicode, no-color fallback, light/dark/system themes, and changing themes while open. Require bounded output, aligned borders, and visible selection/status; intentional truncation/ellipsis is allowed. The current overlay requests minimum width 64: test 40 columns for graceful degradation, not an all-content-visible guarantee or implicit layout rewrite.

## 4. Upstream issue/PR triage

These are upstream reports, not automatic proof of failures in the user's installed Pi.

| Priority | Item | Evidence and proposed treatment |
|---|---|---|
| First release | #40: outdated peer ranges | Confirmed manifest caps coding-agent/tui at 0.84.x, while local Pi is 1.1.0. Current Pi package docs require host peers `*`. Update peers and compatibility assertions together; test actual supported hosts rather than treating permissive metadata as compatibility proof. |
| First release verification; later automation | #31: stale compatibility coverage | `scripts/test-compat.ts` lists only 0.81.1–0.84.0; ordinary CI does not invoke it. Require exact Pi 1.1.0 compiled-artifact qualification and document tested hosts. Defer new scheduled/latest canary infrastructure until after the quiet fork release. |
| First release candidate | #36: stale-context UI noise | `updateUi()` catches all errors, writes console.error, then drops currentCtx. New lifecycle fences may reduce incidence. Reproduce on Pi 1.1.0 before changing behavior; do not suppress all UI exceptions. |
| Investigate early | PR #38: shell-guidance cache instability | Hook-based injection is present. PR moves immutable guidance to bg_run promptGuidelines. Referenced Pi issue #5581 is now closed, so test current Pi before claiming the historical cache-loss rates still apply. PR currently conflicts with main. |
| Design reference | PR #39: footer visibility | Directly useful design, but defaults to `all`, lacks the chosen attention policy, retains update checks, and currently conflicts with main. Port intent selectively rather than blindly cherry-picking generated files. |
| Resolved by removal | #44: stale installed version | Running version is captured at import. Removing this fork's update feature eliminates misleading reinstall advice; no separate updater patch needed. |
| Conditional | PR #41: Landstrip sandbox integration | README explicitly says shell jobs are not sandboxed. If the user relies on Landstrip, background execution is a sandbox-boundary concern. Review separately with deny/cleanup/reload tests; do not blindly add a mandatory integration for a UI release. |
| Conditional | PR #43: Haiku 5.5 attribution | Explicit policy allowlist change; PR acknowledges inferred beta policy. Current session is process-only. Defer unless attribution/model support is needed, then verify the real transport separately. |
| Optional later | PR #26: relocate runtime root | Useful for `.pi/` workspace clutter; currently conflicts. Requires path isolation and cross-project/session collision tests. Not necessary for the user's primary request. |
| Already substantially addressed | #20: feature flags | `PI_BG_FEATURES` exists; normal TUI/RPC modes covered. Maintainer leaves issue open for SDK lifecycle edge cases. Do not rebuild feature selection. |
| Already substantially addressed | #21: Windows startup | Compiled entrypoints/lazy loading shipped; original reporter confirmed major improvement. Later comments raise packaging concerns; current manifest already has pi-ai as a peer. Do not follow the old suggestion to bundle host Pi packages. |
| Residual qualification | #19: compiled Bun | Dynamic-import problem replaced; vendor compiled-Bun qualification remains outstanding. Not evidence that current Node path is broken. |
| Already substantially addressed | #6: reload survival | Opt-in same-process non-agent shell survival exists. Native Windows/SDK edges remain unqualified; hard restart recovery is explicitly unsupported. Preserve this work. |
| Defer | #18: auto-background built-in bash | Changes ownership of a core tool and risks conflicts. Not needed for a quiet, maintainable personal fork. |

PR heads observed: #38 `3c6d1c11bb686c6624fd2f2bcf1858a800550bf3`; #39 `85437c73e1c8625c9801bb7fa3a52d9628a5431d`; #43 `cde44ad025ea4a876111b3a4436b1ae9094dbc84`. Re-fetch and review actual diffs before applying; these observations will age.

### Other maintenance findings

- Initial unchanged-upstream baseline: typecheck passed; unit tests 743/747 passed. Four failures involve macOS fixture paths and a short admission deadline; focused environment-controlled reruns are recorded in the companion baseline report. These are not downstream regressions and must not be silently waived.
- Dependency audit reports five affected packages in the dev-inclusive tree, but zero with `--omit=dev`. Track a deliberate development SDK/lockfile refresh separately unless compatibility failures require it now; do not use an unreviewed force-fix. This does not assess the separately installed Pi host.
- `lint` and `format:check` run `cd ../..` and depend on an external parent repository. They are not portable standalone-fork checks. Replace with explicit local tools/configuration or remove misleading scripts; do not pretend they validate this checkout.
- `dist/` is committed and is the public runtime. Source-only tests cannot prove the installed artifact works.
- Docs are AST-generated with source ownership, command inventories and freshness gates. Removing a command affects more than README.
- Existing manager tests use an all-white/all-black synthetic theme and often strip ANSI. Those checks do not establish good visual contrast. Add role-sensitive tests and actual terminal QA.
- Footer status is recalculated every second even when idle. Consider avoiding identical status writes after correctness tests; do not alter lifecycle timing in the first styling patch merely for speculative optimization.

## 5. Delivery phases and file map

### Phase A — Establish a reproducible fork baseline

**Files:** `package.json`, `package-lock.json`, `.github/workflows/ci.yml`, `scripts/test-compat.ts`, `tests/package/typebox-compat.test.ts`, new `docs/fork-policy.md`. New scheduled/latest CI is a follow-up, not a first-release dependency.

- [ ] Populate a real checkout in the project directory without overwriting the existing `.pi` session/runtime files or this plan. The investigation clone is disposable, not the production install.
- [ ] Configure `origin` as sendhil's public fork and `upstream` as the original repository. Give upstream an intentionally unusable push URL as a guardrail; scripts must also allow only origin for pushes.
- [ ] Record base revision, supported Pi/Node versions and test evidence in fork policy.
- [ ] Keep upstream package name initially to reduce churn. Before the first public fork release, set `private: true` in package.json to prevent accidental npm publication, remove contradictory public publish configuration, and document Git-based installation. This does **not** change GitHub visibility or need to block a local UI canary.
- [ ] Point repository/bugs metadata to the fork; retain author/license attribution. Do not change stable tool names or EventBus protocol identifiers.
- [ ] Add manifest tests for host peers `*`, no bundled Pi SDK copies, and public compiled entrypoints; then update manifest and lockfile.
- [ ] Update both `scripts/test-compat.ts` and `tests/package/typebox-compat.test.ts:95–114`: their current version-string-inclusion assertions incorrectly reject `*`. Separate host-peer policy from behavioral tests and the explicit tested-version matrix.
- [ ] Correct current-host harness seams: resolve the host CLI from its manifest `bin.pi`, not `dist/cli.js` (Pi 1.1.0 uses `dist/bundle/cli.js`); exercise the package manifest's public compiled entrypoints, not `extensions/background-tasks.ts`; explicitly qualify hook and TypeBox behavior rather than extending historical version-specific maps by guesswork.
- [ ] Retain the locked development SDK initially if it can compile the changes and the independent exact-host qualification passes. Upgrade it in a separate change only if required APIs or demonstrated failures demand it; track development audit findings separately. Peer `*` is dependency posture, not a promise of all-host compatibility. Record the verified host set/floor and retain historical lanes only when deliberately supported.
- [ ] Repair standalone lint/format scripts without introducing unrelated formatting churn.

**Acceptance:** clean install/build/package load on Node 22/24 and the selected current Pi; test failures are recorded with unchanged-baseline evidence, not silently ignored. Scheduled latest canary is separate from reproducible release checks.

### Phase B — Permanently remove update nags

**Production:** `src/extension.ts`, `src/core/update-check.ts`, relevant helpers in `src/core/common.ts`.
**Tests:** `tests/sdk/sdk.test.ts`, `tests/rpc/rpc.test.ts`, `tests/unit/core.test.ts`, `tests/unit/update-check.test.ts`, feature-selection/union SDK inventories, `tests/package/package.test.ts`, `tests/package/docs-contract.test.ts`.
**Docs:** `docs/commands/bg-update.md`, `docs/subsystems/host-ui-and-telemetry.md`, `docs/operations/configuration.md`, `scripts/docs/lib.mjs`, generated docs/manifest.

- [ ] Replace “updater must be registered” tests with assertions that `/bg-update` is absent, startup makes no updater registry request, and the footer remains empty without tasks—even when a mocked registry advertises a newer release.
- [ ] Run those tests against unchanged code and capture the expected failures.
- [ ] Remove updater imports/state/startup call/command/segment and hard-coded upstream install target. Delete truly unused updater helpers/tests; retain generic version helpers only if other consumers need them.
- [ ] Test without `PI_OFFLINE` or the old disable flag so the test cannot pass by accidentally masking the feature.
- [ ] Update authored documentation and inventories, regenerate compiled runtime/docs, run focused and package gates.
- [ ] Commit this independently of the visual changes.

**Acceptance:** no updater-owned network request, timer, footer badge, startup warning or command under any normal launch configuration. Pi's own update behavior is untouched. Future upstream merges cannot reintroduce the behavior without failing the fork contract.

### Phase C — Quiet, theme-native UI

**Create:** `src/ui/footer-status.ts`, `tests/unit/footer-status.test.ts`.
**Modify:** `src/extension.ts`, `src/ui/background-tasks-manager.ts`, `tests/component/background-tasks-manager.test.ts`, `tests/sdk/sdk.test.ts`, `docs/subsystems/host-ui-and-telemetry.md`, `docs/reference/shortcuts-and-dock.md`.
No display-mode configuration or session-state files are needed in this phase.

The small footer module takes task snapshots and seen IDs and returns attention-only display segments; it does not mutate task state, query the network or manage lifecycle. Extension code applies current theme roles and writes the status key. Keep seen-state ownership in the existing extension/host service.

- [ ] Test empty/running/failed/completed/killed/mixed task sets and seen/unseen failures. Assert no hints or update text and no mutation of seen IDs.
- [ ] Implement attention policy, then wire it into updateUi without altering notification delivery.
- [ ] Remove literal RGB styling in both files; use theme roles and visible selection markers.
- [ ] Add fake theme functions returning distinctive role markers so tests verify role usage rather than only stripped text. Reject the old literal RGB sequences in rendered output.
- [ ] Add a source owner for the new footer module in the subsystem frontmatter, rebuild and regenerate docs.
- [ ] Capture terminal screenshots for light/dark/system themes and narrow widths. Verify selection remains visible, borders align, and other footer extensions are unaffected.
- [ ] Commit separately from runtime fixes.

**Acceptance:** exact selected footer contract; task history/notifications/stop/rerun/log controls unchanged; no hard-coded palette; bounded rows/aligned borders and visible selection/status at supported widths, allowing intentional truncation. A 40-column check establishes graceful degradation only.

### Phase D — Reproduce and fix relevant reliability issues

**Files:** `tests/sdk/lifecycle-sdk.test.ts`, `tests/sdk/reload-survival-sdk.test.ts`, `tests/sdk/feature-shell-union-sdk.test.ts`, new `tests/scripted-provider/shell-prompt-stability.test.ts`, `src/extension.ts`, and only if required `src/core/shell-policy.ts` / `scripts/docs/lib.mjs`.

- [ ] Create a stale-UI-context regression around new/switch/reload while registry callbacks and status ticks are pending.
- [ ] If reproduced, prefer preventing stale callbacks from acting via activation ownership; suppress only the recognized expected stale-context error, while preserving logging for real failures.
- [ ] Verify timers/listeners are released and newly bound contexts work; do not accept “no console message” as proof of lifecycle correctness.
- [ ] Capture effective system prompts with a scripted provider for typed turn → task completion wake → tool follow-up → next typed turn. Compare the shell guidance section, not the entire conversation history.
- [ ] If guidance changes unexpectedly, adapt PR #38 for current main and host APIs. Verify forced prompts, disabled tools, reload, and coexistence with other guidance providers. Do not broadly weaken the docs AST parser merely to hide unsupported syntax.
- [ ] Preserve same-process reload survival, default kill-on-reload and the one-completion ledger.

**Acceptance:** locally reproduced failures have red/green regression coverage; if not reproduced, record the host/version and keep the candidate out of the first release. No paid model calls are needed for these scripted checks.

### Phase E — Native maintenance skills and fork contract

**Create:**

```text
.pi/skills/bg-upstream-review/SKILL.md
.pi/skills/bg-upstream-sync/SKILL.md
scripts/maintenance/upstream-report.mjs
scripts/maintenance/verify-fork.mjs
scripts/maintenance/verify-generated.mjs
tests/unit/maintenance-upstream-report.test.ts
tests/unit/maintenance-verify-fork.test.ts
tests/unit/maintenance-generated-freshness.test.ts
docs/fork-policy.md
docs/upstream-ledger.md
```

Keep the executable scope small: repository/ref/worktree guards and fork-contract checks. The review report can be written by the skill using ordinary Git/GitHub tools; automatic issue aggregation and a generic merge engine are deferred. Keep maintenance tests flat under `tests/unit/`: the current unquoted `tests/unit/**/*.test.ts` command has shell-dependent expansion, and adding the first nested directory could exclude existing root tests. Verify that both old root tests and new fixtures execute; do not silently change the glob in this release. Wire `verify-fork.mjs` into ordinary CI and sync verification, and prove an intentionally failing fixture fails that gate.

Keep these skills project-local initially: they maintain this repository and should not appear in every unrelated project merely because the runtime plugin is installed. Explicit user/global installation can be added later. Git-ignore rules must permit the skill directories while excluding `.pi` task logs and session artifacts.

#### `/skill:bg-upstream-review`

A read-only working-tree review, with an explicit fetch allowed to refresh Git remote refs:

1. Verify repository identity and expected upstream URL.
2. Read fork policy and ledger; record exact local/upstream SHAs.
3. Fetch only the intended upstream branch with an explicit destination remote-tracking refspec and `--no-tags`. Record before/after HEAD, index, working tree, local branches and tags; only the designated remote-tracking ref and fetch metadata may change.
4. Report ahead/behind, new commits/releases, relevant PRs/issues and changed subsystems.
5. Classify changes: integrate, already present, superseded, conflicts with fork policy, or needs reproduction.
6. Identify likely conflict hotspots and required tests; distinguish issue reports from confirmed defects.
7. Produce a bounded report with source links and exact revisions. Never merge, commit, install, push or run fetched code.

Description should mention this specific repository and upstream review; no generic “helps with Git” description. Use `disable-model-invocation: true` if explicit-only review is preferred; the mutating sync skill must be explicit-only.

#### `/skill:bg-upstream-sync`

Frontmatter: `name: bg-upstream-sync`, a concrete description, `disable-model-invocation: true`.

1. Require both an approved downstream fork-main base and approved upstream revision/change list, resolved once to full commit SHAs and recorded in the review. Refuse changed approved targets or unexpected history rewrites; obtain a new review rather than substituting a moved branch tip.
2. Refuse dirty worktrees, unexpected remotes, merge/rebase in progress, and ambiguous targets. Do not auto-stash user edits. The caller may be on another clean branch; its HEAD is never the implicit integration base.
3. Create a separate worktree on `sync/upstream-YYYY-MM-DD` explicitly from the approved downstream base SHA. Refuse occupied branch names or paths; do not reset or reuse them. Leave caller HEAD/index/files, main, tags and installed checkout unchanged.
4. Default to merging the approved upstream-main SHA. Use cherry-pick only for explicitly selected, unmerged PR commits, with provenance recorded (`-x` where appropriate).
5. Resolve authored source/policy first. Never globally choose ours/theirs. Rebuild `dist` and regenerate docs instead of hand-merging derived bytes.
6. After source and regenerated artifacts are committed to a candidate, run the committed-artifact freshness gate in a clean disposable checkout before any rebuild-capable tests, then the fork contract and relevant baseline/current-host gates. Do not demand a clean tree while intentionally editing; a gate fix produces a new candidate commit and restarts validation. Treat unexpected failures as blockers.
7. Update ledger with original upstream/PR SHA, local commit, decision, tests and evidence, and whether a patch can retire when upstream lands it.
8. Return a diff and test report for human approval. Push/PR creation, merge to main and live installation are separate explicit actions, not implied by invoking the skill.

**Fork invariants enforced by `verify-fork.mjs` and runtime tests:**

- No updater feature/command or updater-owned registry lookup.
- Attention footer default; no successful-completion clutter or command hints.
- No fixed RGB UI chrome.
- No feature enabling caused by a sync; preserve current process-only operator configuration.
- Stable background tools, notifications, reload behavior and EventBus contracts.
- Host dependencies remain peers; compiled output and generated docs correspond to source.
- Fork source identity and npm-publication guard remain intact.

Use deterministic local Git fixtures to test scripts: clean divergence, wrong remote, dirty checkout, upstream history rewrite, already-applied PR, conflicting updater reintroduction, and blocked verification. Add explicit assertions for a caller on an unrelated clean topic branch (candidate starts at approved fork-main SHA, caller unchanged), moved approved targets, occupied worktree/branch refusal, review-fetch mutation boundaries, and source-only commits with stale `dist` (freshness must fail). Construct negative cases in disposable committed fixtures, never by corrupting live source. No network or real user repositories required for these tests. A skill is model guidance, not a security boundary; important checks belong in executable scripts and tests.

**Acceptance:** both skills are discoverable in a trusted project and can be invoked by name; a dry-run sync of a synthetic upstream change produces a reviewable branch without changing main or the live plugin. A change reintroducing the updater is rejected.

### Phase F — Canary, install and rollback

**Files:** `docs/fork-policy.md`, `docs/operations/releasing.md`, fork release notes and ledger.

- [ ] Run the committed-artifact freshness gate below on the approved candidate commit before any other build-capable command. A stale `dist` must fail rather than be silently repaired by package testing.
- [ ] Rehearse the **actual Git installation mechanism** with installed Pi 1.1.0, an isolated agent directory and a working directory outside the development checkout/dependency ancestry. Install the candidate's immutable SHA via Pi's package manager, which omits development/automatic peer dependencies; verify checkout SHA, absence of private host SDK copies and successful loading of manifest-declared `dist/extensions/*` roots. Use scripted/no-provider execution and clean feature settings; never load both upstream and fork.
- [ ] Before publication approval, serve the committed candidate from a disposable bare local Git remote using process-scoped URL rewriting or a tested loopback Git endpoint. Do not use an ordinary local-path Pi install as a substitute: it bypasses Git installation semantics. Do not alter global Git config. This proves the install mechanism, not GitHub availability. If that fixture cannot faithfully exercise the route, report the gate blocked rather than silently pushing.
- [ ] After separate approval to publish the candidate, repeat installation from the canonical fork URL at the same SHA before changing personal settings. No push, tag publication or live install is authorized merely by this plan.
- [ ] Test the normal process-only profile and the default/full profile where those capabilities remain supported. Verify actual compatibility with the installed Pi 1.1.0, not only the development SDK.
- [ ] Test run/finish/fail/kill/logs, notifications with wake on/off, same-process reload survival, task manager navigation, and theme switching.
- [ ] Choose a downstream semver prerelease (for example `2.6.10-sendhil.1`) before release; certify the exact candidate commit, then create the matching immutable `v${package.version}` tag after all gates pass. Do not reuse/move upstream tags. Existing certification accepts this convention; no new release framework is needed. Publication still requires separate approval.
- [ ] Back up the relevant settings before replacing `npm:pi-background-tasks@2.6.9` with the approved pinned Git source from `sendhil/pi-background-tasks`. Preserve resource filters and unrelated settings. Avoid simultaneous registrations from npm and Git sources.
- [ ] Do not reload busy sessions: ordinary tasks can be killed on reload and agent tasks cannot opt into survival. Switch in a fresh session first.
- [ ] Roll back by restoring the prior package declaration/settings and launching a fresh session. Retain the previous known-good fork tag for subsequent rollbacks.

Pi package updates install approved fork releases; upstream synchronization is a separate source-maintenance step. Pinned tags/commits intentionally do not follow main automatically.

## 6. Verification strategy

Start with the locked baseline in isolation. Clear inherited `PI_BG_FEATURES` for default-profile tests; explicitly test `process` separately. `PI_OFFLINE=1` prevents incidental host update activity but is not an operating-system network sandbox and does not constrain arbitrary test subprocesses.

### Required committed-artifact gate

Add `scripts/maintenance/verify-generated.mjs`, flat unit fixture coverage, and a `verify:generated` package script. It validates a specific committed candidate, not an unfinished editing worktree:

1. Create a disposable clean checkout of the candidate SHA and install the locked dependencies with a pinned Node/npm toolchain. Verify the checkout starts clean.
2. Run `build:runtime` and `docs:generate` there **before** SDK/package/payload commands that could repair stale output.
3. Fail on any tracked derived-output delta or unexpected untracked generated file (including ignored generated files); do not rely only on `git diff`, which misses untracked output. Define the generated roots/files from the existing builder and docs generator, and exclude dependency directories.
4. Keep logs and candidate SHA; never silently commit repairs. Corrections create a new candidate and rerun the gate.
5. A disposable committed source-only-change fixture with stale compiled output must fail. A fresh candidate must pass. Wire this check before rebuild-capable gates in CI/release/sync verification.

Normal Pi Git installation clones committed output and installs production dependencies; it does not invoke this package's `prepack`. Thus a successful `npm pack` or `payload:check` cannot substitute for this gate. The isolated installation smoke must load the exact candidate Git bytes, not the regenerated verification checkout.

Core commands after dependencies are installed (first two are new scripts to implement; maintenance fixtures remain in the ordinary unit suite):

```sh
npm run verify:generated
node scripts/maintenance/verify-fork.mjs
npm run typecheck
npm run test:type-safety
npm run test:unit
npm run test:component
npm run test:sdk
npm run test:rpc
npm run test:agent-loop
npm run test:package
npm run docs:verify
npm run payload:check
npm run test:pty
```

Run expensive gates as named background tasks. Review failures on unchanged baseline before attributing them to downstream changes. Package load/compatibility checks must exercise public `dist/extensions/*` entrypoints through Pi, not directly import unsupported private chunks. Live provider, native Windows and vendor-Bun claims require their own evidence.

Baseline execution evidence is recorded in the companion `2026-10-17-background-tasks-baseline.md`. No full-suite or cross-platform pass is implied by this plan.

## 7. Recommended scope and order

**First release:** baseline/host compatibility, permanent updater removal, attention footer and manager palette, fork contract plus maintenance skills. Add lifecycle/cache fixes only when reproduced and tested.

**Later:** new scheduled/latest-Pi CI, optional display modes, development SDK modernization unless required for compatibility, automated upstream issue aggregation, runtime-root relocation, sandbox integration if relevant, model-policy updates if required, idle-render optimizations with measurements.

**Avoid:** rewriting the registry, removing optional agent subsystems just because the current profile disables them, owning the built-in bash tool, auto-merging upstream, auto-publishing npm releases, or adding a startup “upstream news” mechanism that recreates the original annoyance.

## 8. Adversarial review disposition

Three independent reviewers inspected the plan and source, sent findings to the parent, received explicit rebuttal/tradeoff responses, and performed focused second passes. Their verdicts were REVISE on the original text; the parent incorporated the agreed corrections here. This is not a claim that they re-reviewed or approved the final edit.

- **Runtime:** added the overlooked `typebox-compat.test.ts` assertion migration, manifest-based CLI/public compiled-root qualification, and exact Git-install rehearsal without private SDK contamination.
- **Upstream safety:** pinned both integration parents; constrained fetch mutations; refused moved targets/collisions; wired flat maintenance tests into real gates; added committed-output freshness before repair-capable tests.
- **Scope/UI:** attention-only release; deferred new scheduled/latest CI and unnecessary SDK modernization; clarified intentional truncation and 40-column degradation; kept release safeguards without a release framework.
- **Parent challenge that improved the result:** a nested maintenance-test directory was proposed, then rejected by the reviewer because of the existing shell-sensitive glob. Flat filenames preserve test discovery without widening this patch.
- **Boundaries retained after debate:** exact-host compatibility is mandatory; historical cache/lifecycle reports still need reproduction; private npm publication guard does not mean a private GitHub repository; no publication/live rollout implied.

Review workflow: `26db0322-9e00-41b3-a7f7-ee63307c4fcc`. Detailed reports are retained in session subagent artifacts under `reviews/runtime.md`, `reviews/sync.md`, and `reviews/scope.md`, not in the plugin's runtime distribution.

## Sources

- Repository/source: https://github.com/ismailsaleekh/pi-background-tasks/tree/799182ff65d7040732aea23b2001ea860b688531
- Footer PR: https://github.com/ismailsaleekh/pi-background-tasks/pull/39
- Prompt-guidance PR: https://github.com/ismailsaleekh/pi-background-tasks/pull/38
- Peer dependency issue: https://github.com/ismailsaleekh/pi-background-tasks/issues/40
- Compatibility canary issue: https://github.com/ismailsaleekh/pi-background-tasks/issues/31
- Stale UI context: https://github.com/ismailsaleekh/pi-background-tasks/issues/36
- Stale update version: https://github.com/ismailsaleekh/pi-background-tasks/issues/44
- Other candidates: upstream PRs #26, #41, #43 and issues #6, #18, #19, #20, #21.
- Pi trigger-turn issue (closed at investigation): https://github.com/earendil-works/pi/issues/5581
- GitHub fork visibility rules: https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/working-with-forks/about-permissions-and-visibility-of-forks
- Installed Pi docs: `docs/skills.md`, `docs/packages.md`, `docs/cli.md`, `docs/themes.md`, `docs/settings.md` under the installed coding-agent package.
