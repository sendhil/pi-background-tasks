import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function readManifest(root: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as Record<string, unknown>;
}

export function resolveHostCli(hostRoot: string): string {
  const bin = readManifest(hostRoot)['bin'];
  const pi: unknown = typeof bin === 'object' && bin !== null ? Reflect.get(bin, 'pi') : undefined;
  assert.equal(typeof pi, 'string', 'host package must declare bin.pi');
  const cli = resolve(hostRoot, String(pi));
  assert.ok(existsSync(cli), `bin.pi does not exist: ${cli}`);
  return cli;
}

export function publicExtensionRoots(packageRoot: string): string[] {
  const pi = readManifest(packageRoot)['pi'];
  const roots: unknown = typeof pi === 'object' && pi !== null ? Reflect.get(pi, 'extensions') : undefined;
  assert.ok(Array.isArray(roots) && roots.length > 0, 'package needs public compiled roots');
  return roots.map((entry: unknown) => {
    assert.ok(typeof entry === 'string' && /^\.\/dist\/extensions\/[\w-]+\.js$/.test(entry), 'expected a compiled public extension root');
    const path = resolve(packageRoot, entry);
    assert.ok(existsSync(path), `missing public compiled extension: ${path}`);
    return path;
  });
}

export function assertNoPrivateHostSdk(packageRoot: string): void {
  const dependencies = join(packageRoot, 'node_modules');
  const stack = existsSync(dependencies) ? [dependencies] : [];
  const visited = new Set<string>();
  while (stack.length > 0) {
    const directory = stack.pop();
    assert.ok(directory);
    const canonical = realpathSync(directory);
    if (visited.has(canonical)) continue;
    visited.add(canonical);
    if (basename(directory) === 'node_modules') {
      for (const peer of ['@earendil-works/pi-coding-agent', '@earendil-works/pi-agent-core', '@earendil-works/pi-ai', '@earendil-works/pi-tui', 'typebox']) {
        assert.equal(existsSync(join(directory, peer)), false, `private host SDK: ${join(directory, peer)}`);
      }
    }
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory() || (entry.isSymbolicLink() && statSync(path).isDirectory())) stack.push(path);
    }
  }
}

function run(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv): string {
  const result = spawnSync(command, args, { cwd, env, encoding: 'utf8', timeout: 120_000, maxBuffer: 8 * 1024 * 1024 });
  assert.equal(result.error, undefined, `${command}: ${String(result.error)}`);
  assert.equal(result.status, 0, `${command} ${args.join(' ')}\n${result.stdout}\n${result.stderr}`);
  return `${result.stdout}\n${result.stderr}`;
}

/** Git installation, not a local-path load: never rebuild or modify candidate bytes. */
export async function qualifyInstalledHost(repo: string, hostRoot: string, candidate: string): Promise<void> {
  assert.match(candidate, /^[0-9a-f]{40}$/, '--candidate must be an approved full commit SHA');
  assert.equal(readManifest(hostRoot)['version'], '1.1.0', 'this contract qualifies exact Pi 1.1.0 only');
  const cli = resolveHostCli(hostRoot);
  const temp = await mkdtemp(join(realpathSync(tmpdir()), 'pi-bg-git-host-'));
  try {
    const cwd = join(temp, 'workspace');
    const agentDir = join(temp, 'agent');
    const bare = join(temp, 'candidate.git');
    await mkdir(cwd);
    await mkdir(agentDir);
    // Allowlist environment: no personal credentials, Pi settings, feature flags or Git configuration.
    const env: NodeJS.ProcessEnv = {
      PATH: process.env['PATH'], HOME: join(temp, 'home'), TMPDIR: realpathSync(tmpdir()),
      PI_CODING_AGENT_DIR: agentDir, PI_OFFLINE: '1', PI_SKIP_VERSION_CHECK: '1', PI_TELEMETRY: '0', CI: '1',
      GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_TERMINAL_PROMPT: '0',
      npm_config_cache: join(temp, 'npm-cache'), npm_config_ignore_scripts: 'true',
      npm_config_audit: 'false', npm_config_fund: 'false',
    };
    await mkdir(env['HOME']!);
    assert.equal(run('git', ['rev-parse', `${candidate}^{commit}`], repo, env).trim(), candidate);
    run('git', ['clone', '--bare', '--no-hardlinks', repo, bare], cwd, env);
    const canonical = 'https://github.com/sendhil/pi-background-tasks';
    env['GIT_CONFIG_COUNT'] = '1';
    env['GIT_CONFIG_KEY_0'] = `url.${pathToFileURL(bare).href}.insteadOf`;
    env['GIT_CONFIG_VALUE_0'] = canonical;
    // Pin npm explicitly; Pi otherwise may select a different installed package manager.
    await writeFile(join(agentDir, 'settings.json'), JSON.stringify({ packageManager: 'npm' }));
    const source = `git:github.com/sendhil/pi-background-tasks@${candidate}`;
    run(process.execPath, [cli, 'install', source], cwd, env);
    const installed = join(agentDir, 'git/github.com/sendhil/pi-background-tasks');
    assert.equal(run('git', ['rev-parse', 'HEAD'], installed, env).trim(), candidate);
    assert.equal(run('git', ['diff', '--name-only', candidate, '--', 'dist'], installed, env).trim(), '');
    const roots = publicExtensionRoots(installed);
    env['PI_BG_HOST_ROOTS'] = JSON.stringify(roots);
    assertNoPrivateHostSdk(installed);
    assertNoPrivateHostSdk(agentDir);
    for (const file of ['hook-contract-provider.ts', 'hook-probe-extension.ts', 'hook-probe-a.ts', 'hook-probe-b.ts']) {
      await copyFile(join(repo, 'tests/scripted-provider', file), join(temp, file));
    }
    await copyFile(join(repo, 'tests/fixtures/host-qualification-extension.ts'), join(temp, 'host-qualification-extension.ts'));
    const declarations = readFileSync(join(hostRoot, 'dist/core/extensions/types.d.ts'), 'utf8');
    for (const hook of ['before_provider_request', 'agent_settled']) assert.ok(declarations.includes(`"${hook}"`), `missing ${hook} declaration`);
    for (const profile of ['default', 'process']) {
      if (profile === 'process') env['PI_BG_FEATURES'] = 'process';
      else delete env['PI_BG_FEATURES'];
      const log = join(temp, `${profile}.jsonl`);
      env['PI_BG_HOST_LOG'] = log;
      const args = [cli, '--offline', '--no-session', '--no-skills', '--no-prompt-templates', '--no-context-files', '-e', join(temp, 'host-qualification-extension.ts'), '--provider', 'pi-bg-host-qualification', '--model', 'local-model', '-p', 'qualify installed compiled package'];
      const output = run(process.execPath, args, cwd, env);
      assert.doesNotMatch(output, /Extension error|Failed to load extension/i);
      const records = readFileSync(log, 'utf8').trim().split('\n').map(line => JSON.parse(line) as Record<string, unknown>);
      assert.equal(records.filter(record => record['hook'] === 'schemas').length, 1, `compiled package schemas must load\n${output}`);
      assert.equal(records.filter(record => record['hook'] === 'before_provider_request').length, 1);
      assert.equal(records.filter(record => record['hook'] === 'agent_settled').length, 1);
      assert.equal(records.filter(record => record['hook'] === 'provider_call').length, 1);
      assert.ok(records.some(record => record['hook'] === 'payload_replacement'), 'provider must receive hook replacement');
      console.log(`Pi 1.1.0 ${profile}: installed ${candidate}; ${roots.length} compiled roots; host TypeBox schemas + request/settlement hooks passed`);
    }
    // These current-host contracts are observed, not inferred from historical version ranges.
    for (const mode of ['context-replace', 'context-throw', 'tool-result-replace', 'context-abort']) {
      const log = join(temp, `${mode}.jsonl`);
      const result = spawnSync(process.execPath, [cli, '--offline', '--no-extensions', '--no-builtin-tools', '--no-session', '--no-skills', '--no-prompt-templates', '--no-context-files', ...['hook-contract-provider.ts', 'hook-probe-a.ts', 'hook-probe-b.ts'].flatMap(file => ['-e', join(temp, file)]), '--provider', 'pi-bg-hook-contract', '--model', 'hook-contract-model', '-p', 'probe locally'], {
        cwd, env: { ...env, PI_BG_HOOK_PROBE_LOG: log, PI_BG_HOOK_PROBE_MODE: mode, PI_BG_HOOK_PROBE_TOOL: mode === 'context-abort' || mode === 'context-throw' ? '0' : '1', PI_BG_HOOK_CONTRACT_API_KEY: 'local-only' }, encoding: 'utf8', timeout: 30_000,
      });
      assert.equal(result.error, undefined);
      const records = readFileSync(log, 'utf8').trim().split('\n').map(line => JSON.parse(line) as Record<string, unknown>);
      const calls = records.filter(record => record['hook'] === 'provider_call');
      assert.equal(result.status, mode === 'context-abort' ? 1 : 0, `${result.stdout}\n${result.stderr}`);
      if (mode === 'context-abort') {
        assert.equal(records.filter(record => record['hook'] === 'context_aborting').length, 1);
        assert.equal(calls.length, 0, 'Pi 1.1.0 must skip provider after context abort');
        assert.match(`${result.stdout}\n${result.stderr}`, /aborted/i);
      } else {
        assert.equal(calls.length, mode === 'context-throw' ? 1 : 2);
        const ordered = records.filter(record => record['hook'] === 'context' || record['hook'] === 'provider_call');
        assert.deepEqual(ordered.map(record => record['hook'] === 'context' ? record['probeId'] : 'provider_call'), calls.flatMap(() => ['probe-a', 'probe-b', 'provider_call']));
        if (mode === 'context-replace') {
          for (const call of calls) assert.ok(Array.isArray(call['texts']) && call['texts'].includes('HOOK_PROBE_INJECTED_CONTEXT_MESSAGE'));
        } else if (mode === 'context-throw') {
          assert.equal(records.filter(record => record['hook'] === 'context_throwing').length, 1);
        } else {
          const results = records.filter(record => record['hook'] === 'tool_result');
          assert.deepEqual(results.map(record => record['probeId']), ['probe-a', 'probe-b']);
          for (const record of results) {
            assert.equal(record['toolName'], 'probe_echo');
            assert.equal(record['toolCallId'], 'probe-call-1');
            assert.equal(record['isError'], false);
          }
          assert.deepEqual(results[1]?.['texts'], ['HOOK_PROBE_REPLACED_TOOL_RESULT']);
          assert.ok(Array.isArray(calls[1]?.['texts']) && calls[1]['texts'].includes('HOOK_PROBE_REPLACED_TOOL_RESULT'));
          assert.ok(records.indexOf(results[1]!) < records.findIndex(record => record['hook'] === 'message_end' && record['role'] === 'toolResult'));
        }
      }
      console.log(`Pi 1.1.0 ${mode}: passed (local scripted provider only)`);
    }
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}
