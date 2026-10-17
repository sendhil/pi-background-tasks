import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const script = resolve('scripts/maintenance/verify-fork.mjs');
const maintenance = await import(script);
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function write(root: string, path: string, content: string) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}
function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'bg-fork-contract-')));
  roots.push(root);
  const pkg = {
    name: 'pi-background-tasks', private: true, license: 'ISC',
    author: 'Ismail <ismailsalikhodjaev@gmail.com>',
    repository: { type: 'git', url: 'git+https://github.com/sendhil/pi-background-tasks.git' },
    homepage: 'https://github.com/sendhil/pi-background-tasks#readme',
    bugs: { url: 'https://github.com/sendhil/pi-background-tasks/issues' },
    peerDependencies: { '@earendil-works/pi-ai': '*', '@earendil-works/pi-coding-agent': '*', '@earendil-works/pi-tui': '*', typebox: '*' },
    dependencies: {} as Record<string, string>,
    pi: { extensions: ['./dist/extensions/anthropic-attribution.js', './dist/extensions/background-tasks.js'] },
  };
  write(root, 'package.json', JSON.stringify(pkg));
  write(root, 'src/extension.ts', 'export default function extension() {}\n');
  write(root, 'src/ui/background-tasks-manager.ts', 'export const role = "borderMuted";\n');
  write(root, 'dist/extensions/background-tasks.js', 'export default function extension() {}\n');
  write(root, 'dist/extensions/anthropic-attribution.js', 'export default function extension() {}\n');
  write(root, 'LICENSE', 'ISC License\n');
  write(root, 'THIRD_PARTY_NOTICES.md', 'Third-party notices\n');
  return { root, pkg };
}

test('fork metadata refuses npm publication even when runtime fixtures would pass', () => {
  const f = fixture();
  f.pkg.private = false;
  write(f.root, 'package.json', JSON.stringify(f.pkg));
  assert.throws(() => maintenance.verifyMetadata(f.root), /private/);
});

test('fork metadata accepts the desired fork identity and peer/compiled-entrypoint posture', () => {
  const f = fixture();
  assert.doesNotThrow(() => maintenance.verifyMetadata(f.root));
});

for (const scenario of ['identity', 'publication config', 'upstream metadata', 'host dependency', 'optional host', 'bundled host', 'peer range', 'source entrypoint', 'missing artifact', 'packaged skill', 'updater', 'compiled updater', 'fixed RGB', 'license'] as const) {
  test(`fork metadata rejects ${scenario}`, () => {
    const f = fixture();
    if (scenario === 'identity') f.pkg.name = 'renamed-tools';
    if (scenario === 'publication config') Object.assign(f.pkg, { publishConfig: { access: 'public' } });
    if (scenario === 'upstream metadata') f.pkg.repository.url = 'git+https://github.com/ismailsaleekh/pi-background-tasks.git';
    if (scenario === 'host dependency') f.pkg.dependencies['@earendil-works/pi-coding-agent'] = '*';
    if (scenario === 'optional host') Object.assign(f.pkg, { optionalDependencies: { typebox: '*' } });
    if (scenario === 'bundled host') Object.assign(f.pkg, { bundledDependencies: ['@earendil-works/pi-ai'] });
    if (scenario === 'peer range') f.pkg.peerDependencies['@earendil-works/pi-tui'] = '^0.84.0';
    if (scenario === 'source entrypoint') f.pkg.pi.extensions = ['./src/extension.ts'];
    if (scenario === 'missing artifact') rmSync(join(f.root, 'dist/extensions/background-tasks.js'));
    if (scenario === 'packaged skill') Object.assign(f.pkg.pi, { skills: ['.pi/skills'] });
    if (scenario === 'updater') write(f.root, 'src/core/update-check.ts', 'export const registry = "https://registry.npmjs.org";');
    if (scenario === 'compiled updater') write(f.root, 'dist/extensions/background-tasks.js', 'pi.registerCommand("bg-update", {});');
    if (scenario === 'fixed RGB') write(f.root, 'src/ui/background-tasks-manager.ts', 'const color = "\\x1b[48;2;183;223;255m";');
    if (scenario === 'license') rmSync(join(f.root, 'LICENSE'));
    write(f.root, 'package.json', JSON.stringify(f.pkg));
    assert.throws(() => maintenance.verifyMetadata(f.root), /fork|publish|host|peer|compiled|skill|updater|RGB|LICENSE/);
  });
}

const runtimeTests = [
  'tests/unit/footer-status.test.ts',
  'tests/component/background-tasks-manager.test.ts',
  'tests/sdk/sdk.test.ts',
  'tests/sdk/feature-selection-sdk.test.ts',
];
function runtimeFixture() {
  const f = fixture();
  symlinkSync(resolve('node_modules'), join(f.root, 'node_modules'), 'dir');
  for (const path of runtimeTests) write(f.root, path, `
    import { test } from 'node:test';
    import assert from 'node:assert/strict';
    test('runtime contract fixture', () => {
      assert.equal(process.env.PI_BG_FEATURES, undefined);
      assert.equal(process.env.PI_OFFLINE, undefined);
      assert.equal(process.env.PI_BG_DISABLE_UPDATE_CHECK, undefined);
    });
  `);
  write(f.root, 'tests/sdk/sdk.test.ts', `
    import { test } from 'node:test';
    import assert from 'node:assert/strict';
    for (const name of [
      'hides successful footer notices without acknowledging them before explicit /bg-clear',
      'shows only running and unseen failed counts even while the dock is open',
      'never requests package updates or shows an idle footer without offline or disable flags',
    ]) test(name, () => {
      assert.ok(process.env.PI_BG_FEATURES === undefined || process.env.PI_BG_FEATURES === 'process');
      assert.equal(process.env.PI_OFFLINE, undefined);
      assert.equal(process.env.PI_BG_DISABLE_UPDATE_CHECK, undefined);
      assert.equal(process.env.PI_PACKAGE_DIR, undefined);
    });
  `);
  return f;
}
function run(root: string, ...args: string[]) {
  return spawnSync(process.execPath, [script, '--repo', root, ...args], { encoding: 'utf8', env: {
    ...process.env, PI_BG_FEATURES: 'process', PI_OFFLINE: '1', PI_BG_DISABLE_UPDATE_CHECK: '1',
  } });
}

test('verify-fork CLI fails on a real failing runtime assertion, not just text scanning', () => {
  const f = runtimeFixture();
  write(f.root, runtimeTests[0]!, `import { test } from 'node:test'; import assert from 'node:assert/strict'; test('reintroduced successful badge', () => assert.equal('bg 1 done', ''));`);
  const result = run(f.root);
  assert.notEqual(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout + result.stderr, /reintroduced successful badge/);
});

test('verify-fork runs runtime fixtures with masking environment flags cleared', () => {
  const f = runtimeFixture();
  const result = run(f.root);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /# pass 6/);
});

test('metadata-only CLI explicitly does not certify runtime behavior', () => {
  const f = fixture();
  const result = run(f.root, '--metadata-only');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /runtime and freshness are NOT verified/);
});

test('verify-fork blocks when the runtime test files contain no assertions', () => {
  const f = runtimeFixture();
  for (const path of runtimeTests) write(f.root, path, `import { test } from 'node:test'; test.skip('not qualification', () => {});`);
  const result = run(f.root);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /ran no assertions/);
});


test('verify-fork CLI never silently skips checks through a symlinked script path', () => {
  const f = fixture();
  f.pkg.private = false;
  write(f.root, 'package.json', JSON.stringify(f.pkg));
  const link = join(f.root, 'verify.mjs');
  symlinkSync(script, link);
  const result = spawnSync(process.execPath, [link, '--repo', f.root], { encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /private/);
});

test('a conflict resolution that reintroduces the updater is rejected in a committed Git fixture', () => {
  const f = fixture();
  function git(...args: string[]) {
    const result = spawnSync('git', ['-C', f.root, ...args], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  }
  git('init', '-q', '-b', 'main');
  git('config', 'user.name', 'Fixture');
  git('config', 'user.email', 'fixture@example.invalid');
  git('add', '.');
  git('commit', '-qm', 'base');
  git('checkout', '-qb', 'upstream');
  write(f.root, 'src/extension.ts', 'pi.registerCommand("bg-update", {});\n');
  git('commit', '-qam', 'upstream reintroduces updater');
  git('checkout', '-q', 'main');
  write(f.root, 'src/extension.ts', 'export default function quietExtension() {}\n');
  git('commit', '-qam', 'downstream quiet extension');
  const merge = spawnSync('git', ['-C', f.root, '-c', 'core.hooksPath=/dev/null', 'merge', '--no-edit', 'upstream'], { encoding: 'utf8' });
  assert.equal(merge.status, 1);
  assert.match(merge.stdout, /CONFLICT/);
  write(f.root, 'src/extension.ts', 'pi.registerCommand("bg-update", {});\n');
  git('add', 'src/extension.ts');
  git('commit', '-qm', 'incorrect conflict resolution');
  assert.equal(git('status', '--porcelain'), '');
  const result = run(f.root, '--metadata-only');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Forbidden updater marker in src\/extension.ts/);
});

test('verify-fork refuses zero matched profile tests instead of trusting a successful broad suite', () => {
  const f = runtimeFixture();
  write(f.root, 'tests/sdk/sdk.test.ts', `import { test } from 'node:test'; test('unrelated passing test', () => {});`);
  const result = run(f.root);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /exactly 3/);
});

test('verify-fork exercises the three profile-neutral cases with process explicitly enabled', () => {
  const f = runtimeFixture();
  const path = 'tests/sdk/sdk.test.ts';
  write(f.root, path, readFileSync(join(f.root, path), 'utf8').replace("assert.ok(process.env.PI_BG_FEATURES === undefined || process.env.PI_BG_FEATURES === 'process');", "assert.notEqual(process.env.PI_BG_FEATURES, 'process', 'process-specific regression');"));
  const result = run(f.root);
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /exactly 3|process-specific regression/);
});

test('verify-fork clears host package asset overrides and runs exactly three cases per profile', () => {
  const f = runtimeFixture();
  const result = spawnSync(process.execPath, [script, '--repo', f.root], { encoding: 'utf8', env: { ...process.env, PI_PACKAGE_DIR: '/nonexistent/host-assets' } });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal((result.stdout.match(/^# pass 3$/gm) ?? []).length, 2);
});
