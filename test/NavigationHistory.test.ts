import { describe, expect, it } from 'vitest';

import { NavigationHistory } from '../src/NavigationHistory';

describe('NavigationHistory', () => {
  it('starts empty', () => {
    const history = new NavigationHistory();
    expect(history.length).toBe(0);
    expect(history.current).toBeUndefined();
    expect(history.canGoBack).toBe(false);
    expect(history.canGoForward).toBe(false);
  });

  it('records navigations in order', () => {
    const history = new NavigationHistory();
    history.push('https://a.example');
    history.push('https://b.example');

    expect(history.length).toBe(2);
    expect(history.current).toBe('https://b.example');
    expect(history.canGoBack).toBe(true);
    expect(history.canGoForward).toBe(false);
  });

  it('goes back and forward inside the stack', () => {
    const history = new NavigationHistory();
    history.push('https://a.example');
    history.push('https://b.example');
    history.push('https://c.example');

    expect(history.back()).toBe('https://b.example');
    expect(history.back()).toBe('https://a.example');
    expect(history.back()).toBeUndefined();
    expect(history.current).toBe('https://a.example');

    expect(history.forward()).toBe('https://b.example');
    expect(history.forward()).toBe('https://c.example');
    expect(history.forward()).toBeUndefined();
    expect(history.current).toBe('https://c.example');
  });

  it('drops the forward entries when a new navigation happens', () => {
    const history = new NavigationHistory();
    history.push('https://a.example');
    history.push('https://b.example');
    history.back();

    history.push('https://c.example');

    expect(history.all).toEqual(['https://a.example', 'https://c.example']);
    expect(history.canGoForward).toBe(false);
    expect(history.current).toBe('https://c.example');
  });

  it('replaces the current entry on reload', () => {
    const history = new NavigationHistory();
    history.push('https://a.example');
    history.replace('https://a.example');

    expect(history.length).toBe(1);
    expect(history.canGoBack).toBe(false);
  });

  it('pushes when replacing an empty history', () => {
    const history = new NavigationHistory();
    history.replace('https://a.example');
    expect(history.length).toBe(1);
    expect(history.current).toBe('https://a.example');
  });

  it('resets the stack', () => {
    const history = new NavigationHistory();
    history.push('https://a.example');
    history.push('https://b.example');

    history.reset('https://home.example');
    expect(history.all).toEqual(['https://home.example']);
    expect(history.canGoBack).toBe(false);
    expect(history.canGoForward).toBe(false);

    history.reset();
    expect(history.length).toBe(0);
    expect(history.current).toBeUndefined();
  });
});
