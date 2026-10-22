import { parseHttpUrl } from '../SecurityManager';
import { HostMessage, WebviewMessage, parseHostMessage } from '../types';

interface VsCodeApi {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

const vscode = acquireVsCodeApi();

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

let currentUrl = '';
let loadTimeoutMs = 12000;
let loadTimer: number | undefined;
let noticeUrl: string | undefined;

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

function showNotice(level: 'info' | 'warning' | 'error', message: string, actionUrl?: string): void {
  noticeElement.hidden = false;
  noticeElement.className = `notice level-${level}`;
  noticeElement.textContent = message;
  noticeAction.hidden = actionUrl === undefined;
  noticeUrl = actionUrl;
}

function loadFrame(url: string): void {
  const validation = parseHttpUrl(url);
  if (!validation.ok) {
    showNotice('error', validation.reason ?? 'The URL is not valid.');
    return;
  }

  if (loadTimer !== undefined) {
    window.clearTimeout(loadTimer);
    loadTimer = undefined;
  }

  const frame = document.createElement('iframe');
  frame.className = 'browser-frame';
  frame.title = 'Embedded page';
  frame.setAttribute('referrerpolicy', 'no-referrer');

  frame.addEventListener('load', () => {
    if (loadTimer !== undefined) {
      window.clearTimeout(loadTimer);
      loadTimer = undefined;
    }
    setBusy(false);
    post({ type: 'frameLoaded', url });
  });

  frame.src = url;
  frameContainer.replaceChildren(frame);
  setBusy(true);

  loadTimer = window.setTimeout(() => {
    loadTimer = undefined;
    post({ type: 'frameTimeout', url });
  }, loadTimeoutMs);
}

function handleHostMessage(message: HostMessage): void {
  switch (message.type) {
    case 'init': {
      loadTimeoutMs = message.state.loadTimeoutMs;
      updateButtons(message.state.canGoBack, message.state.canGoForward);
      setAddress(message.state.url);
      loadFrame(message.state.url);
      return;
    }
    case 'navigate': {
      updateButtons(message.canGoBack, message.canGoForward);
      setAddress(message.url);
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
  // Only the extension host may drive the panel. The framed page shares the
  // window hierarchy, so the source has to be checked explicitly.
  if (event.source !== window.parent && event.source !== window) {
    return;
  }

  const message = parseHostMessage(event.data);
  if (!message) {
    return;
  }

  handleHostMessage(message);
});

post({ type: 'ready' });
