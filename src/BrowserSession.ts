import { randomBytes } from 'node:crypto';

import * as vscode from 'vscode';

import { type BrowserConfig, type ConfigManager } from './ConfigManager';
import { type FrameabilityResult, probeFrameability } from './Frameability';
import { NavigationHistory } from './NavigationHistory';
import {
  FRAME_LOAD_TIMEOUT_MS,
  type HostMessage,
  type PanelInitState,
  type WebviewMessage,
  parseWebviewMessage,
} from './types';
import { buildFrameSrc, isAllowedByPolicy, parseHttpUrl, resolveTarget } from './SecurityManager';

/**
 * The state of the browser: the history, the current URL and the policy.
 *
 * The logic lives here and not in the view provider, so it can be reasoned
 * about apart from the VS Code API.
 */
export class BrowserSession {
  private readonly history = new NavigationHistory();
  private currentUrl = '';
  private webview: vscode.Webview | undefined;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly configManager: ConfigManager,
  ) {}

  public get url(): string {
    return this.currentUrl;
  }

  public get canGoBack(): boolean {
    return this.history.canGoBack;
  }

  public get canGoForward(): boolean {
    return this.history.canGoForward;
  }

  private get config(): BrowserConfig {
    return this.configManager.config;
  }

  /**
   * Prepares a webview: builds its HTML with the CSP of the allowlist, wires
   * its messages and keeps the state of the browser.
   */
  public async attach(webview: vscode.Webview): Promise<void> {
    this.webview = webview;
    webview.html = await this.buildHtml(webview);

    webview.onDidReceiveMessage((raw: unknown) => {
      void this.handleMessage(raw);
    });

    if (this.currentUrl.length === 0) {
      const home = this.config.homeUrl;
      const validation = parseHttpUrl(home);
      this.currentUrl = validation.ok && validation.url ? validation.url.href : home;
    }
  }

  /** Forgets a webview that is gone. */
  public detach(webview: vscode.Webview): void {
    if (this.webview === webview) {
      this.webview = undefined;
    }
  }

  /**
   * Points the webview at the current URL again, used when the view is
   * resolved again after being disposed.
   */
  public async refresh(): Promise<void> {
    if (!this.webview || this.currentUrl.length === 0) {
      return;
    }
    this.post({
      type: 'navigate',
      url: this.currentUrl,
      canGoBack: this.history.canGoBack,
      canGoForward: this.history.canGoForward,
    });
  }

  private async buildHtml(webview: vscode.Webview): Promise<string> {
    const config = this.config;
    const nonce = randomBytes(16).toString('hex');
    const frameSrc = buildFrameSrc(config.allowlist, config.securityPolicy);

    const csp = [
      "default-src 'none'",
      `img-src ${webview.cspSource} data:`,
      `style-src ${webview.cspSource}`,
      `font-src ${webview.cspSource}`,
      `script-src 'nonce-${nonce}'`,
      "connect-src 'none'",
      `frame-src ${frameSrc}`,
    ].join('; ');

    const stylesUri = webview
      .asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview', 'styles.css'))
      .toString();
    const scriptUri = webview
      .asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview', 'main.js'))
      .toString();

    const template = await vscode.workspace.fs.readFile(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview', 'index.html'),
    );

    return new TextDecoder()
      .decode(template)
      .replaceAll('__CSP__', csp)
      .replaceAll('__NONCE__', nonce)
      .replaceAll('__STYLE_URI__', stylesUri)
      .replaceAll('__SCRIPT_URI__', scriptUri);
  }

  private post(message: HostMessage): void {
    if (!this.webview) {
      return;
    }
    void this.webview.postMessage(message);
  }

  private async handleMessage(raw: unknown): Promise<void> {
    const message: WebviewMessage | undefined = parseWebviewMessage(raw);
    if (!message) {
      return;
    }

    switch (message.type) {
      case 'ready': {
        this.postInit();
        return;
      }
      case 'navigate': {
        await this.navigateFromInput(message.input);
        return;
      }
      case 'back': {
        this.goBack();
        return;
      }
      case 'forward': {
        this.goForward();
        return;
      }
      case 'reload': {
        this.reload();
        return;
      }
      case 'home': {
        await this.navigateTo(this.config.homeUrl);
        return;
      }
      case 'openExternal': {
        await this.openExternal(message.url ?? this.currentUrl);
        return;
      }
      case 'frameLoaded': {
        return;
      }
      case 'frameTimeout': {
        await this.reportSuspectedBlock(message.url);
        return;
      }
      default:
        return;
    }
  }

  private postInit(): void {
    const state: PanelInitState = {
      url: this.currentUrl,
      canGoBack: this.history.canGoBack,
      canGoForward: this.history.canGoForward,
      securityPolicy: this.config.securityPolicy,
      loadTimeoutMs: FRAME_LOAD_TIMEOUT_MS,
    };
    this.post({ type: 'init', state });
  }

  private async navigateFromInput(input: string): Promise<void> {
    const resolved = resolveTarget(input, this.config.searchEngine);
    if (!resolved.ok) {
      this.post({ type: 'error', message: resolved.reason });
      return;
    }
    await this.navigateTo(resolved.url.href);
  }

  /**
   * Loads a URL after the policy allowed it.
   */
  public async navigateTo(target: string): Promise<void> {
    const validation = parseHttpUrl(target);
    if (!validation.ok || !validation.url) {
      this.post({ type: 'error', message: validation.reason ?? 'The URL is not valid.' });
      return;
    }

    const url = validation.url;
    const decision = isAllowedByPolicy(url, this.config.allowlist, this.config.securityPolicy);
    if (!decision.allowed) {
      this.post({
        type: 'error',
        message:
          decision.reason ??
          `"${url.href}" is blocked by the current security policy and allowlist.`,
      });
      return;
    }

    this.history.push(url.href);
    this.currentUrl = url.href;
    this.post({
      type: 'navigate',
      url: url.href,
      canGoBack: this.history.canGoBack,
      canGoForward: this.history.canGoForward,
    });
    void this.inspectFrameability(url.href);
  }

  private goBack(): void {
    const url = this.history.back();
    if (url === undefined) {
      return;
    }
    this.currentUrl = url;
    this.post({
      type: 'navigate',
      url,
      canGoBack: this.history.canGoBack,
      canGoForward: this.history.canGoForward,
    });
    void this.inspectFrameability(url);
  }

  private goForward(): void {
    const url = this.history.forward();
    if (url === undefined) {
      return;
    }
    this.currentUrl = url;
    this.post({
      type: 'navigate',
      url,
      canGoBack: this.history.canGoBack,
      canGoForward: this.history.canGoForward,
    });
    void this.inspectFrameability(url);
  }

  private reload(): void {
    if (this.currentUrl.length === 0) {
      return;
    }
    this.post({
      type: 'navigate',
      url: this.currentUrl,
      canGoBack: this.history.canGoBack,
      canGoForward: this.history.canGoForward,
    });
    void this.inspectFrameability(this.currentUrl);
  }

  private async openExternal(target: string): Promise<void> {
    const validation = parseHttpUrl(target);
    if (!validation.ok || !validation.url) {
      this.post({ type: 'error', message: validation.reason ?? 'The URL is not valid.' });
      return;
    }
    await vscode.env.openExternal(vscode.Uri.parse(validation.url.href));
  }

  /**
   * Asks the server whether it probably refuses to be framed and reports the
   * answer as a hint.
   *
   * The check runs in the extension host, which is not always the machine
   * that renders the frame, so it can only ever be an indication.
   */
  private async inspectFrameability(url: string): Promise<void> {
    const result: FrameabilityResult = await probeFrameability(url);
    if (result.verdict !== 'blocked') {
      return;
    }
    await this.reportSuspectedBlock(url, result.detail);
  }

  private async reportSuspectedBlock(url: string, detail?: string): Promise<void> {
    if (url !== this.currentUrl) {
      return;
    }

    const explanation =
      detail ??
      `The page did not answer within ${Math.round(FRAME_LOAD_TIMEOUT_MS / 1000)} seconds.`;

    this.post({
      type: 'notice',
      level: 'warning',
      message: `This page may refuse to be embedded in the editor (X-Frame-Options or CSP frame-ancestors). ${explanation} This check is heuristic, so the page may still be fine.`,
      action: 'openExternal',
      url,
    });
  }
}
