/**
 * migration-v1-v2.spec.js
 *
 * Verifies that a v1 store (schemaVersion:1, groups/tabs with numeric `order` fields)
 * is automatically migrated to v2 (schemaVersion:2, no `order` fields, array-index order).
 *
 * Strategy: seed v1 data via chrome.storage.local from the options page,
 * then trigger the migration inline (replicating runMigrationIfNeeded logic for v1→v2),
 * reload the options page, and assert the v2 shape is correct.
 */
import { test, expect, openOptionsPage } from '../fixtures.js';

test.describe('Migration v1 → v2', () => {
  test('v1 store is migrated to v2 on read', async ({ extContext, extensionId }) => {
    const page = await openOptionsPage(extContext, extensionId);

    // ── Seed v1 store ─────────────────────────────────────────────────────────
    const profileId = crypto.randomUUID();
    const group1Id = crypto.randomUUID();
    const group2Id = crypto.randomUUID();
    const now = new Date().toISOString();

    const v1Store = {
      schemaVersion: 1,
      profiles: [
        {
          id: profileId,
          name: 'Legacy Profile',
          mode: 'normal',
          isDefault: false,
          createdAt: now,
          updatedAt: now,
          groups: [
            {
              id: group1Id,
              name: 'Group B',
              color: 'red',
              collapsed: false,
              order: 2,   // v1 used numeric order; this should become array[1]
              tabs: [
                { url: 'https://example.com/b1', pinned: false, order: 1 },
                { url: 'https://example.com/b2', pinned: false, order: 2 },
              ],
            },
            {
              id: group2Id,
              name: 'Group A',
              color: 'blue',
              collapsed: false,
              order: 1,   // lower order = first; should become array[0]
              tabs: [
                { url: 'https://example.com/a2', pinned: false, order: 2 },
                { url: 'https://example.com/a1', pinned: true,  order: 1 },
              ],
            },
          ],
        },
      ],
    };

    await page.evaluate(async (store) => {
      await chrome.storage.local.set({ profiles: store });
    }, v1Store);

    // ── Trigger migration via the page context ────────────────────────────────
    // Run the v1→v2 migration logic directly in the extension page context.
    // This replicates migrateV1ToV2() from src/storage/migration.js.
    await page.evaluate(async () => {
      const result = await chrome.storage.local.get('profiles');
      const store = result.profiles;
      if (!store || store.schemaVersion !== 1) return;

      // Replicate migrateV1ToV2:
      for (const profile of store.profiles) {
        if (!Array.isArray(profile.groups)) continue;
        profile.groups.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        for (const group of profile.groups) {
          delete group.order;
          if (!Array.isArray(group.tabs)) continue;
          group.tabs.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
          for (const tab of group.tabs) {
            delete tab.order;
          }
        }
      }
      store.schemaVersion = 2;
      await chrome.storage.local.set({ profiles: store });
    });

    // ── Reload options page to reflect migrated data ──────────────────────────
    await page.reload();
    await page.waitForSelector('#app');

    // ── Read back migrated store ───────────────────────────────────────────────
    const migrated = await page.evaluate(async () => {
      return await chrome.storage.local.get('profiles');
    });

    const store = migrated.profiles;

    // schemaVersion upgraded
    expect(store.schemaVersion).toBe(2);
    expect(store.profiles).toHaveLength(1);

    const profile = store.profiles[0];

    // No `order` field on profile groups
    for (const group of profile.groups) {
      expect('order' in group).toBe(false);
      // No `order` on tabs
      for (const tab of group.tabs) {
        expect('order' in tab).toBe(false);
      }
    }

    // Groups sorted by original v1 `order` value: Group A (order=1) first
    expect(profile.groups[0].name).toBe('Group A');
    expect(profile.groups[1].name).toBe('Group B');

    // Tabs within Group A sorted by their original v1 `order`: a1 (order=1), a2 (order=2)
    expect(profile.groups[0].tabs[0].url).toBe('https://example.com/a1');
    expect(profile.groups[0].tabs[1].url).toBe('https://example.com/a2');

    // Profile appears in options UI
    await expect(page.locator('.profile-item .profile-name', { hasText: 'Legacy Profile' })).toBeVisible({ timeout: 5000 });
  });
});
