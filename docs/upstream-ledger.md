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
