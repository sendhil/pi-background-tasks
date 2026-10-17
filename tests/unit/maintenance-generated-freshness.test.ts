import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const gate = fileURLToPath(new URL('../../scripts/maintenance/verify-generated.mjs', import.meta.url));
const npmVersion = spawnSync('npm', ['--version'], { encoding: 'utf8' }).stdout.trim();

function git(root: string, ...args: string[]): string {
  const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
  return result.stdout.trim();
}

function put(root: string, path: string, text: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
}

function fixture(run: (root: string, candidate: string) => void, options: { extraBuild?: string; extraDocs?: string } = {}): void {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'generated-fixture-')));
  try {
    git(root, 'init', '-q');
    git(root, 'config', 'user.email', 'fixture@example.invalid');
    git(root, 'config', 'user.name', 'Fixture');
    put(root, '.gitignore', 'node_modules/\ndist/ignored.js\ndocs/ignored.md\ndocs/assets/\n');
    put(root, 'package.json', `${JSON.stringify({
      name: 'generated-fixture', version: '1.0.0', private: true, type: 'module',
      scripts: {
        'build:runtime': 'node scripts/build.mjs',
        'docs:generate': 'node scripts/docs.mjs',
        preinstall: 'node -e "process.exit(41)"',
        test: 'node -e "process.exit(42)"',
        prepack: 'node -e "process.exit(43)"',
      },
    }, null, 2)}\n`);
    put(root, 'package-lock.json', `${JSON.stringify({
      name: 'generated-fixture', version: '1.0.0', lockfileVersion: 3, requires: true,
      packages: { '': { name: 'generated-fixture', version: '1.0.0' } },
    }, null, 2)}\n`);
    const header = "import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';\n";
    put(root, 'scripts/build.mjs', `${header}
mkdirSync('dist', { recursive: true });
mkdirSync('node_modules', { recursive: true });
writeFileSync('node_modules/build-order', 'runtime');
writeFileSync('dist/runtime.js', readFileSync('source.txt'));
${options.extraBuild ?? ''}
`);
    put(root, 'scripts/docs.mjs', `${header}
if (readFileSync('node_modules/build-order', 'utf8') !== 'runtime') throw new Error('runtime must precede docs');
for (const path of ['README.md', 'docs/INDEX.md', 'docs/read-before-edit.md', 'docs/manifest.json', 'docs/authored.md']) {
  writeFileSync(path, readFileSync('source.txt'));
}
${options.extraDocs ?? ''}
`);
    for (const path of ['source.txt', 'dist/runtime.js', 'README.md', 'docs/INDEX.md', 'docs/read-before-edit.md', 'docs/manifest.json', 'docs/authored.md']) put(root, path, 'original\n');
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'fresh candidate');
    run(root, git(root, 'rev-parse', 'HEAD'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function invoke(root: string, candidate: string, extra: string[] = []) {
  const result = spawnSync(process.execPath, [gate, '--repo', root, '--candidate', candidate,
    '--node-version', process.versions.node, '--npm-version', npmVersion, ...extra], {
    encoding: 'utf8',
    env: { ...process.env, npm_config_offline: 'true', npm_config_audit: 'false', npm_config_fund: 'false' },
  });
  const output = `${result.stdout}${result.stderr}`;
  const log = /^verify-generated: log (.+)$/mu.exec(output)?.[1];
  if (log) {
    assert.ok(existsSync(log), 'the log survives checkout cleanup');
    assert.match(readFileSync(log, 'utf8'), new RegExp(candidate));
    assert.equal(existsSync(join(dirname(log), 'checkout')), false, 'owned checkout is cleaned after success or failure');
    rmSync(dirname(log), { recursive: true, force: true });
  }
  return { status: result.status, output, log };
}

void describe('maintenance committed generated freshness CLI', () => {
  void it('accepts fresh committed bytes using locked offline dependencies, runtime before docs, and no repair-capable tests', () => {
    fixture((root, candidate) => {
      const result = invoke(root, candidate);
      assert.equal(result.status, 0, result.output);
      assert.match(result.output, /generated artifacts match committed candidate/);
      assert.match(result.output, /npm ci --ignore-scripts/);
      assert.ok(result.log);
      assert.equal(existsSync(join(root, 'node_modules')), false);
    });
  });

  void it('rejects a source-only committed change instead of silently repairing stale output', () => {
    fixture((root) => {
      put(root, 'source.txt', 'changed source\n');
      git(root, 'add', 'source.txt');
      git(root, 'commit', '-qm', 'source only, stale artifacts');
      const candidate = git(root, 'rev-parse', 'HEAD');
      const result = invoke(root, candidate);
      assert.notEqual(result.status, 0, result.output);
      assert.match(result.output, /stale generated artifacts/);
      assert.match(result.output, /dist\/runtime.js/);
      assert.match(result.output, /docs\/manifest.json/);
      assert.match(result.output, /docs\/INDEX.md/);
      assert.equal(readFileSync(join(root, 'dist/runtime.js'), 'utf8'), 'original\n');
      assert.equal(git(root, 'status', '--porcelain'), '');
    });
  });

  void it('validates the explicit commit, not an unrelated dirty caller HEAD or index', () => {
    fixture((root, candidate) => {
      git(root, 'checkout', '-qb', 'unrelated');
      put(root, 'source.txt', 'later committed source\n');
      git(root, 'add', 'source.txt');
      git(root, 'commit', '-qm', 'unrelated stale topic');
      put(root, 'README.md', 'staged user work\n');
      git(root, 'add', 'README.md');
      put(root, 'source.txt', 'unstaged user work\n');
      put(root, 'untracked.txt', 'user data\n');
      put(root, 'node_modules/keep.txt', 'ignored user data\n');
      const before = git(root, 'status', '--porcelain', '--ignored');
      const head = git(root, 'rev-parse', 'HEAD');
      const index = readFileSync(join(root, '.git/index'));
      const result = invoke(root, candidate);
      assert.equal(result.status, 0, result.output);
      assert.equal(git(root, 'rev-parse', 'HEAD'), head);
      assert.equal(git(root, 'status', '--porcelain', '--ignored'), before);
      assert.deepEqual(readFileSync(join(root, '.git/index')), index);
      assert.equal(readFileSync(join(root, 'source.txt'), 'utf8'), 'unstaged user work\n');
      assert.equal(readFileSync(join(root, 'node_modules/keep.txt'), 'utf8'), 'ignored user data\n');
    });
  });

  for (const path of ['dist/new.js', 'dist/ignored.js', 'docs/new.md', 'docs/ignored.md']) {
    void it(`rejects unexpected generated file ${path}, including ignored output`, () => {
      fixture((root, candidate) => {
        const result = invoke(root, candidate);
        assert.notEqual(result.status, 0, result.output);
        assert.match(result.output, /unexpected generated files/);
        assert.ok(result.output.includes(path), result.output);
      }, { extraDocs: `writeFileSync(${JSON.stringify(path)}, 'unexpected');` });
    });
  }

  void it('detects removed tracked output and generated changes staged by a builder', () => {
    fixture((root, candidate) => {
      const result = invoke(root, candidate);
      assert.notEqual(result.status, 0, result.output);
      assert.match(result.output, /dist\/runtime.js/);
      assert.match(result.output, /README.md/);
    }, { extraDocs: `
import { unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
unlinkSync('dist/runtime.js');
writeFileSync('README.md', 'staged change');
execFileSync('git', ['add', 'README.md']);` });
  });

  void it('does not classify dependency files or unrelated docs assets as generated output', () => {
    fixture((root, candidate) => {
      const result = invoke(root, candidate);
      assert.equal(result.status, 0, result.output);
    }, { extraDocs: `mkdirSync('docs/assets', { recursive: true }); writeFileSync('docs/assets/fixture.svg', '<svg/>');` });
  });

  void it('rejects generator failures and preserves failure logs without changing the caller', () => {
    fixture((root, candidate) => {
      const result = invoke(root, candidate);
      assert.notEqual(result.status, 0, result.output);
      assert.match(result.output, /fixture build failed/);
      assert.ok(result.log);
      assert.equal(git(root, 'status', '--porcelain'), '');
    }, { extraBuild: "throw new Error('fixture build failed');" });
  });

  void it('refuses recursive gate invocation from a build instead of looping', () => {
    fixture((root, candidate) => {
      const result = invoke(root, candidate);
      assert.notEqual(result.status, 0, result.output);
      assert.match(result.output, /recursive verify-generated invocation refused/);
      assert.ok(result.log);
    }, { extraBuild: `
import { execFileSync } from 'node:child_process';
execFileSync(process.execPath, [${JSON.stringify(gate)}, '--candidate', '${'0'.repeat(40)}',
  '--node-version', process.versions.node, '--npm-version', ${JSON.stringify(npmVersion)}], { stdio: 'inherit' });` });
  });

  void it('fails closed when generators modify tracked inputs outside generated roots', () => {
    fixture((root, candidate) => {
      const result = invoke(root, candidate);
      assert.notEqual(result.status, 0, result.output);
      assert.match(result.output, /source.txt/);
    }, { extraDocs: "writeFileSync('source.txt', 'unexpected input change');" });
  });

  void it('requires an immutable candidate and exact toolchain, rejecting options before executing builds', () => {
    fixture((root, candidate) => {
      for (const [ref, args, message] of [
        ['HEAD', [], /full commit SHA/],
        ['0'.repeat(40), [], /candidate commit/],
        [candidate, ['--node-version', '0.0.0'], /node version mismatch/],
        [candidate, ['--npm-version', '0.0.0'], /npm version mismatch/],
        [candidate, ['--unexpected'], /unknown argument/],
      ] as const) {
        const result = invoke(root, ref, [...args]);
        assert.notEqual(result.status, 0, result.output);
        assert.match(result.output, message);
      }
    });
  });
});
