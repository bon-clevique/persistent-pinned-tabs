import { NEWTAB_RE } from '../util/url.js';

/**
 * @param {string | undefined} url
 * @returns {boolean}
 */
function isSkippableUrl(url) {
  if (!url) return true;
  return NEWTAB_RE.test(url);
}

/**
 * Captures the current state of a window as a profile-shaped object.
 * Does NOT persist — caller decides whether to createProfile or updateProfile.
 *
 * @param {number} windowId
 * @param {{ name?: string }} [options]
 * @returns {Promise<{ name: string, mode: 'normal'|'incognito', isDefault: false, groups: import('../storage/schema.js').Group[] }>}
 */
export async function captureCurrentWindow(windowId, { name } = {}) {
  const win = await chrome.windows.get(windowId);
  const mode = win.incognito ? 'incognito' : 'normal';

  const allTabs = await chrome.tabs.query({ windowId });

  // Only grouped tabs (TAB_GROUP_ID_NONE === -1)
  const groupedTabs = allTabs.filter(t => t.groupId !== -1);

  // Bucket by groupId
  /** @type {Map<number, chrome.tabs.Tab[]>} */
  const byGroup = new Map();
  for (const tab of groupedTabs) {
    const list = byGroup.get(tab.groupId) ?? [];
    list.push(tab);
    byGroup.set(tab.groupId, list);
  }

  // Fetch group meta and build group objects
  const groupEntries = await Promise.all(
    [...byGroup.entries()].map(async ([groupId, tabs]) => {
      const meta = await chrome.tabGroups.get(groupId);
      const minIndex = Math.min(...tabs.map(t => t.index));

      const validTabs = tabs
        .map(tab => {
          const url = tab.url || tab.pendingUrl;
          if (isSkippableUrl(url)) return null;
          return { url, pinned: tab.pinned, _sortKey: tab.index };
        })
        .filter(Boolean)
        .sort((a, b) => a._sortKey - b._sortKey)
        .map(({ _sortKey: _s, ...rest }) => rest); // strip internal sort key

      return { minIndex, group: { name: meta.title || '', color: meta.color, collapsed: meta.collapsed, tabs: validTabs } };
    })
  );

  // Sort groups by min tab index, drop empty groups; array position is the order
  groupEntries.sort((a, b) => a.minIndex - b.minIndex);
  const groups = groupEntries
    .filter(entry => entry.group.tabs.length > 0)
    .map(entry => ({ ...entry.group, id: crypto.randomUUID() }));

  return {
    name: name ?? `Window ${windowId}`,
    mode,
    isDefault: false,
    groups,
  };
}
