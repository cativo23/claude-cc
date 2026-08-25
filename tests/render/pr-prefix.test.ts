import { describe, it, expect } from 'vitest';
import { getPrPrefix } from '../../src/render/shared.js';

describe('getPrPrefix', () => {
  it('returns # for a github.com PR url', () => {
    expect(getPrPrefix('https://github.com/org/repo/pull/174')).toBe('#');
  });

  it('returns ! for a gitlab.com merge request url', () => {
    expect(getPrPrefix('https://gitlab.com/org/repo/-/merge_requests/42')).toBe('!');
  });

  it('returns ! for a self-hosted gitlab instance', () => {
    expect(getPrPrefix('https://gitlab.mycompany.com/org/repo/-/merge_requests/7')).toBe('!');
  });

  it('defaults to # when url is absent', () => {
    expect(getPrPrefix(undefined)).toBe('#');
  });

  it('defaults to # for an unrecognized host', () => {
    expect(getPrPrefix('https://bitbucket.org/org/repo/pull-requests/1')).toBe('#');
  });

  it('defaults to # for a malformed url', () => {
    expect(getPrPrefix('not-a-url')).toBe('#');
  });
});
