// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

// Vitest runs the tests from the root of the project.
const ROOT = process.cwd();

describe('the stylesheet of the webview', () => {
  it('hides the elements with the hidden attribute', async () => {
    const css = await readFile(resolve(ROOT, 'src/webview/styles.css'), 'utf8');

    // The user agent implements the `hidden` attribute with
    // `[hidden] { display: none }`, and any author rule that sets `display`
    // beats it whatever its specificity. Without an explicit rule the
    // loading indicator stays visible forever, because its class sets
    // `display: inline-flex`.
    expect(css).toMatch(/\[hidden\]\s*\{[^}]*display:\s*none\s*!important/);
  });

  it('does not force the display of the elements that use the hidden attribute', async () => {
    const css = await readFile(resolve(ROOT, 'src/webview/styles.css'), 'utf8');
    const html = await readFile(resolve(ROOT, 'src/webview/index.html'), 'utf8');

    const hiddenIds = [...html.matchAll(/id="([^"]+)"[^>]*\shidden\b/g)].map(
      (match) => match[1] ?? '',
    );
    expect(hiddenIds.length).toBeGreaterThan(0);

    for (const id of hiddenIds) {
      const className = new RegExp(`id="${id}"[^>]*class="([^"]+)"`).exec(html)?.[1];
      expect(className, `the element "${id}" has no class`).toBeDefined();
      for (const name of (className ?? '').split(/\s+/).filter(Boolean)) {
        const rule = new RegExp(`\\.${name}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? '';
        // A rule with `!important` would compete with the global rule for
        // `[hidden]` and the outcome would depend on the order of the rules.
        expect(rule, `the class "${name}" forces the display`).not.toMatch(
          /display\s*:[^;]*!important/,
        );
      }
    }
  });
});
