import { basename } from 'node:path';
import { ICONS } from './icons.js';
import { truncField } from './text.js';
import { getModelName, buildContextBar, formatGitChanges, SEP_MINIMAL } from './shared.js';
import type { Colors } from './colors.js';
import { formatTokens, formatDuration, formatCost } from '../utils/format.js';
import { renderLine3 } from './line3.js';
import type { ClaudeCodeInput, GitStatus, TranscriptData, DisplayToggles, GsdInfo } from '../types.js';

export function renderMinimal(
  input: ClaudeCodeInput,
  git: GitStatus,
  transcript: TranscriptData,
  tokenSpeed: number | null,
  gsd: GsdInfo | null,
  c: Colors,
  display: DisplayToggles,
  cols: number
): string {
  const parts: string[] = [];

  // Directory
  const cwd = input.cwd || input.workspace?.current_dir || '';
  if (display.directory && cwd) {
    const dirName = basename(cwd) || cwd;
    const dirLen = cols < 60 ? 12 : cols < 80 ? 20 : 30;
    parts.push(c.brightBlue(truncField(dirName, dirLen)));
  }

  // Branch
  if (display.branch && git.branch) {
    const branchLen = cols < 60 ? 12 : cols < 80 ? 20 : git.branch.length;
    let branchStr = c.magenta(truncField(git.branch, branchLen));
    if (display.gitChanges) {
      const changeParts = formatGitChanges(git, c);
      if (changeParts.length > 0) branchStr += ' ' + changeParts.join(' ');
    }
    parts.push(branchStr);
  }

  // Model
  if (display.model) {
    const modelName = getModelName(input.model);
    if (modelName) parts.push(c.cyan(truncField(modelName, 20)));
  }

  // Context bar
  if (display.contextBar) {
    parts.push(buildContextBar(input.context_window.used_percentage, c, { segments: 10, pctInsideBar: true }));
  }

  // Only add these if cols >= 60
  if (cols >= 60) {
    // Tokens
    if (display.tokens) {
      const inTokens = input.context_window.total_input_tokens;
      const outTokens = input.context_window.total_output_tokens;
      const tParts: string[] = [];
      if (inTokens != null) tParts.push(`${formatTokens(inTokens)}↑`);
      if (outTokens != null) tParts.push(`${formatTokens(outTokens)}↓`);
      if (tParts.length > 0) parts.push(tParts.join(' '));
    }

    // Cost
    if (display.cost && input.cost) {
      parts.push(formatCost(input.cost.total_cost_usd));
    }

    // Duration
    if (display.duration && input.cost) {
      parts.push(formatDuration(input.cost.total_duration_ms));
    }

    // Token speed
    if (display.tokenSpeed && tokenSpeed != null) {
      parts.push(c.dim(`${tokenSpeed} tok/s`));
    }

    // Lines changed
    if (display.linesChanged && input.cost) {
      const added = input.cost.total_lines_added ?? 0;
      const removed = input.cost.total_lines_removed ?? 0;
      if (added > 0 || removed > 0) {
        parts.push(`${c.green(`+${added}`)}${c.red(`-${removed}`)}`);
      }
    }

    // Style
    if (display.style && input.output_style?.name) {
      parts.push(c.dim(input.output_style.name));
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
    if (display.worktree && input.worktree?.name) {
      parts.push(c.dim(`${ICONS.tree} ${truncField(input.worktree.name, 12)}`));
    }

    // Agent
    if (display.agent && input.agent?.name) {
      parts.push(c.dim(`${ICONS.cubes} ${truncField(input.agent.name, 12)}`));
    }
  }

  const mainLine = parts.join(SEP_MINIMAL);

  // Append tools/todos as extra line
  const l3 = renderLine3(transcript.tools, transcript.todos, c);
  if (l3) return mainLine + '\n' + l3;
  return mainLine;
}
