import { SCHEMA_VERSION, SchemaVersionTooNewError } from './schema.js';

const STORAGE_KEY = 'profiles';

/** @returns {Promise<{schemaVersion: number, profiles: import('./schema.js').Profile[]}>} */
async function readStore() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const store = result[STORAGE_KEY] ?? { schemaVersion: SCHEMA_VERSION, profiles: [] };
  // Guard: reject data written by a newer extension version.
  // Only throw if schemaVersion is explicitly set (undefined = legacy v0.3 shape, handled by migration).
  if (store.schemaVersion !== undefined && store.schemaVersion > SCHEMA_VERSION) {
    throw new SchemaVersionTooNewError(store.schemaVersion, SCHEMA_VERSION);
  }
  return store;
}

/** @param {{schemaVersion: number, profiles: import('./schema.js').Profile[]}} store */
async function writeStore(store) {
  await chrome.storage.local.set({ [STORAGE_KEY]: store });
}

/**
 * @param {{ mode?: 'normal' | 'incognito' }} [options]
 * @returns {Promise<import('./schema.js').Profile[]>}
 */
export async function listProfiles({ mode } = {}) {
  const store = await readStore();
  if (mode == null) return store.profiles;
  return store.profiles.filter(p => p.mode === mode);
}

/**
 * @param {string} id
 * @returns {Promise<import('./schema.js').Profile | undefined>}
 */
export async function getProfile(id) {
  const store = await readStore();
  return store.profiles.find(p => p.id === id);
}

/**
 * @param {Omit<import('./schema.js').Profile, 'id' | 'createdAt' | 'updatedAt'>} profileInput
 * @returns {Promise<import('./schema.js').Profile>}
 */
export async function createProfile(profileInput) {
  const store = await readStore();
  const now = new Date().toISOString();
  const profile = {
    ...profileInput,
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
  };
  store.profiles.push(profile);
  await writeStore(store);
  return profile;
}

/**
 * @param {string} id
 * @param {Partial<import('./schema.js').Profile>} patch
 * @returns {Promise<import('./schema.js').Profile>}
 */
export async function updateProfile(id, patch) {
  const store = await readStore();
  const idx = store.profiles.findIndex(p => p.id === id);
  if (idx === -1) throw new Error(`Profile not found: ${id}`);
  store.profiles[idx] = {
    ...store.profiles[idx],
    ...patch,
    id,
    updatedAt: new Date().toISOString(),
  };
  await writeStore(store);
  return store.profiles[idx];
}

/**
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function deleteProfile(id) {
  const store = await readStore();
  store.profiles = store.profiles.filter(p => p.id !== id);
  await writeStore(store);
}

/**
 * @param {string} id
 * @returns {Promise<import('./schema.js').Profile>}
 */
export async function duplicateProfile(id) {
  const store = await readStore();
  const source = store.profiles.find(p => p.id === id);
  if (!source) throw new Error(`Profile not found: ${id}`);
  const now = new Date().toISOString();
  const copy = {
    ...JSON.parse(JSON.stringify(source)),
    id: crypto.randomUUID(),
    name: `${source.name} (copy)`,
    isDefault: false,
    createdAt: now,
    updatedAt: now,
  };
  store.profiles.push(copy);
  await writeStore(store);
  return copy;
}

/**
 * Sets a profile as the default for its mode, clearing isDefault on all other profiles of the same mode.
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function setDefault(id) {
  const store = await readStore();
  const target = store.profiles.find(p => p.id === id);
  if (!target) throw new Error(`Profile not found: ${id}`);
  const targetMode = target.mode;
  store.profiles = store.profiles.map(p => {
    if (p.mode !== targetMode) return p;
    return { ...p, isDefault: p.id === id };
  });
  await writeStore(store);
}
