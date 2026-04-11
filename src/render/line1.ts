import { basename } from 'node:path';
import { fitSegments, truncField } from './text.js';
import { getModelName, formatGitChanges, SEP } from './shared.js';
import type { Colors } from './colors.js';
import type { RenderContext, TranscriptData } from '../types.js';

function getActiveTodo(transcript: TranscriptData): string | undefined {
  const inProgress = transcript.todos.filter(t => t.status === 'in_progress');
  return inProgress[0]?.content;
}

export function renderLine1(ctx: RenderContext, c: Colors): string {
  const { input, git, transcript, config: { display }, cols, icons } = ctx;
  const left: string[] = [];
  const right: string[] = [];

  // Model
  if (display.model) {
    const modelName = getModelName(input.model);
    if (modelName) left.push(c.cyan(`${icons.model} ${modelName}`));
  }

  // Branch + git changes
  if (display.branch && git.branch) {
    const branchLen = cols < 60 ? 12 : cols < 80 ? 20 : cols < 100 ? 30 : cols < 120 ? 40 : 60;
    const branchName = truncField(git.branch, branchLen);
    let branchStr = c.magenta(`${icons.branch} ${branchName}`);

    if (display.gitChanges) {
      const parts = formatGitChanges(git, c);
      if (parts.length > 0) branchStr += ' ' + parts.join(' ');
    }
    left.push(branchStr);
  }

  // Directory
  if (display.directory) {
    const cwd = input.cwd || input.workspace?.current_dir || '';
    if (cwd) {
      const dirName = basename(cwd) || cwd;
      const dirLen = cols < 80 ? 12 : cols < 120 ? 20 : 30;
      left.push(c.brightBlue(`${icons.folder} ${truncField(dirName, dirLen)}`));
    }
  }

  // Lines changed (right side)
  if (display.linesChanged && input.cost) {
    const added = (input.cost?.total_lines_added ?? input.metrics?.files?.total_lines_added) ?? 0;
    const removed = (input.cost?.total_lines_removed ?? input.metrics?.files?.total_lines_removed) ?? 0;
    if (added > 0 || removed > 0) {
      right.push(`${c.green(`+${added}`)} ${c.red(`-${removed}`)}`);
    }
  }

  // Active task from todos
  const activeTask = getActiveTodo(transcript);
  if (activeTask) {
    right.push(c.yellow(truncField(activeTask, 30)));
  }

  // Worktree
  if (display.worktree && input.worktree?.name) {
    right.push(c.gray(`${icons.tree} ${truncField(input.worktree.name, 15)}`));
  }

  // Agent
  if (display.agent && input.agent?.name) {
    right.push(c.gray(`${icons.cubes} ${truncField(input.agent.name, 15)}`));
  }

  // Session name
  if (display.sessionName && input.session_name) {
    right.push(c.dim(truncField(input.session_name, 20)));
  }

  // Style
  if (display.style && input.output_style?.name) {
    right.push(c.gray(input.output_style.name));
  }

  // Version
  if (display.version && input.version) {
    right.push(c.dim(`v${input.version}`));
  }

  if (left.length === 0 && right.length === 0) return '';
  return fitSegments(left, right, SEP, cols);
}
