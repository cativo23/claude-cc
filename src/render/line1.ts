import { basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fitSegments, truncField } from './text.js';
import { formatGitChanges, getActiveTodo, getCustomCommandsForLine, renderCustomCommand, SEP } from './shared.js';
import { hyperlink } from './hyperlink.js';
import { formatDuration } from '../utils/format.js';
import { isNamedAgentType } from '../parsers/subagents.js';
import type { Colors } from './colors.js';
import type { RenderContext } from '../types.js';

export function renderLine1(ctx: RenderContext, c: Colors): string {
  const { input, git, transcript, config: { display }, cols, icons, memory, tokenSpeed } = ctx;
  const left: string[] = [];
  const right: string[] = [];

  // Model
  if (display.model) {
    if (input.model) left.push(c.cyan(`${icons.model} ${input.model}`));
  }

  // Branch + git changes (prefer Qwen's native git.branch, fallback to external git)
  const branchName = input.gitBranch || git.branch;
  if (display.branch && branchName) {
    const branchLen = cols < 60 ? 20 : cols < 80 ? 35 : cols < 100 ? 50 : cols < 120 ? 70 : 80;
    const bName = truncField(branchName, branchLen);
    let branchStr = c.magenta(`${icons.branch} ${bName}`);

    if (display.gitChanges) {
      const parts = formatGitChanges(git, c);
      if (parts.length > 0) branchStr += ' ' + parts.join(' ');
    }
    left.push(branchStr);
  }

  // Directory
  if (display.directory) {
    const cwd = input.cwd;
    if (cwd) {
      const dirName = basename(cwd) || cwd;
      const dirLen = cols < 80 ? 12 : cols < 120 ? 20 : 30;
      const label = c.brightBlue(`${icons.folder} ${truncField(dirName, dirLen)}`);
      // Wrap with OSC 8 so terminals that support it turn the directory into a
      // clickable file:// link. pathToFileURL handles percent-encoding of
      // spaces and non-ASCII chars correctly.
      left.push(hyperlink(pathToFileURL(cwd).href, label));
    }
  }

  // Repo segment — owner/name from workspace.repo, clickable to open the repo
  // on its host. Distinct from the directory breadcrumb above (a local path):
  // this is the canonical remote identity, and surfaces the owner that the
  // bare cwd basename can't.
  if (display.repo && input.repo) {
    const { owner, name, url } = input.repo;
    const repoLen = cols < 80 ? 14 : cols < 120 ? 24 : 36;
    const label = c.brightBlue(`${icons.repo} ${truncField(`${owner}/${name}`, repoLen)}`);
    left.push(hyperlink(url, label));
  }

  // Added dirs badge — only when count > 0; warning color at >= 5
  if (display.addedDirs && input.addedDirsCount != null && input.addedDirsCount > 0) {
    const badge = `+${input.addedDirsCount} dirs`;
    left.push(input.addedDirsCount >= 5 ? c.orange(badge) : c.dim(badge));
  }

  // Worktree origin-branch breadcrumb — only when original_branch is present,
  // there IS a current branch to contrast against (anchor), and they differ.
  const branchForBreadcrumb = input.gitBranch || git.branch;
  if (display.worktreeBreadcrumb && input.worktreeOriginalBranch && branchForBreadcrumb && input.worktreeOriginalBranch !== branchForBreadcrumb) {
    const truncated = truncField(input.worktreeOriginalBranch, 15);
    left.push(c.gray(`↳ ${truncated}`));
  }

  // Duration (Claude only)
  if (display.duration && input.durationMs != null) {
    right.push(c.dim(`${icons.clock} ${formatDuration(input.durationMs)}`));
  }

  // Memory
  if (display.memory && memory) {
    right.push(c.dim(`${memory.percentage}% mem`));
  }

  // Token speed
  if (display.tokenSpeed && tokenSpeed != null) {
    right.push(c.dim(`${icons.bolt}${tokenSpeed} tok/s`));
  }

  // Lines changed (right side)
  if (display.linesChanged) {
    const added = input.linesAdded;
    const removed = input.linesRemoved;
    if (added > 0 || removed > 0) {
      right.push(`${c.green(`+${added}`)} ${c.red(`-${removed}`)}`);
    }
  }

  // Active task from todos
  const activeTask = getActiveTodo(transcript);
  if (activeTask) {
    right.push(c.yellow(truncField(activeTask, 30)));
  }

  // Worktree / Agent / Session name / Style — read from the normalized layer,
  // which has already run sanitizeTermString() over these untrusted values.
  // Reading input.raw.* directly would bypass that guard and let malformed
  // stdin JSON inject terminal control sequences.
  if (display.worktree && input.worktreeName) {
    right.push(c.gray(`${icons.tree} ${truncField(input.worktreeName, 15)}`));
  }

  if (display.agent) {
    // Show the cubes-icon agent name when:
    //   1) the statusline is rendering inside a subagent session (input.agentName
    //      comes from Claude Code's stdin payload), or
    //   2) the parent session has exactly one *named* subagent currently
    //      running. Anonymous (general-purpose / unknown) agents stay collapsed
    //      under the live ⚡N agents widget on line 3 to avoid noise.
    let agentName = input.agentName;
    if (!agentName) {
      const named = transcript.agents.filter(a => a.status === 'running' && isNamedAgentType(a.type));
      if (named.length === 1) agentName = named[0].type;
    }
    if (agentName) {
      right.push(c.gray(`${icons.cubes} ${truncField(agentName, 15)}`));
    }
  }

  if (display.sessionName && input.sessionName) {
    right.push(c.dim(truncField(input.sessionName, 20)));
  }

  if (display.style && input.outputStyle) {
    right.push(c.gray(input.outputStyle));
  }

  // Version — link to the Claude Code npm page for quick changelog lookup.
  if (display.version && input.version) {
    right.push(hyperlink(
      `https://www.npmjs.com/package/@anthropic-ai/claude-code/v/${encodeURIComponent(input.version)}`,
      c.dim(`v${input.version}`),
    ));
  }

  // Custom commands (issue #143 phase 3) — appended last on the left so they
  // sit after core widgets and evict first under fitSegments' narrow-cols
  // pressure. Filtered to line === 1 and non-hidden state.
  for (const out of getCustomCommandsForLine(ctx.customCommands, 1)) {
    const seg = renderCustomCommand(out, c);
    if (seg) left.push(seg);
  }

  if (left.length === 0 && right.length === 0) return '';
  return fitSegments(left, right, SEP, cols);
}
