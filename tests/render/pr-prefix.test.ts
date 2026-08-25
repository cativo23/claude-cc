import { describe, it, expect } from 'vitest';
import { getPrPrefix } from '../../src/render/shared.js';

describe('getPrPrefix', () => {
  it('returns # for a github.com PR url', () => {
    expect(getPrPrefix('https://github.com/org/repo/pull/174')).toBe('#');
  });

  it('returns ! for a gitlab.com merge request url', () => {
    expect(getPrPrefix('https://gitlab.com/org/repo/-/merge_requests/42')).toBe('!');
  });

  it('returns ! for a self-hosted gitlab instance branded "gitlab"', () => {
    expect(getPrPrefix('https://gitlab.mycompany.com/org/repo/-/merge_requests/7')).toBe('!');
  });

  it('returns ! for a self-hosted instance with no "gitlab" in the hostname, based on path shape', () => {
    expect(getPrPrefix('https://git.mycompany.com/org/repo/-/merge_requests/7')).toBe('!');
  });

  it('does not false-positive on an unrelated host that contains "gitlab" in its name', () => {
    // e.g. a GitHub Pages project site — hostname contains "gitlab" but the
    // path shape is GitHub's, so the path check must win over any hostname guess.
    expect(getPrPrefix('https://gitlab.github.io/org/repo/pull/3')).toBe('#');
  });

  it('defaults to # when url is absent', () => {
    expect(getPrPrefix(undefined)).toBe('#');
  });

  it('defaults to # for an unrecognized host and path shape', () => {
    expect(getPrPrefix('https://bitbucket.org/org/repo/pull-requests/1')).toBe('#');
  });

  it('falls back to a gitlab.com hostname check when the path shape is non-standard', () => {
    expect(getPrPrefix('https://gitlab.com/org/repo')).toBe('!');
  });

  it('defaults to # for a malformed url', () => {
    expect(getPrPrefix('not-a-url')).toBe('#');
  });
});
