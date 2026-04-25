/**
 * @typedef {Object} Tab
 * @property {string} url - non-empty string, max 2048 chars
 * @property {boolean} pinned
 */

/**
 * @typedef {Object} Group
 * @property {string} id - UUID
 * @property {string} name - string, max 200 chars
 * @property {string} color - one of GROUP_COLORS
 * @property {boolean} collapsed
 * @property {Tab[]} tabs - ordered by array index; empty array allowed
 */

/**
 * @typedef {Object} Profile
 * @property {string} id
 * @property {string} name
 * @property {'normal'|'incognito'} mode
 * @property {boolean} isDefault
 * @property {Group[]} groups
 * @property {string} createdAt - ISO string
 * @property {string} updatedAt - ISO string
 */

/**
 * @typedef {Object} ProfileCollection
 * @property {number} schemaVersion
 * @property {Profile[]} profiles
 */

export const SCHEMA_VERSION = 2;

export const GROUP_COLORS = ['grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Thrown when the stored schemaVersion is newer than what this build supports.
 * The user must downgrade to the extension version that wrote the data.
 */
export class SchemaVersionTooNewError extends Error {
  /**
   * @param {number} storedVersion
   * @param {number} supportedVersion
   */
  constructor(storedVersion, supportedVersion) {
    super(
      `Storage schemaVersion ${storedVersion} is newer than supported version ${supportedVersion}. ` +
      `Please update the extension or restore a compatible backup.`
    );
    this.name = 'SchemaVersionTooNewError';
    /** @type {number} */
    this.storedVersion = storedVersion;
    /** @type {number} */
    this.supportedVersion = supportedVersion;
  }
}

/**
 * @param {unknown} obj
 * @returns {obj is Tab}
 */
export function isTab(obj) {
  if (!obj || typeof obj !== 'object') return false;
  if (typeof obj.url !== 'string' || obj.url === '') return false;
  if (typeof obj.pinned !== 'boolean') return false;
  // v2: no order field — explicitly reject it
  if ('order' in obj) return false;
  return true;
}

/**
 * @param {unknown} obj
 * @returns {obj is Group}
 */
export function isGroup(obj) {
  if (!obj || typeof obj !== 'object') return false;
  if (typeof obj.id !== 'string' || !UUID_RE.test(obj.id)) return false;
  if (typeof obj.name !== 'string') return false;
  if (!GROUP_COLORS.includes(obj.color)) return false;
  if (typeof obj.collapsed !== 'boolean') return false;
  // v2: no order field — explicitly reject it
  if ('order' in obj) return false;
  if (!Array.isArray(obj.tabs)) return false;
  return obj.tabs.every(isTab);
}

/**
 * @param {unknown} obj
 * @returns {obj is Profile}
 */
export function isProfile(obj) {
  if (!obj || typeof obj !== 'object') return false;
  if (typeof obj.id !== 'string' || !UUID_RE.test(obj.id)) return false;
  if (typeof obj.name !== 'string') return false;
  if (obj.mode !== 'normal' && obj.mode !== 'incognito') return false;
  if (typeof obj.isDefault !== 'boolean') return false;
  if (!Array.isArray(obj.groups)) return false;
  if (!obj.groups.every(isGroup)) return false;
  if (typeof obj.createdAt !== 'string') return false;
  if (typeof obj.updatedAt !== 'string') return false;
  return true;
}

/**
 * Validates an import payload. Strict v2 only — no `order` fields allowed.
 * @param {unknown} obj
 * @returns {{ ok: boolean, error?: string }}
 */
export function validateProfileCollection(obj) {
  if (!obj || typeof obj !== 'object') {
    return { ok: false, error: 'Not an object' };
  }
  if (obj.schemaVersion !== SCHEMA_VERSION) {
    return { ok: false, error: `schemaVersion mismatch: expected ${SCHEMA_VERSION}, got ${obj.schemaVersion}` };
  }
  if (!Array.isArray(obj.profiles)) {
    return { ok: false, error: 'profiles must be an array' };
  }
  for (let i = 0; i < obj.profiles.length; i++) {
    if (!isProfile(obj.profiles[i])) {
      return { ok: false, error: `profiles[${i}] is invalid` };
    }
  }
  return { ok: true };
}
