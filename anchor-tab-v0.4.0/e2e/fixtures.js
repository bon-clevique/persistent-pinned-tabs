/**
 * fixtures.js — Playwright fixtures for AnchorTab E2E tests.
 *
 * Uses Playwright's bundled Chromium with launchPersistentContext.
 * Removes Playwright's default --disable-extensions and
 * --disable-component-extensions-with-background-pages flags so that our MV3
 * extension's service worker can register. Identifies AnchorTab's service worker
 * by checking chrome.runtime.getManifest().name.
 *
 * Note: --load-extension is NOT supported in stable Google Chrome builds;
 * this file uses Playwright's bundled Chromium which supports it.
 */
import { test as base, chromium, expect } from '@playwright/test';
import { fileURLToPath } from 'url';
import path from 'path';
import os from 'os';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Extension root is one directory above e2e/
const EXTENSION_PATH = path.resolve(__dirname, '..');

// Expected extension name (matches manifest.json → extName i18n key → "AnchorTab")
const EXTENSION_NAME = 'AnchorTab';

/**
 * Open the options page in a new tab and return the Page object.
 * @param {import('@playwright/test').BrowserContext} ctx
 * @param {string} extensionId
 * @returns {Promise<import('@playwright/test').Page>}
 */
export async function openOptionsPage(ctx, extensionId) {
  const page = await ctx.newPage();
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await page.waitForSelector('#app', { timeout: 20000 });
  return page;
}

/**
 * Open the popup page in a new tab and return the Page object.
 * @param {import('@playwright/test').BrowserContext} ctx
 * @param {string} extensionId
 * @returns {Promise<import('@playwright/test').Page>}
 */
export async function openPopupPage(ctx, extensionId) {
  const page = await ctx.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.waitForSelector('#mode-badge', { timeout: 20000 });
  return page;
}

/**
 * Find the AnchorTab service worker among all registered service workers.
 * We filter by manifest name because other built-in extensions may also
 * register service workers when --disable-component-extensions-with-background-pages
 * is removed.
 *
 * @param {import('@playwright/test').BrowserContext} ctx
 * @param {number} timeoutMs
 * @returns {Promise<import('@playwright/test').Worker>}
 */
async function findAnchorTabServiceWorker(ctx, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const sws = ctx.serviceWorkers();
    for (const sw of sws) {
      try {
        const name = await sw.evaluate(() => chrome.runtime.getManifest().name);
        if (name === EXTENSION_NAME) return sw;
      } catch {
        // SW may not be ready yet
      }
    }

    // Wait for next SW registration event
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    try {
      const sw = await ctx.waitForEvent('serviceworker', { timeout: Math.min(3000, remaining) });
      try {
        const name = await sw.evaluate(() => chrome.runtime.getManifest().name);
        if (name === EXTENSION_NAME) return sw;
      } catch {
        // Not our extension, keep waiting
      }
    } catch {
      // timeout on waitForEvent — keep polling existing SWs
    }
  }

  throw new Error(
    `AnchorTab service worker not found within ${timeoutMs}ms. ` +
    `Extension path: ${EXTENSION_PATH}. ` +
    `Ensure the extension has no manifest/i18n errors.`
  );
}

export const test = base.extend({
  // Launch Playwright's bundled Chromium with the extension loaded.
  // Uses ignoreDefaultArgs to remove flags that block MV3 extension service workers:
  //   --disable-extensions: prevents --load-extension from working
  //   --disable-component-extensions-with-background-pages: blocks all SW registrations
  extContext: async ({}, use) => {
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anchortab-e2e-'));
    const ctx = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      ignoreDefaultArgs: [
        '--disable-extensions',
        '--disable-component-extensions-with-background-pages',
      ],
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
        '--no-first-run',
      ],
    });

    try {
      await use(ctx);
    } finally {
      await ctx.close();
      fs.rmSync(userDataDir, { recursive: true, force: true });
    }
  },

  // Resolve the AnchorTab extension ID by finding its service worker
  extensionId: async ({ extContext }, use) => {
    const sw = await findAnchorTabServiceWorker(extContext, 15000);
    const id = sw.url().split('/')[2];
    await use(id);
  },
});

export { expect };
