#!/usr/bin/env node
/**
 * Generate the three statusline mode screenshots referenced by the README's
 * Display section: Custom (full multiline), Minimal (singleline), Powerline.
 *
 * Pipeline: synthesize a stdin payload, render via lumira with the right
 * config, parse ANSI to HTML, capture via chrome headless, auto-trim.
 */

import { writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const ESC = '\x1b';

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function ansiToHtml(input) {
  let out = '', i = 0, fg = null, bg = null, dim = false, openSpan = false;
  const flushSpan = () => { if (openSpan) { out += '</span>'; openSpan = false; } };
  const openSpanIfNeeded = () => {
    flushSpan();
    const styles = [];
    if (fg) styles.push(`color:${fg}`);
    if (bg) styles.push(`background:${bg}`);
    if (dim) styles.push('opacity:0.55');
    if (styles.length) { out += `<span style="${styles.join(';')}">`; openSpan = true; }
  };
  while (i < input.length) {
    const ch = input[i];
    if (ch === ESC && input[i+1] === '[') {
      const end = input.indexOf('m', i+2);
      if (end === -1) { i++; continue; }
      const params = input.slice(i+2, end).split(';').map(p => parseInt(p, 10));
      let j = 0;
      while (j < params.length) {
        const p = params[j];
        if (p === 0 || isNaN(p)) { fg = null; bg = null; dim = false; j++; }
        else if (p === 2) { dim = true; j++; }
        else if (p === 22) { dim = false; j++; }
        else if (p === 39) { fg = null; j++; }
        else if (p === 49) { bg = null; j++; }
        else if (p === 90) { fg = 'rgb(86,95,137)'; j++; }
        else if (p === 38 && params[j+1] === 2) {
          fg = `rgb(${params[j+2]||0},${params[j+3]||0},${params[j+4]||0})`;
          j += 5;
        }
        else if (p === 48 && params[j+1] === 2) {
          bg = `rgb(${params[j+2]||0},${params[j+3]||0},${params[j+4]||0})`;
          j += 5;
        }
        else { j++; }
      }
      openSpanIfNeeded();
      i = end + 1;
      continue;
    }
    if (ch === ESC && input[i+1] === ']') {
      // OSC sequences (hyperlinks) — skip
      let stIdx = -1;
      for (let k = i+2; k < input.length - 1; k++) {
        if (input[k] === ESC && input[k+1] === '\\') { stIdx = k; break; }
        if (input[k] === '\x07') { stIdx = k; break; }
      }
      if (stIdx === -1) { i++; continue; }
      i = stIdx + (input[stIdx] === '\x07' ? 1 : 2);
      continue;
    }
    if (ch === '\n') {
      flushSpan(); out += '\n'; i++; openSpanIfNeeded(); continue;
    }
    out += escapeHtml(ch);
    i++;
  }
  flushSpan();
  return out;
}

function wrapHtml(title, body) {
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  html, body { margin: 0; padding: 0; }
  body {
    background: #1a1b26;
    font-family: 'JetBrains Mono', ui-monospace, Menlo, Consolas, monospace;
    font-size: 14px;
    line-height: 1.45;
    color: #c0caf5;
    padding: 28px 36px;
    display: inline-block;
    white-space: pre;
  }
</style></head>
<body><pre style="margin:0">${body}</pre></body></html>`;
}

const CONFIGS = {
  'mode-custom': {
    config: { preset: 'full', layout: 'multiline', theme: 'tokyo-night', style: 'classic', gsd: false },
  },
  'mode-minimal': {
    config: { preset: 'minimal', layout: 'singleline', theme: 'tokyo-night', style: 'classic', gsd: false },
  },
  'mode-powerline': {
    config: { preset: 'full', layout: 'multiline', theme: 'tokyo-night', style: 'powerline', powerline: { style: 'arrow' }, gsd: false },
  },
};

// Hand-crafted transcript so the tools/todos line is reproducible. Lumira
// gates transcript_path to $HOME or /tmp roots — we copy into /tmp at build
// time so the file is reachable from the temp HOME we set per run.
import { copyFileSync as _copy } from 'node:fs';
const TRANSCRIPT_SRC_REPO = join(ROOT, 'assets', 'showcase', 'demo-transcript.jsonl');
const TRANSCRIPT_SOURCE = '/tmp/lumira-display-transcript.jsonl';
_copy(TRANSCRIPT_SRC_REPO, TRANSCRIPT_SOURCE);

function makePayload() {
  return {
    session_id: 'demo',
    cwd: '/home/dev/projects/my-project',
    transcript_path: existsSync(TRANSCRIPT_SOURCE) ? TRANSCRIPT_SOURCE : '/dev/null',
    session_name: 'Fix the bug',
    model: { id: 'claude-opus-4-7[1m]', display_name: 'Opus 4.6 (1M context)' },
    workspace: { current_dir: '/home/dev/projects/my-project', project_dir: '/home/dev/projects/my-project' },
    version: '2.1.92',
    output_style: { name: 'default' },
    cost: {
      total_cost_usd: 1.31,
      total_duration_ms: 35 * 60 * 1000 + 6 * 1000,
      total_api_duration_ms: 2 * 60 * 1000,
      total_lines_added: 150,
      total_lines_removed: 30,
    },
    context_window: {
      total_input_tokens: 131000,
      total_output_tokens: 25000,
      context_window_size: 1000000,
      current_usage: { input_tokens: 1, output_tokens: 142, cache_creation_input_tokens: 1272, cache_read_input_tokens: 130000 },
      used_percentage: 21,
      remaining_percentage: 79,
    },
  };
}

function renderWithConfig(payloadJson, configObj, cols = 130) {
  const tmpHome = `/tmp/lumira-display-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const cfgDir = `${tmpHome}/.config/lumira`;
  mkdirSync(cfgDir, { recursive: true });
  writeFileSync(`${cfgDir}/config.json`, JSON.stringify(configObj));
  const env = { ...process.env, HOME: tmpHome, COLORTERM: 'truecolor', FORCE_HYPERLINK: '0', COLUMNS: String(cols) };
  try {
    return execFileSync('node', [join(ROOT, 'dist', 'index.js')], { input: payloadJson, env, encoding: 'utf8' });
  } finally {
    rmSync(tmpHome, { recursive: true, force: true });
  }
}

const OUT = join(ROOT, 'assets', 'showcase');
mkdirSync(OUT, { recursive: true });

const payload = JSON.stringify(makePayload());

for (const [name, { config }] of Object.entries(CONFIGS)) {
  const cols = name === 'mode-minimal' ? 80 : 130;
  const ansi = renderWithConfig(payload, config, cols);
  const html = wrapHtml(`lumira — ${name}`, ansiToHtml(ansi).trimEnd());
  writeFileSync(join(OUT, `${name}.html`), html);
  console.log(`wrote ${name}.html`);
}

console.log('Done. Run scripts/capture-display.sh to render the HTML to PNG.');
