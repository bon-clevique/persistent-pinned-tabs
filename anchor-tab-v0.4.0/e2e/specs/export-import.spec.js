import { test, expect, openOptionsPage } from '../fixtures.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

test.describe('Export / Import', () => {
  test('export profile and re-import it', async ({ extContext, extensionId }) => {
    const page = await openOptionsPage(extContext, extensionId);

    // ── Seed a profile with 2 groups, 3 tabs each via storage ────────────────
    const profileId = crypto.randomUUID();
    const group1Id = crypto.randomUUID();
    const group2Id = crypto.randomUUID();
    const now = new Date().toISOString();

    const seedProfile = {
      id: profileId,
      name: 'Export Test Profile',
      mode: 'normal',
      isDefault: false,
      createdAt: now,
      updatedAt: now,
      groups: [
        {
          id: group1Id,
          name: 'Group One',
          color: 'blue',
          collapsed: false,
          tabs: [
            { url: 'https://example.com/a', pinned: false },
            { url: 'https://example.com/b', pinned: false },
            { url: 'https://example.com/c', pinned: true },
          ],
        },
        {
          id: group2Id,
          name: 'Group Two',
          color: 'green',
          collapsed: false,
          tabs: [
            { url: 'https://example.com/d', pinned: false },
            { url: 'https://example.com/e', pinned: false },
            { url: 'https://example.com/f', pinned: false },
          ],
        },
      ],
    };

    await page.evaluate(async (profile) => {
      const existing = await chrome.storage.local.get('profiles');
      const store = existing.profiles ?? { schemaVersion: 2, profiles: [] };
      store.profiles.push(profile);
      await chrome.storage.local.set({ profiles: store });
    }, seedProfile);

    // Reload to show the seeded profile
    await page.reload();
    await page.waitForSelector('#app');
    await expect(page.locator('.profile-item .profile-name', { hasText: 'Export Test Profile' })).toBeVisible({ timeout: 5000 });

    // ── Click Export → capture download ──────────────────────────────────────
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('#btn-export'),
    ]);

    // Save download to a temp file
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anchortab-export-'));
    const exportPath = path.join(tmpDir, 'profiles.json');
    await download.saveAs(exportPath);

    const exportedText = fs.readFileSync(exportPath, 'utf8');
    const exported = JSON.parse(exportedText);

    // Verify export shape
    expect(exported.schemaVersion).toBe(2);
    expect(exported.profiles).toHaveLength(1);
    expect(exported.profiles[0].name).toBe('Export Test Profile');
    expect(exported.profiles[0].groups).toHaveLength(2);

    // ── Delete profile via UI ─────────────────────────────────────────────────
    // Profile item should be selected; if not, click it first
    const profileItem = page.locator('.profile-item', { hasText: 'Export Test Profile' });
    if (!(await profileItem.evaluate(el => el.classList.contains('selected')))) {
      await profileItem.click();
      await page.waitForTimeout(200);
    }

    await page.click('#btn-delete');
    await page.waitForSelector('.anchor-modal', { timeout: 5000 });
    await page.click('.anchor-modal button.danger');
    await expect(page.locator('.profile-item')).toHaveCount(0, { timeout: 5000 });

    // ── Import the saved JSON file ────────────────────────────────────────────
    await page.setInputFiles('#file-input', exportPath);

    // No conflict dialog since we deleted the profile; import should succeed
    await expect(
      page.locator('#banner-area .banner-success')
    ).toBeVisible({ timeout: 5000 });

    // Profile reappears
    await expect(page.locator('.profile-item .profile-name', { hasText: 'Export Test Profile' })).toBeVisible({ timeout: 5000 });

    // Cleanup
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
