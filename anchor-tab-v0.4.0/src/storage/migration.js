import { SCHEMA_VERSION, SchemaVersionTooNewError } from './schema.js';

const SETTINGS_DEFAULTS = {
  newWindowBehavior: 'auto-open',
  legacyMigrationBannerSeen: false,
};

/**
 * Migrates a v1 store in-place to v2.
 * Sorts groups and tabs by their `order` values into array position, then deletes `order`.
 * @param {{ schemaVersion: number, profiles: object[] }} store
 */
function migrateV1ToV2(store) {
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
}

/**
 * Idempotent migration. Handles:
 *   - No profiles key: legacy v0.3.0 → v2 (one pass, no order fields emitted)
 *   - schemaVersion === 1: v1 → v2 (sort-by-order, strip order)
 *   - schemaVersion === 2: no-op
 *   - schemaVersion > SCHEMA_VERSION: throw SchemaVersionTooNewError
 */
export async function runMigrationIfNeeded() {
  const existing = await chrome.storage.local.get(['profiles', 'persistentTabs', 'autoInject', 'settings']);

  const profilesStore = existing.profiles;

  // --- Already has a profiles store ---
  if (profilesStore && typeof profilesStore.schemaVersion === 'number') {
    if (profilesStore.schemaVersion > SCHEMA_VERSION) {
      throw new SchemaVersionTooNewError(profilesStore.schemaVersion, SCHEMA_VERSION);
    }
    if (profilesStore.schemaVersion === SCHEMA_VERSION) {
      console.log('[migration] Already at schemaVersion', SCHEMA_VERSION, '— skipping');
      return;
    }
    if (profilesStore.schemaVersion === 1) {
      console.log('[migration] Migrating v1 → v2');
      migrateV1ToV2(profilesStore);
      await chrome.storage.local.set({ profiles: profilesStore });
      console.log('[migration] v1 → v2 complete');
      return;
    }
    // Unknown old version (e.g. 0) — fall through to legacy path
  }

  // --- Legacy v0.3.0 migration (no profiles key) ---
  console.log('[migration] Starting v0.3.0 → v0.4.0 migration');

  const persistentTabs = existing.persistentTabs;
  const autoInject = existing.autoInject;
  const currentSettings = existing.settings ?? {};

  const profiles = [];

  const hasLegacyData = Array.isArray(persistentTabs) && persistentTabs.length > 0;

  if (hasLegacyData) {
    // v2 shape: no order fields
    const tabs = persistentTabs.map(url => ({ url, pinned: true }));
    const legacyProfile = {
      id: crypto.randomUUID(),
      name: 'Legacy Pinned',
      mode: 'normal',
      isDefault: true,
      groups: [
        {
          id: crypto.randomUUID(),
          name: 'Pinned',
          color: 'blue',
          collapsed: false,
          tabs,
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    profiles.push(legacyProfile);
    console.log('[migration] Created "Legacy Pinned" profile with', tabs.length, 'tab(s)');
  } else {
    console.log('[migration] No persistentTabs found — skipping profile creation');
  }

  const newProfilesStore = { schemaVersion: SCHEMA_VERSION, profiles };

  const newSettings = {
    ...SETTINGS_DEFAULTS,
    ...currentSettings,
    // (#11) Only reset banner if there was actual legacy data to migrate
    legacyMigrationBannerSeen: hasLegacyData ? false : (currentSettings.legacyMigrationBannerSeen ?? false),
  };

  if (autoInject === false) {
    newSettings.newWindowBehavior = 'off';
    console.log('[migration] autoInject was false — setting newWindowBehavior=off');
  }

  await chrome.storage.local.set({
    profiles: newProfilesStore,
    settings: newSettings,
  });

  const keysToRemove = [];
  if (persistentTabs !== undefined) keysToRemove.push('persistentTabs');
  if (autoInject !== undefined) keysToRemove.push('autoInject');
  if (keysToRemove.length > 0) {
    await chrome.storage.local.remove(keysToRemove);
    console.log('[migration] Removed old keys:', keysToRemove.join(', '));
  }

  console.log('[migration] Complete');
}

/**
 * Migrates the old boolean `autoOpenPopupOnNewWindow` setting to the tri-state
 * `newWindowBehavior` setting. Idempotent: no-op if `newWindowBehavior` already exists.
 *
 * Storage shape: `{ settings: { autoOpenPopupOnNewWindow?: boolean, ... } }`
 */
export async function migrateSettingsBooleanToTristate() {
  const existing = await chrome.storage.local.get('settings');
  const settings = existing.settings ?? {};

  // If tri-state key already present, skip entirely (idempotent)
  if ('newWindowBehavior' in settings) {
    console.log('[migration-settings] newWindowBehavior already set — skipping');
    return;
  }

  // If old boolean key not present either, nothing to do
  if (!('autoOpenPopupOnNewWindow' in settings)) {
    console.log('[migration-settings] No autoOpenPopupOnNewWindow found — skipping');
    return;
  }

  const oldValue = settings.autoOpenPopupOnNewWindow;
  const newValue = oldValue === false ? 'off' : 'auto-open';

  const { autoOpenPopupOnNewWindow: _removed, ...rest } = settings;
  await chrome.storage.local.set({ settings: { ...rest, newWindowBehavior: newValue } });

  console.log(
    `[migration-settings] Converted autoOpenPopupOnNewWindow=${oldValue} → newWindowBehavior=${newValue}`
  );
}
