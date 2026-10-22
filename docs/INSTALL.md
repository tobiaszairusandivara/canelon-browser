# Build and install the VSIX

## Build

```bash
npm install
npm run verify     # typecheck + tests + build, must be green
npm run package    # builds and runs vsce package
```

The package script produces `canelon-browser-0.1.0.vsix` in the root of the
repository.

`vsce` needs a `README.md`, a `LICENSE` and a `repository` field in
`package.json`; all three are present. To package without the repository
metadata (for example in a fork) add `--allow-missing-repository`.

## Install on desktop VS Code

```bash
code --install-extension ./canelon-browser-0.1.0.vsix
```

To reinstall over an existing version:

```bash
code --install-extension ./canelon-browser-0.1.0.vsix --force
```

After the installation, run **Canelón Browser: Open** from the Command Palette.

## Install on code-server (remote web)

```bash
code-server --install-extension /path/to/canelon-browser-0.1.0.vsix
```

If the `code-server` binary is not on the `PATH`, copy the VSIX into the
extensions folder of the server and restart it:

```bash
cp canelon-browser-0.1.0.vsix ~/.vscode-server/extensions/
```

The extension runs on the remote side, the panel is rendered in the browser of
the user. Remember the `localhost` limitation described in
[LIMITATIONS.md](LIMITATIONS.md).

## Uninstall

```bash
code --uninstall-extension canelon.embedded-browser
code-server --uninstall-extension canelon.embedded-browser
```

## Development loop

```bash
npm run watch        # rebuilds on every change
```

Press `F5` in VS Code with an `.vscode/launch.json` that starts the extension
in a development host, or load the folder with **Run Extension** from the
command palette of the extension development host.
