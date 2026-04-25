const STORAGE_KEY = 'settings';

/** @typedef {'auto-open' | 'badge' | 'off'} NewWindowBehavior */

/** @type {NewWindowBehavior[]} */
const NEW_WINDOW_BEHAVIOR_VALUES = ['auto-open', 'badge', 'off'];

const DEFAULTS = {
  newWindowBehavior: /** @type {NewWindowBehavior} */ ('auto-open'),
  legacyMigrationBannerSeen: false,
};

async function readSettings() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return { ...DEFAULTS, ...(result[STORAGE_KEY] ?? {}) };
}

async function writeSettings(settings) {
  await chrome.storage.local.set({ [STORAGE_KEY]: settings });
}

/**
 * Returns the new-window behavior setting.
 * @returns {Promise<NewWindowBehavior>}
 */
export async function getNewWindowBehavior() {
  const s = await readSettings();
  return s.newWindowBehavior;
}

/**
 * Sets the new-window behavior setting.
 * @param {NewWindowBehavior} value — must be 'auto-open', 'badge', or 'off'
 * @throws {TypeError} if value is not one of the three valid values
 */
export async function setNewWindowBehavior(value) {
  if (!NEW_WINDOW_BEHAVIOR_VALUES.includes(value)) {
    throw new TypeError(
      `Invalid newWindowBehavior: "${value}". Must be one of: ${NEW_WINDOW_BEHAVIOR_VALUES.join(', ')}`
    );
  }
  const s = await readSettings();
  await writeSettings({ ...s, newWindowBehavior: value });
}

/** @returns {Promise<boolean>} */
export async function getLegacyMigrationBannerSeen() {
  const s = await readSettings();
  return s.legacyMigrationBannerSeen;
}

/** @param {boolean} value */
export async function setLegacyMigrationBannerSeen(value) {
  const s = await readSettings();
  await writeSettings({ ...s, legacyMigrationBannerSeen: value });
}
