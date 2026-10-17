import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { it } from 'node:test';
import { assertNoPrivateHostSdk, publicExtensionRoots, resolveHostCli } from '../fixtures/host-qualification.js';

it('resolves the actual host manifest bin.pi rather than the historical dist/cli.js', () => {
  const root = mkdtempSync(join(tmpdir(), 'host-bin-'));
  try {
    mkdirSync(join(root, 'dist/bundle'), { recursive: true });
    writeFileSync(join(root, 'dist/bundle/cli.js'), '');
    writeFileSync(join(root, 'package.json'), JSON.stringify({ bin: { pi: 'dist/bundle/cli.js' } }));
    assert.equal(resolveHostCli(root), join(root, 'dist/bundle/cli.js'));
    writeFileSync(join(root, 'package.json'), JSON.stringify({ bin: { other: 'dist/bundle/cli.js' } }));
    assert.throws(() => resolveHostCli(root), /bin.pi/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

it('qualifies every manifest-declared compiled root in order, never the source extension', () => {
  const root = mkdtempSync(join(tmpdir(), 'public-roots-'));
  try {
    mkdirSync(join(root, 'dist/extensions'), { recursive: true });
    for (const name of ['first', 'second']) writeFileSync(join(root, `dist/extensions/${name}.js`), '');
    writeFileSync(join(root, 'package.json'), JSON.stringify({ pi: { extensions: ['./dist/extensions/first.js', './dist/extensions/second.js'] } }));
    assert.deepEqual(publicExtensionRoots(root), ['first', 'second'].map(name => join(root, `dist/extensions/${name}.js`)));
    writeFileSync(join(root, 'package.json'), JSON.stringify({ pi: { extensions: ['./extensions/background-tasks.ts'] } }));
    assert.throws(() => publicExtensionRoots(root), /compiled/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

it('rejects private host SDK copies even below a transitive dependency', () => {
  const root = mkdtempSync(join(tmpdir(), 'private-sdk-'));
  try {
    mkdirSync(join(root, 'node_modules/runtime-dependency'), { recursive: true });
    assert.doesNotThrow(() => assertNoPrivateHostSdk(root));
    mkdirSync(join(root, 'node_modules/runtime-dependency/node_modules/typebox'), { recursive: true });
    assert.throws(() => assertNoPrivateHostSdk(root), /private host SDK/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
