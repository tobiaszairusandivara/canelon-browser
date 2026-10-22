import { parseHttpUrl } from '../SecurityManager';
import {
  type HostEnvelope,
  type WebviewMessage,
  parseHostEnvelope,
  isEnvelopeForToken,
} from '../types';

interface VsCodeApi {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

const vscode = acquireVsCodeApi();

const TOKEN_META_NAME = 'canelon-browser-token';
const STILL_LOADING_AFTER_MS = 4000;

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`The element "${id}" is missing from the webview.`);
  }
  return element as T;
}

const backButton = requireElement<HTMLButtonElement>('back');
const forwardButton = requireElement<HTMLButtonElement>('forward');
const reloadButton = requireElement<HTMLButtonElement>('reload');
const homeButton = requireElement<HTMLButtonElement>('home');
const openExternalButton = requireElement<HTMLButtonElement>('open-external');
const addressInput = requireElement<HTMLInputElement>('address');
const loadingIndicator = requireElement<HTMLElement>('loading');
const noticeElement = requireElement<HTMLElement>('notice');
const noticeAction = requireElement<HTMLButtonElement>('notice-action');
const frameContainer = requireElement<HTMLElement>('frame-container');

/**
 * The token that proves that a message comes from the extension host.
 *
 * It is written into the HTML of this webview, so the framed page, which is
 * cross-origin, cannot read it and cannot forge a message.
 *
 * The source of the event cannot be used for this: VS Code overwrites
 * `window.parent` and `window.top` with the window of the webview itself and
 * posts the messages of the extension host from the preload document, so the
 * source of the event is a window that is not reachable from here.
 */
const token =
  document.querySelector<HTMLMetaElement>(`meta[name="${TOKEN_META_NAME}"]`)?.content ?? '';

let currentUrl = '';
let loadTimeoutMs = 12000;
let loadTimer: number | undefined;
let stillLoadingTimer: number | undefined;
let noticeUrl: string | undefined;
let frameWindow: Window | undefined;

function post(message: WebviewMessage): void {
  vscode.postMessage(message);
}

function setBusy(busy: boolean): void {
  loadingIndicator.hidden = !busy;
}

function setAddress(url: string): void {
  currentUrl = url;
  if (document.activeElement !== addressInput) {
    addressInput.value = url;
  }
}

function updateButtons(canGoBack: boolean, canGoForward: boolean): void {
  backButton.disabled = !canGoBack;
  forwardButton.disabled = !canGoForward;
}

function clearNotice(): void {
  noticeElement.hidden = true;
  noticeElement.textContent = '';
  noticeElement.className = 'notice';
  noticeAction.hidden = true;
  noticeUrl = undefined;
}

function showNotice(
  level: 'info' | 'warning' | 'error',
  message: string,
  actionUrl?: string,
): void {
  noticeElement.hidden = false;
  noticeElement.className = `notice level-${level}`;
  noticeElement.textContent = message;
  noticeAction.hidden = actionUrl === undefined;
  noticeUrl = actionUrl;
}

function clearTimers(): void {
  if (loadTimer !== undefined) {
    window.clearTimeout(loadTimer);
    loadTimer = undefined;
  }
  if (stillLoadingTimer !== undefined) {
    window.clearTimeout(stillLoadingTimer);
    stillLoadingTimer = undefined;
  }
}

/**
 * The state shown when the page does not appear.
 *
 * The check is a heuristic: a cross-origin frame cannot be read, so the only
 * signals are the timeout and the headers of the response.
 */
function showNotLoaded(url: string, detail: string): void {
  setBusy(false);
  showNotice(
    'warning',
    `This page may refuse to be embedded in the editor (X-Frame-Options or CSP frame-ancestors). ${detail} The check is heuristic, so the page may still be fine.`,
    url,
  );
}

function loadFrame(url: string): void {
  const validation = parseHttpUrl(url);
  if (!validation.ok) {
    setBusy(false);
    showNotice('error', validation.reason ?? 'The URL is not valid.');
    return;
  }

  clearTimers();

  const frame = document.createElement('iframe');
  frame.className = 'browser-frame';
  frame.title = 'Embedded page';
  frame.setAttribute('referrerpolicy', 'no-referrer');

  frame.addEventListener('load', () => {
    clearTimers();
    setBusy(false);
    post({ type: 'frameLoaded', url });
  });

  frame.addEventListener('error', () => {
    clearTimers();
    showNotLoaded(url, 'The frame reported an error while it was loading.');
  });

  frame.src = url;
  frameContainer.replaceChildren(frame);
  frameWindow = frame.contentWindow ?? undefined;
  setBusy(true);

  stillLoadingTimer = window.setTimeout(() => {
    stillLoadingTimer = undefined;
    showNotice('info', `Still loading ${url}…`, url);
  }, STILL_LOADING_AFTER_MS);

  loadTimer = window.setTimeout(() => {
    loadTimer = undefined;
    post({ type: 'frameTimeout', url });
  }, loadTimeoutMs);
}

function handleHostMessage(envelope: HostEnvelope): void {
  const message = envelope.message;
  switch (message.type) {
    case 'init': {
      loadTimeoutMs = message.state.loadTimeoutMs;
      updateButtons(message.state.canGoBack, message.state.canGoForward);
      setAddress(message.state.url);
      if (!message.state.allowed) {
        setBusy(false);
        showNotice(
          'error',
          message.state.blockedReason ??
            `The security policy does not allow "${message.state.url}".`,
        );
        return;
      }
      loadFrame(message.state.url);
      return;
    }
    case 'navigate': {
      updateButtons(message.canGoBack, message.canGoForward);
      setAddress(message.url);
      if (!message.allowed) {
        setBusy(false);
        showNotice(
          'error',
          message.blockedReason ?? `The security policy does not allow "${message.url}".`,
        );
        return;
      }
      clearNotice();
      loadFrame(message.url);
      return;
    }
    case 'status': {
      setBusy(message.status === 'loading');
      return;
    }
    case 'notice': {
      setBusy(false);
      showNotice(message.level, message.message, message.url);
      return;
    }
    case 'error': {
      setBusy(false);
      showNotice('error', message.message);
      return;
    }
    default:
      return;
  }
}

backButton.addEventListener('click', () => {
  post({ type: 'back' });
});

forwardButton.addEventListener('click', () => {
  post({ type: 'forward' });
});

reloadButton.addEventListener('click', () => {
  post({ type: 'reload' });
});

homeButton.addEventListener('click', () => {
  post({ type: 'home' });
});

openExternalButton.addEventListener('click', () => {
  post({ type: 'openExternal', url: currentUrl });
});

noticeAction.addEventListener('click', () => {
  post({ type: 'openExternal', url: noticeUrl ?? currentUrl });
});

addressInput.addEventListener('keydown', (event: KeyboardEvent) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    const input = addressInput.value.trim();
    if (input.length > 0) {
      post({ type: 'navigate', input });
    }
    addressInput.blur();
    return;
  }
  if (event.key === 'Escape') {
    addressInput.value = currentUrl;
    addressInput.blur();
  }
});

addressInput.addEventListener('focus', () => {
  addressInput.select();
});

window.addEventListener('message', (event: MessageEvent<unknown>) => {
  // The framed page shares the window hierarchy and can post into this
  // window, so the origin of a message is not enough: the token is.
  if (event.source === frameWindow) {
    return;
  }

  const envelope = parseHostEnvelope(event.data);
  if (!envelope || !isEnvelopeForToken(envelope, token)) {
    return;
  }

  handleHostMessage(envelope);
});

post({ type: 'ready' });
