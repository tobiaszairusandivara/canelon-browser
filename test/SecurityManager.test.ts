import { describe, expect, it } from 'vitest';

import {
  buildFrameSrc,
  buildSearchUrl,
  classifyInput,
  isAllowedByPolicy,
  matchesAllowlistPattern,
  parseAllowlistPattern,
  parseHttpUrl,
  resolveTarget,
  toCspSources,
} from '../src/SecurityManager';

describe('parseHttpUrl', () => {
  it('accepts http and https URLs', () => {
    expect(parseHttpUrl('https://example.com').ok).toBe(true);
    expect(parseHttpUrl('http://example.com/path?q=1').ok).toBe(true);
  });

  it('rejects non web schemes', () => {
    for (const input of [
      'ftp://example.com',
      'file:///etc/passwd',
      'javascript:alert(1)',
      'data:text/html,<h1>hi</h1>',
      'mailto:someone@example.com',
      'ws://example.com',
    ]) {
      const result = parseHttpUrl(input);
      expect(result.ok, input).toBe(false);
      expect(result.reason, input).toBeTypeOf('string');
    }
  });

  it('rejects malformed URLs', () => {
    for (const input of [
      '',
      '   ',
      'http://',
      'https://',
      'http://exa mple.com',
      ':::',
      'http://[bad',
    ]) {
      expect(parseHttpUrl(input).ok, input).toBe(false);
    }
  });

  it('rejects URLs without a host', () => {
    expect(parseHttpUrl('file:///etc/passwd').ok).toBe(false);
    expect(parseHttpUrl('http://').ok).toBe(false);
  });
});

describe('parseAllowlistPattern', () => {
  it('parses a bare host with both schemes', () => {
    const pattern = parseAllowlistPattern('example.com');
    expect(pattern?.schemes).toEqual(['http:', 'https:']);
    expect(pattern?.host).toBe('example.com');
    expect(pattern?.wildcardHost).toBe(false);
  });

  it('parses a host and a port', () => {
    const pattern = parseAllowlistPattern('localhost:3000');
    expect(pattern?.host).toBe('localhost');
    expect(pattern?.port).toBe('3000');
  });

  it('parses a port wildcard', () => {
    const pattern = parseAllowlistPattern('localhost:*');
    expect(pattern?.port).toBe('*');
  });

  it('parses a wildcard host', () => {
    const pattern = parseAllowlistPattern('*.internal.company.com');
    expect(pattern?.wildcardHost).toBe(true);
    expect(pattern?.host).toBe('internal.company.com');
  });

  it('parses a scheme and a path prefix', () => {
    const pattern = parseAllowlistPattern('https://docs.python.org/*');
    expect(pattern?.schemes).toEqual(['https:']);
    expect(pattern?.host).toBe('docs.python.org');
    expect(pattern?.pathPrefix).toBe('/*');
  });

  it('rejects unsupported schemes and empty patterns', () => {
    expect(parseAllowlistPattern('ftp://example.com')).toBeUndefined();
    expect(parseAllowlistPattern('javascript:alert(1)')).toBeUndefined();
    expect(parseAllowlistPattern('   ')).toBeUndefined();
    expect(parseAllowlistPattern('/only/a/path')).toBeUndefined();
  });
});

describe('matchesAllowlistPattern', () => {
  it('matches a wildcard host on subdomains and on the apex', () => {
    expect(
      matchesAllowlistPattern(
        new URL('https://wiki.internal.company.com'),
        '*.internal.company.com',
      ),
    ).toBe(true);
    expect(
      matchesAllowlistPattern(new URL('https://internal.company.com'), '*.internal.company.com'),
    ).toBe(true);
    expect(matchesAllowlistPattern(new URL('https://evil.com'), '*.internal.company.com')).toBe(
      false,
    );
    expect(
      matchesAllowlistPattern(new URL('https://notinternal.company.com'), '*.internal.company.com'),
    ).toBe(false);
  });

  it('matches an exact host only', () => {
    expect(matchesAllowlistPattern(new URL('https://docs.python.org/3'), 'docs.python.org')).toBe(
      true,
    );
    expect(matchesAllowlistPattern(new URL('https://blog.python.org/3'), 'docs.python.org')).toBe(
      false,
    );
  });

  it('matches any port with a port wildcard', () => {
    expect(matchesAllowlistPattern(new URL('http://localhost:3000'), 'localhost:*')).toBe(true);
    expect(matchesAllowlistPattern(new URL('http://localhost:65535'), 'localhost:*')).toBe(true);
    expect(matchesAllowlistPattern(new URL('http://example.com:8080'), 'localhost:*')).toBe(false);
  });

  it('matches only the exact port when one is given', () => {
    expect(matchesAllowlistPattern(new URL('http://localhost:3000'), 'localhost:3000')).toBe(true);
    expect(matchesAllowlistPattern(new URL('http://localhost:3001'), 'localhost:3000')).toBe(false);
  });

  it('honours the scheme of the pattern', () => {
    expect(
      matchesAllowlistPattern(new URL('https://docs.python.org/3'), 'https://docs.python.org/*'),
    ).toBe(true);
    expect(
      matchesAllowlistPattern(new URL('http://docs.python.org/3'), 'https://docs.python.org/*'),
    ).toBe(false);
  });

  it('honours the path prefix of the pattern', () => {
    expect(
      matchesAllowlistPattern(
        new URL('https://docs.python.org/3/tutorial'),
        'https://docs.python.org/3/*',
      ),
    ).toBe(true);
    expect(
      matchesAllowlistPattern(
        new URL('https://docs.python.org/blog'),
        'https://docs.python.org/3/*',
      ),
    ).toBe(false);
  });

  it('treats a trailing wildcard as "any path"', () => {
    expect(
      matchesAllowlistPattern(new URL('https://docs.python.org/blog'), 'https://docs.python.org/*'),
    ).toBe(true);
  });

  it('accepts both schemes when the pattern has none', () => {
    expect(matchesAllowlistPattern(new URL('http://example.com'), 'example.com')).toBe(true);
    expect(matchesAllowlistPattern(new URL('https://example.com'), 'example.com')).toBe(true);
  });
});

describe('isAllowedByPolicy', () => {
  const allowlist = ['*.internal.company.com', 'localhost:*'];

  it('allows everything in the open policy', () => {
    expect(isAllowedByPolicy(new URL('https://example.com'), allowlist, 'open').allowed).toBe(true);
  });

  it('still refuses non web schemes in the open policy', () => {
    expect(isAllowedByPolicy(new URL('file:///etc/passwd'), allowlist, 'open').allowed).toBe(false);
  });

  it('only allows allowlisted URLs in the strict policy', () => {
    expect(
      isAllowedByPolicy(new URL('https://wiki.internal.company.com'), allowlist, 'strict').allowed,
    ).toBe(true);
    expect(isAllowedByPolicy(new URL('http://localhost:3000'), allowlist, 'strict').allowed).toBe(
      true,
    );
    expect(isAllowedByPolicy(new URL('https://example.com'), allowlist, 'strict').allowed).toBe(
      false,
    );
  });

  it('explains why a URL was refused', () => {
    const decision = isAllowedByPolicy(new URL('https://example.com'), allowlist, 'strict');
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain('strict');
  });

  it('reports the pattern that allowed the URL', () => {
    const decision = isAllowedByPolicy(new URL('http://localhost:8080'), allowlist, 'strict');
    expect(decision.matchedPattern).toBe('localhost:*');
  });
});

describe('classifyInput', () => {
  it('treats explicit web URLs as URLs', () => {
    expect(classifyInput('https://example.com').kind).toBe('url');
    expect(classifyInput('http://example.com/a?b=c').kind).toBe('url');
    expect(classifyInput('HTTP://example.com').kind).toBe('url');
  });

  it('treats scheme relative URLs as URLs', () => {
    const result = classifyInput('//example.com/path');
    expect(result.kind).toBe('url');
  });

  it('treats hosts, localhost and IPv4 addresses as URLs', () => {
    for (const input of [
      'example.com',
      'example.com/path',
      'nodejs.org/docs',
      'localhost',
      'localhost:3000',
      'localhost:3000/status',
      '192.168.0.1:8080',
    ]) {
      expect(classifyInput(input).kind, input).toBe('url');
    }
  });

  it('prefixes bare hosts with https', () => {
    const result = classifyInput('example.com');
    expect(result.kind).toBe('url');
    if (result.kind === 'url') {
      expect(result.url.href).toBe('https://example.com/');
    }
  });

  it('treats free text as a search query', () => {
    for (const input of [
      'how to test an extension',
      'what is the answer',
      'vscode webview csp frame-src',
      'hello world',
    ]) {
      expect(classifyInput(input).kind, input).toBe('search');
    }
  });

  it('rejects unsupported schemes instead of searching for them', () => {
    for (const input of ['javascript:alert(1)', 'ftp://example.com/file', 'file:///etc/passwd']) {
      expect(classifyInput(input).kind, input).toBe('invalid');
    }
  });
});

describe('buildSearchUrl', () => {
  it('replaces the placeholder with the encoded query', () => {
    const result = buildSearchUrl('https://www.bing.com/search?q=%s', 'vscode webview csp');
    expect(result.ok).toBe(true);
    expect(result.url?.href).toBe('https://www.bing.com/search?q=vscode%20webview%20csp');
  });

  it('rejects a template without a placeholder', () => {
    expect(buildSearchUrl('https://www.bing.com/search', 'query').ok).toBe(false);
  });

  it('rejects an empty or invalid template', () => {
    expect(buildSearchUrl('', 'query').ok).toBe(false);
    expect(buildSearchUrl('ftp://example.com/%s', 'query').ok).toBe(false);
  });
});

describe('resolveTarget', () => {
  const template = 'https://www.bing.com/search?q=%s';

  it('keeps URLs untouched', () => {
    const result = resolveTarget('https://example.com/a', template);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.kind).toBe('url');
      expect(result.url.href).toBe('https://example.com/a');
    }
  });

  it('routes free text to the search engine', () => {
    const result = resolveTarget('how to test', template);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.kind).toBe('search');
      expect(result.url.href).toBe('https://www.bing.com/search?q=how%20to%20test');
    }
  });

  it('refuses an empty input', () => {
    expect(resolveTarget('   ', template).ok).toBe(false);
  });

  it('refuses an unsupported scheme', () => {
    const result = resolveTarget('javascript:alert(1)', template);
    expect(result.ok).toBe(false);
  });
});

describe('toCspSources', () => {
  it('emits both schemes for a pattern without a scheme', () => {
    expect(toCspSources('example.com')).toEqual(['http://example.com', 'https://example.com']);
  });

  it('emits the apex and the wildcard for a wildcard host', () => {
    expect(toCspSources('*.internal.company.com')).toEqual([
      'http://internal.company.com',
      'http://*.internal.company.com',
      'https://internal.company.com',
      'https://*.internal.company.com',
    ]);
  });

  it('keeps the port and the path of the pattern', () => {
    expect(toCspSources('localhost:*')).toEqual(['http://localhost:*', 'https://localhost:*']);
    expect(toCspSources('https://docs.python.org/*')).toEqual(['https://docs.python.org/*']);
  });

  it('returns nothing for an invalid pattern', () => {
    expect(toCspSources('ftp://example.com')).toEqual([]);
  });
});

describe('buildFrameSrc', () => {
  it('allows every web host in the open policy', () => {
    expect(buildFrameSrc([], 'open')).toBe('http: https:');
  });

  it('restricts the frame to the allowlist in the strict policy', () => {
    const frameSrc = buildFrameSrc(['*.internal.company.com', 'localhost:*'], 'strict');
    expect(frameSrc).toContain('https://*.internal.company.com');
    expect(frameSrc).toContain('https://internal.company.com');
    expect(frameSrc).toContain('http://localhost:*');
    expect(frameSrc).not.toContain('https://example.com');
  });

  it('is empty when the strict allowlist is empty', () => {
    expect(buildFrameSrc([], 'strict')).toBe('');
  });
});
