import { describe, expect, it } from 'vitest';

import {
  isEnvelopeForToken,
  parseHostEnvelope,
  parseHostMessage,
  parseWebviewMessage,
} from '../src/types';

describe('parseWebviewMessage', () => {
  it('accepts the known commands', () => {
    expect(parseWebviewMessage({ type: 'ready' })).toEqual({ type: 'ready' });
    expect(parseWebviewMessage({ type: 'back' })).toEqual({ type: 'back' });
    expect(parseWebviewMessage({ type: 'forward' })).toEqual({ type: 'forward' });
    expect(parseWebviewMessage({ type: 'reload' })).toEqual({ type: 'reload' });
    expect(parseWebviewMessage({ type: 'home' })).toEqual({ type: 'home' });
  });

  it('accepts a navigation with input', () => {
    expect(parseWebviewMessage({ type: 'navigate', input: 'example.com' })).toEqual({
      type: 'navigate',
      input: 'example.com',
    });
  });

  it('accepts the frame events', () => {
    expect(parseWebviewMessage({ type: 'frameLoaded', url: 'https://example.com' })).toEqual({
      type: 'frameLoaded',
      url: 'https://example.com',
    });
    expect(parseWebviewMessage({ type: 'frameTimeout', url: 'https://example.com' })).toEqual({
      type: 'frameTimeout',
      url: 'https://example.com',
    });
  });

  it('rejects unknown and malformed messages', () => {
    for (const value of [
      undefined,
      null,
      'navigate',
      42,
      {},
      { type: 'unknown' },
      { type: 'navigate' },
      { type: 'navigate', input: 42 },
      { type: 'frameLoaded' },
      { type: 'openExternal', url: 42 },
    ]) {
      expect(parseWebviewMessage(value), JSON.stringify(value ?? null)).toBeUndefined();
    }
  });
});

describe('parseHostMessage', () => {
  it('accepts the init state', () => {
    const message = parseHostMessage({
      type: 'init',
      state: {
        url: 'https://example.com',
        canGoBack: false,
        canGoForward: false,
        securityPolicy: 'open',
        loadTimeoutMs: 12000,
        allowed: true,
      },
    });

    expect(message?.type).toBe('init');
  });

  it('rejects an init state with a wrong policy', () => {
    const message = parseHostMessage({
      type: 'init',
      state: {
        url: 'https://example.com',
        canGoBack: false,
        canGoForward: false,
        securityPolicy: 'whatever',
        loadTimeoutMs: 12000,
        allowed: true,
      },
    });

    expect(message).toBeUndefined();
  });

  it('accepts a navigation and a status change', () => {
    expect(
      parseHostMessage({
        type: 'navigate',
        url: 'https://example.com',
        canGoBack: true,
        canGoForward: false,
        allowed: true,
      }),
    ).toEqual({
      type: 'navigate',
      url: 'https://example.com',
      canGoBack: true,
      canGoForward: false,
      allowed: true,
    });

    expect(parseHostMessage({ type: 'status', status: 'loading' })).toEqual({
      type: 'status',
      status: 'loading',
    });
  });

  it('accepts notices and errors', () => {
    expect(
      parseHostMessage({
        type: 'notice',
        level: 'warning',
        message: 'It may be blocked',
        action: 'openExternal',
        url: 'https://example.com',
      }),
    ).toEqual({
      type: 'notice',
      level: 'warning',
      message: 'It may be blocked',
      action: 'openExternal',
      url: 'https://example.com',
    });

    expect(parseHostMessage({ type: 'error', message: 'Nope' })).toEqual({
      type: 'error',
      message: 'Nope',
    });
  });

  it('rejects unknown and malformed messages', () => {
    for (const value of [
      undefined,
      null,
      'init',
      {},
      { type: 'unknown' },
      { type: 'status', status: 'pending' },
      { type: 'notice', level: 'fatal', message: 'x' },
      { type: 'notice', level: 'info', message: 'x', action: 'deleteEverything' },
      { type: 'error' },
      { type: 'navigate', url: 'https://example.com', canGoBack: 'yes', canGoForward: false },
      { type: 'navigate', url: 'https://example.com', canGoBack: true, canGoForward: false },
      {
        type: 'init',
        state: {
          url: 'https://example.com',
          canGoBack: false,
          canGoForward: false,
          securityPolicy: 'open',
          loadTimeoutMs: 12000,
        },
      },
    ]) {
      expect(parseHostMessage(value), JSON.stringify(value ?? null)).toBeUndefined();
    }
  });
});

describe('parseHostEnvelope', () => {
  const message = {
    type: 'status',
    status: 'idle',
  };

  it('accepts an envelope with a token', () => {
    const envelope = parseHostEnvelope({ token: 'a-token', message });
    expect(envelope?.token).toBe('a-token');
    expect(envelope?.message.type).toBe('status');
  });

  it('rejects an envelope without a token or with a broken message', () => {
    expect(parseHostEnvelope({ message })).toBeUndefined();
    expect(parseHostEnvelope({ token: '', message })).toBeUndefined();
    expect(parseHostEnvelope({ token: 'a-token', message: { type: 'unknown' } })).toBeUndefined();
    expect(parseHostEnvelope(undefined)).toBeUndefined();
  });

  it('only accepts the envelope of this webview', () => {
    const envelope = parseHostEnvelope({ token: 'a-token', message });
    expect(envelope).toBeDefined();
    if (envelope) {
      expect(isEnvelopeForToken(envelope, 'a-token')).toBe(true);
      expect(isEnvelopeForToken(envelope, 'another-token')).toBe(false);
      expect(isEnvelopeForToken(envelope, '')).toBe(false);
    }
  });
});
