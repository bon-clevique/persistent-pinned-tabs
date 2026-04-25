import { describe, it, expect, beforeEach } from 'vitest';
import { installChromeMock } from './chrome-mock.js';
import { SCHEMA_VERSION } from '../src/storage/schema.js';

let mock;

beforeEach(() => {
  mock = installChromeMock();
});

async function runMigration() {
  const { runMigrationIfNeeded } = await import('../src/storage/migration.js');
  await runMigrationIfNeeded();
}

/** Build a v1 store with groups/tabs having shuffled order values */
function makeV1Store() {
  return {
    schemaVersion: 1,
    profiles: [
      {
        id: '11111111-2222-3333-4444-555555555555',
        name: 'Test Profile',
        mode: 'normal',
        isDefault: true,
        groups: [
          {
            id: 'aaaaaaaa-0000-cccc-dddd-eeeeeeeeeeee',
            name: 'Third',
            color: 'red',
            collapsed: false,
            order: 2,
            tabs: [
              { url: 'https://c.com', pinned: false, order: 1 },
              { url: 'https://d.com', pinned: false, order: 0 },
            ],
          },
          {
            id: 'aaaaaaaa-1111-cccc-dddd-eeeeeeeeeeee',
            name: 'First',
            color: 'blue',
            collapsed: false,
            order: 0,
            tabs: [
              { url: 'https://a.com', pinned: true, order: 0 },
            ],
          },
          {
            id: 'aaaaaaaa-2222-cccc-dddd-eeeeeeeeeeee',
            name: 'Second',
            color: 'green',
            collapsed: true,
            order: 1,
            tabs: [
              { url: 'https://z.com', pinned: false, order: 2 },
              { url: 'https://y.com', pinned: false, order: 0 },
              { url: 'https://x.com', pinned: false, order: 1 },
            ],
          },
        ],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      },
    ],
  };
}

describe('v1 → v2 migration', () => {
  it('sorts groups by prior order value and strips order field', async () => {
    mock.resetStore({ profiles: makeV1Store() });
    await runMigration();

    const store = mock.getStore();
    expect(store.profiles.schemaVersion).toBe(SCHEMA_VERSION);
    expect(store.profiles.schemaVersion).toBe(2);

    const groups = store.profiles.profiles[0].groups;
    expect(groups).toHaveLength(3);

    // Groups should now be in order: First (was order:0), Second (was order:1), Third (was order:2)
    expect(groups[0].name).toBe('First');
    expect(groups[1].name).toBe('Second');
    expect(groups[2].name).toBe('Third');

    // No order field on any group
    for (const g of groups) {
      expect('order' in g).toBe(false);
    }
  });

  it('sorts tabs within each group by prior order value and strips order field', async () => {
    mock.resetStore({ profiles: makeV1Store() });
    await runMigration();

    const store = mock.getStore();
    const groups = store.profiles.profiles[0].groups;

    // Second group (originally order:1 → index 1) has tabs: z(2), y(0), x(1) → sorted: y, x, z
    const secondGroup = groups[1];
    expect(secondGroup.name).toBe('Second');
    expect(secondGroup.tabs[0].url).toBe('https://y.com'); // order:0
    expect(secondGroup.tabs[1].url).toBe('https://x.com'); // order:1
    expect(secondGroup.tabs[2].url).toBe('https://z.com'); // order:2

    // Third group (originally order:2 → index 2) has tabs: c(1), d(0) → sorted: d, c
    const thirdGroup = groups[2];
    expect(thirdGroup.name).toBe('Third');
    expect(thirdGroup.tabs[0].url).toBe('https://d.com'); // order:0
    expect(thirdGroup.tabs[1].url).toBe('https://c.com'); // order:1

    // No order field on any tab
    for (const g of groups) {
      for (const t of g.tabs) {
        expect('order' in t).toBe(false);
      }
    }
  });

  it('does not touch other storage keys (settings, etc.)', async () => {
    mock.resetStore({
      profiles: makeV1Store(),
      settings: { autoOpenPopupOnNewWindow: true, legacyMigrationBannerSeen: true },
    });
    await runMigration();

    const store = mock.getStore();
    // Settings should be untouched (v1→v2 migration only touches profiles)
    expect(store.settings.legacyMigrationBannerSeen).toBe(true);
    expect(store.settings.autoOpenPopupOnNewWindow).toBe(true);
  });

  it('is idempotent: running again on already-v2 store is a no-op', async () => {
    mock.resetStore({ profiles: makeV1Store() });
    await runMigration();

    const afterFirst = JSON.parse(JSON.stringify(mock.getStore()));
    await runMigration();

    const afterSecond = mock.getStore();
    expect(afterSecond.profiles.schemaVersion).toBe(2);
    expect(afterSecond.profiles.profiles[0].groups[0].name)
      .toBe(afterFirst.profiles.profiles[0].groups[0].name);
  });

  it('handles profile with empty groups array', async () => {
    mock.resetStore({
      profiles: {
        schemaVersion: 1,
        profiles: [
          {
            id: '11111111-2222-3333-4444-555555555555',
            name: 'Empty',
            mode: 'normal',
            isDefault: false,
            groups: [],
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          },
        ],
      },
    });
    await runMigration();

    const store = mock.getStore();
    expect(store.profiles.schemaVersion).toBe(2);
    expect(store.profiles.profiles[0].groups).toHaveLength(0);
  });
});
