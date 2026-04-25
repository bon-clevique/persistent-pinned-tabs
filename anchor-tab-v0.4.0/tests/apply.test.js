import { describe, it, expect, beforeEach } from 'vitest';
import { installChromeMock } from './chrome-mock.js';
import { applyProfile, ProfileInUseError } from '../src/engine/apply.js';
import { resetCacheForTesting, getWindowIdForProfile } from '../src/engine/active-window-map.js';

/** Minimal valid profile factory */
function makeProfile({ id = 'prof-1', groups = [] } = {}) {
  return { id, name: 'Test Profile', mode: 'normal', isDefault: false, groups, createdAt: '', updatedAt: '' };
}

/** Minimal group factory */
function makeGroup({ name = 'Group', color = 'blue', collapsed = false, tabs = [] } = {}) {
  return { id: crypto.randomUUID(), name, color, collapsed, tabs };
}

/** Minimal tab factory */
function makeTab({ url = 'https://example.com', pinned = false } = {}) {
  return { url, pinned };
}

let mock;

beforeEach(() => {
  mock = installChromeMock();
  mock.resetAll();
  resetCacheForTesting();
});

// ── Basic apply ──────────────────────────────────────────────────────────────

describe('applyProfile — basic success', () => {
  it('creates all tabs and groups for a 2-group, 3-tab-each profile', async () => {
    const { windowId } = mock.seedWindow();
    const profile = makeProfile({
      groups: [
        makeGroup({ tabs: [makeTab(), makeTab(), makeTab()] }),
        makeGroup({ tabs: [makeTab({ url: 'https://a.com' }), makeTab({ url: 'https://b.com' }), makeTab({ url: 'https://c.com' })] }),
      ],
    });

    const result = await applyProfile(profile, windowId);

    expect(result.created).toBe(6);
    expect(result.groups).toBe(2);
    expect(result.skipped).toHaveLength(0);
  });

  it('creates groups with correct metadata (title, color, collapsed)', async () => {
    const { windowId } = mock.seedWindow();
    const profile = makeProfile({
      groups: [
        makeGroup({ name: 'MyGroup', color: 'red', collapsed: true, tabs: [makeTab()] }),
      ],
    });

    await applyProfile(profile, windowId);

    const allGroups = mock.getAllGroups();
    expect(allGroups).toHaveLength(1);
    expect(allGroups[0].title).toBe('MyGroup');
    expect(allGroups[0].color).toBe('red');
    expect(allGroups[0].collapsed).toBe(true);
  });

  it('returns result with correct field types', async () => {
    const { windowId } = mock.seedWindow();
    const profile = makeProfile({
      groups: [makeGroup({ tabs: [makeTab()] })],
    });

    const result = await applyProfile(profile, windowId);

    expect(typeof result.created).toBe('number');
    expect(Array.isArray(result.skipped)).toBe(true);
    expect(typeof result.groups).toBe('number');
  });
});

// ── Pinned and discarded tabs ────────────────────────────────────────────────

describe('applyProfile — pinned and discarded', () => {
  it('creates pinned tabs with pinned:true', async () => {
    const { windowId } = mock.seedWindow();
    const profile = makeProfile({
      groups: [makeGroup({ tabs: [makeTab({ pinned: true })] })],
    });

    await applyProfile(profile, windowId);

    const createdTabs = mock.getWindowTabs(windowId);
    expect(createdTabs).toHaveLength(1);
    expect(createdTabs[0].pinned).toBe(true);
  });

  it('creates non-pinned tabs with discarded:true', async () => {
    const { windowId } = mock.seedWindow();
    const profile = makeProfile({
      groups: [makeGroup({ tabs: [makeTab({ pinned: false })] })],
    });

    await applyProfile(profile, windowId);

    const createdTabs = mock.getWindowTabs(windowId);
    expect(createdTabs).toHaveLength(1);
    expect(createdTabs[0].discarded).toBe(true);
  });
});

// ── Skipping unopenable URLs ─────────────────────────────────────────────────

describe('applyProfile — unopenable URLs', () => {
  it('skips chrome:// URLs with reason "unopenable"', async () => {
    const { windowId } = mock.seedWindow();
    const profile = makeProfile({
      groups: [makeGroup({ tabs: [makeTab({ url: 'chrome://settings' })] })],
    });

    const result = await applyProfile(profile, windowId);

    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].url).toBe('chrome://settings');
    expect(result.skipped[0].reason).toBe('unopenable');
    expect(result.created).toBe(0);
  });

  it('skips all-unopenable profile: created=0, groups=0, no registration', async () => {
    const { windowId } = mock.seedWindow();
    const profile = makeProfile({
      id: 'unopenable-prof',
      groups: [makeGroup({ tabs: [makeTab({ url: 'chrome://settings' }), makeTab({ url: 'file:///etc/hosts' })] })],
    });

    const result = await applyProfile(profile, windowId);

    expect(result.created).toBe(0);
    expect(result.groups).toBe(0);
    expect(result.skipped).toHaveLength(2);

    // Should NOT be registered in active-window-map
    expect(await getWindowIdForProfile('unopenable-prof')).toBeUndefined();
  });
});

// ── Per-tab create failure ───────────────────────────────────────────────────

describe('applyProfile — per-tab create failure', () => {
  it('skips a tab that fails to create, other tabs in the group succeed', async () => {
    const { windowId } = mock.seedWindow();
    const failUrl = 'https://will-fail.com';

    // Override create to throw for one specific URL
    const originalCreate = globalThis.chrome.tabs.create;
    globalThis.chrome.tabs.create = async (opts) => {
      if (opts.url === failUrl) throw new Error('Simulated create failure');
      return originalCreate(opts);
    };

    const profile = makeProfile({
      groups: [makeGroup({ tabs: [
        makeTab({ url: 'https://ok.com' }),
        makeTab({ url: failUrl }),
        makeTab({ url: 'https://also-ok.com' }),
      ]})],
    });

    const result = await applyProfile(profile, windowId);

    // 2 of 3 created, 1 skipped
    expect(result.created).toBe(2);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].url).toBe(failUrl);
    expect(result.skipped[0].reason).toBe('create-failed');
    expect(result.groups).toBe(1);
  });
});

// ── Per-group rollback ───────────────────────────────────────────────────────

describe('applyProfile — per-group rollback', () => {
  it('rolls back tabs when chrome.tabs.group throws, earlier groups survive', async () => {
    const { windowId } = mock.seedWindow();

    // Let the first group.tabs.group succeed, fail on the second
    let groupCallCount = 0;
    const originalGroup = globalThis.chrome.tabs.group;
    globalThis.chrome.tabs.group = async (opts) => {
      groupCallCount++;
      if (groupCallCount === 2) throw new Error('Simulated group failure');
      return originalGroup(opts);
    };

    const profile = makeProfile({
      groups: [
        makeGroup({ name: 'First', tabs: [makeTab({ url: 'https://first.com' })] }),
        makeGroup({ name: 'Second', tabs: [makeTab({ url: 'https://second.com' })] }),
      ],
    });

    const result = await applyProfile(profile, windowId);

    // First group succeeded, second was rolled back
    expect(result.created).toBe(1);
    expect(result.groups).toBe(1);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].url).toBe('https://second.com');
    expect(result.skipped[0].reason).toBe('create-failed');

    // Verify first group's tab is still in the window
    const remainingTabs = mock.getWindowTabs(windowId);
    expect(remainingTabs.some(t => t.url === 'https://first.com')).toBe(true);
    // Second group's tab should have been removed
    expect(remainingTabs.some(t => t.url === 'https://second.com')).toBe(false);
  });

  it('rolls back tabs when chrome.tabGroups.update throws', async () => {
    const { windowId } = mock.seedWindow();

    globalThis.chrome.tabGroups.update = async () => {
      throw new Error('Simulated tabGroups.update failure');
    };

    const profile = makeProfile({
      groups: [makeGroup({ tabs: [makeTab({ url: 'https://rollback.com' })] })],
    });

    const result = await applyProfile(profile, windowId);

    expect(result.created).toBe(0);
    expect(result.groups).toBe(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toBe('create-failed');

    // Tab should be removed (rolled back)
    const remainingTabs = mock.getWindowTabs(windowId);
    expect(remainingTabs.some(t => t.url === 'https://rollback.com')).toBe(false);
  });
});

// ── ProfileInUseError ─────────────────────────────────────────────────────────

describe('applyProfile — ProfileInUseError', () => {
  it('throws ProfileInUseError when profile is active in another existing window', async () => {
    const { windowId: win1 } = mock.seedWindow();
    const { windowId: win2 } = mock.seedWindow();

    const profile = makeProfile({
      id: 'shared-prof',
      groups: [makeGroup({ tabs: [makeTab()] })],
    });

    // Apply in window 1 first
    await applyProfile(profile, win1);

    // Try to apply in window 2 — should throw
    await expect(applyProfile(profile, win2)).rejects.toThrow(ProfileInUseError);

    try {
      await applyProfile(profile, win2);
    } catch (e) {
      expect(e).toBeInstanceOf(ProfileInUseError);
      expect(e.existingWindowId).toBe(win1);
    }
  });

  it('recovers from stale entry when referenced window no longer exists', async () => {
    const { windowId: win2 } = mock.seedWindow();

    // Seed a mapping for a window that doesn't exist in the mock
    const staleWindowId = 9999; // not seeded in mock

    // Manually seed the active-window-map session entry
    resetCacheForTesting();
    // We prime the session store directly so active-window-map loads it
    mock.getSessionStore()['activeWindowMap'] = { 'stale-prof': staleWindowId };

    // Now resetCacheForTesting so it re-reads from session
    resetCacheForTesting();

    const profile = makeProfile({
      id: 'stale-prof',
      groups: [makeGroup({ tabs: [makeTab()] })],
    });

    // window 9999 doesn't exist → chrome.windows.get should throw → stale entry cleared
    const result = await applyProfile(profile, win2);

    expect(result.created).toBe(1);
    expect(await getWindowIdForProfile('stale-prof')).toBe(win2);
  });
});

// ── register not called when created === 0 ────────────────────────────────────

describe('applyProfile — no registration when nothing created', () => {
  it('does not register in active-window-map when all URLs are unopenable', async () => {
    const { windowId } = mock.seedWindow();
    const profile = makeProfile({
      id: 'no-reg-prof',
      groups: [makeGroup({ tabs: [makeTab({ url: 'chrome://newtab' })] })],
    });

    await applyProfile(profile, windowId);

    expect(await getWindowIdForProfile('no-reg-prof')).toBeUndefined();
  });
});

// ── Per-profile lock / concurrency ───────────────────────────────────────────

describe('applyProfile — per-profile lock', () => {
  /**
   * Two concurrent applyProfile calls for the same profile on the same windowId.
   * Expected behavior: the first call completes and registers the profile,
   * then the second call starts. Since the profile is now registered for windowId
   * (same window), the second call proceeds (same window is not a conflict) and
   * also succeeds. Both return valid ApplyResult objects.
   *
   * The lock serializes the two calls rather than running them in parallel —
   * meaning: second awaits first, then runs. With the same windowId, no
   * ProfileInUseError is thrown.
   */
  it('serializes concurrent calls on the same profile+window: both succeed', async () => {
    const { windowId } = mock.seedWindow();
    const profile = makeProfile({
      id: 'concurrent-prof',
      groups: [makeGroup({ tabs: [makeTab()] })],
    });

    const [result1, result2] = await Promise.all([
      applyProfile(profile, windowId),
      applyProfile(profile, windowId),
    ]);

    // Both must return valid shapes
    expect(typeof result1.created).toBe('number');
    expect(typeof result2.created).toBe('number');
    expect(Array.isArray(result1.skipped)).toBe(true);
    expect(Array.isArray(result2.skipped)).toBe(true);
  });

  it('second call to different window throws ProfileInUseError after first registers', async () => {
    const { windowId: win1 } = mock.seedWindow();
    const { windowId: win2 } = mock.seedWindow();

    const profile = makeProfile({
      id: 'lock-cross-window-prof',
      groups: [makeGroup({ tabs: [makeTab()] })],
    });

    // First apply registers profile in win1
    await applyProfile(profile, win1);

    // Second apply to win2 should throw since win1 still exists
    await expect(applyProfile(profile, win2)).rejects.toThrow(ProfileInUseError);
  });
});
