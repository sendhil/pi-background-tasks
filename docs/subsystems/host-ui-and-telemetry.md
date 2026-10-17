---
doc_id: subsystems/host-ui-and-telemetry
audience: maintainer
mode: authored
review_policy: behavioral
stability: stable
covers_surfaces: []
covers_sources: [extensions/background-tasks.ts, src/core/config.ts, src/extension.ts, src/ui/background-tasks-manager.ts, src/ui/footer-status.ts]
---
# Host UI and telemetry

This subsystem owns the extension entrypoint, command/tool registration, footer dock, task manager UI, and completion renderer. Task lifecycle internals are owned by [background-task-runtime](background-task-runtime.md).

## Entrypoint and registration

The published `dist/extensions/background-tasks.js` entrypoint is compiled from `extensions/background-tasks.ts`, which re-exports the authoritative `src/extension.ts`. Only the ordered paths in `package.json.pi.extensions` and the package-owned child extension paths are supported extension roots. Files under `dist/src/**` are private compiled implementation chunks, not standalone Node entrypoints. Importing one directly from an unrelated natively loaded extension bypasses Pi's Jiti host-module aliases and is unsupported. The packed-package gate instead exercises every public lazy lane through the real package entrypoint with no package-local Pi SDK or TypeBox installation.

Before creating the registry or registering a surface, the extension strictly parses the shared capability/shortcut configuration. It dynamically imports delegate/Fusion facade registration only for enabled capabilities; the dock component is imported only when an interactive manager is opened. `process` is mandatory and registers:

- commands: `/bg`, `/tasks`, `/bg-tasks`, `/bg-clear`, `/jobs`, `/logs`, `/kill`;
- tools: `bg_run`, `bg_status`, `bg_logs`, `bg_kill`;
- shortcut: the selected dock key (`shift+down`, `ctrl+alt+b`, or none for `off`) plus unconditional `ctrl+alt+c`;
- renderer: `background-task-notification`;
- the task UI, the EventBus v1 service, and the optional [host interface](../api/eventbus-host-v1.md) service.

The host interface shares this activation's registry and terminal seen set (`/bg-clear`, dock detail views and host `mark_seen` all mark the same set), is invalidated from the registry change callback and seen-state changes, and becomes ready after the first `session_start` supplies the session context. Its verified result reader is a deferred lane imported only on the first terminal delegate/Fusion result read.

Delegate, Fusion, attested-run, and ambient attribution registrations are independently selected by `PI_BG_FEATURES`. `bg_result` is derived and registered once iff delegate or Fusion is enabled. Disabled facade/attribution modules are absent from the process-only static startup graph rather than merely inactive. Active-tool cleanup is delegated to Pi's registration rebuild: a stale package name with no current definition is dropped, while an active definition from another extension remains active even when it uses a disabled package capability name such as `bg_delegate` or the retired `fusion_brainstorm`. The package does not perform name-wide subtraction. The default selection enables the complete current capability surface. Capability flags alone make no startup-performance claim.

## Agent-visible shell guidance

A dedicated `before_agent_start` hook adds the activation's actual background-shell executable, dialect, and `-c`/cmd argument shape before the model generates a command. The hook uses an independently replaceable prompt section when the host supports structured sections and a chained, idempotent block on string-only hosts, including when `systemPromptOptions` is absent. For OMP-style `string[]` prompts it preserves array boundaries/peer text and appends or updates one package block without changing the caller's array. It preserves guidance added by other background-feature hooks in either registration order, requires no UI, and is independent of the ambient attribution flag. The complete shape-validation contract is in [Background task runtime](background-task-runtime.md#shell-policy).

An inherited Nu, fish, csh, or unknown shell is explicitly described as `user-non-posix`, with instructions not to assume Bash syntax and remediation to set `PI_BG_POSIX_SHELL=bash` before startup or `/reload`. The guidance contains only resolved launch facts, not the process environment or credentials. The registry receives the same immutable selection; task snapshots and metadata make that match observable.

## Footer status

The footer is updated on task changes and once per second while a session is active. It shows only running tasks and unseen failures, in that order: `bg 2 running · 1 failed`. Without either count, only the `background-tasks` status key is cleared. Other extensions' status entries are untouched.

`src/ui/footer-status.ts` derives display segments from task snapshots and seen IDs without mutating either. The extension applies the current Pi theme: `dim` for the prefix, running count and separators; `error` for the failure count. There is no background fill, successful/stopped badge, version notice, command hint, or focused suffix. There are no footer modes or persisted preferences.

Hiding successful or stopped tasks does not acknowledge them, remove history, or suppress completion notifications. Opening a finished task's detail view marks it seen; `/bg-clear` or its shortcut marks all currently unseen finished tasks seen. Opening the list or closing the dock does not acknowledge tasks. Timeout and output-cap failures retain their existing failed classification.

## Task manager UI

`/tasks`, `/bg-tasks`, and the configured dock shortcut (when not `off`) open the same overlay. The two commands are unconditional process surfaces, including when the shortcut is disabled. Non-interactive contexts receive an error notification directing users to `/jobs`, `/logs`, `bg_status`, or `bg_logs`.

The manager uses the terminal background, `borderMuted` frames, ordinary `text` titles, subdued secondary text, and an `accent` pointer for selection. Semantic status labels remain visible without color. Rows truncate to available terminal columns, including Unicode names; 80/120 columns are supported and 40 columns gracefully truncates content.

The list view supports selection, paging, stop, confirmed stop-all, history toggle, rerun, output path, and close. Rerun is shell-task-only: typed delegate and Fusion tasks fail with guidance to relaunch through their owning tool rather than executing their display command as a shell command. Rerunning an opted survivor preserves `surviveReload:true`, but it is a new execution with a new id/nonce and the current activation's shell policy, timeout, and output cap. The detail view shows task identity, status, runtime, output path, description, task-owned model/context/tokens/tools when reported, command, error, and an output tail.

Detail output semantics:

- reads a UI-only tail buffer of 128 KiB;
- refreshes every second only while following;
- shows 12 output lines;
- scrolling up pauses follow and freezes the buffer;
- reaching the bottom or pressing `r` resumes follow;
- missing output files and read failures are displayed in the detail box.

## Completion rendering

`background-task-notification` renders `[bg completed]`, `[bg failed]`, `[bg killed]`, or other status with task name, id, output path, and error. The notification content itself is produced by the runtime and may trigger a follow-up turn depending on task flags.

## Package maintenance

The extension does not check a package registry, advertise versions, or register an update command. Package installation and updates remain Pi's responsibility; no startup updater or replacement polling mechanism runs here.

## Telemetry display

The host UI displays telemetry only from task snapshots: context, model, token totals, and tool counts. When unavailable, detail rows say `not reported by this background task`. The UI never copies telemetry from the parent session into a task.

## Shutdown

On session shutdown, one early synchronous lifecycle fence permanently closes the activation. Only `reason:"reload"` may first detach admission-committed `surviveReload:true`, `isAgent:false` ordinary executions; detachment removes the old host adapter before any await while preserving logical publication and notification state. The same call stack then closes admissions, aborts admission-owned cancellation scopes, closes registry publication, the EventBus service and the host interface service (which removes its request listener, disposes leases and publishes one `closed` change frame), clears pending retry/status handles, suppresses old-host notifications, closes every enabled Fusion/delegate/result lazy lane including the host result reader, aborts Fusion controllers, and aborts delegate preparation. The entrypoint registers this shared fence before any facade asynchronous cleanup, so sequential Pi dispatch cannot pause with another old lane still open. Later handlers drain workflow/preparation/admission-owned subprocess, file, and managed cleanup; kill every remaining registry-owned task with the specific lifecycle reason; and report cleanup failures through the UI when possible. Preflight that crosses closure cannot insert, spawn, or return EventBus success.

The first fresh `session_start` callback synchronously claims the exact `(process.pid, session id, canonical cwd)` slot, imports/durably audits the same task records, commits the fresh adapter, then allows existing UI/status setup. Completion during the gap queues for that adapter. Status, logs, kill, commands, and dock therefore use the same id/PID/path/nonce/execution after reload. A malformed new activation or removed extension cannot steal the owner; its fixed handoff deadline cleans up.

Shutdown terminal metadata and task waiters remain truthful even when old-activation EventBus publication is abandoned. Shutdown is idempotent, including handle cleanup on repeated calls. `session_start` rechecks activation after runtime-directory setup and before status interval creation, so an overlapping late continuation cannot recreate old resources. Pi `AgentSession.reload()` replaces the extension runner; `AgentSessionRuntime` new/switch/fork/clone/dispose flows do not claim reload handoffs and kill opted work. Kill-on-reload remains the default unless an ordinary task explicitly opts in. Hard crash/restart survival is not supported.

## Related docs

- [Shortcuts and dock](../reference/shortcuts-and-dock.md)
- [`/tasks` and `/bg-tasks`](../commands/task-manager.md)
- [`/bg-clear`](../commands/bg-clear.md)
- [Completion delivery](../concepts/completion-delivery.md)
- [Host interface EventBus API v1](../api/eventbus-host-v1.md)
- [Background task runtime](background-task-runtime.md)

## Source ownership/reference

Primary source ownership for this document is `extensions/background-tasks.ts`, `src/extension.ts`, `src/core/config.ts`, `src/ui/background-tasks-manager.ts`, and `src/ui/footer-status.ts`.
