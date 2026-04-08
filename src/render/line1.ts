import { basename } from 'node:path';
import { ICONS } from './icons.js';
import { fitSegments, truncField } from './text.js';
import type { Colors } from './colors.js';
import type { ClaudeCodeInput, GitStatus, TranscriptData, DisplayToggles } from '../types.js';

const SEP = ` \x1b[90m│\x1b[0m `;

function getModelName(model: ClaudeCodeInput['model']): string {
  if (typeof model === 'string') return model;
  if (model && typeof model === 'object' && 'display_name' in model) return model.display_name;
  return '';
}

function getActiveTodo(transcript: TranscriptData): string | undefined {
  const inProgress = transcript.todos.filter(t => t.status === 'in_progress');
  return inProgress[0]?.content;
}

export function renderLine1(
  input: ClaudeCodeInput,
  git: GitStatus,
  transcript: TranscriptData,
  c: Colors,
  display: DisplayToggles,
  cols: number
): string {
  const left: string[] = [];
  const right: string[] = [];

  // Model
  if (display.model) {
    const modelName = getModelName(input.model);
    if (modelName) left.push(c.cyan(`${ICONS.model} ${modelName}`));
  }

  // Branch + git changes
  if (display.branch && git.branch) {
    const branchLen = cols < 60 ? 12 : cols < 80 ? 20 : cols < 100 ? 30 : cols < 120 ? 40 : 60;
    const branchName = truncField(git.branch, branchLen);
    let branchStr = c.magenta(`${ICONS.branch} ${branchName}`);

    if (display.gitChanges) {
      const parts: string[] = [];
      if (git.staged > 0) parts.push(c.green(`+${git.staged}`));
      if (git.modified > 0) parts.push(c.yellow(`~${git.modified}`));
      if (git.untracked > 0) parts.push(c.gray(`?${git.untracked}`));
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
      left.push(c.brightBlue(`${ICONS.folder} ${truncField(dirName, dirLen)}`));
    }
  }

  // Lines changed (right side)
  if (display.linesChanged && input.cost) {
    const added = input.cost.total_lines_added ?? 0;
    const removed = input.cost.total_lines_removed ?? 0;
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
    right.push(c.gray(`${ICONS.tree} ${truncField(input.worktree.name, 15)}`));
  }

  // Agent
  if (display.agent && input.agent?.name) {
    right.push(c.gray(`${ICONS.cubes} ${truncField(input.agent.name, 15)}`));
  }

  // Session name
  if (display.sessionName && input.session_name) {
    right.push(c.dim(truncField(input.session_name, 20)));
  }

  // Style
  if (display.style && input.output_style?.name && input.output_style.name !== 'default') {
    right.push(c.dim(input.output_style.name));
  }

  // Version
  if (display.version && input.version) {
    right.push(c.dim(`v${input.version}`));
  }

  if (left.length === 0 && right.length === 0) return '';
  return fitSegments(left, right, SEP, cols);
}
