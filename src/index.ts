#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { readStdin as defaultReadStdin } from './stdin.js';
import { parseGitStatus } from './parsers/git.js';
import { parseTranscript } from './parsers/transcript.js';
import { getTokenSpeed } from './parsers/token-speed.js';
import { getMemoryInfo } from './parsers/memory.js';
import { getGsdInfo } from './parsers/gsd.js';
import { getTermCols, getLayoutCols } from './utils/terminal.js';
import { loadConfig, mergeCliFlags } from './config.js';
import { render } from './render/index.js';
import type { Dependencies, RenderContext } from './types.js';
import { EMPTY_TRANSCRIPT } from './types.js';

const defaultDeps: Dependencies = {
  readStdin: () => defaultReadStdin(process.stdin),
  parseGit: (cwd) => parseGitStatus(cwd),
  parseTranscript: (path) => parseTranscript(path),
  getTokenSpeed: (ctx) => getTokenSpeed(ctx),
  getMemoryInfo: () => getMemoryInfo(),
  getGsdInfo: (session) => getGsdInfo(session),
  getTermCols: () => getTermCols(),
};

export async function main(overrides: Partial<Dependencies> = {}): Promise<string> {
  const deps = { ...defaultDeps, ...overrides };
  const config = mergeCliFlags(loadConfig(), process.argv);
  const input = await deps.readStdin();
  const cwd = input.cwd || input.workspace?.current_dir || process.cwd();

  const [git, transcript] = await Promise.all([
    deps.parseGit(cwd),
    input.transcript_path ? deps.parseTranscript(input.transcript_path) : Promise.resolve(EMPTY_TRANSCRIPT),
  ]);

  const tokenSpeed = deps.getTokenSpeed(input.context_window);
  const memory = deps.getMemoryInfo();
  const gsd = config.gsd ? deps.getGsdInfo(input.session_id) : null;

  const rawCols = deps.getTermCols();
  const isTTY = !!(process.stdout.columns || process.stderr.columns);
  const cols = getLayoutCols(rawCols, isTTY);
  return render({ input, git, transcript, tokenSpeed, memory, gsd, cols, config } as RenderContext);
}

// Run when invoked directly
const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] && (__filename === process.argv[1] || __filename === process.argv[1] + '.js')) {
  main().then(o => process.stdout.write(o)).catch(e => { if (!(e instanceof SyntaxError)) process.stderr.write(`Statusline error: ${e.message}\n`); });
}
