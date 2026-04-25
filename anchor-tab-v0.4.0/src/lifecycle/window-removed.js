import { unregister } from '../engine/active-window-map.js';

export function registerWindowRemovedListener() {
  chrome.windows.onRemoved.addListener(async (windowId) => {
    await unregister(windowId);
  });
}
