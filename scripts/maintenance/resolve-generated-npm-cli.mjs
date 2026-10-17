import { realpathSync, statSync } from 'node:fs';
import { basename, delimiter, dirname, isAbsolute, join, resolve } from 'node:path';

function javascriptCli(candidate) {
  try {
    const file = realpathSync(candidate);
    if (basename(file) === 'npm-cli.js' && statSync(file).isFile()) return file;
  } catch {
    // Missing candidates are expected while checking known install layouts.
  }
  return undefined;
}

function fromLauncher(launcher) {
  if (typeof launcher !== 'string' || !isAbsolute(launcher)) return undefined;
  try {
    const file = realpathSync(launcher);
    if (!statSync(file).isFile()) return undefined;
    const direct = javascriptCli(file);
    if (direct) return direct;
    // npm.cmd is never executed or parsed. Windows npm installs its JS here.
    if (/^npm(?:\.cmd)?$/iu.test(basename(file))) {
      return javascriptCli(join(dirname(file), 'node_modules/npm/bin/npm-cli.js'));
    }
  } catch {
    // An unavailable launcher cannot identify a usable npm installation.
  }
  return undefined;
}

export function resolveGeneratedNpmCli(execPath = process.execPath, env = process.env) {
  const configured = env.npm_execpath;
  if (configured !== undefined) {
    const cli = fromLauncher(configured);
    if (cli) return cli;
    throw new Error(`cannot resolve npm-cli.js from npm_execpath ${JSON.stringify(configured)}`);
  }
  // Match the existing docs/package resolver's adjacent Windows and Unix layouts.
  const nodeDir = dirname(execPath);
  for (const candidate of [
    resolve(nodeDir, 'node_modules/npm/bin/npm-cli.js'),
    resolve(nodeDir, '../lib/node_modules/npm/bin/npm-cli.js'),
  ]) {
    const cli = javascriptCli(candidate);
    if (cli) return cli;
  }
  // Direct invocation also supports split installations (e.g. Homebrew). Inspect
  // PATH launchers as files, never invoke `npm`, a shell shim, or a command string.
  const path = Object.entries(env).find(([key]) => key.toLowerCase() === 'path')?.[1] ?? '';
  for (const directory of path.split(delimiter).filter((entry) => isAbsolute(entry))) {
    for (const name of ['npm', 'npm.cmd']) {
      const cli = fromLauncher(join(directory, name));
      if (cli) return cli;
    }
  }
  throw new Error(`cannot resolve npm-cli.js near ${execPath} or from PATH; set npm_execpath to its absolute JavaScript path`);
}
