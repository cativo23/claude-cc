#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { readStdin as defaultReadStdin, StdinParseError } from './stdin.js';
import { parseGitStatus } from './parsers/git.js';
import { parseTranscript } from './parsers/transcript.js';
import { getTokenSpeed } from './parsers/token-speed.js';
import { getMemoryInfo } from './parsers/memory.js';
import { getGsdInfo } from './parsers/gsd.js';
import { getMcpInfo } from './parsers/mcp.js';
import { getCustomCommandOutputs } from './parsers/custom-commands.js';
import { getLayoutCols, getTermCols } from './utils/terminal.js';
import { loadConfig, mergeCliFlags } from './config.js';
import { render } from './render/index.js';
import { resolveIcons } from './render/icons.js';
import { install, uninstall } from './installer.js';
import { runThemesCommand } from './commands/themes.js';
import { runStatsCommand } from './commands/stats.js';
import { runCustomRefreshFromStdin } from './commands/custom-refresh.js';
import { runCustomCommand } from './commands/custom.js';
import type { Dependencies, RawInput } from './types.js';
import type { NormalizedInput } from './normalize.js';
import { EMPTY_TRANSCRIPT } from './types.js';
import { normalize } from './normalize.js';

const defaultDeps: Dependencies = {
  readStdin: () => defaultReadStdin(process.stdin),
  parseGit: (cwd) => parseGitStatus(cwd),
  parseTranscript: (path) => parseTranscript(path),
  getTokenSpeed: (ctx) => getTokenSpeed(ctx),
  getMemoryInfo: () => getMemoryInfo(),
  getGsdInfo: (cwd) => getGsdInfo(cwd),
  getMcpInfo: (cwd) => getMcpInfo(cwd),
  getTermCols: () => getTermCols(),
};

/**
 * Build the stdin envelope passed to user-written custom commands (issue #143).
 *
 * Keep this contract minimal and forward-compatible: the `lumira.version`
 * field is the API version a user-script can branch on, and only fields with
 * a stable meaning are exposed. Anything more would couple user scripts to
 * lumira's internal normalisation. Documented as the user-facing contract
 * for the Custom Command widget.
 */
function buildStdinEnvelope(input: RawInput, n: NormalizedInput): string {
  const envelope = {
    lumira: { version: 1, platform: n.platform },
    model: n.model,
    cwd: n.cwd,
    context_window: input.context_window ?? null,
    cost: 'cost' in input ? input.cost ?? null : null,
    git: { branch: n.gitBranch ?? null },
  };
  return JSON.stringify(envelope);
}

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
  const gsd = config.gsd ? deps.getGsdInfo(cwd) : null;
  const mcp = deps.getMcpInfo(cwd);

  const rawCols = deps.getTermCols();
  const isTTY = !!(process.stdout.columns || process.stderr.columns);
  const cols = getLayoutCols(rawCols, isTTY);
  const icons = resolveIcons(config.icons);
  const normalizedInput = normalize(input);

  // Custom command outputs (issue #143). The parser is async because it reads
  // the on-disk cache + may spawn a detached refresh helper, but it is
  // designed to return immediately (no network or process waits). Defensive
  // catch: any unexpected error degrades to no custom segments rather than
  // breaking the entire statusline render.
  const configFilePath = join(homedir(), '.config', 'lumira', 'config.json');
  const customCommands = await getCustomCommandOutputs({
    config: config.customCommands,
    stdin: buildStdinEnvelope(input, normalizedInput),
    configFilePath,
  }).catch(() => []);

  return render({ input: normalizedInput, git, transcript, tokenSpeed, memory, gsd, mcp, cols, config, icons, customCommands });
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
    const configPath = join(homedir(), '.config', 'lumira', 'config.json');
    install({ configPath }).then(o => process.stdout.write(o)).catch(e => process.stderr.write(`Install error: ${e.message}\n`));
  } else if (cmd === 'uninstall') {
    const o = uninstall();
    process.stdout.write(o);
  } else if (cmd === 'themes') {
    const r = runThemesCommand(process.argv, process.stdout.columns);
    if (r.stdout) process.stdout.write(r.stdout);
    if (r.stderr) process.stderr.write(r.stderr);
    if (r.exitCode !== 0) process.exit(r.exitCode);
  } else if (cmd === 'stats') {
    runStatsCommand(process.argv, process.stdout.columns).then(r => {
      if (r.stdout) process.stdout.write(r.stdout);
      if (r.stderr) process.stderr.write(r.stderr);
      if (r.exitCode !== 0) process.exit(r.exitCode);
    }).catch(e => {
      process.stderr.write(`Stats error: ${e.message}\n`);
      process.exit(1);
    });
  } else if (cmd === 'custom') {
    runCustomCommand(process.argv).then(r => {
      if (r.output) process.stdout.write(r.output);
      if (r.exitCode !== 0) process.exit(r.exitCode);
    }).catch(e => {
      process.stderr.write(`Custom command error: ${e.message}\n`);
      process.exit(1);
    });
  } else if (cmd === '__custom-refresh') {
    // Internal: invoked by the renderer as a detached child to refresh a
    // single custom command's cache entry without keeping the renderer's
    // event loop refed. Reads the spec JSON from its own stdin.
    runCustomRefreshFromStdin().then(() => process.exit(0)).catch(() => process.exit(0));
  } else {
    main().then(o => process.stdout.write(o)).catch(e => { if (!(e instanceof StdinParseError)) process.stderr.write(`Statusline error: ${e.message}\n`); });
  }
}
