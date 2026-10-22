import { describe, expect, it } from 'vitest';

import { evaluateFrameHeaders, parseFrameAncestors, probeFrameability } from '../src/Frameability';

describe('parseFrameAncestors', () => {
  it('finds the directive inside a CSP header', () => {
    expect(
      parseFrameAncestors("default-src 'self'; frame-ancestors 'none'; script-src 'self'"),
    ).toBe("'none'");
    expect(parseFrameAncestors('frame-ancestors https://example.com https://other.com')).toBe(
      'https://example.com https://other.com',
    );
  });

  it('returns undefined when the directive is missing', () => {
    expect(parseFrameAncestors("default-src 'self'")).toBeUndefined();
    expect(parseFrameAncestors(undefined)).toBeUndefined();
  });
});

describe('evaluateFrameHeaders', () => {
  it('detects X-Frame-Options', () => {
    expect(evaluateFrameHeaders({ 'x-frame-options': 'DENY' }).verdict).toBe('blocked');
    expect(evaluateFrameHeaders({ 'x-frame-options': 'SAMEORIGIN' }).verdict).toBe('blocked');
    expect(
      evaluateFrameHeaders({ 'x-frame-options': 'allow-from https://example.com' }).verdict,
    ).toBe('blocked');
  });

  it('detects frame-ancestors', () => {
    expect(
      evaluateFrameHeaders({ 'content-security-policy': "frame-ancestors 'none'" }).verdict,
    ).toBe('blocked');
    expect(
      evaluateFrameHeaders({ 'content-security-policy': "frame-ancestors 'self'" }).verdict,
    ).toBe('blocked');
    expect(
      evaluateFrameHeaders({ 'content-security-policy': 'frame-ancestors https://example.com' })
        .verdict,
    ).toBe('blocked');
    expect(evaluateFrameHeaders({ 'content-security-policy': 'frame-ancestors *' }).verdict).toBe(
      'allowed',
    );
  });

  it('reports headers without frame restrictions as allowed', () => {
    const result = evaluateFrameHeaders({ 'content-type': 'text/html' });
    expect(result.verdict).toBe('allowed');
    expect(result.detail).toContain('do not block framing');
  });

  it('explains why the page is probably refused', () => {
    const result = evaluateFrameHeaders({ 'x-frame-options': 'SAMEORIGIN' });
    expect(result.verdict).toBe('blocked');
    expect(result.detail).toContain('X-Frame-Options');
  });
});

describe('probeFrameability', () => {
  it('does not probe a URL it cannot parse', async () => {
    const result = await probeFrameability('not a url');
    expect(result.verdict).toBe('unknown');
    expect(result.detail).toContain('could not be parsed');
  });

  it('does not probe a scheme that is not http', async () => {
    const result = await probeFrameability('ftp://example.com/file');
    expect(result.verdict).toBe('unknown');
    expect(result.detail).toContain('http and https');
  });
});
