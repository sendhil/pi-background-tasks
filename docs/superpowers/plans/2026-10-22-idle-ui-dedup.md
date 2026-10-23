---
doc_id: superpowers/plans/2026-10-22-idle-ui-dedup
audience: maintainer
mode: authored
review_policy: contract
stability: evolving
covers_surfaces: []
covers_sources: []
---
# Idle UI Deduplication Implementation Plan

> **For agentic workers:** Execute inline with test-driven development; the assigned worker is the sole writer and must not delegate. Independent parent review is required before acceptance.

**Goal:** Eliminate redundant background-task footer/widget setters after successful synchronization without changing task truth or lifecycle behavior.

**Architecture:** Keep activation-local last-observed `ctx.ui` identity, independent widget/status success flags, and the last successfully applied fully themed status bytes. Reset both flags on each UI-reference transition, including A→B→A. Keep the one-second timer as derive/theme/compare work and preserve independent host invalidation and the dock timer.

**Tech Stack:** TypeScript, Node test runner via local tsx, real Pi SDK extension callbacks, controlled interval boundary, counted synthetic UI, existing docs engine and runtime build.

## Global Constraints

- Scope: `src/extension.ts` publication seam, source-named SDK regression tests, owning authored docs and relevant test docs, engine-generated docs and compiled `dist` only.
- No ctx-wrapper identity cache, WeakMap, internal host/theme imports, new public API, production test hooks, or broad refactors.
- Keep existing error logging/currentCtx clearing; record a successful setter only after it returns. Widget and status success are independent.
- Preserve task/seen state, registry events, notifications/durability, host revisions, synchronous shutdown fences and reload survival.
- Tests use `PI_OFFLINE=1 PI_SKIP_VERSION_CHECK=1 PI_TELEMETRY=0 CI=1` and task-owned temp HOME/agent/session roots.
- Initial missing dependencies were escalated; the user approved only the locked local `npm ci --ignore-scripts --no-audit --no-fund`. Do not upgrade dependencies or run lifecycle scripts without approval.
- No commits, staging, tags, push, publication, live-runtime installation/reloads, real provider requests, global configuration changes, browser experiments or production Git polling.

## Task 1: Deduplicate successful UI publication

**Files:**
- Create: `tests/sdk/extension-ui.test.ts` (registered source-extension callbacks through real SDK).
- Modify: `src/extension.ts` activation state and `updateUi` only.

**Interfaces:** Consume existing `ExtensionContext.ui`, registry callbacks, commands/shortcuts and EventBus APIs. Produce no exported interface changes; only the count of own-key UI setters changes.

**Seam:** The real extension registers callbacks with the SDK runner; a counted fake replaces only the terminal UI and a controlled interval replaces only time. This proves setter suppression, not powerline polling or real terminal rendering.

- [x] Write and run the empty-idle regression before production edits: initial `setWidget('background-tasks', undefined)` and `setStatus('background-tasks', undefined)` occur once; multiple captured timer ticks add zero setters. Expected RED: extra setters on unchanged ticks.
- [x] Add activation-local state and derive before publication:
  ```ts
  let lastObservedUi: ExtensionContext['ui'] | undefined;
  let widgetSynchronized = false;
  let statusSynchronized = false;
  let lastAppliedStatus: string | undefined;
  ```
  Capture `const ui = ctx.ui`; on reference change reset both success flags. Render all segments using `ui.theme.fg`; clear the widget only until its setter succeeds; publish status iff uninitialized or rendered bytes differ, recording bytes/success after return. Leave the catch and lifecycle code unchanged.
- [x] Run the same test GREEN, then add focused checks for repeated equal callbacks, immediate running/failure/ack changes, theme byte changes, fresh context wrappers with stable UI, new UI and aliased A→B→A synchronization, each partial setter failure/retry after context restoration, and closed/late-start no-write/no-timer behavior. Existing SDK/host/component/lifecycle tests remain intact. Additional tests after the first implementation are explicitly supplemental regression tests; do not call them pre-implementation RED evidence.
- [x] Verify host revisions advance through semantic acknowledgement even when the rendered footer is equal. Use the real host EventBus service, not internal host calls.

## Task 2: Documentation, generated closure and validation

**Files:** Modify footer prose in `docs/subsystems/host-ui-and-telemetry.md`, add a focused coverage note in `TESTING.md` and the footer row in `TEST_PLAN.md`. Update the docs-count fixture in `scripts/docs/selftest.mjs` from 46 to 47 for this required plan (separately approved after the first default-gate failure). Let the docs engine own INDEX/read gate/manifest/generated regions; let runtime build own `dist`.

- [x] Describe comparison-only idle ticks, first sync of undefined status, reference-transition reset and retry-after-success semantics; preserve shutdown/dock/task contracts.
- [x] Run `npm run build:runtime`, focused `tsx --test tests/sdk/extension-ui.test.ts`, footer/extension-api/host units, SDK lifecycle/reload/host tests, and components.
- [x] Run `npm run typecheck`, `npm run test:type-safety`, `npm run docs:generate`, `npm run docs:verify`, and default `npm test`. Existing offline loopback/pack fixtures are allowed only in their owned roots; stop on unsafe external needs. Report unrelated failures separately without repairs.
- [x] Inspect `git diff --check`, `git diff --stat`, `git status --short` and staged-file list. Write exact RED/GREEN evidence, generated-file list, caveats and commands to `/tmp/pi-spawn-audit-20261022/background-tasks-idle-ui-implementation.md`. Do not record semantic PASS attestations.
