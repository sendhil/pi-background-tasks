# Background Tasks Investigation: Baseline Evidence

Date: 2026-10-17.

## Inspected state

- Disposable checkout: `/tmp/pi-background-tasks-investigation`.
- Fork and upstream main both at `799182ff65d7040732aea23b2001ea860b688531` (`2.6.10`).
- Working tree clean before baseline execution.
- Host Node `26.8.1`, npm `11.19.0`; installed global Pi `1.1.0`.
- User's configured runtime package remains `npm:pi-background-tasks@2.6.9`; it was not changed.

## Baseline execution

Named background task: `Baseline plugin checks`, ID `bf94a06a6`.

```sh
cd /tmp/pi-background-tasks-investigation &&
npm ci --ignore-scripts &&
env -u PI_BG_FEATURES PI_OFFLINE=1 PI_SKIP_VERSION_CHECK=1 PI_TELEMETRY=0 npm run typecheck &&
env -u PI_BG_FEATURES PI_OFFLINE=1 PI_SKIP_VERSION_CHECK=1 PI_TELEMETRY=0 npm run test:unit &&
env -u PI_BG_FEATURES PI_OFFLINE=1 PI_SKIP_VERSION_CHECK=1 PI_TELEMETRY=0 npm run test:component
```

Result: dependency install and TypeScript typecheck passed. Unit tests: **747 total, 743 passed, 4 failed**, no skips. Component tests were not reached because the command short-circuited. Dependency lifecycle scripts were disabled for the initial inspection install. Tests execute repository code in a disposable checkout, not an OS sandbox.

Failures on unchanged upstream:

1. Two `anthropic-attribution-fixture-portability` assertions compare `/private/var/...` actual paths against `/var/...` expected paths on macOS.
2. `pi-launch` unreadable-manifest test expects a mocked read to throw, but its injected comparison uses a noncanonical path. Hypothesis: the same symlink/canonicalization mismatch prevents the injected failure.
3. Registry admission-owned Git deadline test expects one Git spawn but observes zero; its admission deadline is 20 ms. Hypothesis: parallel-suite load exhausts the deadline before spawn.

Follow-up task `b936c7ee5` reran these three test files serially with canonicalized TMPDIR, then ran component tests independently. **Focused tests: 89/89 passed. Component tests: 12/12 passed.** Both commands exited zero; no skips and no source changes.

This supports environment-sensitive fixture/test-timing explanations rather than demonstrated production failures. Because both TMPDIR and concurrency changed together, it does not independently isolate each cause, and a passing rerun does not prove the deadline test cannot flake. Normalize expected fixture paths and replace fragile timing assumptions during implementation. The complete 747-test unit suite was not rerun under the adjusted environment; do not report a clean full-suite pass.

## Dependency audit

`npm audit --json` reported five affected packages in the development-inclusive tree: two high, two moderate and one low. Names: `brace-expansion`, `undici`, `@earendil-works/pi-coding-agent` (via undici), `protobufjs`, `esbuild`.

`npm audit --omit=dev --json` reported **zero vulnerabilities** for this package's production dependency tree. This is not an audit of the separately installed host Pi and is not proof that no vulnerabilities exist. Upgrade the development SDK/lockfile deliberately with compatibility tests; do not run `npm audit fix --force` indiscriminately. No dependency fixes were applied.

No full SDK/RPC/package/PTY/cross-platform or live-model suite has been claimed as passing. Node 22/24 and current-Pi packaged compatibility checks are rollout gates in the delivery plan, not evidence supplied by this initial command.
