import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename, dirname, resolve, sep } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

const EXPECTED_REMOTES = {
  origin: 'https://github.com/sendhil/pi-background-tasks.git',
  upstream: 'https://github.com/ismailsaleekh/pi-background-tasks.git',
};

function requireCommit(repo, sha) {
  if (!/^[0-9a-f]{40}$/.test(sha ?? '') || git(repo, 'rev-parse', `${sha}^{commit}`) !== sha) {
    throw new Error('Approval requires a full commit SHA (40 lowercase hex characters)');
  }
  return sha;
}

function isAncestor(repo, base, tip) {
  try { git(repo, 'merge-base', '--is-ancestor', base, tip); return true; }
  catch (error) { if (error.status === 1) return false; throw error; }
}

function requireAncestor(repo, base, tip) {
  if (!isAncestor(repo, base, tip)) throw new Error(`${base} is not an ancestor of ${tip}; obtain a new review`);
}

function preflight(repo, expectedRemotes) {
  if (realpathSync(repo) !== realpathSync(git(repo, 'rev-parse', '--show-toplevel'))) {
    throw new Error('Run at the repository root');
  }
  if (git(repo, 'remote') !== 'origin\nupstream') throw new Error('Unexpected remotes');
  for (const [name, url] of Object.entries(expectedRemotes)) {
    if (git(repo, 'remote', 'get-url', '--all', name) !== url) throw new Error(`Unexpected ${name} remote URL`);
    const push = git(repo, 'remote', 'get-url', '--push', '--all', name);
    if (push !== (name === 'upstream' ? 'DISABLED' : url)) throw new Error(`Unexpected ${name} push URL`);
  }
  for (const marker of ['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'rebase-merge', 'rebase-apply', 'sequencer', 'BISECT_LOG']) {
    if (existsSync(resolve(repo, git(repo, 'rev-parse', '--git-path', marker)))) throw new Error('Git operation in progress');
  }
  if (git(repo, 'rev-parse', '--is-shallow-repository') !== 'false' || git(repo, 'for-each-ref', 'refs/replace')) {
    throw new Error('Full, unreplaced history required');
  }
  if (git(repo, 'status', '--porcelain=v1', '--untracked-files=all')) throw new Error('A clean worktree and index are required; never auto-stash');
}

function gitRaw(repo, ...args) {
  return execFileSync('git', ['--no-optional-locks', '-C', repo, ...args], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function git(repo, ...args) {
  return gitRaw(repo, ...args).trim();
}

function snapshot(repo, excludedRefs = ['refs/remotes/upstream/main']) {
  return {
    head: git(repo, 'rev-parse', 'HEAD'),
    headRef: git(repo, 'rev-parse', '--symbolic-full-name', 'HEAD'),
    index: createHash('sha256').update(readFileSync(resolve(repo, git(repo, 'rev-parse', '--git-path', 'index')))).digest('hex'),
    worktree: git(repo, 'status', '--porcelain=v1', '--untracked-files=all'),
    refs: git(repo, 'for-each-ref', '--format=%(refname) %(objectname)').split('\n').filter(line => !excludedRefs.includes(line.split(' ')[0])),
  };
}

function unchanged(before, after) {
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('Protected repository state changed; stop and inspect, do not auto-restore');
}

export function review({ repo, previousUpstream, fetch = false }, expectedRemotes = EXPECTED_REMOTES) {
  preflight(repo, expectedRemotes);
  requireCommit(repo, previousUpstream);
  const downstream = git(repo, 'rev-parse', 'refs/heads/main');
  const upstreamBefore = git(repo, 'rev-parse', 'refs/remotes/upstream/main');
  requireAncestor(repo, previousUpstream, downstream);
  requireAncestor(repo, previousUpstream, upstreamBefore);
  const before = snapshot(repo);
  if (fetch) {
    // Empty refmap suppresses configured destinations; ancestry is checked after fetching too.
    try {
      git(repo, '-c', 'core.hooksPath=/dev/null', '-c', 'gc.auto=0', 'fetch',
        '--no-tags', '--no-prune', '--no-prune-tags', '--no-recurse-submodules',
        '--no-write-commit-graph', '--no-auto-maintenance', '--refmap=',
        'upstream', 'refs/heads/main:refs/remotes/upstream/main');
    } finally {
      unchanged(before, snapshot(repo));
    }
  }
  const upstream = git(repo, 'rev-parse', 'refs/remotes/upstream/main');
  requireAncestor(repo, upstreamBefore, upstream);
  const after = snapshot(repo);
  unchanged(before, after);
  const [ahead, behind] = git(repo, 'rev-list', '--left-right', '--count', `${downstream}...${upstream}`).split(/\s+/).map(Number);
  return { downstream, upstream, previousUpstream, upstreamBefore, ahead, behind, before, after };
}

export function prepareSync({ repo, previousUpstream, downstream, upstream, branch, worktree, picks = [] }, expectedRemotes = EXPECTED_REMOTES) {
  const approved = review({ repo, previousUpstream }, expectedRemotes);
  requireCommit(repo, downstream);
  requireCommit(repo, upstream);
  if (approved.downstream !== downstream || approved.upstream !== upstream) {
    throw new Error('Approved main targets moved; obtain a new review');
  }
  if (new Set(picks).size !== picks.length) throw new Error('duplicate selected commits');
  for (const pick of picks) {
    requireCommit(repo, pick);
    if (isAncestor(repo, pick, downstream)) throw new Error(`Selected commit already applied: ${pick}`);
    if (isAncestor(repo, pick, upstream)) throw new Error(`Selected commit already upstream: ${pick}; use the main merge`);
    if (git(repo, 'rev-list', '--parents', '-n', '1', pick).split(' ').length !== 2) {
      throw new Error('Selected root/merge commit requires manual patch review');
    }
    // Restrict git cherry to this single non-merge commit; an empty patch is uncertain too.
    if (git(repo, 'cherry', downstream, pick, `${pick}^`) !== `+ ${pick}`) {
      throw new Error(`Selected patch already applied or empty; manual review required: ${pick}`);
    }
    if (!git(repo, 'diff-tree', '--no-commit-id', '--name-only', '-r', pick)) {
      throw new Error('Empty selected patch requires manual review');
    }
  }
  if (!/^sync\/upstream-\d{4}-\d{2}-\d{2}$/.test(branch ?? '')) throw new Error('Expected branch name sync/upstream-YYYY-MM-DD');
  if (git(repo, 'for-each-ref', '--format=%(refname)', `refs/heads/${branch}`)) throw new Error('Branch occupied; never reset/reuse');
  if (!worktree || /[\r\n]/.test(worktree)) throw new Error('An outside worktree path is required');
  worktree = resolve(worktree);
  if (lstatSync(worktree, { throwIfNoEntry: false })) throw new Error('Worktree path occupied; never reset/reuse');
  worktree = resolve(realpathSync(dirname(worktree)), basename(worktree));
  // Paths may contain newlines, including after resolving a symlinked parent.
  for (const field of gitRaw(repo, 'worktree', 'list', '--porcelain', '-z').split('\0')) {
    if (!field.startsWith('worktree ')) continue;
    const occupied = field.slice('worktree '.length);
    if (worktree === occupied || worktree.startsWith(`${occupied}${sep}`)) throw new Error('Worktree must be outside existing worktrees (including occupied registrations)');
  }
  const before = snapshot(repo, [`refs/heads/${branch}`]);
  git(repo, '-c', 'core.hooksPath=/dev/null', 'worktree', 'add', '-b', branch, worktree, downstream);
  const after = snapshot(repo, [`refs/heads/${branch}`]);
  unchanged(before, after);
  return { downstream, upstream, previousUpstream, picks, branch, worktree, before, after };
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { positionals, values, tokens } = parseArgs({ options: {
      repo: { type: 'string', default: process.cwd() },
      'previous-upstream': { type: 'string' },
      fetch: { type: 'boolean', default: false },
      downstream: { type: 'string' }, upstream: { type: 'string' },
      branch: { type: 'string' }, worktree: { type: 'string' },
      pick: { type: 'string', multiple: true },
    }, allowPositionals: true, tokens: true });
    const seen = new Set();
    for (const token of tokens) {
      if (token.kind !== 'option' || token.name === 'pick') continue;
      if (seen.has(token.name)) throw new Error(`Repeated option --${token.name}; approvals must be unambiguous`);
      seen.add(token.name);
    }
    const [command] = positionals;
    if (positionals.length !== 1 || !['review', 'prepare-sync'].includes(command)) {
      throw new Error('Usage: upstream-report.mjs review|prepare-sync --previous-upstream <SHA> [options]');
    }
    const options = { repo: resolve(values.repo), previousUpstream: values['previous-upstream'],
      fetch: values.fetch, downstream: values.downstream, upstream: values.upstream,
      branch: values.branch, worktree: values.worktree, picks: values.pick };
    if (command === 'review' && ['downstream', 'upstream', 'branch', 'worktree', 'pick'].some(key => values[key] !== undefined)) {
      throw new Error('Sync options are not allowed for review');
    }
    if (command === 'prepare-sync' && values.fetch) throw new Error('Fetch belongs to explicit review, never sync');
    console.log(JSON.stringify(command === 'review' ? review(options) : prepareSync(options), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
