import { getNewWindowBehavior } from '../storage/settings-repo.js';
import { listProfiles } from '../storage/profiles-repo.js';
import { NEWTAB_RE } from '../util/url.js';

let startupGraceUntil = 0;

/** Call on chrome.runtime.onStartup to suppress popup for session-restore windows. */
export function markStartup() {
  startupGraceUntil = Date.now() + 5000;
}

/** @param {string | undefined} url */
function isEmptyishUrl(url) {
  if (!url) return true;
  return NEWTAB_RE.test(url) || url.startsWith('chrome-extension://');
}

/** @param {number} ms */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Sets a badge on the active tab of the given window showing the profile count
 * for that window's mode. Skips if count is 0.
 * @param {number} windowId
 * @param {'normal' | 'incognito'} mode
 */
export async function setBadgeForWindow(windowId, mode) {
  const profiles = await listProfiles({ mode });
  const count = profiles.length;
  if (count === 0) return;

  const activeTabs = await chrome.tabs.query({ windowId, active: true });
  const activeTab = activeTabs[0];
  if (!activeTab) return;

  await chrome.action.setBadgeText({ text: String(count), tabId: activeTab.id });
  await chrome.action.setBadgeBackgroundColor({ color: '#1a73e8', tabId: activeTab.id });
}

/**
 * Clears the action badge for the given tab.
 * @param {number} tabId
 */
export async function clearBadgeForTab(tabId) {
  await chrome.action.setBadgeText({ text: '', tabId });
}

let popupPending = false;

export function registerWindowCreatedListener() {
  chrome.windows.onCreated.addListener(async (win) => {
    if (win.type !== 'normal') return;
    if (Date.now() < startupGraceUntil) return;

    const behavior = await getNewWindowBehavior();

    if (behavior === 'off') return;

    await delay(200);

    const tabs = await chrome.tabs.query({ windowId: win.id });
    if (tabs.length !== 1) return;

    const tab = tabs[0];
    const emptyish = !tab.pendingUrl && isEmptyishUrl(tab.url);
    if (!emptyish) return;

    if (behavior === 'auto-open') {
      if (popupPending) return;
      popupPending = true;
      try {
        await chrome.action.openPopup({ windowId: win.id });
      } catch (err) {
        console.warn('[window-created] openPopup failed:', err);
      } finally {
        popupPending = false;
      }
      return;
    }

    if (behavior === 'badge') {
      const mode = win.incognito ? 'incognito' : 'normal';
      await setBadgeForWindow(win.id, mode);
    }
  });
}
