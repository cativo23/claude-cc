import { basename } from 'node:path';
import { truncField } from './text.js';
import { buildContextBar, formatGitChanges, formatQwenMetrics, SEP_MINIMAL } from './shared.js';
import type { Colors } from './colors.js';
import { formatTokens, formatDuration, formatCost } from '../utils/format.js';
import { renderLine3 } from './line3.js';
import type { RenderContext } from '../types.js';

export function renderMinimal(ctx: RenderContext, c: Colors): string {
  const { normalized: n, git, tokenSpeed, gsd, config: { display }, cols, icons } = ctx;
  const parts: string[] = [];

  // Directory
  if (display.directory && n.cwd) {
    const dirName = basename(n.cwd) || n.cwd;
    const dirLen = cols < 60 ? 12 : cols < 80 ? 20 : 30;
    parts.push(c.brightBlue(truncField(dirName, dirLen)));
  }

  // Branch (sanitized via normalize)
  const branchName = n.gitBranch || git.branch;
  if (display.branch && branchName) {
    const branchLen = cols < 60 ? 12 : cols < 80 ? 20 : branchName.length;
    let branchStr = c.magenta(truncField(branchName, branchLen));
    if (display.gitChanges) {
      const changeParts = formatGitChanges(git, c);
      if (changeParts.length > 0) branchStr += ' ' + changeParts.join(' ');
    }
    parts.push(branchStr);
  }

  // Model (sanitized via normalize)
  if (display.model && n.model) {
    parts.push(c.cyan(truncField(n.model, 20)));
  }

  // Context bar
  if (display.contextBar) {
    parts.push(buildContextBar(n.context.usedPercentage, c, { segments: 10, iconSet: icons }));
  }

  // Only add these if cols >= 60
  if (cols >= 60) {
    // Tokens
    if (display.tokens) {
      const tParts: string[] = [];
      if (n.tokens.input > 0) tParts.push(`${formatTokens(n.tokens.input)}↑`);
      if (n.tokens.output > 0) tParts.push(`${formatTokens(n.tokens.output)}↓`);
      if (tParts.length > 0) parts.push(tParts.join(' '));
    }

    // Cost (Claude only)
    if (display.cost && n.cost != null) {
      parts.push(formatCost(n.cost));
    }

    // Duration (Claude only)
    if (display.duration && n.durationMs != null) {
      parts.push(formatDuration(n.durationMs));
    }

    // Token speed
    if (display.tokenSpeed && tokenSpeed != null) {
      parts.push(c.dim(`${tokenSpeed} tok/s`));
    }

    // Lines changed (unified from normalize)
    if (display.linesChanged) {
      if (n.linesAdded > 0 || n.linesRemoved > 0) {
        parts.push(`${c.green(`+${n.linesAdded}`)}${c.red(`-${n.linesRemoved}`)}`);
      }
    }

    // Qwen metrics (shared helper)
    parts.push(...formatQwenMetrics(n, c, icons));

    // Style (sanitized via normalize)
    if (display.style && n.outputStyle) {
      parts.push(c.dim(n.outputStyle));
    }

    // Version (sanitized via normalize)
    if (display.version && n.version) {
      parts.push(c.dim(`v${n.version}`));
    }

    // GSD current task
    if (gsd?.currentTask) {
      parts.push(c.yellow(truncField(gsd.currentTask, 20)));
    }

    // Worktree (sanitized via normalize)
    if (display.worktree && n.worktreeName) {
      parts.push(c.dim(`${icons.tree} ${truncField(n.worktreeName, 12)}`));
    }

    // Agent (sanitized via normalize)
    if (display.agent && n.agentName) {
      parts.push(c.dim(`${icons.cubes} ${truncField(n.agentName, 12)}`));
    }
  }

  const mainLine = parts.join(SEP_MINIMAL);

  // Append tools/todos as extra line
  const l3 = renderLine3(ctx, c);
  if (l3) return mainLine + '\n' + l3;
  return mainLine;
}
