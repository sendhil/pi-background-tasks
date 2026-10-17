import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { it } from 'node:test';
import { resolveNpmCli } from '../helpers/npm-cli.js';

it('resolves the npm-provided JS executable when npm is installed separately from Node', () => {
  const root = mkdtempSync(join(tmpdir(), 'npm-cli-'));
  try {
    const cli = join(root, 'npm-cli.js');
    writeFileSync(cli, '');
    assert.equal(resolveNpmCli(join(root, 'separate-node/bin/node'), { npm_execpath: cli }), cli);
    assert.throws(() => resolveNpmCli(join(root, 'missing/node'), { npm_execpath: join(root, 'missing.js') }), /cannot resolve npm-cli/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
