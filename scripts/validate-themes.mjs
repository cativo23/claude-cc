#!/usr/bin/env node
/**
 * Validates every registered theme's powerline palette has sufficient contrast
 * against its declared `fg` color. Uses the WCAG 2.1 relative-luminance formula
 * and requires at least the AA threshold for normal text (4.5:1).
 *
 * Exits 0 on success, 1 on any failure. Used in CI for theme-PR jobs.
 *
 * Run locally: node scripts/validate-themes.mjs
 */

import { THEMES, THEME_METADATA } from '../dist/themes/index.js';

const THRESHOLD_AA = 4.5;

const POWERLINE_BG_KEYS = [
  'modelBg',
  'dirBg',
  'branchCleanBg',
  'branchDirtyBg',
  'taskBg',
  'versionBg',
];

/** sRGB component (0..255) → linear in [0..1]. */
function linearize(c8) {
  const c = c8 / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function luminance({ r, g, b }) {
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

function contrastRatio(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

function fmtRgb({ r, g, b }) {
  return `rgb(${r},${g},${b})`;
}

let failed = 0;
const themeNames = Object.keys(THEMES);

console.log(`Validating ${themeNames.length} theme${themeNames.length === 1 ? '' : 's'} against WCAG AA (≥${THRESHOLD_AA}:1)\n`);

for (const name of themeNames) {
  const theme = THEMES[name];
  const meta = THEME_METADATA[name];
  const pl = theme.powerline;
  if (!pl) {
    console.log(`  ${name}  (no powerline palette — skipping)`);
    continue;
  }
  let themeFailed = false;
  const lines = [];
  const fg = pl.fg;
  if (!fg || typeof fg.r !== 'number' || typeof fg.g !== 'number' || typeof fg.b !== 'number') {
    console.log(`  ✗ ${name}  (${meta?.mode ?? '?'})`);
    console.log(`    ✗ fg              MISSING or malformed (expected { r, g, b })`);
    failed++;
    continue;
  }
  for (const key of POWERLINE_BG_KEYS) {
    const bg = pl[key];
    if (!bg || typeof bg.r !== 'number' || typeof bg.g !== 'number' || typeof bg.b !== 'number') {
      themeFailed = true;
      lines.push(`    ✗ ${key.padEnd(15)} MISSING or malformed (expected { r, g, b })`);
      continue;
    }
    const ratio = contrastRatio(fg, bg);
    const pass = ratio >= THRESHOLD_AA;
    if (!pass) themeFailed = true;
    lines.push(
      `    ${pass ? '✓' : '✗'} ${key.padEnd(15)} ${fmtRgb(bg).padEnd(20)} → ${ratio.toFixed(2)}:1`
    );
  }
  console.log(`  ${themeFailed ? '✗' : '✓'} ${name}  (${meta?.mode ?? '?'})`);
  if (themeFailed) {
    for (const l of lines) console.log(l);
    failed++;
  }
}

console.log();
if (failed > 0) {
  console.error(`FAIL: ${failed}/${themeNames.length} theme(s) below WCAG AA contrast (${THRESHOLD_AA}:1).`);
  console.error('Fix the failing bg values in src/themes/<name>.ts and re-run.');
  process.exit(1);
}
console.log(`OK: all ${themeNames.length} theme(s) meet WCAG AA (≥${THRESHOLD_AA}:1) on every powerline cell.`);
