import { basename } from 'node:path';
import { truncField } from './text.js';
import { getModelName, buildContextBar, formatGitChanges, SEP_MINIMAL } from './shared.js';
import type { Colors } from './colors.js';
import { formatTokens, formatDuration, formatCost } from '../utils/format.js';
import { renderLine3 } from './line3.js';
import type { RenderContext } from '../types.js';

export function renderMinimal(ctx: RenderContext, c: Colors): string {
  const { input, git, transcript, tokenSpeed, gsd, config: { display }, cols, icons } = ctx;
  const parts: string[] = [];

  // Directory
  const cwd = input.cwd;
  if (display.directory && cwd) {
    const dirName = basename(cwd) || cwd;
    const dirLen = cols < 60 ? 12 : cols < 80 ? 20 : 30;
    parts.push(c.brightBlue(truncField(dirName, dirLen)));
  }

  // Branch
  const branchName = input.gitBranch || git.branch;
  if (display.branch && branchName) {
    const branchLen = cols < 60 ? 12 : cols < 80 ? 20 : branchName.length;
    let branchStr = c.magenta(truncField(branchName, branchLen));
    if (display.gitChanges) {
      const changeParts = formatGitChanges(git, c);
      if (changeParts.length > 0) branchStr += ' ' + changeParts.join(' ');
    }
    parts.push(branchStr);
  }

  // Model
  if (display.model) {
    const modelName = getModelName(input.raw.model);
    if (modelName) parts.push(c.cyan(truncField(modelName, 20)));
  }

  // Context bar
  if (display.contextBar) {
    parts.push(buildContextBar(input.context.usedPercentage, c, { segments: 10, pctInsideBar: true, iconSet: icons }));
  }

  // Only add these if cols >= 60
  if (cols >= 60) {
    // Tokens
    if (display.tokens) {
      const inTokens = input.tokens.input;
      const outTokens = input.tokens.output;
      const tParts: string[] = [];
      if (inTokens > 0) tParts.push(`${formatTokens(inTokens)}↑`);
      if (outTokens > 0) tParts.push(`${formatTokens(outTokens)}↓`);
      if (tParts.length > 0) parts.push(tParts.join(' '));
    }

    // Cost (Claude only)
    if (display.cost && input.cost != null) {
      parts.push(formatCost(input.cost));
    }

    // Duration (Claude only)
    if (display.duration && input.durationMs != null) {
      parts.push(formatDuration(input.durationMs));
    }

    // Token speed
    if (display.tokenSpeed && tokenSpeed != null) {
      parts.push(c.dim(`${tokenSpeed} tok/s`));
    }

    // Lines changed
    if (display.linesChanged) {
      const added = input.linesAdded;
      const removed = input.linesRemoved;
      if (added > 0 || removed > 0) {
        parts.push(`${c.green(`+${added}`)}${c.red(`-${removed}`)}`);
      }
    }

    // Qwen Code: API metrics (requests, cached tokens, thoughts)
    if (input.platform === 'qwen-code' && input.performance) {
      const perf = input.performance;
      if (perf.requests > 0) {
        let reqStr = `${perf.requests} req`;
        if (perf.errors > 0) reqStr += `(${perf.errors} err)`;
        parts.push(c.dim(`${icons.bolt} ${reqStr}`));
      }
      if (input.tokens.cached != null && input.tokens.cached > 0) {
        parts.push(c.dim(`${icons.comment} ${formatTokens(input.tokens.cached)} cached`));
      }
      if (input.tokens.thoughts != null && input.tokens.thoughts > 0) {
        const label = input.tokens.thoughts === 1 ? 'thought' : 'thoughts';
        parts.push(c.dim(`^${formatTokens(input.tokens.thoughts)} ${label}`));
      }
    }

    // Style
    if (display.style && input.raw.output_style?.name) {
      parts.push(c.dim(input.raw.output_style.name));
    }

    // Version
    if (display.version && input.version) {
      parts.push(c.dim(`v${input.version}`));
    }

    // GSD current task
    if (gsd?.currentTask) {
      parts.push(c.yellow(truncField(gsd.currentTask, 20)));
    }

    // Worktree
    if (display.worktree && input.raw.worktree?.name) {
      parts.push(c.dim(`${icons.tree} ${truncField(input.raw.worktree.name, 12)}`));
    }

    // Agent
    if (display.agent && input.raw.agent?.name) {
      parts.push(c.dim(`${icons.cubes} ${truncField(input.raw.agent.name, 12)}`));
    }
  }

  const mainLine = parts.join(SEP_MINIMAL);

  // Append tools/todos as extra line
  const l3 = renderLine3(ctx, c);
  if (l3) return mainLine + '\n' + l3;
  return mainLine;
}
