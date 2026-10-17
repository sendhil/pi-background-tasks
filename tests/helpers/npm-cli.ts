import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

// npm ships as npm.cmd on Windows, and spawnSync with shell:false does not
// consult PATHEXT, so spawning the bare name yields status null with no child.
// Resolving npm's own JavaScript entry and running it through the current Node
// executable avoids the shim without introducing shell:true, mirroring how
// production resolves the Pi bin.
export function resolveNpmCli(execPath = process.execPath, env = process.env): string {
  const nodeDir = dirname(execPath);
  const candidates = [
    env['npm_execpath'],
    join(nodeDir, '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    join(nodeDir, 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  ];
  for (const candidate of candidates) {
    if (candidate && candidate.endsWith('npm-cli.js') && existsSync(candidate)) return candidate;
  }
  throw new Error(`cannot resolve npm-cli.js near ${execPath}`);
}

