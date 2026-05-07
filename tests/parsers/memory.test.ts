import { describe, it, expect } from 'vitest';
import { getMemoryInfo, type MemoryReader } from '../../src/parsers/memory.js';

const linuxReader = (totalBytes: number, freeBytes: number): MemoryReader => ({
  platform: () => 'linux',
  totalmem: () => totalBytes,
  freemem: () => freeBytes,
  vmStat: () => { throw new Error('vm_stat not available on linux'); },
});

const darwinReader = (vmStatOutput: string, totalBytes: number = 16 * 1024 * 1024 * 1024): MemoryReader => ({
  platform: () => 'darwin',
  totalmem: () => totalBytes,
  freemem: () => 0,
  vmStat: () => vmStatOutput,
});

describe('getMemoryInfo (linux/non-darwin path)', () => {
  it('computes percentage from totalmem - freemem', () => {
    const info = getMemoryInfo(linuxReader(16_000_000_000, 4_000_000_000));
    expect(info).not.toBeNull();
    expect(info!.totalBytes).toBe(16_000_000_000);
    expect(info!.usedBytes).toBe(12_000_000_000);
    expect(info!.percentage).toBe(75);
  });

  it('returns null when totalmem reports 0', () => {
    expect(getMemoryInfo(linuxReader(0, 0))).toBeNull();
  });

  it('returns null when totalmem is negative (degenerate)', () => {
    expect(getMemoryInfo(linuxReader(-1, 0))).toBeNull();
  });

  it('clamps percentage to [0,100] when freemem > totalmem (degenerate kernel)', () => {
    const info = getMemoryInfo(linuxReader(8_000_000_000, 10_000_000_000));
    expect(info!.percentage).toBe(0);
  });

  it('returns null when reader throws', () => {
    const reader: MemoryReader = {
      platform: () => 'linux',
      totalmem: () => { throw new Error('boom'); },
      freemem: () => 0,
      vmStat: () => '',
    };
    expect(getMemoryInfo(reader)).toBeNull();
  });
});

describe('getMemoryInfo (darwin path)', () => {
  const darwinSample = `Mach Virtual Memory Statistics: (page size of 16384 bytes)
Pages free:                          12345.
Pages active:                        100000.
Pages inactive:                       50000.
Pages speculative:                     1000.
Pages throttled:                          0.
Pages wired down:                     50000.
Pages purgeable:                       2000.
Pages occupied by compressor:         20000.
`;

  it('computes used bytes from active + wired + compressed pages', () => {
    const total = 16 * 1024 * 1024 * 1024;
    const info = getMemoryInfo(darwinReader(darwinSample, total));
    expect(info).not.toBeNull();
    expect(info!.usedBytes).toBe(170000 * 16384);
    expect(info!.totalBytes).toBe(total);
    expect(info!.percentage).toBe(Math.round((170000 * 16384 / total) * 100));
  });

  it('falls back to 4096 page size when vm_stat header is missing', () => {
    const noHeader = `Pages active: 100.\nPages wired down: 100.\n`;
    const info = getMemoryInfo(darwinReader(noHeader));
    expect(info!.usedBytes).toBe(200 * 4096);
  });

  it('treats missing compressed-pages line as 0 (older macOS)', () => {
    const noCompressed = `page size of 16384 bytes\nPages active:                        1000.\nPages wired down:                     1000.\n`;
    const info = getMemoryInfo(darwinReader(noCompressed));
    expect(info!.usedBytes).toBe(2000 * 16384);
  });

  it('returns null when active pages line is missing', () => {
    expect(getMemoryInfo(darwinReader('page size of 16384 bytes\nPages wired down: 100.\n'))).toBeNull();
  });

  it('returns null when wired pages line is missing', () => {
    expect(getMemoryInfo(darwinReader('page size of 16384 bytes\nPages active: 100.\n'))).toBeNull();
  });

  it('returns null when vmStat throws (vm_stat binary missing)', () => {
    const reader: MemoryReader = {
      platform: () => 'darwin',
      totalmem: () => 16 * 1024 * 1024 * 1024,
      freemem: () => 0,
      vmStat: () => { throw new Error('ENOENT: vm_stat not found'); },
    };
    expect(getMemoryInfo(reader)).toBeNull();
  });

  it('returns null when totalmem is 0 on darwin', () => {
    expect(getMemoryInfo(darwinReader(darwinSample, 0))).toBeNull();
  });
});
