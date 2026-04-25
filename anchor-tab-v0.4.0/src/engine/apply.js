import { isOpenableUrl } from '../util/url.js';
import { register, getWindowIdForProfile, unregisterProfile } from './active-window-map.js';

/** @type {Map<string, Promise<void>>} */
const profileLocks = new Map();

export class ProfileInUseError extends Error {
  /**
   * @param {number} existingWindowId
   */
  constructor(existingWindowId) {
    super(`Profile already active in window ${existingWindowId}`);
    this.name = 'ProfileInUseError';
    this.existingWindowId = existingWindowId;
  }
}

/**
 * @typedef {{ url: string, reason: 'unopenable' | 'create-failed' }} SkippedTab
 */

/**
 * @typedef {{ created: number, skipped: SkippedTab[], groups: number }} ApplyResult
 */

/**
 * Applies a profile to a window by creating tab groups with their tabs.
 * Pre-existing tabs in the window are untouched. No tab is activated.
 *
 * Returns a summary of what was applied:
 *   - created: total tabs successfully created across all groups
 *   - skipped: tabs not created (unopenable URL or chrome.tabs.create failure)
 *   - groups: number of groups for which at least one tab was created AND grouped successfully
 *
 * @param {import('../storage/schema.js').Profile} profile
 * @param {number} windowId
 * @returns {Promise<ApplyResult>}
 */
export async function applyProfile(profile, windowId) {
  const prev = profileLocks.get(profile.id);
  if (prev) await prev.catch(() => {});
  const p = (async () => {
    // Check if profile is already active in another window
    const existingWindowId = await getWindowIdForProfile(profile.id);
    if (existingWindowId != null && existingWindowId !== windowId) {
      let windowStillExists = false;
      try {
        await chrome.windows.get(existingWindowId);
        windowStillExists = true;
      } catch {
        // Window no longer exists
      }
      if (windowStillExists) {
        throw new ProfileInUseError(existingWindowId);
      }
      // Stale entry — clear it and proceed
      await unregisterProfile(profile.id);
    }

    let totalCreated = 0;
    let groupsSucceeded = 0;
    /** @type {SkippedTab[]} */
    const skipped = [];

    for (const group of profile.groups) {
      /** @type {{ id: number, url: string }[]} */
      const createdTabs = [];

      for (const tab of group.tabs) {
        if (!isOpenableUrl(tab.url)) {
          console.warn('[apply] skipping URL (unopenable):', tab.url);
          skipped.push({ url: tab.url, reason: 'unopenable' });
          continue;
        }
        try {
          let created;
          try {
            // discarded:true creates tabs without loading them (memory efficient).
            // Falls back without discarded if the browser doesn't support it.
            created = await chrome.tabs.create({
              windowId,
              url: tab.url,
              pinned: tab.pinned,
              active: false,
              discarded: !tab.pinned,
            });
          } catch {
            created = await chrome.tabs.create({
              windowId,
              url: tab.url,
              pinned: tab.pinned,
              active: false,
            });
          }
          createdTabs.push({ id: created.id, url: tab.url });
        } catch (e) {
          console.warn('[apply] failed to create tab:', tab.url, e);
          skipped.push({ url: tab.url, reason: 'create-failed' });
        }
      }

      if (createdTabs.length > 0) {
        try {
          const newGroupId = await chrome.tabs.group({
            tabIds: createdTabs.map(t => t.id),
            createProperties: { windowId },
          });
          await chrome.tabGroups.update(newGroupId, {
            title: group.name,
            color: group.color,
            collapsed: group.collapsed,
          });
          totalCreated += createdTabs.length;
          groupsSucceeded += 1;
        } catch (err) {
          // Per-group rollback: only remove tabs belonging to THIS group.
          // Earlier groups are intentionally left intact — they were already
          // successfully grouped and are visible to the user. Rolling back
          // across group boundaries would destroy successfully applied work.
          // The per-profile lock prevents concurrent applyProfile calls from
          // racing on the same profile.
          console.warn('[apply] failed to group/update tabs; rolling back this group only:', err);
          try {
            await chrome.tabs.remove(createdTabs.map(t => t.id));
          } catch (removeErr) {
            console.warn('[apply] failed to clean up orphan tabs after group error:', removeErr);
          }
          // Tabs that were created for this group but then rolled back are skipped
          for (const { url } of createdTabs) {
            skipped.push({ url, reason: 'create-failed' });
          }
        }
      }
    }

    // Only register in active-window-map if at least one tab was actually created
    // and grouped successfully. Registering with zero tabs would create a phantom
    // lock, blocking future applies until the stale entry is manually cleared.
    if (totalCreated > 0) {
      await register(profile.id, windowId);
    }

    return { created: totalCreated, skipped, groups: groupsSucceeded };
  })();
  profileLocks.set(profile.id, p);
  try { return await p; } finally {
    if (profileLocks.get(profile.id) === p) profileLocks.delete(profile.id);
  }
}
