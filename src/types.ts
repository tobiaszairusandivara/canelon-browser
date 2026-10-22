/**
 * The IPC contract between the extension host and the webview client.
 *
 * Both sides speak the same discriminated unions and both validate every
 * message before acting on it, so a malformed or forged message cannot drive
 * the panel.
 *
 * The validators are written by hand on purpose. The repository conventions
 * model the data of a boundary with a schema library, and Zod would be the
 * natural choice here, but this extension ships with **no runtime dependency
 * at all**: a schema library in the bundle would be the only one, and it would
 * be paid for by every user of the panel. The discriminated unions below fill
 * the same role, they are checked at runtime by `parseHostMessage` and
 * `parseWebviewMessage`, and they are unit tested.
 */

export const FRAME_LOAD_TIMEOUT_MS = 12000;

export type SecurityPolicyLevel = 'strict' | 'open';

export type NoticeLevel = 'info' | 'warning' | 'error';

export interface PanelInitState {
  /** The URL the panel starts on. */
  readonly url: string;
  readonly canGoBack: boolean;
  readonly canGoForward: boolean;
  readonly securityPolicy: SecurityPolicyLevel;
  /** Milliseconds the client waits for the iframe `load` event. */
  readonly loadTimeoutMs: number;
}

export type HostMessage =
  | { readonly type: 'init'; readonly state: PanelInitState }
  | {
      readonly type: 'navigate';
      readonly url: string;
      readonly canGoBack: boolean;
      readonly canGoForward: boolean;
    }
  | { readonly type: 'status'; readonly status: 'loading' | 'idle' }
  | {
      readonly type: 'notice';
      readonly level: NoticeLevel;
      readonly message: string;
      /** Optional action button rendered next to the message. */
      readonly action?: 'openExternal';
      /** The URL the action applies to. */
      readonly url?: string;
    }
  | { readonly type: 'error'; readonly message: string };

export type WebviewMessage =
  | { readonly type: 'ready' }
  | { readonly type: 'navigate'; readonly input: string }
  | { readonly type: 'back' }
  | { readonly type: 'forward' }
  | { readonly type: 'reload' }
  | { readonly type: 'home' }
  | { readonly type: 'openExternal'; readonly url?: string }
  | { readonly type: 'frameLoaded'; readonly url: string }
  | { readonly type: 'frameTimeout'; readonly url: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

/** Validates a message coming from the extension host. */
export function parseHostMessage(value: unknown): HostMessage | undefined {
  if (!isRecord(value) || !isString(value['type'])) {
    return undefined;
  }

  switch (value['type']) {
    case 'init': {
      const state = value['state'];
      if (!isRecord(state)) {
        return undefined;
      }
      const { url, canGoBack, canGoForward, securityPolicy, loadTimeoutMs } = state;
      if (
        !isString(url) ||
        !isBoolean(canGoBack) ||
        !isBoolean(canGoForward) ||
        !isString(securityPolicy) ||
        !isNumber(loadTimeoutMs)
      ) {
        return undefined;
      }
      if (securityPolicy !== 'strict' && securityPolicy !== 'open') {
        return undefined;
      }
      return {
        type: 'init',
        state: {
          url,
          canGoBack,
          canGoForward,
          securityPolicy,
          loadTimeoutMs,
        },
      };
    }
    case 'navigate': {
      const { url, canGoBack, canGoForward } = value;
      if (!isString(url) || !isBoolean(canGoBack) || !isBoolean(canGoForward)) {
        return undefined;
      }
      return { type: 'navigate', url, canGoBack, canGoForward };
    }
    case 'status': {
      const status = value['status'];
      if (status !== 'loading' && status !== 'idle') {
        return undefined;
      }
      return { type: 'status', status };
    }
    case 'notice': {
      const { level, message, action, url } = value;
      if (!isString(level) || !isString(message)) {
        return undefined;
      }
      if (level !== 'info' && level !== 'warning' && level !== 'error') {
        return undefined;
      }
      if (action !== undefined && action !== 'openExternal') {
        return undefined;
      }
      if (url !== undefined && !isString(url)) {
        return undefined;
      }
      return {
        type: 'notice',
        level,
        message,
        ...(action !== undefined ? { action } : {}),
        ...(url !== undefined ? { url } : {}),
      };
    }
    case 'error': {
      const message = value['message'];
      if (!isString(message)) {
        return undefined;
      }
      return { type: 'error', message };
    }
    default:
      return undefined;
  }
}

/** Validates a message coming from the webview client. */
export function parseWebviewMessage(value: unknown): WebviewMessage | undefined {
  if (!isRecord(value) || !isString(value['type'])) {
    return undefined;
  }

  switch (value['type']) {
    case 'ready':
      return { type: 'ready' };
    case 'navigate': {
      const input = value['input'];
      if (!isString(input)) {
        return undefined;
      }
      return { type: 'navigate', input };
    }
    case 'back':
      return { type: 'back' };
    case 'forward':
      return { type: 'forward' };
    case 'reload':
      return { type: 'reload' };
    case 'home':
      return { type: 'home' };
    case 'openExternal': {
      const url = value['url'];
      if (url !== undefined && !isString(url)) {
        return undefined;
      }
      return { type: 'openExternal', ...(url !== undefined ? { url } : {}) };
    }
    case 'frameLoaded':
    case 'frameTimeout': {
      const url = value['url'];
      if (!isString(url)) {
        return undefined;
      }
      return { type: value['type'], url };
    }
    default:
      return undefined;
  }
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
