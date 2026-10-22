import * as http from 'node:http';
import * as https from 'node:https';

/**
 * Best-effort detection of pages that refuse to be embedded in a frame.
 *
 * The check is heuristic on purpose: the webview frame is cross-origin, so the
 * extension cannot read what the browser rendered. The result is a hint for the
 * user, never a guarantee.
 */
export type FrameabilityVerdict = 'blocked' | 'allowed' | 'unknown';

export interface FrameabilityResult {
  readonly verdict: FrameabilityVerdict;
  readonly detail: string;
}

type HeaderBag = Record<string, string | string[] | undefined>;

function readHeader(headers: HeaderBag, name: string): string | undefined {
  const value = headers[name] ?? headers[name.toLowerCase()];
  if (value === undefined) {
    return undefined;
  }
  return Array.isArray(value) ? value.join(', ') : value;
}

/**
 * Extracts the `frame-ancestors` directive of a CSP header.
 */
export function parseFrameAncestors(csp: string | undefined): string | undefined {
  if (csp === undefined) {
    return undefined;
  }
  for (const directive of csp.split(';')) {
    const parts = directive.trim().split(/\s+/);
    if (parts[0]?.toLowerCase() === 'frame-ancestors') {
      return parts.slice(1).join(' ');
    }
  }
  return undefined;
}

/**
 * Decides, from the response headers alone, whether the page probably refuses
 * to be framed.
 */
export function evaluateFrameHeaders(headers: HeaderBag): FrameabilityResult {
  const xfo = readHeader(headers, 'x-frame-options');
  if (xfo !== undefined) {
    const normalized = xfo.trim().toUpperCase();
    if (
      normalized.includes('DENY') ||
      normalized.includes('SAMEORIGIN') ||
      normalized.includes('ALLOW-FROM')
    ) {
      return {
        verdict: 'blocked',
        detail: `The server sends "X-Frame-Options: ${xfo.trim()}", so the page is very likely refused inside a frame.`,
      };
    }
  }

  const csp = readHeader(headers, 'content-security-policy');
  const frameAncestors = parseFrameAncestors(csp);
  if (frameAncestors !== undefined) {
    const sources = frameAncestors.toLowerCase().split(/\s+/).filter(Boolean);
    if (sources.includes("'none'")) {
      return {
        verdict: 'blocked',
        detail:
          'The server sends a "Content-Security-Policy: frame-ancestors \'none\'" directive, so the page cannot be framed.',
      };
    }
    if (sources.includes("'self'")) {
      return {
        verdict: 'blocked',
        detail:
          'The server sends a "Content-Security-Policy: frame-ancestors \'self\'" directive, so the page can only be framed by itself.',
      };
    }
    if (sources.length > 0 && !sources.includes('*')) {
      return {
        verdict: 'blocked',
        detail: `The server sends a "Content-Security-Policy: frame-ancestors ${frameAncestors}" directive that does not list the webview origin.`,
      };
    }
  }

  return {
    verdict: 'allowed',
    detail:
      'The response headers do not block framing, although the page may still refuse to load for other reasons.',
  };
}

interface ProbeResponse {
  readonly statusCode: number;
  readonly headers: http.IncomingHttpHeaders;
}

function requestHeaders(): http.OutgoingHttpHeaders {
  return {
    'User-Agent':
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
  };
}

function requestOnce(url: URL, timeoutMs: number): Promise<ProbeResponse> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const transport = url.protocol === 'https:' ? https : http;
    const request = transport.request(
      url,
      { method: 'GET', headers: requestHeaders(), timeout: timeoutMs },
      (response) => {
        settled = true;
        // Only the headers are interesting, the body is dropped right away.
        response.destroy();
        resolve({ statusCode: response.statusCode ?? 0, headers: response.headers });
      },
    );

    request.on('timeout', () => {
      request.destroy(new Error('timeout'));
    });
    request.on('error', (error: Error) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    });
    request.end();
  });
}

/**
 * Asks the server for its headers and evaluates them.
 *
 * The request is made from the extension host, which is not necessarily the
 * same machine as the renderer (in code-server the host runs in the container
 * while the frame runs in the user's browser), so the answer is only a hint.
 */
export async function probeFrameability(
  target: string,
  timeoutMs = 6000,
): Promise<FrameabilityResult> {
  let url: URL;
  try {
    url = new URL(target);
  } catch {
    return { verdict: 'unknown', detail: 'The URL could not be parsed.' };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { verdict: 'unknown', detail: 'Only http and https URLs can be probed.' };
  }

  let response: ProbeResponse | undefined;
  try {
    response = await requestOnce(url, timeoutMs);
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown error';
    return {
      verdict: 'unknown',
      detail: `The extension host could not reach the page (${reason}). Note that in code-server "localhost" points at the container, not at your machine.`,
    };
  }

  if (response.statusCode >= 400) {
    return {
      verdict: 'unknown',
      detail: `The server answered with HTTP ${response.statusCode}, so the headers of the real page could not be inspected.`,
    };
  }

  return evaluateFrameHeaders(response.headers);
}
