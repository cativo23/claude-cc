import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import type { GsdInfo } from '../types.js';

export function getGsdInfo(session: string, claudeDir: string = join(process.env['CLAUDE_CONFIG_DIR'] || join(homedir(), '.claude'))): GsdInfo | null {
  let updateAvailable = false;
  let currentTask: string | undefined;

  const cacheFile = join(claudeDir, 'cache', 'gsd-update-check.json');
  if (existsSync(cacheFile)) { try { if (JSON.parse(readFileSync(cacheFile, 'utf8')).update_available) updateAvailable = true; } catch {} }

  const todosDir = join(claudeDir, 'todos');
  if (session && existsSync(todosDir)) {
    try {
      const sanitized = (session || '').replace(/[^\w-]/g, '');
      const files = readdirSync(todosDir).filter(f => f.startsWith(sanitized) && f.includes('-agent-') && f.endsWith('.json'))
        .map(f => ({ name: f, mtime: statSync(join(todosDir, f)).mtime })).sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
      if (files.length > 0) {
        const todoPath = join(todosDir, files[0].name);
        if (!resolve(todoPath).startsWith(resolve(todosDir))) return null;
        const todos = JSON.parse(readFileSync(resolve(todoPath), 'utf8'));
        const ip = todos.find((t: { status: string; activeForm?: string }) => t.status === 'in_progress');
        if (ip?.activeForm) currentTask = ip.activeForm;
      }
    } catch {}
  }

  if (!updateAvailable && !currentTask) return null;
  return { updateAvailable, currentTask };
}
