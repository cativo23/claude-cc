#!/usr/bin/env node
// Build the README hero shots: tokyo-night + classic, 5:2 (wide README inline)
// and 16:9 (GitHub social preview). Two HTML files → captured to PNG via
// scripts/capture-hero.sh.

import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
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
  let out = '';
  let i = 0;
  let fg = null, bg = null, dim = false;
  let openSpan = false;

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
        else if (p === 90) { fg = 'rgb(86,95,137)'; j++; } // bright black ≈ tokyo comment
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
    if (ch === '\n') {
      flushSpan();
      out += '\n';
      i++;
      openSpanIfNeeded();
      continue;
    }
    out += escapeHtml(ch);
    i++;
  }
  flushSpan();
  return out;
}

function wrapHtml({ title, body, aspectW, aspectH, basePx }) {
  // basePx = total content height target. Width derived from aspect ratio.
  const widthPx = Math.round(basePx * (aspectW / aspectH));
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  html, body { margin: 0; padding: 0; }
  body {
    width: ${widthPx}px;
    height: ${basePx}px;
    background: #1a1b26;
    font-family: 'JetBrains Mono', ui-monospace, Menlo, Consolas, monospace;
    color: #c0caf5;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }
  .frame {
    display: inline-block;
  }
  .label {
    font-size: 13px;
    color: #565f89;
    letter-spacing: 0.04em;
    margin-bottom: 14px;
  }
  .label .name { color: #7aa2f7; font-weight: 500; }
  pre {
    margin: 0;
    white-space: pre;
    font-size: 14px;
    line-height: 1.55;
    color: #c0caf5;
  }
</style></head>
<body>
<div class="frame">
  <div class="label"><span class="name">lumira</span> · statusline for Claude Code · tokyo-night</div>
  <pre>${body}</pre>
</div>
</body></html>`;
}

const env = { ...process.env, COLORTERM: 'truecolor', FORCE_HYPERLINK: '0' };

function renderTokyoNight() {
  const raw = execFileSync(
    'node',
    ['dist/index.js', 'themes', 'preview', 'tokyo-night'],
    { env, cwd: ROOT, encoding: 'utf8' }
  );
  // strip the "── tokyo-night" header line (first line)
  const lines = raw.split('\n');
  while (lines.length && !lines[0].includes(ESC + '[')) lines.shift();
  return lines.join('\n').trimEnd();
}

const ansi = renderTokyoNight();
const body = ansiToHtml(ansi);

const outDir = join(ROOT, 'assets', 'showcase');
mkdirSync(outDir, { recursive: true });

const variants = [
  // Generous canvas; capture-hero.sh trims to content + fixed margin.
  { name: 'hero-5-2', aspectW: 1280, aspectH: 600, basePx: 600 },
  { name: 'hero-16-9', aspectW: 1280, aspectH: 800, basePx: 800 },
];

for (const v of variants) {
  const html = wrapHtml({ title: `lumira — hero ${v.aspectW}:${v.aspectH}`, body, ...v });
  const file = join(outDir, `${v.name}.html`);
  writeFileSync(file, html);
  console.log(`wrote ${file}  (${Math.round(v.basePx*v.aspectW/v.aspectH)}x${v.basePx})`);
}
console.log('done');
