import { test, expect, openOptionsPage } from '../fixtures.js';

test.describe('Options CRUD', () => {
  test('create profile, add group, add tab, rename, duplicate, delete', async ({ extContext, extensionId }) => {
    const page = await openOptionsPage(extContext, extensionId);

    // ── Create empty profile ──────────────────────────────────────────────────
    await page.click('#btn-new-empty');

    // Modal appears: wait for the input field inside it
    const nameInput = page.locator('.anchor-modal input[type="text"]');
    await nameInput.waitFor({ timeout: 5000 });
    await nameInput.fill('Test A');

    // Click OK button (value='submit')
    await page.click('.anchor-modal button:has-text("OK")');

    // Profile appears in list
    await expect(page.locator('.profile-item .profile-name', { hasText: 'Test A' })).toBeVisible({ timeout: 5000 });

    // ── Add group ─────────────────────────────────────────────────────────────
    await page.click('#btn-add-group');
    await expect(page.locator('.group-block')).toBeVisible({ timeout: 5000 });

    // ── Add tab ───────────────────────────────────────────────────────────────
    await page.click('.btn-add-tab');
    const tabInput = page.locator('.tab-url-input').first();
    await tabInput.waitFor({ timeout: 5000 });
    await tabInput.fill('https://example.com');
    // Tab element exists
    await expect(page.locator('.tab-row')).toHaveCount(1);

    // ── Rename profile via name input ─────────────────────────────────────────
    const profileNameInput = page.locator('#profile-name-input');
    await profileNameInput.clear();
    await profileNameInput.fill('Test A Renamed');
    // Wait for debounce (250ms) + storage write
    await page.waitForTimeout(500);
    // Reload options to confirm persisted name (list item updates)
    await page.reload();
    await page.waitForSelector('#app');
    await expect(page.locator('.profile-item .profile-name', { hasText: 'Test A Renamed' })).toBeVisible({ timeout: 5000 });

    // ── Duplicate ─────────────────────────────────────────────────────────────
    await page.click('#btn-duplicate');
    // Both original and copy exist in list
    await expect(page.locator('.profile-item')).toHaveCount(2, { timeout: 5000 });
    // The duplicated profile should appear — its name should be "Test A Renamed (copy)"
    const profileNames = await page.locator('.profile-item .profile-name').allTextContents();
    expect(profileNames.some(n => n.includes('(copy)'))).toBe(true);

    // ── Delete ────────────────────────────────────────────────────────────────
    // Delete the currently selected profile (the copy — it was selected after duplicate)
    await page.click('#btn-delete');
    // Modal appears
    await expect(page.locator('.anchor-modal')).toBeVisible({ timeout: 5000 });
    // Click Delete button in modal
    await page.click('.anchor-modal button.danger');
    await expect(page.locator('.profile-item')).toHaveCount(1, { timeout: 5000 });
  });
});
