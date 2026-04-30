import { basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { getModelName } from './shared.js';
import { truncField } from './text.js';
import { hyperlink } from './hyperlink.js';
import {
  renderPowerline,
  resolveStyle,
  type PowerlineSegment,
  type PowerlineStyleName,
} from './powerline.js';
import type { ColorMode } from './colors.js';
import type { RenderContext, TranscriptData } from '../types.js';
import {
  type PowerlinePalette,
  derivePowerlinePalette,
  DEFAULT_POWERLINE_PALETTE,
  type ThemePalette,
} from '../themes.js';

function getActiveTodo(transcript: TranscriptData): string | undefined {
  const inProgress = transcript.todos.filter(t => t.status === 'in_progress');
  return inProgress[0]?.content;
}

/**
 * Build the line1 segment list for the powerline renderer. Segment priorities
 * control which get dropped first when the terminal is narrow:
 *   model:   100  (always kept)
 *   branch:   80
 *   dir:      60
 *   task:     40
 *   version:  20  (dropped first)
 */
function buildSegments(ctx: RenderContext, palette: PowerlinePalette): PowerlineSegment[] {
  const { input, git, transcript, config: { display }, icons } = ctx;
  const segments: PowerlineSegment[] = [];

  if (display.model) {
    const modelName = getModelName(input.raw.model);
    if (modelName) {
      segments.push({
        text: modelName,
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

  const activeTask = getActiveTodo(transcript);
  if (activeTask) {
    segments.push({
      text: truncField(activeTask, 30),
      bg: palette.taskBg,
      fg: palette.fg,
      priority: 40,
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
  const segments = buildSegments(ctx, palette);
  if (segments.length === 0) return '';
  return renderPowerline(segments, style, mode, ctx.cols);
}
