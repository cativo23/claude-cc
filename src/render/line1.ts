import { basename } from 'node:path';
import { fitSegments, truncField } from './text.js';
import { formatGitChanges, SEP } from './shared.js';
import type { Colors } from './colors.js';
import type { RenderContext, TranscriptData } from '../types.js';

function getActiveTodo(transcript: TranscriptData): string | undefined {
  const inProgress = transcript.todos.filter(t => t.status === 'in_progress');
  return inProgress[0]?.content;
}

export function renderLine1(ctx: RenderContext, c: Colors): string {
  const { normalized: n, git, transcript, config: { display }, cols, icons } = ctx;
  const left: string[] = [];
  const right: string[] = [];

  // Model
  if (display.model && n.model) {
    left.push(c.cyan(`${icons.model} ${n.model}`));
  }

  // Branch + git changes (prefer normalized native branch, fallback to external git)
  const branchName = n.gitBranch || git.branch;
  if (display.branch && branchName) {
    const branchLen = cols < 60 ? 12 : cols < 80 ? 20 : cols < 100 ? 30 : cols < 120 ? 40 : 60;
    const bName = truncField(branchName, branchLen);
    let branchStr = c.magenta(`${icons.branch} ${bName}`);

    if (display.gitChanges) {
      const parts = formatGitChanges(git, c);
      if (parts.length > 0) branchStr += ' ' + parts.join(' ');
    }
    left.push(branchStr);
  }

  // Directory
  if (display.directory && n.cwd) {
    const dirName = basename(n.cwd) || n.cwd;
    const dirLen = cols < 80 ? 12 : cols < 120 ? 20 : 30;
    left.push(c.brightBlue(`${icons.folder} ${truncField(dirName, dirLen)}`));
  }

  // Lines changed (right side) — unified from normalize()
  if (display.linesChanged) {
    if (n.linesAdded > 0 || n.linesRemoved > 0) {
      right.push(`${c.green(`+${n.linesAdded}`)} ${c.red(`-${n.linesRemoved}`)}`);
    }
  }

  // Active task from todos
  const activeTask = getActiveTodo(transcript);
  if (activeTask) {
    right.push(c.yellow(truncField(activeTask, 30)));
  }

  // Worktree
  if (display.worktree && n.worktreeName) {
    right.push(c.gray(`${icons.tree} ${truncField(n.worktreeName, 15)}`));
  }

  // Agent
  if (display.agent && n.agentName) {
    right.push(c.gray(`${icons.cubes} ${truncField(n.agentName, 15)}`));
  }

  // Session name
  if (display.sessionName && n.sessionName) {
    right.push(c.dim(truncField(n.sessionName, 20)));
  }

  // Style
  if (display.style && n.outputStyle) {
    right.push(c.gray(n.outputStyle));
  }

  // Version
  if (display.version && n.version) {
    right.push(c.dim(`v${n.version}`));
  }

  if (left.length === 0 && right.length === 0) return '';
  return fitSegments(left, right, SEP, cols);
}
