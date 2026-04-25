/**
 * import-caps.spec.js
 *
 * Verifies that the import validator enforces size / count caps:
 *   - File > 5 MB         → "too large" banner
 *   - > 500 profiles       → "too many profiles" banner
 *   - Tab URL > 2048 chars → "url too long" banner
 */
import { test, expect, openOptionsPage } from '../fixtures.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * Write a temp JSON file and return its path.
 * @param {string} prefix
 * @param {unknown} data
 * @returns {string}
 */
function writeTempJson(prefix, data) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const filePath = path.join(tmpDir, 'data.json');
  fs.writeFileSync(filePath, typeof data === 'string' ? data : JSON.stringify(data));
  return filePath;
}

test.describe('Import validation caps', () => {
  test('file > 5 MB is rejected with too-large banner', async ({ extContext, extensionId }) => {
    const page = await openOptionsPage(extContext, extensionId);

    // Build a JSON file that exceeds 5 MB
    // Use a large string value embedded in a valid-looking object
    const bigString = 'x'.repeat(5 * 1024 * 1024 + 100);
    const filePath = writeTempJson('anchortab-toobig-', `{"schemaVersion":2,"profiles":[],"padding":"${bigString}"}`);

    await page.setInputFiles('#file-input', filePath);

    await expect(
      page.locator('#banner-area .banner-error')
    ).toBeVisible({ timeout: 5000 });

    const errorText = await page.locator('#banner-area .banner-error').textContent();
    // Message contains "5 MB" or "too large" (see optionsImportTooLarge i18n key)
    expect(errorText).toMatch(/5\s*MB|too large/i);

    fs.rmSync(path.dirname(filePath), { recursive: true, force: true });
  });

  test('> 500 profiles is rejected', async ({ extContext, extensionId }) => {
    const page = await openOptionsPage(extContext, extensionId);

    const now = new Date().toISOString();
    // Build 501 minimal valid profiles
    const profiles = Array.from({ length: 501 }, (_, i) => ({
      id: crypto.randomUUID(),
      name: `Profile ${i}`,
      mode: 'normal',
      isDefault: false,
      createdAt: now,
      updatedAt: now,
      groups: [],
    }));

    const filePath = writeTempJson('anchortab-toomany-', { schemaVersion: 2, profiles });
    await page.setInputFiles('#file-input', filePath);

    await expect(
      page.locator('#banner-area .banner-error')
    ).toBeVisible({ timeout: 5000 });

    const errorText = await page.locator('#banner-area .banner-error').textContent();
    expect(errorText).toMatch(/500|too many/i);

    fs.rmSync(path.dirname(filePath), { recursive: true, force: true });
  });

  test('tab URL > 2048 chars is rejected', async ({ extContext, extensionId }) => {
    const page = await openOptionsPage(extContext, extensionId);

    const now = new Date().toISOString();
    const longUrl = 'https://example.com/' + 'a'.repeat(3000);

    const profileWithLongUrl = {
      id: crypto.randomUUID(),
      name: 'Long URL Profile',
      mode: 'normal',
      isDefault: false,
      createdAt: now,
      updatedAt: now,
      groups: [
        {
          id: crypto.randomUUID(),
          name: 'Group',
          color: 'blue',
          collapsed: false,
          tabs: [
            { url: longUrl, pinned: false },
          ],
        },
      ],
    };

    const filePath = writeTempJson('anchortab-longurl-', { schemaVersion: 2, profiles: [profileWithLongUrl] });
    await page.setInputFiles('#file-input', filePath);

    await expect(
      page.locator('#banner-area .banner-error')
    ).toBeVisible({ timeout: 5000 });

    const errorText = await page.locator('#banner-area .banner-error').textContent();
    expect(errorText).toMatch(/2048|URL.*long|too long/i);

    fs.rmSync(path.dirname(filePath), { recursive: true, force: true });
  });
});
