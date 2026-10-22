# Manual test checklist

Run the whole list on desktop VS Code and on code-server. Every step that
fails is a bug to report.

## 0. Install

- [ ] The panel opens with **Canelón Browser: Open** from the Command Palette.
- [ ] The panel opens next to the editor and the toolbar shows Back, Forward,
      Reload, Home, the address bar and the external-browser button.
- [ ] The toolbar uses the theme of the editor (VS Code CSS variables) and the
      Codicon glyphs are rendered, not empty squares.
- [ ] The command a second time reuses the same panel instead of opening a
      second one.

## 1. Search routing

- [ ] Typing `how to test` in the address bar and pressing Enter loads a
      search engine page with the query encoded (`?q=how%20to%20test`).
- [ ] Typing `example.com` loads `https://example.com` and **not** a search.
- [ ] Typing `localhost:3000` loads `http://localhost:3000` and not a search.
- [ ] Typing `http://example.com/a?b=c` keeps the path and the query.
- [ ] Typing `javascript:alert(1)` shows an error notice and loads nothing.
- [ ] Changing `canelonBrowser.searchEngine` to another `%s` template and
      searching again uses the new engine.

## 2. Navigation history

- [ ] Load `https://example.com`, then `https://example.org`, then `https://example.net`.
- [ ] **Back** goes to `example.org` and the address bar follows.
- [ ] **Back** again goes to `example.com`.
- [ ] **Forward** goes back to `example.org` and then to `example.net`.
- [ ] Back and Forward are greyed out at the ends of the history.
- [ ] **Reload** keeps the same URL and does not add an entry to the history
      (the Back button state does not change).
- [ ] **Home** loads `canelonBrowser.homeUrl`.
- [ ] After a Back, loading a new page drops the forward entries.

## 3. Allowlist

Set `canelonBrowser.securityPolicy` to `strict` and
`canelonBrowser.allowlist` to:

```json
["*.internal.company.com", "localhost:*", "https://docs.python.org/*"]
```

- [ ] `https://docs.python.org/3/` loads (exact host, exact scheme).
- [ ] `http://docs.python.org/3/` is **blocked**: the panel shows the policy
      error and no page is loaded.
- [ ] `https://example.com` is **blocked** with a message that mentions the
      strict policy.
- [ ] A host that matches the wildcard loads, if it exists and allows framing.
- [ ] Changing the allowlist reloads the panel and the new list is applied
      without reloading the window.
- [ ] With `canelonBrowser.securityPolicy` back to `open`, `https://example.com`
      loads again.
- [ ] `file:///etc/passwd` and `javascript:alert(1)` are always refused, in
      both policies.

### The browser also blocks it

- [ ] With `strict` and the allowlist above, open the developer tools of the
      webview and check that the `frame-src` of the Content Security Policy
      only lists the allowlisted hosts. A URL outside the allowlist is
      refused by the browser itself, not only by the extension code.

## 4. Pages that refuse to be embedded

- [ ] Load `https://duckduckgo.com` (it sends `X-Frame-Options: SAMEORIGIN`):
      the panel shows the notice that the page may refuse to be embedded and
      offers **Open in External Browser**.
- [ ] Clicking **Open in External Browser** opens the page in the system
      browser.
- [ ] A page that loads normally shows no warning notice.

## 5. Desktop VS Code

- [ ] The panel survives switching tabs and coming back (the page is not
      reloaded from scratch).
- [ ] Reloading the window keeps the extension working: the command opens the
      panel again.
- [ ] The panel is not affected by the light and the dark theme.

## 6. code-server (remote web)

- [ ] The command opens the panel in the browser of the user.
- [ ] A page reachable from the internet loads.
- [ ] `http://localhost:3000` in the frame points at the machine of the
      **user**, not at the container: confirm it in the panel and remember
      that the heuristic probe resolves the same name in the container.
- [ ] The extension host logs no errors when the panel is opened
      (Developer Tools → Extension Host log).

## 7. Regression

- [ ] `npm run verify` passes (typecheck, unit tests, build).
- [ ] `npm test` runs the SecurityManager, NavigationHistory, IPC and
      frameability suites.
