import { describe, it, expect, beforeEach } from 'vitest';
import { installChromeMock } from './chrome-mock.js';
import { SCHEMA_VERSION } from '../src/storage/schema.js';

async function runSettingsMigration() {
  const { migrateSettingsBooleanToTristate } = await import('../src/storage/migration.js');
  await migrateSettingsBooleanToTristate();
}

let mock;

beforeEach(() => {
  mock = installChromeMock();
});

async function runMigration() {
  // Re-import fresh each time by resetting module cache via dynamic import with cache bust
  // Since vitest caches ESM modules, we use a workaround: import once and call repeatedly.
  // Migration is idempotent, so repeated calls are safe.
  const { runMigrationIfNeeded } = await import('../src/storage/migration.js');
  await runMigrationIfNeeded();
}

describe('migration: v0.3.0 with persistentTabs + autoInject=true', () => {
  it('creates Legacy Pinned profile as default, removes old keys', async () => {
    mock.resetStore({
      persistentTabs: ['https://github.com', 'https://example.com'],
      autoInject: true,
    });

    await runMigration();

    const store = mock.getStore();

    expect(store.persistentTabs).toBeUndefined();
    expect(store.autoInject).toBeUndefined();

    expect(store.profiles).toBeDefined();
    expect(store.profiles.schemaVersion).toBe(SCHEMA_VERSION);
    expect(store.profiles.profiles).toHaveLength(1);

    const profile = store.profiles.profiles[0];
    expect(profile.name).toBe('Legacy Pinned');
    expect(profile.mode).toBe('normal');
    expect(profile.isDefault).toBe(true);
    expect(profile.groups).toHaveLength(1);

    const group = profile.groups[0];
    expect(group.name).toBe('Pinned');
    expect(group.color).toBe('blue');
    // v2: no order field on group
    expect('order' in group).toBe(false);
    expect(group.tabs).toHaveLength(2);
    expect(group.tabs[0].url).toBe('https://github.com');
    expect(group.tabs[0].pinned).toBe(true);
    // v2: no order field on tab
    expect('order' in group.tabs[0]).toBe(false);
    expect(group.tabs[1].url).toBe('https://example.com');
    expect('order' in group.tabs[1]).toBe(false);

    expect(store.settings.newWindowBehavior).toBe('auto-open');
    // Banner reset because legacy data was present
    expect(store.settings.legacyMigrationBannerSeen).toBe(false);
  });
});

describe('migration: autoInject=false', () => {
  it('sets newWindowBehavior=off', async () => {
    mock.resetStore({
      persistentTabs: ['https://example.com'],
      autoInject: false,
    });

    await runMigration();

    const store = mock.getStore();
    expect(store.settings.newWindowBehavior).toBe('off');
    expect(store.settings.legacyMigrationBannerSeen).toBe(false);
  });
});

describe('migration: empty persistentTabs', () => {
  it('creates no profile, still writes profiles store and cleans keys', async () => {
    mock.resetStore({
      persistentTabs: [],
      autoInject: true,
    });

    await runMigration();

    const store = mock.getStore();
    expect(store.persistentTabs).toBeUndefined();
    expect(store.autoInject).toBeUndefined();
    expect(store.profiles.profiles).toHaveLength(0);
    expect(store.profiles.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('handles absent persistentTabs gracefully', async () => {
    mock.resetStore({});

    await runMigration();

    const store = mock.getStore();
    expect(store.profiles.profiles).toHaveLength(0);
    expect(store.profiles.schemaVersion).toBe(SCHEMA_VERSION);
  });
});

describe('migration: banner reset conditional (#11)', () => {
  it('does NOT reset legacyMigrationBannerSeen if no persistentTabs', async () => {
    mock.resetStore({
      settings: { legacyMigrationBannerSeen: true, newWindowBehavior: 'auto-open' },
    });

    await runMigration();

    const store = mock.getStore();
    // No legacy data → banner flag should remain true (user already dismissed it)
    expect(store.settings.legacyMigrationBannerSeen).toBe(true);
  });

  it('resets legacyMigrationBannerSeen if persistentTabs were migrated', async () => {
    mock.resetStore({
      persistentTabs: ['https://example.com'],
      settings: { legacyMigrationBannerSeen: true },
    });

    await runMigration();

    const store = mock.getStore();
    expect(store.settings.legacyMigrationBannerSeen).toBe(false);
  });
});

describe('migration: future schemaVersion', () => {
  it('throws SchemaVersionTooNewError for schemaVersion > SCHEMA_VERSION', async () => {
    mock.resetStore({
      profiles: {
        schemaVersion: 999,
        profiles: [],
      },
    });

    const { SchemaVersionTooNewError } = await import('../src/storage/schema.js');
    await expect(runMigration()).rejects.toThrow(SchemaVersionTooNewError);
  });

  it('thrown error has storedVersion and supportedVersion', async () => {
    mock.resetStore({
      profiles: { schemaVersion: 999, profiles: [] },
    });

    const { SchemaVersionTooNewError } = await import('../src/storage/schema.js');
    try {
      await runMigration();
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(SchemaVersionTooNewError);
      expect(err.storedVersion).toBe(999);
      expect(err.supportedVersion).toBe(SCHEMA_VERSION);
    }
  });
});

describe('migration: idempotency', () => {
  it('does not re-run if profiles already at SCHEMA_VERSION', async () => {
    mock.resetStore({
      persistentTabs: ['https://github.com'],
      autoInject: true,
      profiles: {
        schemaVersion: SCHEMA_VERSION,
        profiles: [],
      },
    });

    await runMigration();

    const store = mock.getStore();
    // Old keys still present because migration was skipped
    expect(store.persistentTabs).toBeDefined();
    // Profiles untouched (still empty array from initial state)
    expect(store.profiles.profiles).toHaveLength(0);
  });

  it('running twice with no existing profiles only runs once', async () => {
    mock.resetStore({
      persistentTabs: ['https://a.com'],
      autoInject: true,
    });

    await runMigration();

    const afterFirst = JSON.parse(JSON.stringify(mock.getStore()));

    await runMigration();

    const afterSecond = mock.getStore();
    expect(afterSecond.profiles.profiles).toHaveLength(afterFirst.profiles.profiles.length);
    // profile IDs must be identical (no new profile was created)
    expect(afterSecond.profiles.profiles[0].id).toBe(afterFirst.profiles.profiles[0].id);
  });
});

describe('migrateSettingsBooleanToTristate: boolean → tri-state', () => {
  it('converts autoOpenPopupOnNewWindow=true → newWindowBehavior=auto-open', async () => {
    mock.resetStore({
      settings: { autoOpenPopupOnNewWindow: true, legacyMigrationBannerSeen: false },
    });

    await runSettingsMigration();

    const store = mock.getStore();
    expect(store.settings.newWindowBehavior).toBe('auto-open');
    expect('autoOpenPopupOnNewWindow' in store.settings).toBe(false);
    expect(store.settings.legacyMigrationBannerSeen).toBe(false);
  });

  it('converts autoOpenPopupOnNewWindow=false → newWindowBehavior=off', async () => {
    mock.resetStore({
      settings: { autoOpenPopupOnNewWindow: false, legacyMigrationBannerSeen: true },
    });

    await runSettingsMigration();

    const store = mock.getStore();
    expect(store.settings.newWindowBehavior).toBe('off');
    expect('autoOpenPopupOnNewWindow' in store.settings).toBe(false);
    expect(store.settings.legacyMigrationBannerSeen).toBe(true);
  });

  it('is idempotent: skips if newWindowBehavior already present', async () => {
    mock.resetStore({
      settings: { newWindowBehavior: 'badge', legacyMigrationBannerSeen: false },
    });

    await runSettingsMigration();

    const store = mock.getStore();
    // Must not change the existing value
    expect(store.settings.newWindowBehavior).toBe('badge');
  });

  it('is a no-op if neither key is present', async () => {
    mock.resetStore({
      settings: { legacyMigrationBannerSeen: false },
    });

    await runSettingsMigration();

    const store = mock.getStore();
    expect('newWindowBehavior' in store.settings).toBe(false);
    expect('autoOpenPopupOnNewWindow' in store.settings).toBe(false);
  });

  it('handles absent settings key gracefully', async () => {
    mock.resetStore({});

    await runSettingsMigration();

    const store = mock.getStore();
    // No settings key was written since there was nothing to migrate
    expect(store.settings).toBeUndefined();
  });
});
