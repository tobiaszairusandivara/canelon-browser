import * as vscode from 'vscode';

import { BrowserSession } from './BrowserSession';
import { BrowserViewProvider } from './BrowserViewProvider';
import { ConfigManager } from './ConfigManager';

export const VIEW_ID = 'canelonBrowser.browser';

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

  context.subscriptions.push(
    vscode.commands.registerCommand('canelonBrowser.open', async () => {
      await vscode.commands.executeCommand(`${VIEW_ID}.focus`);
    }),
  );
}

export function deactivate(): void {
  // Everything is disposed through the subscriptions of the context.
}
