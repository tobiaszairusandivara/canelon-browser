# Limitations

The embedded browser is a `iframe` inside a VS Code webview. That single fact
causes every limitation listed here. None of them is a bug in the extension:
they are the price of not shipping a browser.

## X-Frame-Options and CSP `frame-ancestors`

A server can forbid its pages from being embedded:

```http
X-Frame-Options: SAMEORIGIN
```

```http
Content-Security-Policy: frame-ancestors 'none'
```

When a server sends one of those, Chromium refuses to render the page inside
the frame and shows an error page instead. The extension cannot read what the
frame rendered (it is cross-origin), so the detection is a **heuristic**:

1. the iframe does not fire its `load` event within 12 seconds, or
2. the extension host asks the server for its headers and finds
   `X-Frame-Options` or a `frame-ancestors` directive that does not include
   the webview origin.

The panel then shows a notice with an **Open in External Browser** button. The
notice says "may refuse to be embedded", because the check is an indication,
not a proof. A page can also block framing with JavaScript (frame busting),
which no header check can detect.

Many popular sites block framing, among them `duckduckgo.com`,
`google.com`, `brave.com`, `ecosia.org`, `startpage.com` and `mojeek.com`
(the last one sends `frame-ancestors 'none'` instead of `X-Frame-Options`).
The default search engine of this extension is Bing because it sends no such
header, so the search works out of the box. Its home page is an exception:
`www.bing.com` sends `X-Frame-Options: SAMEORIGIN` while
`www.bing.com/search?q=…` does not, which is why the default home page of
this extension is Wikipedia.

The probe runs in the extension host, which is not always the machine that
renders the frame — see the code-server section below.

## Cookies and session isolation

- The frame is a third-party context for every site it loads. Modern browsers
  block or partition third-party cookies, so many sites drop the session
  right away, show the login page again or refuse to work at all.
- The webview has its own cookie store, separate from the system browser.
  Being logged in in Chrome does not mean being logged in in the panel, and
  the other way around. The panel keeps the session of the site between
  restarts of the editor, but never shares it with the browser.
- Some sites refuse to work without a first-party context. Nothing the
  extension can do about it: use the external browser button.

## History and address bar

The frame is cross-origin, so the extension host cannot read its URL and
cannot call `history.back()` inside it. Two consequences:

- **Links clicked inside the page do not update the address bar.** The
  extension only knows the URLs it navigated to, so the address bar can show
  the previous page while the frame already shows the next one.
- **Back and Forward walk the extension-side history**, not the real history
  of the frame. After clicking a link inside the page, Back returns to the
  last URL the extension navigated to, which may skip the page the user came
  from.

Both are inherent to the cross-origin frame and are documented here on
purpose.

## code-server and "localhost"

In code-server the split is:

| Part                         | Runs on                                |
| :--------------------------- | :------------------------------------- |
| The extension host           | The container (or the remote machine). |
| The webview and the `iframe` | The browser of the user.               |

Because the frame runs in the browser of the user, **`localhost` inside the
embedded browser is the machine of the user, not the container**. A service
listening on `localhost:3000` inside the container is _not_ reachable from the
frame, while the same address on the machine of the user may be reachable (or
may be a completely different service).

The same applies to the heuristic probe: it runs in the extension host, so in
code-server it resolves `localhost` inside the container. The probe can
therefore report a different answer than the frame gets.

If a service of the container has to be embedded, expose it through a host
name or a port that the user can reach, and add that host to the allowlist.

## Other limitations

- The panel keeps a single browser instance; there are no tabs and no
  separate windows.
- The `Open in External Browser` action needs a system browser. In a remote
  web session it opens the browser of the user.
- Only `http:` and `https:` are loaded. `file:`, `ftp:`, `data:` and
  `javascript:` are rejected by the extension and by the CSP of the webview.
- Pop-ups of the framed site may be blocked by the webview sandbox.
- Downloads of the framed site are handled by the browser, not by the
  extension.
