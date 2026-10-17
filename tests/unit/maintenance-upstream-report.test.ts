import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const script = resolve('scripts/maintenance/upstream-report.mjs');
const maintenance = await import(script);
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function git(repo: string, ...args: string[]): string {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}
function commit(repo: string, file: string, text: string): string {
  writeFileSync(join(repo, file), text);
  git(repo, 'add', file);
  git(repo, 'commit', '-qm', file);
  return git(repo, 'rev-parse', 'HEAD');
}
function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'bg-maintenance-')));
  roots.push(root);
  const repo = join(root, 'fork');
  mkdirSync(repo);
  git(repo, 'init', '-q', '-b', 'main');
  git(repo, 'config', 'user.name', 'Fixture');
  git(repo, 'config', 'user.email', 'fixture@example.invalid');
  const base = commit(repo, 'base.txt', 'base');
  git(repo, 'checkout', '-qb', 'upstream-fixture');
  const upstream = commit(repo, 'upstream.txt', 'upstream');
  const remote = join(root, 'upstream.git');
  git(root, 'clone', '-q', '--bare', repo, remote);
  git(remote, 'branch', '-f', 'main', upstream);
  git(repo, 'checkout', '-q', 'main');
  const downstream = commit(repo, 'fork.txt', 'downstream');
  git(repo, 'remote', 'add', 'origin', 'https://github.com/sendhil/pi-background-tasks.git');
  git(repo, 'remote', 'add', 'upstream', remote);
  git(repo, 'remote', 'set-url', '--push', 'upstream', 'DISABLED');
  git(repo, 'update-ref', 'refs/remotes/upstream/main', upstream);
  const expectedRemotes = { origin: 'https://github.com/sendhil/pi-background-tasks.git', upstream: remote };
  return { root, repo, remote, base, upstream, downstream, expectedRemotes };
}

test('review reports exact main revisions and divergence without changing caller state', () => {
  const f = fixture();
  const head = git(f.repo, 'rev-parse', 'HEAD');
  const report = maintenance.review({ repo: f.repo, previousUpstream: f.base }, f.expectedRemotes);
  assert.equal(report?.downstream, f.downstream);
  assert.equal(report.upstream, f.upstream);
  assert.equal(report.ahead, 1);
  assert.equal(report.behind, 1);
  assert.equal(git(f.repo, 'rev-parse', 'HEAD'), head);
  assert.equal(git(f.repo, 'status', '--porcelain'), '');
});

for (const scenario of ['wrong remote', 'extra remote', 'enabled upstream push', 'dirty', 'untracked', 'staged', 'merge', 'rebase', 'rewrite', 'short SHA'] as const) {
  test(`review refuses ${scenario}`, () => {
    const f = fixture();
    let previousUpstream = f.base;
    if (scenario === 'wrong remote') git(f.repo, 'remote', 'set-url', 'origin', 'https://example.invalid/wrong.git');
    if (scenario === 'extra remote') git(f.repo, 'remote', 'add', 'other', f.remote);
    if (scenario === 'enabled upstream push') git(f.repo, 'remote', 'set-url', '--push', 'upstream', f.remote);
    if (scenario === 'dirty') writeFileSync(join(f.repo, 'fork.txt'), 'dirty');
    if (scenario === 'untracked') writeFileSync(join(f.repo, 'untracked.txt'), 'untracked');
    if (scenario === 'staged') { writeFileSync(join(f.repo, 'fork.txt'), 'staged'); git(f.repo, 'add', 'fork.txt'); }
    if (scenario === 'merge') writeFileSync(join(f.repo, '.git/MERGE_HEAD'), `${f.upstream}\n`);
    if (scenario === 'rebase') mkdirSync(join(f.repo, '.git/rebase-merge'));
    if (scenario === 'rewrite') previousUpstream = f.downstream;
    if (scenario === 'short SHA') previousUpstream = f.base.slice(0, 8);
    assert.throws(() => maintenance.review({ repo: f.repo, previousUpstream }, f.expectedRemotes), /remote|push|clean|progress|ancestor|full commit SHA/);
  });
}

test('review fetch advances only the designated upstream ref, never tags or configured destinations', () => {
  const f = fixture();
  git(f.repo, 'update-ref', 'refs/remotes/upstream/main', f.base);
  git(f.repo, 'config', '--replace-all', 'remote.upstream.fetch', '+refs/heads/*:refs/heads/*');
  git(f.repo, 'config', 'fetch.prune', 'true');
  git(f.repo, 'config', 'fetch.pruneTags', 'true');
  git(f.remote, 'tag', 'upstream-only', f.upstream);
  git(f.repo, 'tag', 'local-only', f.downstream);
  const index = readFileSync(join(f.repo, '.git/index'));
  const branches = git(f.repo, 'for-each-ref', '--format=%(refname) %(objectname)', 'refs/heads');
  const report = maintenance.review({ repo: f.repo, previousUpstream: f.base, fetch: true }, f.expectedRemotes);
  assert.equal(report.upstream, f.upstream);
  assert.equal(git(f.repo, 'tag', '--list'), 'local-only');
  assert.equal(git(f.repo, 'for-each-ref', '--format=%(refname) %(objectname)', 'refs/heads'), branches);
  assert.deepEqual(readFileSync(join(f.repo, '.git/index')), index);
  assert.deepEqual(report.before, report.after);
  assert.equal(report.upstreamBefore, f.base);
});

function syncOptions(f: ReturnType<typeof fixture>) {
  return { repo: f.repo, previousUpstream: f.base, downstream: f.downstream, upstream: f.upstream,
    branch: 'sync/upstream-2026-10-17', worktree: join(f.root, 'candidate') };
}

test('prepare-sync starts from the approved downstream main, never the caller topic HEAD', () => {
  const f = fixture();
  git(f.repo, 'checkout', '-qb', 'unrelated-topic', f.base);
  const callerHead = commit(f.repo, 'topic.txt', 'topic');
  const options = syncOptions(f);
  const report = maintenance.prepareSync(options, f.expectedRemotes);
  assert.equal(report?.downstream, f.downstream);
  assert.equal(git(options.worktree, 'rev-parse', 'HEAD'), f.downstream);
  assert.equal(git(options.worktree, 'branch', '--show-current'), options.branch);
  assert.equal(git(f.repo, 'rev-parse', 'HEAD'), callerHead);
  assert.equal(git(f.repo, 'rev-parse', 'main'), f.downstream);
  assert.deepEqual(report.before, report.after);
  // Exercise the skill's explicit merge in the disposable candidate, not in the caller.
  git(options.worktree, '-c', 'core.hooksPath=/dev/null', 'merge', '--no-ff', '--no-edit', f.upstream);
  assert.equal(readFileSync(join(options.worktree, 'upstream.txt'), 'utf8'), 'upstream');
  assert.equal(git(f.repo, 'rev-parse', 'main'), f.downstream);
  assert.equal(git(f.repo, 'rev-parse', 'HEAD'), callerHead);
});

for (const scenario of ['moved downstream', 'moved upstream', 'branch instead of SHA', 'occupied path', 'occupied branch', 'inside caller', 'wrong branch name'] as const) {
  test(`prepare-sync refuses ${scenario} without creating a candidate`, () => {
    const f = fixture();
    const options = syncOptions(f);
    if (scenario === 'moved downstream') commit(f.repo, 'moved.txt', 'new main');
    if (scenario === 'moved upstream') git(f.repo, 'update-ref', 'refs/remotes/upstream/main', f.base);
    if (scenario === 'branch instead of SHA') options.downstream = 'main';
    if (scenario === 'occupied path') mkdirSync(options.worktree);
    if (scenario === 'occupied branch') git(f.repo, 'branch', options.branch, f.base);
    if (scenario === 'inside caller') options.worktree = join(f.repo, 'candidate');
    if (scenario === 'wrong branch name') options.branch = 'main-copy';
    const branches = git(f.repo, 'for-each-ref', '--format=%(refname) %(objectname)', 'refs/heads');
    assert.throws(() => maintenance.prepareSync(options, f.expectedRemotes), /moved|full commit SHA|occupied|outside|branch name/);
    assert.equal(git(f.repo, 'for-each-ref', '--format=%(refname) %(objectname)', 'refs/heads'), branches);
    assert.equal(existsSync(join(options.worktree, '.git')), false);
  });
}

function pickFixture() {
  const f = fixture();
  git(f.repo, 'checkout', '-qb', 'selected-pr', f.base);
  const pick = commit(f.repo, 'pr.txt', 'selected change');
  git(f.repo, 'checkout', '-q', 'main');
  return { ...f, pick };
}

test('prepare-sync records an explicit ordered unmerged commit selection without applying it', () => {
  const f = pickFixture();
  const options = { ...syncOptions(f), picks: [f.pick] };
  const report = maintenance.prepareSync(options, f.expectedRemotes);
  assert.deepEqual(report.picks, [f.pick]);
  assert.equal(existsSync(join(options.worktree, 'pr.txt')), false);
  git(options.worktree, '-c', 'core.hooksPath=/dev/null', 'cherry-pick', '-x', f.pick);
  assert.match(git(options.worktree, 'log', '-1', '--format=%B'), new RegExp(f.pick));
  assert.equal(git(f.repo, 'rev-parse', 'main'), f.downstream);
});

for (const scenario of ['already applied', 'patch equivalent', 'already upstream', 'duplicate', 'short', 'missing', 'empty'] as const) {
  test(`prepare-sync refuses ${scenario} selected commits`, () => {
    const f = pickFixture();
    if (scenario === 'patch equivalent') {
      git(f.repo, 'cherry-pick', f.pick);
      git(f.repo, 'commit', '--amend', '-qm', 'different commit, same patch');
      f.downstream = git(f.repo, 'rev-parse', 'HEAD');
    }
    if (scenario === 'empty') {
      git(f.repo, 'checkout', '-q', 'selected-pr');
      git(f.repo, 'commit', '--allow-empty', '-qm', 'empty');
      f.pick = git(f.repo, 'rev-parse', 'HEAD');
      git(f.repo, 'checkout', '-q', 'main');
    }
    const picks = scenario === 'duplicate' ? [f.pick, f.pick]
      : [scenario === 'already applied' ? f.downstream : scenario === 'already upstream' ? f.upstream
        : scenario === 'short' ? f.pick.slice(0, 8) : scenario === 'missing' ? 'a'.repeat(40) : f.pick];
    const options = { ...syncOptions(f), picks };
    assert.throws(() => maintenance.prepareSync(options, f.expectedRemotes), /applied|upstream|duplicate|full commit SHA|patch|commit/);
    assert.equal(existsSync(options.worktree), false);
  });
}


test('CLI emits a pinned review and rejects unknown mutation options', () => {
  const f = fixture();
  git(f.repo, 'remote', 'set-url', 'upstream', 'https://github.com/ismailsaleekh/pi-background-tasks.git');
  const result = spawnSync(process.execPath, [script, 'review', '--repo', f.repo, '--previous-upstream', f.base], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, new RegExp(f.downstream));
  const refused = spawnSync(process.execPath, [script, 'prepare-sync', '--push'], { encoding: 'utf8' });
  assert.notEqual(refused.status, 0);
  assert.match(refused.stderr, /Unknown option/);
});

test('project ignore rules permit only the two authored skill files under .pi', () => {
  for (const name of ['bg-upstream-review', 'bg-upstream-sync']) {
    const result = spawnSync('git', ['check-ignore', '--no-index', `.pi/skills/${name}/SKILL.md`]);
    assert.equal(result.status, 1, `${name} must be trackable`);
  }
  for (const path of ['.pi/tasks/task.log', '.pi/sessions/session.json', '.pi/settings.json', '.pi/skills/other/SKILL.md', '.pi/skills/bg-upstream-sync/debug.log', 'nested/.pi/tasks/task.log', 'nested/.pi/skills/bg-upstream-sync/SKILL.md']) {
    assert.equal(spawnSync('git', ['check-ignore', '--no-index', path]).status, 0, `${path} must stay ignored`);
  }
});

test('Pi discovers both project-local explicit-only maintenance skills without diagnostics', async () => {
  const { loadSkillsFromDir } = await import('@earendil-works/pi-coding-agent');
  const result = loadSkillsFromDir({ dir: resolve('.pi/skills'), source: 'project' });
  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(result.skills.map(skill => skill.name).sort(), ['bg-upstream-review', 'bg-upstream-sync']);
  assert.ok(result.skills.every(skill => skill.disableModelInvocation));
});

test('review refuses a rewritten upstream fetched tip and preserves caller branches/tags', () => {
  const f = fixture();
  git(f.remote, 'update-ref', 'refs/heads/main', f.base);
  const refs = git(f.repo, 'for-each-ref', '--format=%(refname) %(objectname)', 'refs/heads', 'refs/tags');
  assert.throws(() => maintenance.review({ repo: f.repo, previousUpstream: f.base, fetch: true }, f.expectedRemotes), /ancestor|fetch/);
  assert.equal(git(f.repo, 'for-each-ref', '--format=%(refname) %(objectname)', 'refs/heads', 'refs/tags'), refs);
  assert.equal(git(f.repo, 'status', '--porcelain'), '');
});

test('prepare-sync refuses an absent but still registered worktree path', () => {
  const f = fixture();
  const options = syncOptions(f);
  git(f.repo, 'worktree', 'add', '-b', 'held', options.worktree, f.base);
  rmSync(options.worktree, { recursive: true });
  assert.throws(() => maintenance.prepareSync(options, f.expectedRemotes), /occupied/);
  assert.equal(existsSync(options.worktree), false);
  assert.equal(git(f.repo, 'for-each-ref', '--format=%(refname)', `refs/heads/${options.branch}`), '');
});

test('CLI rejects repeated approval options rather than silently choosing the last value', () => {
  const f = fixture();
  git(f.repo, 'remote', 'set-url', 'upstream', 'https://github.com/ismailsaleekh/pi-background-tasks.git');
  const result = spawnSync(process.execPath, [script, 'review', '--repo', f.repo, '--previous-upstream', f.base, '--previous-upstream', f.base], { encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Repeated option/);
});


test('CLI executes guards when its script path is a symlink', () => {
  const f = fixture();
  const link = join(f.root, 'guard.mjs');
  symlinkSync(script, link);
  const result = spawnSync(process.execPath, [link, 'review', '--repo', f.repo, '--previous-upstream', f.base], { encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Unexpected upstream remote URL/);
});
