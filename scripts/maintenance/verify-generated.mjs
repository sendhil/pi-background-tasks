#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';

const usage = `Usage: node scripts/maintenance/verify-generated.mjs
  --candidate <full commit SHA> --node-version <exact version> --npm-version <exact version>
  [--repo <local repository>]

Validates committed runtime/docs bytes in a disposable checkout, not the caller's
working tree. Runs npm ci --ignore-scripts, build:runtime, then docs:generate.
Logs survive checkout cleanup; no candidate repairs are committed. Run only on
trusted candidate code: isolation protects caller state, not against hostile code.
`;

function argumentsFrom(argv) {
  if (argv.length === 1 && argv[0] === '--help') return null;
  const options = {};
  for (let i = 0; i < argv.length; i += 2) {
    const name = argv[i];
    if (!['--candidate', '--repo', '--node-version', '--npm-version'].includes(name)) {
      throw new Error(`unknown argument ${name}`);
    }
    if (!argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error(`missing value for ${name}`);
    options[name.slice(2)] = argv[i + 1];
  }
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(options.candidate ?? '')) {
    throw new Error('--candidate must be an explicit full commit SHA (not HEAD, a branch, or a tag)');
  }
  for (const key of ['node-version', 'npm-version']) {
    if (!/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/u.test(options[key] ?? '')) throw new Error(`--${key} must pin an exact version`);
  }
  return options;
}

let logPath;
function log(text) {
  process.stdout.write(`${text}\n`);
  if (logPath) appendFileSync(logPath, `${text}\n`);
}

// Do not inherit a caller's alternate index/worktree or inject it into the clone.
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
env.PATH = `${dirname(process.execPath)}${delimiter}${env.PATH ?? ''}`;
delete env.PI_BG_FEATURES;
env.PI_BG_VERIFY_GENERATED_ACTIVE = '1';

function command(executable, args, cwd) {
  log(`verify-generated: run ${executable} ${args.join(' ')}`);
  const result = spawnSync(executable, args, { cwd, env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (result.stdout) log(result.stdout.replaceAll('\0', '\n').trimEnd());
  if (result.stderr) log(result.stderr.trimEnd());
  if (result.error || result.status !== 0) {
    throw new Error(`${executable} ${args.join(' ')} failed (${result.error?.message ?? result.signal ?? result.status})`);
  }
  return result.stdout;
}

function git(cwd, ...args) {
  return command('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'core.autocrlf=false', '-C', cwd, ...args], cwd);
}

// build-runtime.mjs owns all dist/. docs/lib.mjs rewrites every docs/**/*.md
// (including authored frontmatter), docs/manifest.json and README.md. Assets,
// attestations.json and unrelated docs JSON are inputs, not generated roots.
function isGeneratedPath(path) {
  const parts = path.split('/');
  if (parts.some((part) => ['node_modules', '.git', '.pi'].includes(part))) return false;
  return path === 'dist' || path.startsWith('dist/') || path === 'README.md'
    || path === 'docs/manifest.json' || (path.startsWith('docs/') && path.endsWith('.md'));
}

function checkCandidate(checkout, candidate) {
  if (git(checkout, 'rev-parse', 'HEAD').trim() !== candidate) throw new Error('generator changed candidate HEAD');
  // Compare to the commit, not just the index: staged repairs must also fail.
  const changed = git(checkout, 'diff', '--name-only', '-z', '--no-ext-diff', '--no-textconv', candidate, '--')
    .split('\0').filter(Boolean);
  // No --exclude-standard: ignored generated output is still a freshness failure.
  const unexpected = git(checkout, 'ls-files', '--others', '-z', '--', 'dist', 'docs', 'README.md')
    .split('\0').filter((path) => path && isGeneratedPath(path));
  if (changed.length || unexpected.length) {
    const messages = [];
    if (changed.length) messages.push(`stale generated artifacts (tracked candidate changes): ${changed.map((path) => JSON.stringify(path)).join(', ')}`);
    if (unexpected.length) messages.push(`unexpected generated files: ${unexpected.map((path) => JSON.stringify(path)).join(', ')}`);
    throw new Error(messages.join('\n'));
  }
}

function verify(options) {
  if (process.env.PI_BG_VERIFY_GENERATED_ACTIVE) throw new Error('recursive verify-generated invocation refused');
  if (process.versions.node !== options['node-version']) {
    throw new Error(`node version mismatch: expected ${options['node-version']}, actual ${process.versions.node}`);
  }
  const npmVersion = command('npm', ['--version'], process.cwd()).trim();
  if (npmVersion !== options['npm-version']) throw new Error(`npm version mismatch: expected ${options['npm-version']}, actual ${npmVersion}`);
  const repo = git(resolve(options.repo ?? process.cwd()), 'rev-parse', '--show-toplevel').trim();
  let candidate;
  try {
    candidate = git(repo, 'rev-parse', '--verify', `${options.candidate}^{commit}`).trim();
  } catch {
    throw new Error(`candidate commit does not exist: ${options.candidate}`);
  }
  if (candidate !== options.candidate) throw new Error('candidate must identify a commit directly');

  // Own a unique directory; never reuse paths or remove caller worktrees/metadata.
  const owned = realpathSync(mkdtempSync(join(tmpdir(), 'pi-bg-generated-')));
  const checkout = join(owned, 'checkout');
  logPath = join(owned, 'verify-generated.log');
  log(`verify-generated: log ${logPath}`);
  log(`verify-generated: candidate ${candidate}`);
  log(`verify-generated: toolchain node=${process.versions.node} npm=${npmVersion} executable=${process.execPath} platform=${process.platform}/${process.arch}`);
  try {
    mkdirSync(checkout);
    git(checkout, 'init', '--quiet');
    git(checkout, 'fetch', '--no-tags', '--no-recurse-submodules', '--', repo, candidate);
    git(checkout, 'checkout', '--detach', '--force', candidate);
    if (git(checkout, 'status', '--porcelain', '--untracked-files=all', '--ignored=matching')) {
      throw new Error('disposable checkout did not start clean');
    }
    command('npm', ['ci', '--ignore-scripts', '--include=dev', '--no-audit', '--no-fund'], checkout);
    checkCandidate(checkout, candidate);
    command('npm', ['run', 'build:runtime'], checkout);
    command('npm', ['run', 'docs:generate'], checkout);
    checkCandidate(checkout, candidate);
    log('verify-generated: generated artifacts match committed candidate');
  } finally {
    rmSync(checkout, { recursive: true, force: true });
    log('verify-generated: disposed owned checkout; log retained');
  }
}

try {
  const options = argumentsFrom(process.argv.slice(2));
  if (options) verify(options);
  else process.stdout.write(usage);
} catch (error) {
  log(`verify-generated: FAIL ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
