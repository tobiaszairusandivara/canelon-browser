import * as vscode from 'vscode';

import { BrowserPanel } from './BrowserPanel';
import { ConfigManager } from './ConfigManager';

let panel: BrowserPanel | undefined;

/**
 * Entry point of the extension host.
 *
 * The panel is created lazily and reused, so the command always reveals the
 * same browser instead of opening a new one on every invocation.
 */
export function activate(context: vscode.ExtensionContext): void {
  const configManager = new ConfigManager();
  context.subscriptions.push(configManager);

  context.subscriptions.push(
    vscode.commands.registerCommand('canelonBrowser.open', async (argument?: unknown) => {
      const initialUrl = typeof argument === 'string' ? argument : undefined;

      if (panel && !panel.isDisposed) {
        panel.reveal();
        if (initialUrl !== undefined) {
          await panel.navigate(initialUrl);
        }
        return;
      }

      panel = await BrowserPanel.create(context.extensionUri, configManager);
      panel.reveal();
      if (initialUrl !== undefined) {
        await panel.navigate(initialUrl);
      }
    }),
  );
}

export function deactivate(): void {
  panel?.dispose();
  panel = undefined;
}
