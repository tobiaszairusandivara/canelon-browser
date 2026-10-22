// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { build } from 'esbuild';
import { JSDOM, type DOMWindow } from 'jsdom';
import { beforeAll, describe, expect, it } from 'vitest';

// Vitest runs the tests from the root of the project.
const ROOT = process.cwd();
const TOKEN = 'a-token-that-only-the-host-and-the-webview-know';

interface PostedMessage {
  readonly type: string;
  readonly input?: string;
  readonly url?: string;
}

let clientCode = '';

/**
 * The real client, bundled exactly as the extension bundles it.
 */
beforeAll(async () => {
  const result = await build({
    entryPoints: [resolve(ROOT, 'src/webview/main.ts')],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'es2022',
    write: false,
  });
  clientCode = result.outputFiles[0]?.text ?? '';
});

interface VsCodeApi {
  postMessage(message: PostedMessage): void;
  getState(): unknown;
  setState(state: unknown): void;
}

type WebviewWindow = DOMWindow & { acquireVsCodeApi: () => VsCodeApi };

interface Harness {
  readonly dom: JSDOM;
  readonly posted: PostedMessage[];
  readonly window: WebviewWindow;
}

async function createHarness(token = TOKEN): Promise<Harness> {
  const template = await readFile(resolve(ROOT, 'src/webview/index.html'), 'utf8');
  const html = template
    .replace('__CSP__', "default-src 'none'")
    .replace('__NONCE__', 'nonce')
    .replace('__TOKEN__', token)
    .replace('__STYLE_URI__', 'styles.css')
    .replace('__SCRIPT_URI__', 'main.js');

  const dom = new JSDOM(html, {
    runScripts: 'outside-only',
    url: 'https://localhost/',
    pretendToBeVisual: true,
  });

  const posted: PostedMessage[] = [];
  const win = dom.window as WebviewWindow;
  win.acquireVsCodeApi = () => ({
    postMessage: (message: PostedMessage) => void posted.push(message),
    getState: () => undefined,
    setState: () => undefined,
  });

  win.eval(clientCode);

  return { dom, posted, window: win };
}

/**
 * Delivers a message the way VS Code does.
 *
 * The host of a webview lives in the preload document, which is a different
 * window than the content of the webview, so the source of the event is not
 * the window of the webview and it is not reachable as `window.parent`,
 * because VS Code overwrites it.
 */
function deliver(harness: Harness, payload: unknown, source: unknown = undefined): void {
  const win = harness.window;
  const init: Record<string, unknown> = { data: payload };
  if (source !== undefined) {
    init['source'] = source;
  }
  win.dispatchEvent(new win.MessageEvent('message', init));
}

function initEnvelope(url: string, token = TOKEN): unknown {
  return {
    token,
    message: {
      type: 'init',
      state: {
        url,
        canGoBack: false,
        canGoForward: false,
        securityPolicy: 'open',
        loadTimeoutMs: 12000,
        allowed: true,
      },
    },
  };
}

describe('the webview client', () => {
  it('announces that it is ready', async () => {
    const harness = await createHarness();
    expect(harness.posted.map((message) => message.type)).toContain('ready');
  });

  it('loads the page when the host sends the state, whatever the source of the message is', async () => {
    const harness = await createHarness();

    // A window that is neither the webview nor a reachable parent: this is
    // what VS Code does, because the messages come from the preload document.
    const foreign = new JSDOM('', { url: 'https://preload.local/' }).window;
    deliver(harness, initEnvelope('https://example.com/'), foreign);

    const frame = harness.window.document.querySelector('iframe');
    expect(frame, 'the client did not create the iframe').not.toBeNull();
    expect(frame?.getAttribute('src')).toBe('https://example.com/');
  });

  it('loads the page when the source of the message is unknown', async () => {
    const harness = await createHarness();
    deliver(harness, initEnvelope('https://example.com/'), null);

    const frame = harness.window.document.querySelector('iframe');
    expect(frame, 'the client did not create the iframe').not.toBeNull();
  });

  it('ignores a message with a wrong token', async () => {
    const harness = await createHarness();
    deliver(harness, initEnvelope('https://example.com/', 'a-forged-token'));

    expect(harness.window.document.querySelector('iframe')).toBeNull();
  });

  it('ignores a message that comes from the framed page', async () => {
    const harness = await createHarness();
    deliver(harness, initEnvelope('https://example.com/'));
    const frame = harness.window.document.querySelector('iframe');
    expect(frame).not.toBeNull();

    // The framed page posts into the window of the webview. It does not know
    // the token, but the source is checked as well.
    const frameWindow = (frame as { contentWindow: unknown }).contentWindow;
    deliver(harness, initEnvelope('https://evil.example/'), frameWindow);

    expect(harness.window.document.querySelector('iframe')?.getAttribute('src')).toBe(
      'https://example.com/',
    );
  });

  it('hides the loading indicator when the frame finishes loading', async () => {
    const harness = await createHarness();
    deliver(harness, initEnvelope('https://example.com/'));

    const loading = harness.window.document.getElementById('loading');
    const frame = harness.window.document.querySelector('iframe');
    expect(loading?.hidden).toBe(false);

    frame?.dispatchEvent(new harness.window.Event('load'));

    expect(loading?.hidden).toBe(true);
    expect(harness.posted.map((message) => message.type)).toContain('frameLoaded');
  });

  it('shows the blocked state when the policy does not allow the page', async () => {
    const harness = await createHarness();
    deliver(harness, {
      token: TOKEN,
      message: {
        type: 'init',
        state: {
          url: 'https://blocked.example/',
          canGoBack: false,
          canGoForward: false,
          securityPolicy: 'strict',
          loadTimeoutMs: 12000,
          allowed: false,
          blockedReason: 'The security policy is "strict" and it does not allow it.',
        },
      },
    });

    expect(harness.window.document.querySelector('iframe')).toBeNull();
    const notice = harness.window.document.getElementById('notice');
    expect(notice?.hidden).toBe(false);
    expect(notice?.textContent).toContain('strict');
  });
});
