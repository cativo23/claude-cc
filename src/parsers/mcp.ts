import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { McpInfo, McpServerInfo } from '../types.js';
import { debug } from '../utils/debug.js';

const log = debug('mcp');

/**
 * Read MCP server configurations from .mcp.json files.
 * Checks both cwd and ~/.claude/ for server definitions.
 */
export function getMcpInfo(cwd: string): McpInfo | null {
  const servers: McpServerInfo[] = [];

  const paths = [
    join(cwd, '.mcp.json'),
    join(homedir(), '.claude', '.mcp.json'),
  ];

  for (const p of paths) {
    if (!existsSync(p)) continue;
    try {
      const raw = JSON.parse(readFileSync(p, 'utf8'));
      const mcpServers = raw?.mcpServers ?? {};
      const added: string[] = [];
      for (const name of Object.keys(mcpServers)) {
        // Avoid duplicates if same server in both files
        if (servers.some(s => s.name === name)) continue;
        servers.push({ name, status: 'ok' });
        added.push(name);
      }
      // SECURITY: only log server names. `raw.mcpServers[name]` values contain
      // `env` / `args` which often carry API tokens — never log the raw object.
      if (log.enabled && added.length > 0) log('loaded from', p, added);
    } catch (err) {
      log('malformed JSON:', p, (err as Error).message);
    }
  }

  if (servers.length === 0) return null;
  return { servers };
}
