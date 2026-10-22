import { build, context } from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const watch = process.argv.includes('--watch');

const shared = {
  bundle: true,
  sourcemap: true,
  minify: false,
  logLevel: 'info',
};

const extensionBuild = {
  ...shared,
  entryPoints: [resolve(root, 'src/extension.ts')],
  outfile: resolve(root, 'dist/extension.js'),
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  external: ['vscode'],
};

const webviewBuild = {
  ...shared,
  entryPoints: [resolve(root, 'src/webview/main.ts')],
  outfile: resolve(root, 'dist/webview/main.js'),
  platform: 'browser',
  format: 'iife',
  target: 'es2022',
};

async function copyWebviewAssets() {
  await mkdir(resolve(root, 'dist/webview'), { recursive: true });
  await Promise.all([
    cp(resolve(root, 'src/webview/index.html'), resolve(root, 'dist/webview/index.html')),
    cp(resolve(root, 'src/webview/styles.css'), resolve(root, 'dist/webview/styles.css')),
  ]);
}

async function main() {
  await rm(resolve(root, 'dist'), { recursive: true, force: true });
  await copyWebviewAssets();

  if (!watch) {
    await build(extensionBuild);
    await build(webviewBuild);
    return;
  }

  const extensionCtx = await context(extensionBuild);
  const webviewCtx = await context(webviewBuild);
  await Promise.all([extensionCtx.watch(), webviewCtx.watch()]);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
