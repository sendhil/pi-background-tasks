---
doc_id: operations/releasing
audience: maintainer
mode: authored
review_policy: contract
stability: evolving
covers_surfaces: []
covers_sources: []
---
# Releasing operations

Package maintenance entrypoint: `PUBLISHING.md`. Source version is always `package.json`; never hard-code a release version in commands.

```bash
VERSION=$(node -p "require('./package.json').version")
printf 'pi-background-tasks@%s\n' "$VERSION"
```

This public personal fork is npm-private. The operator approved the first downstream Git release as `v2.6.10-sendhil.1` and the idle-UI follow-up as `v2.6.10-sendhil.2`. Read the current package version from `package.json`. Use immutable matching downstream tags and never reuse upstream tags. Future publication and installation still require explicit approval. See [fork policy](../fork-policy.md).

## Ordinary release checks

Run from the `pi-background-tasks` package root in an isolated environment. These are release-candidate checks, not tag certification:

```bash
# First regenerate intentionally edited source, then commit the candidate.
# Resolve CANDIDATE once; a gate fix requires a new commit and full restart.
CANDIDATE=$(git rev-parse HEAD)
NODE_VERSION=22.19.0 # or the pinned 24.22.0 lane, with npm 11.19.0
npm run verify:generated -- --candidate "$CANDIDATE" --node-version "$NODE_VERSION" --npm-version 11.19.0
npm run verify:fork
npm run typecheck
npm run test:type-safety
npm run test:unit
npm run test:sdk
npm run test:rpc
npm run test:component
npm run test:package
npm run test:hook-contract
npm run smoke
npm run smoke:large-context
npm run pack:dry-run
# With pnpm 11.18.0 on PATH:
npm run test:pnpm-pack
npm run docs:verify
npm run payload:check
# On a tag ref only: GITHUB_REF_TYPE=tag GITHUB_REF_NAME=v$VERSION npm run release:check-version
npm run test:compat -- --host "$PI_HOST_ROOT" --candidate "$CANDIDATE"
```

`npm run test:full` additionally runs PTY and scripted-provider agent-loop gates. Treat it as a full interactive gate; do not run it for routine docs edits.

Live evidence (`npx tsx scripts/delegate-live-run.ts`) is release-time and performs real subscription-OAuth inference. It must never use API-key/metered frontier channels.

## Payload verification

Use `npm pack --dry-run --json` output as the payload source of truth. Verify at minimum:

- `dist/extensions/anthropic-attribution.js` and `dist/extensions/background-tasks.js` are the ordered Pi entrypoints;
- the complete compiled `dist/` runtime closure, source maps, copied hook-contract evidence, and minimal `dist/package.json` are included;
- authoritative `extensions/` and runtime `src/` sources remain included for public source/API compatibility;
- `docs/`, `README.md`, `TESTING.md`, `TEST_PLAN.md`, `PUBLISHING.md`, `BACKGROUND-TASKS-INSTRUCTIONS.md`, `THIRD_PARTY_NOTICES.md`, root `logo.png`, and `LICENSE` are included per current `package.json.files`;
- tests, scripts, node_modules, local `.pi/` artifacts, generated evidence not meant for runtime, and nested tarballs are excluded;
- TypeBox and `@earendil-works/pi-ai` remain Pi-provided peers and no private/nested runtime copies are bundled;
- production dependencies use registry versions only; no exotic URL/git/file subdependency is shipped;
- docs/assets/gateway/logo inclusion matches `package.json.files` exactly.

## Tag certification and installation

The CI/release workflows run committed-artifact freshness before build-capable tests, followed by the fork contract. The pinned Pi 1.1.0 host is provisioned outside project SDK dependencies. `test:compat` never prebuilds: provide an installed host root and the immutable candidate SHA. Historical network-fetching compatibility is available only through explicit `--historical`, not an implicit latest-host promise.

The current-host gate rehearses Pi's actual Git install from a disposable local bare remote via process-scoped URL rewriting. It proves installation mechanics and committed-byte loading, not GitHub availability. After separate publication approval, repeat the same SHA from the canonical fork remote before any personal settings change.

`release:check-version` requires an explicit matching tag ref and never publishes. Neither successful gates nor a skill invocation authorize pushes, tag creation, npm publication, personal installation, or reload of busy sessions. Keep the previous package declaration for rollback; restore it and launch a fresh session if rollout is later approved.
