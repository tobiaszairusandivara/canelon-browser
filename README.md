# Canelón Browser

A browser that lives inside a VS Code panel.

The VS Code webview is already a Chromium instance, so the extension does not
ship a browser, a headless Chrome or any runtime dependency: it renders the
page in an `iframe` inside a webview panel and drives it with a small toolbar.

- **Zero runtime dependencies.** Only devDependencies (`typescript`, `esbuild`,
  `vitest`, `@types/vscode`, `@vscode/vsce`).
- **Allowlist enforcement.** In `strict` mode the `frame-src` of the webview
  Content Security Policy is generated from the allowlist, so the browser
  refuses a non-allowed page even if the extension code were bypassed.
- **Search or URL.** Whatever is not a URL goes to the configured search
  engine.
- **Navigation history.** The extension keeps the history on its side, because
  a cross-origin frame cannot be inspected from the extension host.

## Commands

| Command               | Palette                   |
| :-------------------- | :------------------------ |
| `canelonBrowser.open` | **Canelón Browser: Open** |

The command opens the panel next to the current editor and reuses it on the
next invocation.

## Settings

| Setting                         | Type               | Default                            | Description                                                                      |
| :------------------------------ | :----------------- | :--------------------------------- | :------------------------------------------------------------------------------- |
| `canelonBrowser.allowlist`      | `string[]`         | `[]`                               | Patterns the browser may load.                                                   |
| `canelonBrowser.securityPolicy` | `strict` \| `open` | `open`                             | `strict` blocks everything that is not allowlisted.                              |
| `canelonBrowser.searchEngine`   | `string`           | `https://www.bing.com/search?q=%s` | Template used for text that is not a URL. `%s` is replaced by the encoded query. |
| `canelonBrowser.homeUrl`        | `string`           | `https://www.wikipedia.org`        | Page loaded when the panel opens and when Home is pressed.                       |

### Allowlist patterns

| Pattern                       | Matches                                                          |
| :---------------------------- | :--------------------------------------------------------------- |
| `example.com`                 | `http://example.com` and `https://example.com` (any path).       |
| `*.internal.company.com`      | `internal.company.com` and every subdomain, over http and https. |
| `localhost:3000`              | That exact port.                                                 |
| `localhost:*`                 | Any port.                                                        |
| `https://docs.python.org/*`   | Only that scheme, host and path prefix.                          |
| `http://localhost:8080/admin` | A scheme, a host, a port and a path prefix.                      |

Only `http:` and `https:` are ever loaded. A pattern without a scheme matches
both. A pattern that cannot be parsed is ignored, and the Settings editor
reports invalid values.

### Search engine and framing

Many search engines send `X-Frame-Options: SAMEORIGIN` or a
`Content-Security-Policy: frame-ancestors` directive, which means their pages
**cannot** be displayed inside an iframe at all. `duckduckgo.com`,
`google.com`, `mojeek.com` and `brave.com` are among them. The default search
engine is Bing because its result pages send no such header, so searching
works out of the box. The default home page is Wikipedia for the same reason:
the Bing _home page_ does send `X-Frame-Options: SAMEORIGIN`, only its result
pages do not.

When a page refuses to be framed, the panel shows a clear notice with an
**Open in External Browser** button. The detection is a heuristic, never a
guarantee — see [docs/LIMITATIONS.md](docs/LIMITATIONS.md).

## Development

The scripts follow the names the repository conventions reserve, so the CI and
the release checklist keep working:

```bash
npm install          # install the dependencies
npm run dev          # esbuild in watch mode
npm run build        # production build of the extension and the webview client
npm run typecheck    # tsc --noEmit, host and webview
npm run lint         # ESLint + Prettier check
npm run format       # Prettier write
npm run test         # Vitest, single run
npm run test:watch   # Vitest in watch mode
npm run test:cov     # Vitest with the coverage thresholds enforced
npm run verify       # typecheck && lint && test && build
```

`npm run dev` is the watch build, the extension equivalent of the `dev` script
of the desktop client: press `F5` to launch the Extension Development Host.

The coverage thresholds are the ones of the repository (80% statements, 80%
branches, 80% functions, 70% lines). They are measured over the modules that
can be unit tested outside of a VS Code host, because the extension host
modules need a running VS Code to be exercised.

The project layout:

```text
src/
├── extension.ts        # activation, command registration
├── BrowserPanel.ts     # panel, policy enforcement, history, IPC
├── SecurityManager.ts  # pure URL validation, allowlist and CSP generation
├── ConfigManager.ts    # typed access to the settings
├── NavigationHistory.ts# pure extension-side history
├── Frameability.ts     # heuristic X-Frame-Options / frame-ancestors probe
├── types.ts            # discriminated unions and message validators
└── webview/            # index.html, main.ts, styles.css
```

`SecurityManager.ts`, `NavigationHistory.ts`, `Frameability.ts` and `types.ts`
never import `vscode`, so they are unit tested directly with Vitest.

The extension has **no runtime dependency**: the validation of the messages and
of the URLs is written with discriminated unions instead of a schema library,
which keeps the package installable without a `dependencies` block.

## Packaging

See [docs/INSTALL.md](docs/INSTALL.md) for the `vsce` commands and the
installation on desktop VS Code and on code-server.

## Manual test checklist

See [docs/MANUAL_TEST_CHECKLIST.md](docs/MANUAL_TEST_CHECKLIST.md).

## Limitations

See [docs/LIMITATIONS.md](docs/LIMITATIONS.md).

## License

MIT — see [LICENSE](LICENSE).
