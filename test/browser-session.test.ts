import type { Uri as VscodeUri, Webview } from 'vscode';
import { beforeEach, describe, expect, it } from 'vitest';

import { BrowserSession } from '../src/BrowserSession';
import { ConfigManager } from '../src/ConfigManager';
import { Uri, configuration, executedCommands, openedExternally } from './vscode-mock';

interface PostedMessage {
  readonly token: string;
  readonly message: {
    readonly type: string;
    readonly url?: string;
    readonly state?: { readonly url: string; readonly allowed: boolean };
  };
}

interface FakeWebview {
  html: string;
  readonly posted: PostedMessage[];
  readonly received: ((raw: unknown) => void)[];
  asWebviewUri(uri: VscodeUri): VscodeUri;
  postMessage(message: PostedMessage): Promise<boolean>;
  onDidReceiveMessage(callback: (raw: unknown) => void): { dispose(): void };
}

function createWebview(): FakeWebview {
  const posted: PostedMessage[] = [];
  const received: ((raw: unknown) => void)[] = [];
  return {
    html: '',
    posted,
    received,
    asWebviewUri: (uri: VscodeUri) =>
      Uri.parse(`https://cdn.vscode.net${uri.path}`) as unknown as VscodeUri,
    postMessage: async (message: PostedMessage) => {
      posted.push(message);
      return true;
    },
    onDidReceiveMessage: (callback: (raw: unknown) => void) => {
      received.push(callback);
      return { dispose: () => {} };
    },
  };
}

async function createSession(): Promise<{
  session: BrowserSession;
  webview: FakeWebview;
  send: (message: unknown) => Promise<void>;
}> {
  const webview = createWebview();
  const session = new BrowserSession(
    Uri.parse('/extension') as unknown as VscodeUri,
    new ConfigManager(),
  );
  await session.attach(webview as unknown as Webview);
  const send = async (message: unknown): Promise<void> => {
    await webview.received[0]?.(message);
  };
  return { session, webview, send };
}

describe('the browser session', () => {
  beforeEach(() => {
    executedCommands.length = 0;
    openedExternally.length = 0;
    configuration['securityPolicy'] = 'open';
    configuration['allowlist'] = [];
    configuration['homeUrl'] = 'https://www.wikipedia.org';
  });

  it('writes the CSP of the allowlist and a token in the webview', async () => {
    const { webview } = await createSession();

    expect(webview.html).toContain('frame-src http: https:');
    expect(webview.html).toMatch(/name="canelon-browser-token" content="[0-9a-f]{32}"/);
    expect(webview.html).not.toContain('__TOKEN__');
  });

  it('sends the state inside an envelope with the token', async () => {
    const { webview, send } = await createSession();
    await send({ type: 'ready' });

    const init = webview.posted.at(-1);
    const token = /content="([0-9a-f]{32})"/.exec(webview.html)?.[1];
    expect(init?.token).toBe(token);
    expect(init?.message.type).toBe('init');
    expect(init?.message.state?.url).toBe('https://www.wikipedia.org/');
  });

  it('tells the host when the page takes the focus', async () => {
    const { send } = await createSession();

    await send({ type: 'frameFocus' });
    expect(executedCommands).toContainEqual({
      command: 'setContext',
      args: ['canelonBrowser.focused', true],
    });

    await send({ type: 'frameBlur' });
    expect(executedCommands).toContainEqual({
      command: 'setContext',
      args: ['canelonBrowser.focused', false],
    });
  });

  it('refuses a URL that the policy does not allow', async () => {
    configuration['securityPolicy'] = 'strict';
    configuration['allowlist'] = ['*.internal.company.com'];

    const { webview, send } = await createSession();
    await send({ type: 'ready' });
    await send({ type: 'navigate', input: 'https://evil.example' });

    const error = webview.posted.filter((message) => message.message.type === 'error').at(-1);
    expect(error).toBeDefined();
    const navigations = webview.posted.filter((message) => message.message.type === 'navigate');
    expect(navigations).toHaveLength(0);
  });

  it('walks the history', async () => {
    const { webview, send } = await createSession();
    await send({ type: 'ready' });

    await send({ type: 'navigate', input: 'https://a.example' });
    await send({ type: 'navigate', input: 'https://b.example' });
    await send({ type: 'back' });

    const back = webview.posted.filter((message) => message.message.type === 'navigate').at(-1);
    expect(back?.message.url).toBe('https://a.example/');
  });

  it('opens the page in the external browser', async () => {
    const { send } = await createSession();
    await send({ type: 'ready' });
    await send({ type: 'openExternal', url: 'https://example.com/' });

    expect(openedExternally).toEqual(['https://example.com/']);
  });

  it('asks the client to focus the address bar', async () => {
    const { session, webview } = await createSession();
    session.focusAddressBar();

    expect(webview.posted.at(-1)?.message.type).toBe('focusAddressBar');
  });
});
