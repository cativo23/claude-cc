#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { realpathSync } from 'node:fs';
import { readStdin as defaultReadStdin } from './stdin.js';
import { parseGitStatus } from './parsers/git.js';
import { parseTranscript } from './parsers/transcript.js';
import { getTokenSpeed } from './parsers/token-speed.js';
import { getMemoryInfo } from './parsers/memory.js';
import { getGsdInfo } from './parsers/gsd.js';
import { getMcpInfo } from './parsers/mcp.js';
import { getTermCols, getLayoutCols } from './utils/terminal.js';
import { loadConfig, mergeCliFlags } from './config.js';
import { render } from './render/index.js';
import { resolveIcons } from './render/icons.js';
import { install, uninstall } from './installer.js';
import { normalize } from './normalize.js';
import type { Dependencies, RenderContext } from './types.js';
import { EMPTY_TRANSCRIPT } from './types.js';

const defaultDeps: Dependencies = {
  readStdin: () => defaultReadStdin(process.stdin),
  parseGit: (cwd) => parseGitStatus(cwd),
  parseTranscript: (path) => parseTranscript(path),
  getTokenSpeed: (ctx) => getTokenSpeed(ctx),
  getMemoryInfo: () => getMemoryInfo(),
  getGsdInfo: (session) => getGsdInfo(session),
  getMcpInfo: (cwd) => getMcpInfo(cwd),
  getTermCols: () => getTermCols(),
};

export async function main(overrides: Partial<Dependencies> = {}): Promise<string> {
  const deps = { ...defaultDeps, ...overrides };
  const configLoader = deps.loadConfig ?? loadConfig;
  const config = mergeCliFlags(configLoader(), process.argv);
  const input = await deps.readStdin();
  const cwd = input.cwd || input.workspace?.current_dir || process.cwd();

  const [git, transcript] = await Promise.all([
    deps.parseGit(cwd),
    input.transcript_path ? deps.parseTranscript(input.transcript_path) : Promise.resolve(EMPTY_TRANSCRIPT),
  ]);

  const tokenSpeed = deps.getTokenSpeed(input.context_window);
  const memory = deps.getMemoryInfo();
  const gsd = config.gsd ? deps.getGsdInfo(input.session_id) : null;
  const mcp = deps.getMcpInfo(cwd);

  const rawCols = deps.getTermCols();
  const isTTY = !!(process.stdout.columns || process.stderr.columns);
  const cols = getLayoutCols(rawCols, isTTY);
  const icons = resolveIcons(config.icons);
  const normalized = normalize(input);
  return render({ input, normalized, git, transcript, tokenSpeed, memory, gsd, mcp, cols, config, icons });
}

// Run when invoked directly.
// Resolve through realpath to handle npx symlinks.
function isDirectRun(): boolean {
  if (!process.argv[1]) return false;
  try {
    const self = realpathSync(fileURLToPath(import.meta.url)).replace(/\.js$/, '');
    const invoked = realpathSync(process.argv[1]).replace(/\.js$/, '');
    return self === invoked;
  } catch {
    return false;
  }
}

if (isDirectRun()) {
  const cmd = process.argv[2];
  if (cmd === 'install') {
    install().then(o => process.stdout.write(o)).catch(e => process.stderr.write(`Install error: ${e.message}\n`));
  } else if (cmd === 'uninstall') {
    const o = uninstall();
    process.stdout.write(o);
  } else {
    main().then(o => process.stdout.write(o)).catch(e => { if (!(e instanceof SyntaxError)) process.stderr.write(`Statusline error: ${e.message}\n`); });
  }
}
