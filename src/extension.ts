import * as vscode from 'vscode';

import { BrowserSession } from './BrowserSession';
import { BrowserViewProvider } from './BrowserViewProvider';
import { ConfigManager } from './ConfigManager';

export const VIEW_ID = 'canelonBrowser.browser';

/**
 * The context key that tells whether the extension runs in the desktop
 * application.
 *
 * The shortcuts of the browser are only bound there: in code-server the
 * browser is the one that answers Ctrl+R and it would reload the whole
 * workbench.
 */
export const DESKTOP_CONTEXT_KEY = 'canelonBrowser.desktop';

/**
 * Entry point of the extension host.
 *
 * The browser lives in a view of the activity bar. The command of the
 * extension focuses that view, so the icon of the activity bar and the
 * command do exactly the same thing.
 */
export function activate(context: vscode.ExtensionContext): void {
  const configManager = new ConfigManager();
  context.subscriptions.push(configManager);

  const session = new BrowserSession(context.extensionUri, configManager);
  const provider = new BrowserViewProvider(session, context.extensionUri);
  context.subscriptions.push(provider);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(VIEW_ID, provider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
  );

  void vscode.commands.executeCommand(
    'setContext',
    DESKTOP_CONTEXT_KEY,
    vscode.env.uiKind === vscode.UIKind.Desktop,
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('canelonBrowser.open', async () => {
      await vscode.commands.executeCommand(`${VIEW_ID}.focus`);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('canelonBrowser.focusAddressBar', () => {
      session.focusAddressBar();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('canelonBrowser.back', () => {
      session.back();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('canelonBrowser.forward', () => {
      session.forward();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('canelonBrowser.reload', () => {
      session.reload();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('canelonBrowser.openDeveloperTools', async () => {
      if (vscode.env.uiKind === vscode.UIKind.Desktop) {
        await vscode.commands.executeCommand('workbench.action.webview.openDeveloperTools');
        return;
      }
      await vscode.window.showInformationMessage(
        'In code-server the developer tools of the browser show the workbench. Open them with F12 in the browser: the webview is an iframe of that page.',
      );
    }),
  );
}

export function deactivate(): void {
  // Everything is disposed through the subscriptions of the context.
}
