#!/usr/bin/env node
/**
 * Build the README's themes-gallery composite: render `lumira themes preview
 * --all --powerline` (7 themes × 3 lines each), parse to HTML, capture via
 * chrome headless. The output drops as assets/showcase/themes-gallery.png.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
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
      let stIdx = -1;
      for (let k = i+2; k < input.length - 1; k++) {
        if (input[k] === ESC && input[k+1] === '\\') { stIdx = k; break; }
        if (input[k] === '\x07') { stIdx = k; break; }
      }
      if (stIdx === -1) { i++; continue; }
      i = stIdx + (input[stIdx] === '\x07' ? 1 : 2);
      continue;
    }
    if (ch === '\n') { flushSpan(); out += '\n'; i++; openSpanIfNeeded(); continue; }
    out += escapeHtml(ch);
    i++;
  }
  flushSpan();
  return out;
}

const env = { ...process.env, COLORTERM: 'truecolor', FORCE_HYPERLINK: '0', COLUMNS: '180' };
const ansi = execFileSync('node', [join(ROOT, 'dist', 'index.js'), 'themes', 'preview', '--all', '--powerline'], { env, encoding: 'utf8' });

const html = `<!doctype html>
<html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  html, body { margin: 0; padding: 0; }
  body {
    background: #1a1b26;
    font-family: 'JetBrains Mono', ui-monospace, Menlo, Consolas, monospace;
    font-size: 13px;
    line-height: 1.45;
    color: #c0caf5;
    padding: 24px 32px;
    display: inline-block;
  }
  pre { margin: 0; white-space: pre; }
</style></head>
<body><pre>${ansiToHtml(ansi).trimEnd()}</pre></body></html>`;

const outDir = join(ROOT, 'assets', 'showcase');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'themes-gallery.html'), html);
console.log('wrote themes-gallery.html');
