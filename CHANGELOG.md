# Changelog

All notable changes to this project are documented in this file.
The format is based on [Conventional Commits](https://www.conventionalcommits.org/).

## [0.1.0] - 2026-10-22

### Bug fixes

- The browser did not load any page: the client of the webview rejected every
  message of the extension host, because VS Code overwrites `window.parent`
  with the window of the webview and posts the messages from the preload
  document. The origin of a message is now proven with a token that only the
  host and the webview know.
- The loading indicator stayed visible forever: the `hidden` attribute is
  implemented by the user agent and any author rule that sets `display` beats
  it.

### Features

- Open a browser in a VS Code webview with a toolbar, an editable address bar and Codicon buttons
- Contribute a container to the activity bar, so the extension appears in the bar like most of them. The command of the extension focuses that view, so the icon and the command do the same thing
- Route the text of the address bar to a configurable search engine when it is not a URL
- Enforce an allowlist with a `strict`/`open` security policy and generate the `frame-src` of the webview CSP from it
- Keep the navigation history on the extension side to drive Back, Forward and Reload
- Show a heuristic notice with an "Open in External Browser" button when a page refuses to be embedded
- Command Palette entry "Canelón Browser: Open"

### Documentation

- Document the limitations of the embedded browser, the manual test checklist and the VSIX packaging
