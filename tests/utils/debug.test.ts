import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { debug } from '../../src/utils/debug.js';

describe('debug', () => {
  let originalEnv: string | undefined;
  let writeSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    originalEnv = process.env['LUMIRA_DEBUG'];
    writeSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    if (originalEnv === undefined) delete process.env['LUMIRA_DEBUG'];
    else process.env['LUMIRA_DEBUG'] = originalEnv;
    writeSpy.mockRestore();
  });

  it('is silent when LUMIRA_DEBUG is unset', () => {
    delete process.env['LUMIRA_DEBUG'];
    const log = debug('test');
    expect(log.enabled).toBe(false);
    log('hello', { a: 1 });
    expect(writeSpy).not.toHaveBeenCalled();
  });

  it('is silent for falsy string values (0, false, empty, no, off, case-insensitive)', () => {
    for (const v of ['0', 'false', '', 'FALSE', 'no', 'NO', 'off', 'Off']) {
      process.env['LUMIRA_DEBUG'] = v;
      const log = debug('test');
      expect(log.enabled).toBe(false);
      log('should not write');
    }
    expect(writeSpy).not.toHaveBeenCalled();
  });

  it('writes to stderr when LUMIRA_DEBUG=1', () => {
    process.env['LUMIRA_DEBUG'] = '1';
    const log = debug('transcript');
    expect(log.enabled).toBe(true);
    log('hello world');
    expect(writeSpy).toHaveBeenCalledTimes(1);
    const output = writeSpy.mock.calls[0][0] as string;
    expect(output).toContain('[lumira:transcript]');
    expect(output).toContain('hello world');
    expect(output.endsWith('\n')).toBe(true);
  });

  it('serializes objects via JSON.stringify', () => {
    process.env['LUMIRA_DEBUG'] = '1';
    const log = debug('ns');
    log('parsed', { tools: 5, durationMs: 12 });
    const output = writeSpy.mock.calls[0][0] as string;
    expect(output).toContain('{"tools":5,"durationMs":12}');
  });

  it('annotates unserializable values explicitly', () => {
    process.env['LUMIRA_DEBUG'] = '1';
    const log = debug('ns');
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    log(circular);
    const output = writeSpy.mock.calls[0][0] as string;
    // Explicit marker so a genuine serialization bug doesn't degrade silently.
    expect(output).toContain('<unserializable:');
  });

  it('accepts any truthy value outside the denylist', () => {
    for (const v of ['1', 'true', 'anything']) {
      process.env['LUMIRA_DEBUG'] = v;
      const log = debug('ns');
      expect(log.enabled).toBe(true);
    }
  });
});
