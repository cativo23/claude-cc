import { basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { truncField } from './text.js';
import { getActiveTodo, getCustomCommandsForLine, renderCustomCommand } from './shared.js';
import { formatDuration } from '../utils/format.js';
import { hyperlink } from './hyperlink.js';
import { isNamedAgentType } from '../parsers/subagents.js';
import {
  renderPowerline,
  resolveStyle,
  type PowerlineSegment,
  type PowerlineStyleName,
} from './powerline.js';
import { createColors, type ColorMode } from './colors.js';
import type { RenderContext } from '../types.js';
import {
  type PowerlinePalette,
  derivePowerlinePalette,
  DEFAULT_POWERLINE_PALETTE,
  type ThemePalette,
} from '../themes.js';

/**
 * Build the line1 segment list for the powerline renderer. Segment priorities
 * control which get dropped first when the terminal is narrow (lower = drops first):
 *   model:             100  (always kept)
 *   branch:             80
 *   repo:               61  (git-identity cluster with branch; data-gated)
 *   worktreeBreadcrumb: 62  (git-identity cluster with branch/repo; data-gated) — see note below
 *   dir:                60
 *   addedDirs:          59  (renders after dir; data-gated; evicts before dir under pressure)
 *   task:               40
 *   duration:           35
 *   memory:             30
 *   tokenSpeed:         25
 *   linesChanged:       24
 *   worktree:           23
 *   agent:              22
 *   sessionName:        21
 *   version:            20
 *   style:              18  (dropped first)
 *
 * Note: priority controls only WHICH segments get evicted, not WHERE they
 * render — render order follows push order below (see applyPriorityEviction
 * in powerline.ts, which filters but never re-sorts).
 */
function buildSegments(ctx: RenderContext, palette: PowerlinePalette, c: import('./colors.js').Colors): PowerlineSegment[] {
  const { input, git, transcript, config: { display }, icons, memory, tokenSpeed } = ctx;
  const segments: PowerlineSegment[] = [];

  if (display.model) {
    if (input.model) {
      segments.push({
        text: input.model,
        icon: icons.model,
        bg: palette.modelBg,
        fg: palette.fg,
        priority: 100,
      });
    }
  }

  const branchName = input.gitBranch || git.branch;
  if (display.branch && branchName) {
    const dirty = git.staged + git.modified + git.untracked > 0;
    // Signal git state via bg swap — robbed from powerline-go's RepoCleanBg /
    // RepoDirtyBg distinction. Both badges and the bg swap respect
    // `display.gitChanges` so toggling it off matches classic renderer
    // behaviour (no signal of dirty state at all).
    const showDirty = display.gitChanges && dirty;
    let label = truncField(branchName, 40);
    if (showDirty) {
      const badges: string[] = [];
      if (git.staged > 0)    badges.push(`+${git.staged}`);
      if (git.modified > 0)  badges.push(`!${git.modified}`);
      if (git.untracked > 0) badges.push(`?${git.untracked}`);
      if (badges.length) label += ' ' + badges.join(' ');
    }
    segments.push({
      text: label,
      icon: icons.branch,
      bg: showDirty ? palette.branchDirtyBg : palette.branchCleanBg,
      fg: palette.fg,
      priority: 80,
    });
  }

  if (display.repo && input.repo) {
    const { owner, name, url } = input.repo;
    // Priority 61 — above directory@60. Repo is git identity (owner/name of the
    // remote), grouped with branch, so it survives narrow-terminal pressure a
    // step longer than the local directory. Rendered before directory to keep
    // the git-identity segments adjacent. Same dir-family background.
    segments.push({
      text: hyperlink(url, truncField(`${owner}/${name}`, 36)),
      icon: icons.repo,
      bg: palette.dirBg,
      fg: palette.fg,
      priority: 61,
    });
  }

  if (display.worktreeBreadcrumb && input.worktreeOriginalBranch) {
    const currentBranch = input.gitBranch || git.branch;
    // Only render when there is a current branch to contrast against — the
    // breadcrumb is meaningless without an anchor (no branch shown / branch off).
    // Priority 62 — above directory@60, below repo@61. Grouped with the rest of
    // the git-identity cluster (branch/repo) so it evicts together with them
    // under narrow-terminal pressure, same rationale as repo's placement above.
    if (currentBranch && input.worktreeOriginalBranch !== currentBranch) {
      segments.push({
        text: `↳ ${truncField(input.worktreeOriginalBranch, 15)}`,
        bg: palette.versionBg,
        fg: palette.fg,
        priority: 62,
      });
    }
  }

  if (display.directory && input.cwd) {
    const dirName = basename(input.cwd) || input.cwd;
    segments.push({
      text: hyperlink(pathToFileURL(input.cwd).href, truncField(dirName, 30)),
      icon: icons.folder,
      bg: palette.dirBg,
      fg: palette.fg,
      priority: 60,
    });
  }

  if (display.addedDirs && input.addedDirsCount != null && input.addedDirsCount > 0) {
    const badge = `+${input.addedDirsCount} dirs`;
    const bg = input.addedDirsCount >= 5 ? palette.taskBg : palette.versionBg;
    // Priority 59 — one BELOW directory@60. The badge annotates the directory,
    // so it must evict before the directory under narrow-terminal pressure
    // (applyPriorityEviction drops lowest-priority first). Insertion order is
    // unchanged, so it still renders right after the directory.
    segments.push({ text: badge, bg, fg: palette.fg, priority: 59 });
  }

  const activeTask = getActiveTodo(transcript);
  if (activeTask) {
    segments.push({
      text: truncField(activeTask, 30),
      bg: palette.taskBg,
      fg: palette.fg,
      priority: 40,
    });
  }

  // System info — moved from line 2 in fix #82 to declutter the metrics line.
  // Mirror the classic line1 right cluster: duration, memory, tokenSpeed.
  if (display.duration && input.durationMs != null) {
    segments.push({
      text: `${icons.clock} ${formatDuration(input.durationMs)}`,
      bg: palette.branchCleanBg,
      fg: palette.fg,
      priority: 35,
    });
  }

  if (display.memory && memory) {
    segments.push({
      text: `${memory.percentage}% mem`,
      bg: palette.branchCleanBg,
      fg: palette.fg,
      priority: 30,
    });
  }

  if (display.tokenSpeed && tokenSpeed != null) {
    segments.push({
      text: `${icons.bolt}${tokenSpeed} tok/s`,
      bg: palette.branchCleanBg,
      fg: palette.fg,
      priority: 25,
    });
  }

  // Lines changed — emitted as a single segment in powerline (classic uses
  // two-color spans inside one cell, which the segment model can't express).
  // Signed numbers carry the semantic without needing per-token color.
  if (display.linesChanged) {
    const added = input.linesAdded;
    const removed = input.linesRemoved;
    if (added > 0 || removed > 0) {
      segments.push({
        text: `+${added} -${removed}`,
        bg: palette.branchCleanBg,
        fg: palette.fg,
        priority: 24,
      });
    }
  }

  if (display.worktree && input.worktreeName) {
    segments.push({
      text: truncField(input.worktreeName, 15),
      icon: icons.tree,
      bg: palette.dirBg,
      fg: palette.fg,
      priority: 23,
    });
  }

  // Mirrors classic line1: prefer the explicit input.agentName (subagent
  // session render), else show the cubes badge when exactly one *named*
  // subagent is running on the parent. Anonymous agents stay collapsed
  // under the line 3 ⚡N agents widget to avoid noise.
  if (display.agent) {
    let agentName = input.agentName;
    if (!agentName) {
      const named = transcript.agents.filter(a => a.status === 'running' && isNamedAgentType(a.type));
      if (named.length === 1) agentName = named[0].type;
    }
    if (agentName) {
      segments.push({
        text: truncField(agentName, 15),
        icon: icons.cubes,
        bg: palette.taskBg,
        fg: palette.fg,
        priority: 22,
      });
    }
  }

  if (display.sessionName && input.sessionName) {
    segments.push({
      text: truncField(input.sessionName, 20),
      bg: palette.branchCleanBg,
      fg: palette.fg,
      priority: 21,
    });
  }

  if (display.style && input.outputStyle) {
    segments.push({
      text: input.outputStyle,
      bg: palette.branchCleanBg,
      fg: palette.fg,
      priority: 18,
    });
  }

  if (display.version && input.version) {
    segments.push({
      text: hyperlink(
        `https://www.npmjs.com/package/@anthropic-ai/claude-code/v/${encodeURIComponent(input.version)}`,
        `v${input.version}`,
      ),
      bg: palette.versionBg,
      fg: palette.fg,
      priority: 20,
    });
  }

  // Custom commands (issue #143 phase 3) — neutral bg (dirBg) so user-defined
  // segments don't collide with the semantic bg slots (modelBg, taskBg, etc.).
  // Priority 15 sits below all built-in segments so custom commands evict
  // first under narrow-cols pressure — keeps lumira's own widgets visible
  // when space is tight, treating user widgets as additive overlay.
  for (const out of getCustomCommandsForLine(ctx.customCommands, 1)) {
    const text = renderCustomCommand(out, c);
    if (text) {
      segments.push({ text, bg: palette.dirBg, fg: palette.fg, priority: 15 });
    }
  }

  return segments;
}

/** Render line1 in powerline style. Caller must ensure mode != 'named'. */
export function renderPowerlineLine1(ctx: RenderContext, mode: ColorMode, theme: ThemePalette | null): string {
  const palette = theme
    ? (theme.powerline ?? derivePowerlinePalette(theme))
    : DEFAULT_POWERLINE_PALETTE;
  const styleName = (ctx.config.powerline?.style ?? 'auto') as PowerlineStyleName;
  const hasNerdFont = (ctx.config.icons ?? 'nerd') === 'nerd';
  const style = resolveStyle(styleName, hasNerdFont);
  // Custom command segments need a Colors instance to apply inline fg styling
  // inside the segment text (mirroring how pace/quota colour their bodies).
  // Built with the same (mode, theme) the dispatcher uses for classic mode.
  const c = createColors(mode, theme);
  const segments = buildSegments(ctx, palette, c);
  if (segments.length === 0) return '';
  return renderPowerline(segments, style, mode, ctx.cols);
}
