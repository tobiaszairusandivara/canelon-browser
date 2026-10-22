import * as vscode from 'vscode';

import { type SecurityPolicy, parseHttpUrl } from './SecurityManager';

export const CONFIG_SECTION = 'canelonBrowser';

export const DEFAULT_SEARCH_ENGINE = 'https://www.bing.com/search?q=%s';
export const DEFAULT_HOME_URL = 'https://www.wikipedia.org';

export interface BrowserConfig {
  readonly allowlist: readonly string[];
  readonly securityPolicy: SecurityPolicy;
  readonly searchEngine: string;
  readonly homeUrl: string;
}

export const DEFAULT_CONFIG: BrowserConfig = {
  allowlist: [],
  securityPolicy: 'open',
  searchEngine: DEFAULT_SEARCH_ENGINE,
  homeUrl: DEFAULT_HOME_URL,
};

/**
 * Reads the `canelonBrowser.*` settings and keeps a snapshot of them.
 *
 * Invalid values fall back to the defaults instead of breaking the panel.
 */
export class ConfigManager implements vscode.Disposable {
  private readonly changeEmitter = new vscode.EventEmitter<BrowserConfig>();
  private readonly subscription: vscode.Disposable;

  constructor() {
    this.subscription = vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration(CONFIG_SECTION)) {
        this.changeEmitter.fire(this.config);
      }
    });
  }

  public get onDidChange(): vscode.Event<BrowserConfig> {
    return this.changeEmitter.event;
  }

  public get config(): BrowserConfig {
    const section = vscode.workspace.getConfiguration(CONFIG_SECTION);
    return normalizeConfig({
      allowlist: section.get('allowlist'),
      securityPolicy: section.get('securityPolicy'),
      searchEngine: section.get('searchEngine'),
      homeUrl: section.get('homeUrl'),
    });
  }

  public dispose(): void {
    this.subscription.dispose();
    this.changeEmitter.dispose();
  }
}

/**
 * Turns raw setting values into a valid configuration.
 *
 * Exported separately from the class so it can be reasoned about (and reused)
 * without touching the VS Code API.
 */
export function normalizeConfig(raw: {
  allowlist?: unknown;
  securityPolicy?: unknown;
  searchEngine?: unknown;
  homeUrl?: unknown;
}): BrowserConfig {
  const allowlist = Array.isArray(raw.allowlist)
    ? raw.allowlist.filter(
        (entry): entry is string => typeof entry === 'string' && entry.trim().length > 0,
      )
    : DEFAULT_CONFIG.allowlist;

  const securityPolicy: SecurityPolicy =
    raw.securityPolicy === 'strict' || raw.securityPolicy === 'open'
      ? raw.securityPolicy
      : DEFAULT_CONFIG.securityPolicy;

  const searchEngine =
    typeof raw.searchEngine === 'string' && raw.searchEngine.includes('%s')
      ? raw.searchEngine.trim()
      : DEFAULT_CONFIG.searchEngine;

  const homeUrl =
    typeof raw.homeUrl === 'string' && parseHttpUrl(raw.homeUrl).ok
      ? raw.homeUrl.trim()
      : DEFAULT_CONFIG.homeUrl;

  return { allowlist, securityPolicy, searchEngine, homeUrl };
}
