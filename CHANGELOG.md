# Changelog

All notable changes to this project are documented in this file.
The format is based on [Conventional Commits](https://www.conventionalcommits.org/).

## [0.1.0] - 2026-10-22

### Features

- Open a browser in a VS Code webview panel with a toolbar, an editable address bar and Codicon buttons
- Route the text of the address bar to a configurable search engine when it is not a URL
- Enforce an allowlist with a `strict`/`open` security policy and generate the `frame-src` of the webview CSP from it
- Keep the navigation history on the extension side to drive Back, Forward and Reload
- Show a heuristic notice with an "Open in External Browser" button when a page refuses to be embedded
- Command Palette entry "Canelón Browser: Open"

### Documentation

- Document the limitations of the embedded browser, the manual test checklist and the VSIX packaging
