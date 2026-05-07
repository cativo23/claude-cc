import { describe, it, expect } from 'vitest';
import { homedir } from 'node:os';
import { getMcpInfo, type McpReader } from '../../src/parsers/mcp.js';

function makeReader(files: Record<string, string>): McpReader {
  return {
    existsSync: (p: string) => p in files,
    readFileSync: (p: string) => {
      if (!(p in files)) throw new Error(`readFileSync called for unregistered path: ${p}`);
      return files[p]!;
    },
  };
}

describe('getMcpInfo', () => {
  it('returns null when no .mcp.json files exist', () => {
    expect(getMcpInfo('/project', makeReader({}))).toBeNull();
  });

  it('reads servers from cwd .mcp.json', () => {
    const reader = makeReader({
      '/project/.mcp.json': JSON.stringify({
        mcpServers: { 'my-server': { command: 'node', args: ['server.js'] } },
      }),
    });
    const result = getMcpInfo('/project', reader);
    expect(result).not.toBeNull();
    expect(result!.servers).toHaveLength(1);
    expect(result!.servers[0].name).toBe('my-server');
    expect(result!.servers[0].status).toBe('ok');
  });

  it('deduplicates servers across files', () => {
    const content = JSON.stringify({ mcpServers: { 'shared-server': { command: 'node' } } });
    const reader = makeReader({
      '/project/.mcp.json': content,
      [`${homedir()}/.claude/.mcp.json`]: content, // homedir() matches what getMcpInfo uses
    });
    const result = getMcpInfo('/project', reader);
    expect(result!.servers).toHaveLength(1);
  });

  it('handles malformed JSON gracefully', () => {
    const reader = makeReader({ '/project/.mcp.json': 'not valid json' });
    expect(getMcpInfo('/project', reader)).toBeNull();
  });

  it('handles missing mcpServers key', () => {
    const reader = makeReader({
      '/project/.mcp.json': JSON.stringify({ other: 'data' }),
    });
    expect(getMcpInfo('/project', reader)).toBeNull();
  });

  it('ignores mcpServers when it is an array (not a plain object)', () => {
    const reader = makeReader({
      '/project/.mcp.json': JSON.stringify({ mcpServers: ['server1', 'server2'] }),
    });
    expect(getMcpInfo('/project', reader)).toBeNull();
  });

  it('ignores mcpServers when it is a string', () => {
    const reader = makeReader({
      '/project/.mcp.json': JSON.stringify({ mcpServers: 'server1' }),
    });
    expect(getMcpInfo('/project', reader)).toBeNull();
  });

  it('ignores mcpServers when it is null', () => {
    const reader = makeReader({
      '/project/.mcp.json': JSON.stringify({ mcpServers: null }),
    });
    expect(getMcpInfo('/project', reader)).toBeNull();
  });
});
