/**
 * A mock of the part of the VS Code API that the extension uses.
 *
 * It lets the tests of the extension host run outside of VS Code. The mock is
 * aliased to the `vscode` module in the configuration of Vitest.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export enum UIKind {
  Desktop = 1,
  Web = 2,
  Unknown = 3,
}

export enum ViewColumn {
  Active = -1,
  Beside = -2,
  One = 1,
  Two = 2,
}

export class Uri {
  private constructor(public readonly fsPath: string) {}

  public static file(fsPath: string): Uri {
    return new Uri(fsPath);
  }

  public static parse(value: string): Uri {
    return new Uri(value);
  }

  public static joinPath(base: Uri, ...parts: string[]): Uri {
    return new Uri(join(base.fsPath, ...parts));
  }

  public get path(): string {
    return this.fsPath;
  }

  public toString(): string {
    return this.fsPath;
  }
}

export class Disposable {
  public constructor(private readonly callOnDispose: () => void = () => {}) {}
  public dispose(): void {
    this.callOnDispose();
  }
}

export class EventEmitter<T> {
  private readonly listeners: ((value: T) => void)[] = [];

  public readonly event = (listener: (value: T) => void): Disposable => {
    this.listeners.push(listener);
    return new Disposable();
  };

  public fire(value: T): void {
    for (const listener of [...this.listeners]) {
      listener(value);
    }
  }

  public dispose(): void {
    this.listeners.length = 0;
  }
}

/** The settings the mock returns. */
export const configuration: Record<string, unknown> = {
  allowlist: [],
  securityPolicy: 'open',
  searchEngine: 'https://www.bing.com/search?q=%s',
  homeUrl: 'https://www.wikipedia.org',
};

/** The commands the extension executed, with their arguments. */
export const executedCommands: { command: string; args: unknown[] }[] = [];

/** The URLs that were opened in the external browser. */
export const openedExternally: string[] = [];

/** The messages that were shown to the user. */
export const shownMessages: string[] = [];

export const workspace = {
  getConfiguration: (_section?: string) => ({
    get: (key: string) => configuration[key],
  }),
  onDidChangeConfiguration: () => new Disposable(),
  fs: {
    readFile: async (uri: Uri): Promise<Uint8Array> => {
      // The template of the webview is read from the sources, so the tests do
      // not depend on a build.
      const content = readFileSync(join(process.cwd(), 'src', 'webview', 'index.html'), 'utf8');
      void uri;
      return new TextEncoder().encode(content);
    },
  },
};

export const window = {
  showInformationMessage: async (message: string): Promise<void> => {
    shownMessages.push(message);
  },
  showErrorMessage: async (message: string): Promise<void> => {
    shownMessages.push(message);
  },
};

export const commands = {
  registerCommand: (_id: string, _callback: (...args: unknown[]) => unknown) => new Disposable(),
  executeCommand: async (command: string, ...args: unknown[]): Promise<void> => {
    executedCommands.push({ command, args });
  },
};

export const env = {
  uiKind: UIKind.Desktop,
  openExternal: async (uri: Uri): Promise<boolean> => {
    openedExternally.push(uri.toString());
    return true;
  },
};
