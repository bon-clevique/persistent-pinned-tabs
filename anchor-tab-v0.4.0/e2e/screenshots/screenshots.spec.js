/**
 * screenshots.spec.js — Generate Chrome Web Store screenshots.
 *
 * Output: e2e/screenshots/{lang}/{NN-name}.png  (1280x800 each)
 *
 * Locales rendered: en, ja. The extension picks the locale via
 * chrome.i18n which honors the browser UI locale; we set --lang.
 *
 * Run with:  LANG_TARGET=en npm run e2e -- --grep screenshots
 *        or  LANG_TARGET=ja npm run e2e -- --grep screenshots
 *        or  npm run screenshots   (runs both via shell loop)
 */
import { test, expect, openOptionsPage, openPopupPage } from '../fixtures.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LANG = process.env.LANG_TARGET || 'en';
const OUT_DIR = path.join(__dirname, 'out', LANG);

const VIEWPORT = { width: 1280, height: 800 };

fs.mkdirSync(OUT_DIR, { recursive: true });

/** Save a 1280x800 screenshot with normalized name. */
async function shot(page, name) {
  await page.setViewportSize(VIEWPORT);
  await page.waitForTimeout(300); // settle animations / focus
  const file = path.join(OUT_DIR, `${name}.png`);
  await page.screenshot({
    path: file,
    fullPage: false,
    clip: { x: 0, y: 0, width: VIEWPORT.width, height: VIEWPORT.height },
  });
  return file;
}

/**
 * Inject a chrome.i18n.getMessage override that resolves keys from a specific
 * locale's messages.json. Runs before any extension script via addInitScript,
 * so that t(key) calls in popup-view / options-view return the forced locale.
 */
async function installLocaleOverride(context, lang, messagesByLang) {
  const messages = messagesByLang[lang];
  await context.addInitScript((args) => {
    const { messages } = args;
    const apply = () => {
      if (typeof chrome === 'undefined' || !chrome.i18n) return;
      chrome.i18n.getMessage = (key, substitutions) => {
        const entry = messages[key];
        if (!entry) return '';
        let msg = entry.message;
        if (substitutions != null) {
          const subs = Array.isArray(substitutions) ? substitutions : [substitutions];
          if (entry.placeholders) {
            for (const [name, def] of Object.entries(entry.placeholders)) {
              const idx = parseInt((def.content || '').replace('$', ''), 10) - 1;
              const value = subs[idx] != null ? String(subs[idx]) : '';
              msg = msg.split(`$${name}$`).join(value);
            }
          }
        }
        return msg;
      };
    };
    apply();
    // Reapply if chrome appears later (defensive — extension pages preload it)
    Object.defineProperty(globalThis, '__anchortabLocaleApplied', { value: true });
  }, { messages });
}

function loadAllLocaleMessages() {
  const root = path.resolve(__dirname, '..', '..', '_locales');
  const out = {};
  for (const lang of ['en', 'ja']) {
    const file = path.join(root, lang, 'messages.json');
    out[lang] = JSON.parse(fs.readFileSync(file, 'utf8'));
  }
  return out;
}

/**
 * Seed two named profiles directly into chrome.storage.local on the
 * options page so the UI shows realistic content.
 */
async function seedProfiles(optionsPage) {
  await optionsPage.evaluate(async () => {
    const profiles = [
      {
        id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
        name: 'Work',
        mode: 'normal',
        isDefault: true,
        createdAt: new Date('2026-04-20T09:00:00Z').toISOString(),
        updatedAt: new Date('2026-04-25T10:00:00Z').toISOString(),
        groups: [
          {
            id: 'g1aaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
            name: 'Daily',
            color: 'blue',
            collapsed: false,
            tabs: [
              { url: 'https://mail.google.com/', pinned: true },
              { url: 'https://calendar.google.com/', pinned: true },
              { url: 'https://github.com/', pinned: false },
              { url: 'https://www.notion.so/', pinned: false },
            ],
          },
          {
            id: 'g2aaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
            name: 'Sprint',
            color: 'green',
            collapsed: false,
            tabs: [
              { url: 'https://linear.app/', pinned: false },
              { url: 'https://www.figma.com/', pinned: false },
              { url: 'https://docs.google.com/', pinned: false },
            ],
          },
          {
            id: 'g3aaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
            name: 'Reference',
            color: 'yellow',
            collapsed: true,
            tabs: [
              { url: 'https://developer.mozilla.org/', pinned: false },
              { url: 'https://developer.chrome.com/docs/extensions/', pinned: false },
            ],
          },
        ],
      },
      {
        id: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',
        name: 'Research',
        mode: 'normal',
        isDefault: false,
        createdAt: new Date('2026-04-22T09:00:00Z').toISOString(),
        updatedAt: new Date('2026-04-25T11:00:00Z').toISOString(),
        groups: [
          {
            id: 'g4bbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',
            name: 'Reading list',
            color: 'purple',
            collapsed: false,
            tabs: [
              { url: 'https://arxiv.org/', pinned: true },
              { url: 'https://news.ycombinator.com/', pinned: false },
              { url: 'https://scholar.google.com/', pinned: false },
            ],
          },
        ],
      },
      {
        id: 'cccccccc-cccc-4ccc-cccc-cccccccccccc',
        name: 'Personal',
        mode: 'normal',
        isDefault: false,
        createdAt: new Date('2026-04-23T09:00:00Z').toISOString(),
        updatedAt: new Date('2026-04-24T11:00:00Z').toISOString(),
        groups: [
          {
            id: 'g5cccccc-cccc-4ccc-cccc-cccccccccccc',
            name: 'Daily',
            color: 'pink',
            collapsed: false,
            tabs: [
              { url: 'https://www.youtube.com/', pinned: true },
              { url: 'https://twitter.com/', pinned: false },
            ],
          },
        ],
      },
    ];
    await chrome.storage.local.set({
      profiles: { schemaVersion: 2, profiles },
    });
  });
  // Re-navigate rather than reload() to avoid SW-restart races on
  // chrome-extension:// pages.
  await optionsPage.goto(optionsPage.url());
  await optionsPage.waitForSelector('#app', { timeout: 20000 });
}

test.describe('Chrome Web Store screenshots', () => {
  test('generate 5 listing screenshots', async ({ extContext, extensionId }) => {
    // Force the chosen UI locale BEFORE any extension page loads.
    const messagesByLang = loadAllLocaleMessages();
    await installLocaleOverride(extContext, LANG, messagesByLang);

    // 1) Options page — overview
    const opts = await openOptionsPage(extContext, extensionId);
    await seedProfiles(opts);
    // Select the default ("Work") profile so the editor shows substantial content
    await opts.locator('.profile-item[data-id^="aaaaaaaa"]').first().click().catch(() => {});
    await opts.waitForTimeout(500);
    // Make sure top is visible (legacy banner + toolbar + list head)
    await opts.evaluate(() => window.scrollTo({ top: 0 }));
    await shot(opts, '01-options-overview');

    // 2) Profile editor — focus on a single group with anchor + normal tabs.
    //    Hide the legacy migration banner so the editor occupies more space.
    await opts.evaluate(() => {
      const banner = document.querySelector('#legacy-banner, .legacy-migration-banner');
      if (banner) banner.style.display = 'none';
      // Scroll the first group block into view
      const first = document.querySelector('.group-block, [data-group-index="0"]');
      if (first) first.scrollIntoView({ block: 'start', behavior: 'instant' });
    });
    await opts.waitForTimeout(400);
    await shot(opts, '02-profile-editor');

    // 3) Settings — tri-state new-window behavior. Hide non-settings DOM
    //    and scale the Settings card so it dominates a 1280x800 frame.
    await opts.evaluate(() => {
      const editor = document.querySelector('#editor, .editor-pane');
      const list = document.querySelector('#profile-list, .profile-list');
      const toolbar = document.querySelector('#toolbar, .toolbar');
      if (editor) editor.style.display = 'none';
      if (list) list.style.display = 'none';
      if (toolbar) toolbar.style.display = 'none';
      const banner = document.querySelector('#legacy-banner, .legacy-migration-banner');
      if (banner) banner.style.display = 'none';

      const settings = Array.from(document.querySelectorAll('section, fieldset, .settings, [data-section="settings"], h2, h3'))
        .find((el) => /Settings|設定|新しいウィンドウ|behavior/i.test(el.textContent || ''));
      if (settings) {
        const card = settings.closest('section, fieldset, .settings, [data-section="settings"]') || settings;
        card.style.maxWidth = '640px';
        card.style.padding = '40px 48px';
        card.style.background = '#ffffff';
        card.style.boxShadow = '0 12px 40px rgba(0,0,0,0.10)';
        card.style.borderRadius = '16px';
        card.style.fontSize = '20px';
        card.style.lineHeight = '1.7';
      }
      // Center the visible card vertically + horizontally in the viewport.
      document.body.style.background = 'linear-gradient(135deg, #f5f7fb 0%, #e7ecf5 100%)';
      document.body.style.minHeight = '100vh';
      document.body.style.display = 'flex';
      document.body.style.alignItems = 'center';
      document.body.style.justifyContent = 'center';
      document.body.style.margin = '0';
      document.body.style.padding = '0';
      window.scrollTo({ top: 0 });
    });
    await opts.waitForTimeout(400);
    await shot(opts, '03-settings-tri-state');

    // 4) Popup — frame the popup centered in the 1280x800 viewport. We use
    //    `zoom` (not transform) for predictable layout sizing, then center
    //    via flexbox on documentElement.
    const popup = await openPopupPage(extContext, extensionId);
    const framePopup = () => {
      document.documentElement.style.cssText =
        'background: linear-gradient(135deg, #f5f7fb 0%, #e7ecf5 100%); ' +
        'min-height: 100vh; height: 100vh; display: flex; ' +
        'align-items: center; justify-content: center; margin: 0; padding: 0;';
      document.body.style.cssText =
        'margin: 0; zoom: 1.8; box-shadow: 0 20px 60px rgba(0,0,0,0.18); ' +
        'border-radius: 16px; background: #ffffff; overflow: hidden;';
    };
    await popup.evaluate(framePopup);
    await popup.waitForTimeout(400);
    await shot(popup, '04-popup');

    // 5) Apply-result info banner — synthesize the success state directly so
    //    the screenshot shows the partial-apply summary without depending on
    //    real chrome.tabs activity inside Playwright's persistentContext.
    await popup.evaluate(() => {
      const banner = document.querySelector('.info-banner');
      const msg = document.querySelector('.info-message');
      if (banner && msg) {
        const tmpl = chrome.i18n.getMessage('applySummaryWithSkipped', [
          '5', '2', '2', 'chrome://settings/, chrome://extensions/',
        ]);
        msg.textContent = tmpl || 'Applied 5 tabs in 2 groups. Skipped 2: chrome://settings/, chrome://extensions/';
        banner.hidden = false;
        banner.style.display = '';
      }
      // Re-apply the centered/scaled framing (info banner injection grew the
      // body which can otherwise break it). Mirror the framePopup() applied
      // above for shot 4.
      document.documentElement.style.cssText =
        'background: linear-gradient(135deg, #f5f7fb 0%, #e7ecf5 100%); ' +
        'min-height: 100vh; height: 100vh; display: flex; ' +
        'align-items: center; justify-content: center; margin: 0; padding: 0;';
      document.body.style.cssText =
        'margin: 0; zoom: 1.8; box-shadow: 0 20px 60px rgba(0,0,0,0.18); ' +
        'border-radius: 16px; background: #ffffff; overflow: hidden;';
    });
    await popup.waitForTimeout(300);
    await shot(popup, '05-apply-summary');

    expect(fs.readdirSync(OUT_DIR).length).toBeGreaterThanOrEqual(5);
  });
});
