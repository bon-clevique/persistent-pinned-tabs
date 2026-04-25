const MAP_KEY = 'activeWindowMap';

/** @type {Record<string, number> | null} */
let cache = null;

/** @type {boolean} */
let flushScheduled = false;

/** Load cache from session storage if not yet loaded. */
async function loadCacheIfNeeded() {
  if (cache === null) {
    const result = await chrome.storage.session.get(MAP_KEY);
    cache = result[MAP_KEY] ?? {};
  }
}

/**
 * Schedule a debounced flush of the in-memory cache to session storage.
 * Multiple calls within the same microtask queue coalesce into a single write.
 */
function scheduleFlush() {
  if (flushScheduled) return;
  flushScheduled = true;
  setTimeout(async () => {
    flushScheduled = false;
    await chrome.storage.session.set({ [MAP_KEY]: cache });
  }, 0);
}

/**
 * Test-only helper: force any pending flush to complete immediately.
 * @returns {Promise<void>}
 */
export async function flushNow() {
  if (flushScheduled) {
    flushScheduled = false;
    await chrome.storage.session.set({ [MAP_KEY]: cache });
  }
}

/**
 * Test-only helper: reset the in-memory cache so tests start clean.
 * Call this after resetting the session store in beforeEach.
 */
export function resetCacheForTesting() {
  cache = null;
  flushScheduled = false;
}

/**
 * @param {string} profileId
 * @param {number} windowId
 */
export async function register(profileId, windowId) {
  await loadCacheIfNeeded();
  cache[profileId] = windowId;
  scheduleFlush();
}

/**
 * Removes any entry whose value === windowId.
 * @param {number} windowId
 */
export async function unregister(windowId) {
  await loadCacheIfNeeded();
  for (const [profileId, wid] of Object.entries(cache)) {
    if (wid === windowId) delete cache[profileId];
  }
  scheduleFlush();
}

/**
 * @param {string} profileId
 */
export async function unregisterProfile(profileId) {
  await loadCacheIfNeeded();
  delete cache[profileId];
  scheduleFlush();
}

/**
 * @param {number} windowId
 * @returns {Promise<string | undefined>}
 */
export async function getProfileIdForWindow(windowId) {
  await loadCacheIfNeeded();
  return Object.keys(cache).find(id => cache[id] === windowId);
}

/**
 * @param {string} profileId
 * @returns {Promise<number | undefined>}
 */
export async function getWindowIdForProfile(profileId) {
  await loadCacheIfNeeded();
  return cache[profileId];
}
