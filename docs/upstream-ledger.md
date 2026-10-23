---
doc_id: upstream-ledger
audience: maintainer
mode: authored
review_policy: contract
stability: evolving
covers_surfaces: []
covers_sources: []
---
# Upstream integration ledger

Read [fork policy](fork-policy.md) before review/sync. This ledger records provenance and decisions, not permission to publish or install. Full validation receipts belong to the exact candidate SHA in the external review report; changing this file after validation creates a new candidate requiring freshness-first validation again.

## Starting baseline

| Source | Exact revision | Decision / evidence |
| --- | --- | --- |
| Upstream main, 2.6.10 | `799182ff65d7040732aea23b2001ea860b688531` | Existing shared baseline; last integrated upstream anchor. [Source](https://github.com/ismailsaleekh/pi-background-tasks/commit/799182ff65d7040732aea23b2001ea860b688531). |
| Approved implementation starting point | `ed049f468eddd31c6c58985a62fa44296a7bc53d` | Plan and baseline evidence only; not a quiet-fork release or installation. |

Initial unchanged-baseline typecheck passed; unit 743/747, then focused canonical-TMPDIR serial 89/89 and component 12/12 passed. See [full baseline evidence](superpowers/plans/2026-10-17-background-tasks-baseline.md). No subsequent upstream integration, publication or live rollout is asserted here.

## Downstream decisions to preserve

| Patch / policy | Upstream reference | Decision | Retirement condition |
| --- | --- | --- | --- |
| Permanent updater removal | [Issue 44](https://github.com/ismailsaleekh/pi-background-tasks/issues/44) | Supersedes stale-version advice rather than improving the checker. | Upstream removes the updater completely and behavioral no-updater tests remain green. |
| Attention footer / theme-native UI | [PR 39](https://github.com/ismailsaleekh/pi-background-tasks/pull/39) | Design reference only; no blind cherry-pick or attribution of downstream changes to an applied PR. | Upstream exactly matches attention-only/no-hints/no-fixed-RGB contract and notification/history tests pass. |
| Host peer posture | [Issue 40](https://github.com/ismailsaleekh/pi-background-tasks/issues/40) | Require host peers `*`, no bundled host SDK; compatibility is separately qualified. | Upstream matches metadata and exact-host Git-install gates remain green. |
| Native maintenance guards | Local fork policy | Explicit-only, pinned review and isolated candidate; no startup updater replacement. | Deliberate policy review; not automatically retired by an unrelated upstream workflow. |

The upstream PR head observations in the delivery plan are historical, not current approvals. Re-review exact revisions before selecting any commit.

## Recording a future integration

For each approved integration append its date, reviewed downstream-main SHA, reviewed upstream-main SHA, previous integrated upstream SHA, selected ordered commit SHAs (if any), original PR/source links, and classification (integrate/already present/superseded/conflicts with policy/needs reproduction). Record authored conflict resolutions, local merge/cherry-pick provenance, required tests and evidence locations, remaining risk, and retirement conditions. Use `cherry-pick -x` for approved selected commits. Never infer that ancestry alone proves an equivalent patch was not already applied.

Do not invent a final candidate self-SHA inside that same commit: reference the resulting immutable candidate and actual executed commands/results in the external handoff. Gate fixes or later ledger edits produce a new candidate and restart qualification. Human acceptance, publication and installation remain separately recorded decisions.

## 2026-10-17 local implementation integration

No upstream PR was merged. The following isolated downstream commits were integrated in order; all are based on the approved implementation starting point. Shared dist/docs are regenerated only after source integration.

| Component source | Local integration commit | Decision / evidence |
| --- | --- | --- |
| `85b1375`, `ef300a7` | `98306b5`, `652e386` | Host peer/publication policy and explicit Pi 1.1.0 Git-install harness; component focused metadata/schema/hook evidence retained in session handoff. |
| `e5f41881a932c9dbd780d5d3dab0d39ae0f13148` | `aefd8f8` | Updater removed; attention footer/theme-native manager; component 79/79 focused, default/process three-case contract 3/3 each. |
| `36a531edd4407e4a00452b429e5d70a44cf72e80`, `4aeef67ee7ff3ce59a457c773d326e55dbc43f0a` | `36dfd77`, `7c11a87` | Guarded explicit-only skills and tracked Pi artifact allowlist; component 62/62 under default/process. |
| `fb65cdd7dde7954a67b983376603232a21ceb7bc` | `2a579c4` | Isolated committed-artifact freshness; component 13/13 fixtures under default/process. |

Integration adds CI/release ordering and pinned current-host checks, standalone script cleanup, npm test-harness portability and governed documentation counts. These are implementation records, not certification of an integrated candidate. Advisory stale behavioral receipts are preserved. Node 22/24 candidate results, visual evidence gaps, and any remaining blockers must be read from the exact-SHA external integration report. Issues #36/#38 remain reproduction candidates; no speculative runtime fix was applied. At that integration checkpoint, release naming, publication, canonical remote installation and personal rollout remained unapproved and undone; the subsequent release authorization is recorded below.

## 2026-10-17 first fork release authorization

The operator approved publishing `v2.6.10-sendhil.1` and migrating the synchronized `claude-config` package declaration to that immutable Git tag. This release changes version metadata and release documentation relative to reviewed implementation `22de02e8cc146375052f27571a73b76d9931ed10`; it does not change runtime behavior. Publication/install outcomes and exact release-SHA checks are recorded externally after execution, rather than asserted in advance. The implementation full suites passed 1,043 tests on each Node 22/24 at `1852cdb`, and the final test-only PTY delta at `22de02e` passed its affected gates and independent recheck. Native remote CI, pixel-level contrast and optional strict behavioral receipts were not claimed as complete. No npm publication is authorized.

### Integration review repairs and harness evidence

- Artifact portability: original `b0a19a9e58606f94c3c11459e6fae9edabfa9ad0` → local `a3e6095`; invoke validated npm JavaScript through the pinned Node executable, never a Windows shell shim. Original `593548c803dbd199fbfc390769f4a2ac3e33c379` → local `6272711`; explicitly create SHA-1 verification repositories regardless of caller Git defaults.
- Maintenance path guard: original `2b5409c7a256afa31e7cb28af5fd6b68820e5143` → local `768d99c`; NUL-delimited worktree parsing preserves newline-containing paths and symlink-alias containment. Targeted independent component rechecks accepted these repairs; whole-candidate acceptance remains separate.
- Integration harness repairs preserve runtime behavior: npm JavaScript resolution for split installations, deterministic admission deadline clock, unique local selector query and initialized synthetic theme, portable PTY host launch, waiting for persisted rerun notification before deleting a fixture, and reusing bounded EventBus fixture cleanup for an observed ENOTEMPTY race. The notification cleanup warning also reproduced on unchanged upstream `799182f`; this fixture synchronization does not certify shutdown draining all post-terminal writes.
- Packed lazy-load probes now isolate provider authentication/settings and use explicit unavailable routes instead of relying on a default catalog model to reject launch. Healthy semantic errors and sticky missing-module-first refusal remain distinct. Earlier ambiguous probe runs accepted a delegate launch before cleanup; their automatically removed traces cannot establish absence of external requests. Final qualification uses a credential-free process environment.
- Current-host exploratory evidence observed unchanged shell guidance through typed/tool-follow-up/completion-wake/next-typed calls and successful new-session rebinding, plus theme/width PTY overlays. These are bounded observations, not an exhaustive stale-context/cache study or screenshot/contrast certification. No #36/#38 runtime fix was justified.

## 2026-10-22 idle UI release authorization

The operator approved committing, pushing and tagging `v2.6.10-sendhil.2`, then updating the shared `claude-config` Git package pin. No upstream integration is included. The change deduplicates successful footer status writes and legacy widget clears by last-observed UI reference while retaining the comparison timer, immediate task/seen updates, host revisions and shutdown fences. The pre-release implementation passed 1,057 default tests on Node 24.20.0 and an independent 16-test UI/lifecycle/host recheck; those are not substitutes for the pinned release-candidate gates. Exact candidate SHA, freshness-first checks, current-host installation and publication outcomes are recorded externally after execution. The prior immutable tag remains the rollback target. No npm publication or reload of running sessions is authorized.
