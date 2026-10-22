/**
 * Extension-side navigation history.
 *
 * The page lives in a cross-origin iframe, so the extension cannot read its
 * URL and cannot call `history.back()` inside it. The toolbar therefore drives
 * this stack and re-points the iframe at the recorded URLs.
 *
 * This module is pure on purpose: it has no `vscode` dependency so it can be
 * unit tested directly.
 */
export class NavigationHistory {
  private entries: string[] = [];
  private index = -1;

  /** The URL of the current entry, if any. */
  public get current(): string | undefined {
    return this.index >= 0 ? this.entries[this.index] : undefined;
  }

  public get canGoBack(): boolean {
    return this.index > 0;
  }

  public get canGoForward(): boolean {
    return this.index >= 0 && this.index < this.entries.length - 1;
  }

  public get length(): number {
    return this.entries.length;
  }

  /** The recorded URLs, oldest first. */
  public get all(): readonly string[] {
    return this.entries;
  }

  /**
   * Records a new navigation. Any forward entries are dropped, the same way a
   * browser drops them after the user follows a link.
   */
  public push(url: string): void {
    if (this.index < this.entries.length - 1) {
      this.entries = this.entries.slice(0, this.index + 1);
    }
    this.entries.push(url);
    this.index = this.entries.length - 1;
  }

  /** Replaces the current entry, used by reload so the stack does not grow. */
  public replace(url: string): void {
    if (this.index < 0) {
      this.push(url);
      return;
    }
    this.entries[this.index] = url;
  }

  /** Moves one entry back and returns the new URL, or `undefined` at the start. */
  public back(): string | undefined {
    if (!this.canGoBack) {
      return undefined;
    }
    this.index -= 1;
    return this.entries[this.index];
  }

  /** Moves one entry forward and returns the new URL, or `undefined` at the end. */
  public forward(): string | undefined {
    if (!this.canGoForward) {
      return undefined;
    }
    this.index += 1;
    return this.entries[this.index];
  }

  /** Clears the stack, optionally starting it at a given URL. */
  public reset(url?: string): void {
    this.entries = url === undefined ? [] : [url];
    this.index = url === undefined ? -1 : 0;
  }
}
