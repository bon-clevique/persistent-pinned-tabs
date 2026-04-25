import { runMigrationIfNeeded, migrateSettingsBooleanToTristate } from './src/storage/migration.js';
import { registerWindowCreatedListener, markStartup } from './src/lifecycle/window-created.js';
import { registerWindowRemovedListener } from './src/lifecycle/window-removed.js';

registerWindowCreatedListener();
registerWindowRemovedListener();

chrome.runtime.onStartup.addListener(() => {
  markStartup();
});

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason === 'install' || reason === 'update') {
    await runMigrationIfNeeded();
    await migrateSettingsBooleanToTristate();
  }
});

// ── Badge clear on window focus ───────────────────────────────────────────────
// When the user focuses a window (implying they've noticed the badge), clear it
// for the active tab. This is event-driven and works without popup coordination.
chrome.windows.onFocusChanged.addListener(async (winId) => {
  if (winId === chrome.windows.WINDOW_ID_NONE) return;
  const tabs = await chrome.tabs.query({ windowId: winId, active: true });
  if (tabs[0]) {
    await chrome.action.setBadgeText({ text: '', tabId: tabs[0].id });
  }
});
