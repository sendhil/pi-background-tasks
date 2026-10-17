import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync, spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

const HOST_PACKAGES = ['@earendil-works/pi-ai', '@earendil-works/pi-agent-core', '@earendil-works/pi-coding-agent', '@earendil-works/pi-tui', 'typebox'];
const PUBLIC_EXTENSIONS = ['./dist/extensions/anthropic-attribution.js', './dist/extensions/background-tasks.js'];

function check(condition, message) {
  if (!condition) throw new Error(message);
}

function files(root, directory) {
  if (!existsSync(join(root, directory))) return [];
  return readdirSync(join(root, directory), { withFileTypes: true }).flatMap(entry => {
    const path = `${directory}/${entry.name}`;
    return entry.isDirectory() ? files(root, path) : /\.(?:[cm]?js|ts)$/.test(path) ? [path] : [];
  });
}

// These are regression tripwires, not proof of runtime behavior or absence of network traffic.
export function verifyMetadata(root) {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  check(pkg.private === true, 'package.json private must be true (public Git fork, no npm publication)');
  check(!('publishConfig' in pkg), 'Remove publishConfig from this non-publishing fork');
  check(pkg.name === 'pi-background-tasks', 'Keep the stable fork package identity');
  check(pkg.repository?.type === 'git' && pkg.repository?.url === 'git+https://github.com/sendhil/pi-background-tasks.git'
    && pkg.bugs?.url === 'https://github.com/sendhil/pi-background-tasks/issues'
    && pkg.homepage === 'https://github.com/sendhil/pi-background-tasks#readme', 'Unexpected fork source metadata');
  check(pkg.license === 'ISC' && pkg.author === 'Ismail <ismailsalikhodjaev@gmail.com>', 'Retain fork license and upstream attribution');
  for (const path of ['LICENSE', 'THIRD_PARTY_NOTICES.md']) check(existsSync(join(root, path)), `Retain ${path}`);
  for (const name of HOST_PACKAGES) {
    if (name !== '@earendil-works/pi-agent-core' || name in (pkg.peerDependencies ?? {})) {
      check(pkg.peerDependencies?.[name] === '*', `Host peer ${name} must use *`);
    }
    check(!(name in (pkg.dependencies ?? {})) && !(name in (pkg.optionalDependencies ?? {})), `Do not install host dependency ${name}`);
    for (const key of ['bundledDependencies', 'bundleDependencies']) {
      check(pkg[key] !== true && !pkg[key]?.includes?.(name), `Do not bundle host package ${name}`);
    }
  }
  check(JSON.stringify(pkg.pi?.extensions) === JSON.stringify(PUBLIC_EXTENSIONS), 'Keep public compiled extension roots');
  for (const path of PUBLIC_EXTENSIONS) check(existsSync(join(root, path)), `Missing compiled artifact ${path}`);
  check(pkg.pi?.skills === undefined, 'Maintenance skills must stay project-local, not package resources');
  const allowedPiFiles = ['.pi/skills/bg-upstream-review/SKILL.md', '.pi/skills/bg-upstream-sync/SKILL.md'];
  const trackedPiFiles = execFileSync('git', ['--no-optional-locks', '-C', root, 'ls-files', '-z', '--', '.pi'], { encoding: 'utf8' }).split('\0').filter(Boolean);
  check(trackedPiFiles.every(path => allowedPiFiles.includes(path)), 'Tracked Pi settings/runtime artifacts are forbidden; only the two maintenance skills may be tracked');
  for (const path of [...files(root, 'src'), ...files(root, 'extensions'), ...files(root, 'dist')]) {
    const source = readFileSync(join(root, path), 'utf8');
    check(!/update-check|bg-update|latestKnownVersion|checkForUpdate|PI_BG_REGISTRY_URL|registry\.npmjs\.org/.test(`${path}\n${source}`), `Forbidden updater marker in ${path}`);
    if (/extension\.[cm]?[jt]s$|\/ui\//.test(path)) {
      check(!/(?:\\x1b|\\u001b|\u001b)\[(?:38|48);2;/i.test(source), `Fixed RGB UI chrome in ${path}`);
    }
  }
}

export function verifyRuntime(root) {
  const env = { ...process.env, TMPDIR: realpathSync(tmpdir()), PI_SKIP_VERSION_CHECK: '1', PI_TELEMETRY: '0' };
  // No ambient process-only profile or legacy updater opt-out may mask regressions.
  for (const key of ['PI_BG_FEATURES', 'PI_OFFLINE', 'PI_BG_DISABLE_UPDATE_CHECK', 'PI_BG_REGISTRY_URL', 'PI_PACKAGE_DIR', 'NODE_TEST_CONTEXT']) delete env[key];
  const tests = [
    'tests/unit/footer-status.test.ts',
    'tests/component/background-tasks-manager.test.ts',
    'tests/sdk/sdk.test.ts',
    'tests/sdk/feature-selection-sdk.test.ts',
  ];
  for (const path of tests) check(existsSync(join(root, path)), `Missing runtime contract test ${path}`);
  function run(testPaths, testEnv, pattern) {
    const result = spawnSync(process.execPath, ['--import', 'tsx', '--test', '--test-reporter=tap', '--test-concurrency=1',
      ...(pattern ? [`--test-name-pattern=${pattern}`] : []), ...testPaths], {
      cwd: root, env: testEnv, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
    });
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    if (result.error) throw result.error;
    return result;
  }
  const result = run(tests, env);
  check(result.status === 0 && /^# pass [1-9]\d*$/m.test(result.stdout), 'Fork runtime contract tests failed or ran no assertions; block integration');
  const pattern = [
    'hides successful footer notices without acknowledging them before explicit /bg-clear',
    'shows only running and unseen failed counts even while the dock is open',
    'never requests package updates or shows an idle footer without offline or disable flags',
  ].join('|');
  for (const profile of ['default', 'process']) {
    console.log(`Fork profile-neutral SDK contract: ${profile}`);
    const selected = run(['tests/sdk/sdk.test.ts'], profile === 'process' ? { ...env, PI_BG_FEATURES: 'process' } : env, pattern);
    check(selected.status === 0 && ['tests 3', 'pass 3', 'fail 0', 'skipped 0', 'cancelled 0', 'todo 0'].every(summary =>
      selected.stdout.split('\n').includes(`# ${summary}`)), `Fork ${profile} profile must run exactly 3 passing SDK contract tests with no failures/skips; block integration`);
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { values } = parseArgs({ options: {
      repo: { type: 'string', default: process.cwd() }, 'metadata-only': { type: 'boolean', default: false },
    } });
    const root = resolve(values.repo);
    verifyMetadata(root);
    if (values['metadata-only']) {
      console.log('Fork metadata/tripwires passed ONLY; runtime and freshness are NOT verified');
    } else {
      verifyRuntime(root);
      console.log('Fork metadata and source runtime contracts passed; committed freshness/current-host qualification remain separate gates');
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
