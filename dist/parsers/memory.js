import { totalmem, freemem, platform } from 'node:os';
import { execFileSync } from 'node:child_process';
const defaultReader = {
    platform,
    totalmem,
    freemem,
    vmStat: () => execFileSync('vm_stat', [], { encoding: 'utf8', timeout: 2000 }),
};
export function getMemoryInfo(reader = defaultReader) {
    try {
        if (reader.platform() === 'darwin') {
            const output = reader.vmStat();
            const psMatch = output.match(/page size of (\d+) bytes/);
            const ps = psMatch ? parseInt(psMatch[1], 10) : 4096;
            const active = output.match(/Pages active:\s+(\d+)/);
            const wired = output.match(/Pages wired down:\s+(\d+)/);
            const compressed = output.match(/Pages occupied by compressor:\s+(\d+)/);
            if (!active || !wired)
                return null;
            const usedBytes = (parseInt(active[1], 10) + parseInt(wired[1], 10) + (compressed ? parseInt(compressed[1], 10) : 0)) * ps;
            const totalBytes = reader.totalmem();
            if (totalBytes <= 0)
                return null;
            return { usedBytes, totalBytes, percentage: Math.min(100, Math.max(0, Math.round((usedBytes / totalBytes) * 100))) };
        }
        const totalBytes = reader.totalmem();
        if (totalBytes <= 0)
            return null;
        const usedBytes = totalBytes - reader.freemem();
        return { usedBytes, totalBytes, percentage: Math.min(100, Math.max(0, Math.round((usedBytes / totalBytes) * 100))) };
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=memory.js.map