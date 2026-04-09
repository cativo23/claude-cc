import { totalmem, freemem, platform } from 'node:os';
import { execFileSync } from 'node:child_process';
import type { MemoryInfo } from '../types.js';

export function getMemoryInfo(): MemoryInfo | null {
  try {
    if (platform() === 'darwin') {
      const output = execFileSync('vm_stat', [], { encoding: 'utf8', timeout: 2000 });
      const psMatch = output.match(/page size of (\d+) bytes/);
      const ps = psMatch ? parseInt(psMatch[1], 10) : 16384;
      const active = output.match(/Pages active:\s+(\d+)/);
      const wired = output.match(/Pages wired down:\s+(\d+)/);
      const compressed = output.match(/Pages occupied by compressor:\s+(\d+)/);
      if (!active || !wired) return null;
      const usedBytes = (parseInt(active[1], 10) + parseInt(wired[1], 10) + (compressed ? parseInt(compressed[1], 10) : 0)) * ps;
      const totalBytes = totalmem();
      return { usedBytes, totalBytes, percentage: Math.min(100, Math.max(0, Math.round((usedBytes / totalBytes) * 100))) };
    }
    const totalBytes = totalmem();
    if (totalBytes <= 0) return null;
    const usedBytes = totalBytes - freemem();
    return { usedBytes, totalBytes, percentage: Math.min(100, Math.max(0, Math.round((usedBytes / totalBytes) * 100))) };
  } catch { return null; }
}
