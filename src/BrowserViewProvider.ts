import * as vscode from 'vscode';

import { type BrowserSession } from './BrowserSession';

/**
 * The browser shown in the activity bar.
 *
 * The view is a webview view, the same kind of surface VS Code uses for the
 * views of most of the extensions. The command of the extension focuses it,
 * so the icon of the activity bar and the command do exactly the same thing.
 */
export class BrowserViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    private readonly session: BrowserSession,
    private readonly extensionUri: vscode.Uri,
  ) {}

  public async resolveWebviewView(view: vscode.WebviewView): Promise<void> {
    view.webview.options = {
      enableScripts: true,
      // Without this the sandbox of the frame of the webview does not allow
      // the forms, so no page could ever send a login.
      enableForms: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview')],
    };

    await this.session.attach(view.webview);

    view.onDidDispose(() => {
      this.session.detach(view.webview);
    });

    view.onDidChangeVisibility(() => {
      if (view.visible) {
        void this.session.refresh();
      }
    });
  }

  public dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables.length = 0;
  }
}
