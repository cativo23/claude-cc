#!/usr/bin/env node
// Runs via "npm version" lifecycle hook — keeps .claude-plugin/*.json in sync with package.json
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const version = pkg.version;

for (const file of ['plugin.json', 'marketplace.json']) {
  const path = resolve(root, '.claude-plugin', file);
  const json = JSON.parse(readFileSync(path, 'utf8'));

  json.version = version;
  if (json.plugins) {
    for (const p of json.plugins) p.version = version;
  }
  if (json.metadata) json.metadata.version = version;

  writeFileSync(path, JSON.stringify(json, null, 2) + '\n');
  console.log(`bumped .claude-plugin/${file} → ${version}`);
}
