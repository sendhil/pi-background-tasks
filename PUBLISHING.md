# Publishing the personal pi-background-tasks fork

This repository is the public `sendhil/pi-background-tasks` fork. Its package is
npm-private (`private: true`): **do not publish it to npm or replace the upstream
npm package.** Retain upstream author, license and third-party notices.

The package version is authoritative; the immutable Git tag must be exactly
`v${version}`. Downstream releases use `2.6.10-sendhil.1`-style prerelease versions,
not upstream tags. Never move or reuse a published tag.

## Qualification before publication

Follow [release operations](docs/operations/releasing.md) and
[fork policy](docs/fork-policy.md). In summary:

1. Intentionally update source/version metadata, regenerate `dist` and docs, and
   commit the candidate. Resolve its full SHA once.
2. Run `verify:generated` against that commit with exact Node/npm versions before
   any build-capable test can repair stale committed output.
3. Run the fork contract, required test/doc/payload gates, and actual Pi 1.1.0
   Git-install qualification. The isolated local-remote rehearsal proves the
   installation mechanism, not canonical GitHub availability.
4. Record exact revisions, executed gates and remaining limitations. Optional
   strict behavioral-attestation failures must not be hidden or fabricated.
5. Obtain explicit operator approval to push/tag/install. Do not reload busy Pi
   sessions. Approval for one release does not authorize later releases.

## Git publication

After approval and qualification, publish only to `origin`
(`https://github.com/sendhil/pi-background-tasks.git`), using normal fast-forward
updates and an immutable matching tag. Never push to `upstream` or force-update a
published ref. Verify the canonical remote tag resolves to the intended commit.

The existing tag certification workflow checks `v${version}` against package
metadata and never publishes to npm. Its results and the ordinary CI matrix are
separate evidence from local macOS testing.

## Synchronized installation

After the tag is published, verify an isolated real Pi installation from the
canonical fork URL, without local URL rewriting. Then replace the old npm entry
in `claude-config/pi/settings.json` with the approved tag, for example:

```text
git:github.com/sendhil/pi-background-tasks@v2.6.10-sendhil.2
```

Do not keep both npm and Git declarations. Check the private settings overlay,
which merges package arrays, for an old npm source. Update the setup regression
and documentation with the shared pin; run the configuration repository's tests.

On each machine, pull `claude-config`, run `./setup.sh --agent pi`, and start a
fresh Pi session with `PI_BG_FEATURES=process`. Existing sessions keep their loaded
extension until restarted; do not reload sessions that own running tasks.

Keep the previous shared declaration for rollback. Restore it in the durable
configuration source and rerun setup rather than editing generated settings.
The maintenance skills are intentionally project-local to this source checkout.
