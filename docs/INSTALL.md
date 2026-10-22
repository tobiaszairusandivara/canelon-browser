# Build and install the VSIX

## Download the packaged extension (without cloning the repository)

The CI publishes the packaged extension as an artifact of every run, so the
VSIX can be tried without downloading the repository:

1. Open the **Actions** tab of the repository, or the check of the pull request.
2. Open the run of the `verify` workflow.
3. In the **Artifacts** section, download `canelon-browser-vsix`.
4. Unzip it: it contains the `embedded-browser-<version>.vsix` file.

From the command line:

```bash
gh run download <run-id> -n canelon-browser-vsix -D /tmp/canelon-browser
```

The artifacts expire after 90 days and they need a GitHub login, because the
repository is private. A release with the same file attached is the permanent
alternative.

## Install on desktop VS Code

```bash
code --install-extension ./embedded-browser-0.1.0.vsix
```

To reinstall over an existing version:

```bash
code --install-extension ./embedded-browser-0.1.0.vsix --force
```

After the installation, run **Canelón Browser: Open** from the Command Palette.

## Install on code-server (remote web)

The extension runs on the remote side, the panel is rendered in the browser of
the user. Remember the `localhost` limitation described in
[LIMITATIONS.md](LIMITATIONS.md).

With the CLI of the server:

```bash
code-server --install-extension /path/to/embedded-browser-0.1.0.vsix
```

Without the CLI, the server also discovers an extension that is unpacked in its
extensions folder. A VSIX is a zip whose contents live under `extension/`, so
the files have to end up directly in the folder of the extension:

```bash
TARGET=~/.vscode-server/extensions/canelon.embedded-browser-0.1.0
mkdir -p "$TARGET"
cd "$TARGET"

# unzip the VSIX (python3 works too: python3 -m zipfile -e <vsix> .)
unzip ~/Downloads/canelon-browser-vsix/embedded-browser-0.1.0.vsix
mv extension/* .
rmdir extension
```

The folder has to end up with `package.json` and `dist/` inside it. Restart the
server afterwards, or use **Extensions: Install from VSIX** in the remote
editor.

## Build

```bash
npm install
npm run verify     # typecheck + lint + tests + build, must be green
npm run package    # builds and runs vsce package
```

The package script produces `embedded-browser-0.1.0.vsix` in the root of the
repository. The file is ignored by git, it is a build artifact.

The name of the file comes from the `name` of the package, while the
identifier of the extension is `canelon.embedded-browser` (the publisher and
the name), which is the one the uninstall command needs.

`vsce` needs a `README.md`, a `LICENSE` and a `repository` field in
`package.json`; all three are present. To package without the repository
metadata (for example in a fork) add `--allow-missing-repository`.

## Uninstall

```bash
code --uninstall-extension canelon.embedded-browser
code-server --uninstall-extension canelon.embedded-browser
```

On a server without the CLI, remove the folder
`~/.vscode-server/extensions/canelon.embedded-browser-0.1.0` and restart the
server.

## Development loop

```bash
npm run dev         # rebuilds on every change
```

Press `F5` in VS Code to launch the Extension Development Host with the
`.vscode/launch.json` of the repository.
