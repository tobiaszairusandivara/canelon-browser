/**
 * Pure URL validation and policy helpers.
 *
 * This module must never import `vscode`: it is bundled both into the
 * extension host and into the webview client, and it is exercised directly by
 * the unit tests.
 *
 * The same rule as in `types.ts` applies here: the repository conventions
 * would model this boundary with a schema library such as Zod, but the
 * extension has no runtime dependency, so the parsing of the URLs and of the
 * allowlist patterns is written by hand and covered by the unit tests.
 */

export type SecurityPolicy = 'strict' | 'open';

export const SUPPORTED_SCHEMES = ['http:', 'https:'] as const;

/** Schemes that are never allowed, regardless of the policy. */
const BLOCKED_SCHEMES = [
  'javascript:',
  'data:',
  'file:',
  'blob:',
  'about:',
  'chrome:',
  'vscode:',
  'mailto:',
  'ftp:',
  'ws:',
  'wss:',
];

export interface UrlValidation {
  readonly ok: boolean;
  readonly url?: URL | undefined;
  readonly reason?: string | undefined;
}

export interface AllowlistPattern {
  /** Schemes the pattern applies to. Empty means "http and https". */
  readonly schemes: readonly string[];
  /** Host without wildcards, lower-cased. */
  readonly host: string;
  /** True when the pattern was written as `*.host`. */
  readonly wildcardHost: boolean;
  /** Exact port, or `*` for any port, or undefined for "any port". */
  readonly port?: string;
  /** Path prefix the URL must start with. */
  readonly pathPrefix?: string;
  /** The original pattern text, kept for error messages. */
  readonly raw: string;
}

export type InputClassification =
  | { readonly kind: 'url'; readonly input: string; readonly url: URL }
  | { readonly kind: 'search'; readonly input: string }
  | { readonly kind: 'invalid'; readonly input: string; readonly reason: string };

export interface PolicyDecision {
  readonly allowed: boolean;
  readonly reason?: string | undefined;
  /** The pattern that allowed the URL, when the decision is positive. */
  readonly matchedPattern?: string | undefined;
}

const HOST_PATTERN = /^(?<host>[a-z0-9._-]+|\[[0-9a-f:]+\])(?::(?<port>\*|\d{1,5}))?/i;
const DOTTED_HOST = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(?::\d{1,5})?(?:[/?#].*)?$/i;
const LOCALHOST = /^localhost(?::\d{1,5})?(?:[/?#].*)?$/i;
const IPV4 = /^(?:\d{1,3}\.){3}\d{1,3}(?::\d{1,5})?(?:[/?#].*)?$/i;
const SCHEME = /^([a-z][a-z0-9+.-]*):/i;

function isSupportedScheme(scheme: string): boolean {
  return (SUPPORTED_SCHEMES as readonly string[]).includes(scheme);
}

/**
 * Parses an absolute URL and rejects everything that is not `http:`/`https:`.
 * Malformed input yields `ok: false` instead of throwing.
 */
export function parseHttpUrl(input: string): UrlValidation {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return { ok: false, reason: 'The URL is empty.' };
  }
  if (/\s/.test(trimmed)) {
    return { ok: false, reason: 'The URL contains whitespace.' };
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, reason: `"${trimmed}" is not a valid absolute URL.` };
  }

  if (BLOCKED_SCHEMES.includes(url.protocol)) {
    return { ok: false, reason: `The scheme "${url.protocol}" is not allowed.` };
  }
  if (!isSupportedScheme(url.protocol)) {
    return { ok: false, reason: `Only http and https URLs are supported, got "${url.protocol}".` };
  }
  if (url.hostname.length === 0) {
    return { ok: false, reason: 'The URL has no host.' };
  }

  return { ok: true, url };
}

/**
 * Parses an allowlist pattern.
 *
 * Supported shapes:
 * - `example.com`
 * - `*.example.com`
 * - `localhost:3000`
 * - `localhost:*`
 * - `https://docs.python.org/*`
 * - `http://localhost:8080/admin`
 */
export function parseAllowlistPattern(pattern: string): AllowlistPattern | undefined {
  const raw = pattern.trim();
  if (raw.length === 0) {
    return undefined;
  }

  let rest = raw;
  let schemes: string[] = [];

  const schemeMatch = SCHEME.exec(rest);
  if (schemeMatch) {
    const scheme = `${schemeMatch[1].toLowerCase()}:`;
    const afterScheme = rest.slice(schemeMatch[0].length);

    if (isSupportedScheme(scheme)) {
      schemes = [scheme];
      rest = afterScheme.replace(/^\/\//, '');
    } else if (!/^(\d|\*)/.test(afterScheme)) {
      // "localhost:3000" and "localhost:*" are a host and a port, but any
      // other scheme makes the pattern invalid.
      return undefined;
    }
  }

  if (rest.length === 0 || rest.startsWith('/')) {
    return undefined;
  }

  let wildcardHost = false;
  if (rest.startsWith('*.')) {
    wildcardHost = true;
    rest = rest.slice(2);
  }

  const hostMatch = HOST_PATTERN.exec(rest);
  if (!hostMatch?.groups) {
    return undefined;
  }

  const rawHost = hostMatch.groups['host'];
  if (rawHost === undefined) {
    return undefined;
  }

  const host = wildcardHost ? rawHost : rawHost;
  if (host.length === 0) {
    return undefined;
  }

  const rawPort = hostMatch.groups['port'];
  if (rawPort !== undefined && rawPort !== '*' && Number(rawPort) > 65535) {
    return undefined;
  }

  let pathPrefix: string | undefined;
  const pathStart = rest.indexOf('/', hostMatch[0].length);
  if (pathStart >= 0) {
    pathPrefix = rest.slice(pathStart);
    if (pathPrefix.length === 1) {
      pathPrefix = undefined;
    }
  }

  return {
    schemes: schemes.length > 0 ? schemes : [...SUPPORTED_SCHEMES],
    host: host.toLowerCase(),
    wildcardHost,
    ...(rawPort !== undefined ? { port: rawPort } : {}),
    ...(pathPrefix !== undefined ? { pathPrefix } : {}),
    raw,
  };
}

/**
 * Matches a URL against a single allowlist pattern.
 *
 * A `*.host` pattern matches the apex host and every subdomain, which is the
 * behaviour users expect from an allowlist. The CSP generator emits the
 * matching CSP sources so the browser enforces the same set.
 */
export function matchesAllowlistPattern(url: URL, pattern: string): boolean {
  const parsed = parseAllowlistPattern(pattern);
  if (!parsed) {
    return false;
  }

  if (!parsed.schemes.includes(url.protocol)) {
    return false;
  }

  const host = url.hostname.toLowerCase();
  const hostMatches = parsed.wildcardHost
    ? host === parsed.host || host.endsWith(`.${parsed.host}`)
    : host === parsed.host;

  if (!hostMatches) {
    return false;
  }

  if (parsed.port !== undefined && parsed.port !== '*') {
    if (url.port !== parsed.port) {
      return false;
    }
  }

  if (parsed.pathPrefix !== undefined) {
    // A trailing "*" is a wildcard, the same way the CSP path matching works.
    const prefix = parsed.pathPrefix.endsWith('*')
      ? parsed.pathPrefix.slice(0, -1)
      : parsed.pathPrefix;
    if (!url.pathname.startsWith(prefix)) {
      return false;
    }
  }

  return true;
}

/**
 * Decides whether a URL may be loaded, given the policy and the allowlist.
 */
export function isAllowedByPolicy(
  url: URL,
  allowlist: readonly string[],
  policy: SecurityPolicy,
): PolicyDecision {
  const validation = parseHttpUrl(url.href);
  if (!validation.ok) {
    return { allowed: false, reason: validation.reason };
  }

  if (policy === 'open') {
    return { allowed: true };
  }

  for (const pattern of allowlist) {
    if (matchesAllowlistPattern(url, pattern)) {
      return { allowed: true, matchedPattern: pattern };
    }
  }

  return {
    allowed: false,
    reason: `The security policy is "strict" and "${url.href}" does not match any allowlist pattern.`,
  };
}

/**
 * Decides whether the text typed in the address bar is a URL, a search query or
 * an invalid input.
 *
 * Text with an explicit `http`/`https` scheme, a dotted host, `localhost` or an
 * IPv4 address is a URL. Everything else is a search query.
 */
export function classifyInput(input: string): InputClassification {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return { kind: 'search', input: trimmed };
  }

  if (trimmed.startsWith('//')) {
    const candidate = parseHttpUrl(`https:${trimmed}`);
    if (candidate.ok && candidate.url) {
      return { kind: 'url', input: trimmed, url: candidate.url };
    }
    return { kind: 'invalid', input: trimmed, reason: candidate.reason ?? 'Invalid URL.' };
  }

  const schemeMatch = SCHEME.exec(trimmed);
  if (schemeMatch) {
    const afterScheme = trimmed.slice(schemeMatch[0].length);
    const looksLikeHostPort = /^\d/.test(afterScheme);

    if (!looksLikeHostPort) {
      const candidate = parseHttpUrl(trimmed);
      if (candidate.ok && candidate.url) {
        return { kind: 'url', input: trimmed, url: candidate.url };
      }
      return {
        kind: 'invalid',
        input: trimmed,
        reason: candidate.reason ?? `"${trimmed}" is not a valid URL.`,
      };
    }
  }

  if (/\s/.test(trimmed)) {
    return { kind: 'search', input: trimmed };
  }

  if (DOTTED_HOST.test(trimmed) || LOCALHOST.test(trimmed) || IPV4.test(trimmed)) {
    const candidate = parseHttpUrl(`https://${trimmed}`);
    if (candidate.ok && candidate.url) {
      return { kind: 'url', input: trimmed, url: candidate.url };
    }
    return { kind: 'invalid', input: trimmed, reason: candidate.reason ?? 'Invalid URL.' };
  }

  return { kind: 'search', input: trimmed };
}

/**
 * Builds the URL of a search engine from its template.
 *
 * The template must contain `%s`, which is replaced by the URL-encoded query.
 */
export function buildSearchUrl(template: string, query: string): UrlValidation {
  const trimmedTemplate = template.trim();
  if (trimmedTemplate.length === 0) {
    return { ok: false, reason: 'The search engine template is empty.' };
  }
  if (!trimmedTemplate.includes('%s')) {
    return { ok: false, reason: 'The search engine template must contain "%s".' };
  }

  const candidate = trimmedTemplate.replace(/%s/g, encodeURIComponent(query));
  const validation = parseHttpUrl(candidate);
  if (!validation.ok) {
    return { ok: false, reason: validation.reason };
  }

  return validation;
}

/**
 * Resolves the text typed in the address bar into the URL that should be loaded.
 */
export function resolveTarget(
  input: string,
  searchTemplate: string,
):
  | { readonly ok: true; readonly url: URL; readonly kind: 'url' | 'search' }
  | { readonly ok: false; readonly reason: string } {
  const classification = classifyInput(input);

  if (classification.kind === 'url') {
    return { ok: true, url: classification.url, kind: 'url' };
  }
  if (classification.kind === 'invalid') {
    return { ok: false, reason: classification.reason };
  }
  if (classification.input.length === 0) {
    return { ok: false, reason: 'Type a URL or a search term.' };
  }

  const search = buildSearchUrl(searchTemplate, classification.input);
  if (!search.ok || !search.url) {
    return { ok: false, reason: search.reason ?? 'The search engine template is invalid.' };
  }

  return { ok: true, url: search.url, kind: 'search' };
}

/**
 * Converts an allowlist pattern into the CSP source expressions that allow the
 * same set of URLs.
 *
 * A `*.host` pattern needs two sources, because the CSP wildcard does not match
 * the apex host.
 */
export function toCspSources(pattern: string): string[] {
  const parsed = parseAllowlistPattern(pattern);
  if (!parsed) {
    return [];
  }

  const sources: string[] = [];
  for (const scheme of parsed.schemes) {
    const port = parsed.port === undefined ? '' : `:${parsed.port}`;
    const path = parsed.pathPrefix === undefined ? '' : parsed.pathPrefix;

    if (parsed.wildcardHost) {
      sources.push(`${scheme}//${parsed.host}${port}${path}`);
      sources.push(`${scheme}//*.${parsed.host}${port}${path}`);
      continue;
    }

    sources.push(`${scheme}//${parsed.host}${port}${path}`);
  }

  return [...new Set(sources)];
}

/**
 * Builds the `frame-src` directive of the webview Content Security Policy.
 *
 * In `strict` mode the allowlist is the only thing the browser may frame. In
 * `open` mode any `http`/`https` host is allowed, which keeps the extension
 * usable while still refusing non-web schemes.
 */
export function buildFrameSrc(allowlist: readonly string[], policy: SecurityPolicy): string {
  if (policy === 'open') {
    return 'http: https:';
  }

  const sources = allowlist.flatMap((pattern) => toCspSources(pattern));
  return [...new Set(sources)].join(' ');
}
