import { describe, it, expect } from 'vitest';
import { computeApiLatency, formatApiLatency } from '../../src/render/api-latency.js';

describe('computeApiLatency', () => {
  it('should_return_null_when_durationMs_is_undefined', () => {
    expect(computeApiLatency(undefined, 30000)).toBeNull();
  });

  it('should_return_null_when_durationMs_is_zero', () => {
    expect(computeApiLatency(0, 30000)).toBeNull();
  });

  it('should_return_null_when_apiDurationMs_is_undefined', () => {
    expect(computeApiLatency(60000, undefined)).toBeNull();
  });

  it('should_return_integer_percent_for_valid_inputs', () => {
    // 43800ms api / 60000ms total = 73%
    const result = computeApiLatency(60000, 43800);
    expect(result).toBe(73);
  });

  it('should_clamp_result_to_100_when_api_exceeds_wall_clock', () => {
    // clock skew: apiDurationMs > durationMs
    expect(computeApiLatency(60000, 70000)).toBe(100);
  });

  it('should_return_0_when_apiDurationMs_is_zero_and_durationMs_positive', () => {
    expect(computeApiLatency(60000, 0)).toBe(0);
  });

  it('should_round_fractional_percent_to_nearest_integer', () => {
    // 30100ms / 60000ms = 50.166... → rounds to 50
    expect(computeApiLatency(60000, 30100)).toBe(50);
    // 30500ms / 60000ms = 50.833... → rounds to 51
    expect(computeApiLatency(60000, 30500)).toBe(51);
  });
});

describe('formatApiLatency', () => {
  it('should_format_as_API_N_percent', () => {
    expect(formatApiLatency(73)).toBe('API 73%');
  });

  it('should_format_zero_as_API_0_percent', () => {
    expect(formatApiLatency(0)).toBe('API 0%');
  });

  it('should_format_100_as_API_100_percent', () => {
    expect(formatApiLatency(100)).toBe('API 100%');
  });
});
