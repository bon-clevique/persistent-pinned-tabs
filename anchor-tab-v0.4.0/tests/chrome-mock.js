/**
 * Creates an in-memory chrome.storage.local mock and installs it on globalThis.chrome.
 * Also provides mocks for chrome.tabs, chrome.tabGroups, and chrome.windows.
 * Returns helpers for test introspection and state management.
 */
export function installChromeMock(initialData = {}) {
  // ── storage ─────────────────────────────────────────────────────────────────
  let store = { ...initialData };

  const local = {
    async get(keys) {
      if (keys == null) return { ...store };
      const keysArr = Array.isArray(keys) ? keys : [keys];
      const result = {};
      for (const k of keysArr) {
        if (k in store) result[k] = store[k];
      }
      return result;
    },
    async set(obj) {
      Object.assign(store, obj);
    },
    async remove(keys) {
      const keysArr = Array.isArray(keys) ? keys : [keys];
      for (const k of keysArr) {
        delete store[k];
      }
    },
  };

  let sessionStore = {};

  const session = {
    async get(keys) {
      if (keys == null) return { ...sessionStore };
      const keysArr = Array.isArray(keys) ? keys : [keys];
      const result = {};
      for (const k of keysArr) {
        if (k in sessionStore) result[k] = sessionStore[k];
      }
      return result;
    },
    async set(obj) {
      Object.assign(sessionStore, obj);
    },
    async remove(keys) {
      const keysArr = Array.isArray(keys) ? keys : [keys];
      for (const k of keysArr) {
        delete sessionStore[k];
      }
    },
  };

  // ── in-memory state ──────────────────────────────────────────────────────────
  /** @type {Map<number, {id:number, incognito:boolean, type:string, focused:boolean}>} */
  const windows = new Map();
  /** @type {Map<number, {id:number, windowId:number, url:string, pinned:boolean, active:boolean, discarded:boolean, groupId:number, index:number, pendingUrl?:string}>} */
  const tabs = new Map();
  /** @type {Map<number, {id:number, windowId:number, title:string, color:string, collapsed:boolean}>} */
  const groups = new Map();

  let nextWindowId = 1000;
  let nextTabId = 1;
  let nextGroupId = 100;

  // ── event emitters ───────────────────────────────────────────────────────────
  function makeEventEmitter() {
    const listeners = [];
    return {
      addListener(fn) { listeners.push(fn); },
      removeListener(fn) {
        const idx = listeners.indexOf(fn);
        if (idx !== -1) listeners.splice(idx, 1);
      },
      // test-only helper
      emit(...args) {
        for (const fn of listeners) fn(...args);
      },
    };
  }

  const onCreated = makeEventEmitter();
  const onRemoved = makeEventEmitter();
  const onFocusChanged = makeEventEmitter();

  // ── chrome.windows ───────────────────────────────────────────────────────────
  const windowsApi = {
    async get(windowId) {
      const win = windows.get(windowId);
      if (!win) throw new Error(`No window with id ${windowId}`);
      return { ...win };
    },
    async getCurrent() {
      for (const [, win] of windows) {
        if (win.focused) return { ...win };
      }
      // Return first window if none focused
      const first = windows.values().next().value;
      if (!first) throw new Error('No windows exist');
      return { ...first };
    },
    async create({ url, incognito = false } = {}) {
      const id = nextWindowId++;
      const win = { id, incognito, type: 'normal', focused: false };
      windows.set(id, win);
      if (url) {
        // Create an initial tab in this window
        const tabId = nextTabId++;
        tabs.set(tabId, {
          id: tabId, windowId: id, url, pinned: false,
          active: true, discarded: false, groupId: -1, index: 0,
        });
      }
      onCreated.emit(win);
      return { ...win };
    },
    async update(windowId, { focused } = {}) {
      const win = windows.get(windowId);
      if (!win) throw new Error(`No window with id ${windowId}`);
      if (focused !== undefined) {
        // Unfocus all others
        for (const [, w] of windows) w.focused = false;
        win.focused = focused;
      }
      return { ...win };
    },
    onCreated,
    onRemoved,
    onFocusChanged,
  };

  // ── chrome.tabs ──────────────────────────────────────────────────────────────
  const tabsApi = {
    TAB_GROUP_ID_NONE: -1,

    async query({ windowId, active, groupId } = {}) {
      const result = [];
      for (const [, tab] of tabs) {
        if (windowId !== undefined && tab.windowId !== windowId) continue;
        if (active !== undefined && tab.active !== active) continue;
        if (groupId !== undefined && tab.groupId !== groupId) continue;
        result.push({ ...tab });
      }
      // Return in index order
      result.sort((a, b) => a.index - b.index);
      return result;
    },

    async create({ windowId, url, pinned = false, active = false, discarded = false } = {}) {
      const id = nextTabId++;
      // Compute index as count of existing tabs in this window
      let index = 0;
      for (const [, tab] of tabs) {
        if (tab.windowId === windowId) index++;
      }
      const tab = { id, windowId, url: url ?? '', pinned, active, discarded, groupId: -1, index };
      tabs.set(id, tab);
      return { ...tab };
    },

    async group({ tabIds, createProperties: { windowId } = {} } = {}) {
      const ids = Array.isArray(tabIds) ? tabIds : [tabIds];
      const id = nextGroupId++;
      // Determine windowId from first tab if not provided
      const effectiveWindowId = windowId ?? tabs.get(ids[0])?.windowId;
      groups.set(id, { id, windowId: effectiveWindowId, title: '', color: 'grey', collapsed: false });
      for (const tabId of ids) {
        const tab = tabs.get(tabId);
        if (tab) tab.groupId = id;
      }
      return id;
    },

    async remove(tabIds) {
      const ids = Array.isArray(tabIds) ? tabIds : [tabIds];
      for (const id of ids) {
        tabs.delete(id);
      }
    },

    async update(tabId, updates) {
      const tab = tabs.get(tabId);
      if (!tab) throw new Error(`No tab with id ${tabId}`);
      Object.assign(tab, updates);
      return { ...tab };
    },
  };

  // ── chrome.tabGroups ─────────────────────────────────────────────────────────
  const tabGroupsApi = {
    TAB_GROUP_ID_NONE: -1,

    async get(groupId) {
      const group = groups.get(groupId);
      if (!group) throw new Error(`No group with id ${groupId}`);
      return { ...group };
    },

    async update(groupId, { title, color, collapsed } = {}) {
      const group = groups.get(groupId);
      if (!group) throw new Error(`No group with id ${groupId}`);
      if (title !== undefined) group.title = title;
      if (color !== undefined) group.color = color;
      if (collapsed !== undefined) group.collapsed = collapsed;
      return { ...group };
    },

    async query({ windowId, collapsed } = {}) {
      const result = [];
      for (const [, group] of groups) {
        if (windowId !== undefined && group.windowId !== windowId) continue;
        if (collapsed !== undefined && group.collapsed !== collapsed) continue;
        result.push({ ...group });
      }
      return result;
    },
  };

  // ── install on globalThis ────────────────────────────────────────────────────
  globalThis.chrome = {
    storage: { local, session },
    tabs: tabsApi,
    tabGroups: tabGroupsApi,
    windows: windowsApi,
  };

  // ── test helpers ─────────────────────────────────────────────────────────────

  /**
   * Seeds a window with optional groups and tabs.
   * @param {{ id?: number, incognito?: boolean, type?: string, focused?: boolean, tabs?: Array<{url?: string, pinned?: boolean, groupId?: number, pendingUrl?: string}>, groups?: Array<{id?: number, title: string, color: string, collapsed: boolean}> }} opts
   * @returns {{ windowId: number, tabIds: number[], groupIds: number[] }}
   */
  function seedWindow({ id, incognito = false, type = 'normal', focused = false, tabs: tabDefs = [], groups: groupDefs = [] } = {}) {
    const windowId = id ?? nextWindowId++;
    windows.set(windowId, { id: windowId, incognito, type, focused });

    // Create groups first so tabs can reference them
    const groupIds = [];
    const groupIdMap = new Map(); // local index → actual groupId (for cross-referencing by tabDefs)
    for (const gDef of groupDefs) {
      const gId = gDef.id ?? nextGroupId++;
      groups.set(gId, {
        id: gId,
        windowId,
        title: gDef.title ?? '',
        color: gDef.color ?? 'grey',
        collapsed: gDef.collapsed ?? false,
      });
      groupIds.push(gId);
      groupIdMap.set(gDef.id, gId); // allow tabDefs to use original id
    }

    const tabIds = [];
    for (let i = 0; i < tabDefs.length; i++) {
      const tDef = tabDefs[i];
      const tabId = nextTabId++;
      // Resolve groupId: -1 means ungrouped; anything else is passed through
      let resolvedGroupId = tDef.groupId !== undefined ? tDef.groupId : -1;
      tabs.set(tabId, {
        id: tabId,
        windowId,
        url: tDef.url ?? '',
        pendingUrl: tDef.pendingUrl,
        pinned: tDef.pinned ?? false,
        active: false,
        discarded: false,
        groupId: resolvedGroupId,
        index: i,
      });
      tabIds.push(tabId);
    }

    return { windowId, tabIds, groupIds };
  }

  /**
   * Returns ordered array of tabs for a given windowId.
   * @param {number} windowId
   * @returns {Array}
   */
  function getWindowTabs(windowId) {
    const result = [];
    for (const [, tab] of tabs) {
      if (tab.windowId === windowId) result.push({ ...tab });
    }
    result.sort((a, b) => a.index - b.index);
    return result;
  }

  /**
   * Returns the group metadata for a given groupId.
   * @param {number} groupId
   */
  function getGroup(groupId) {
    const g = groups.get(groupId);
    return g ? { ...g } : undefined;
  }

  /**
   * Returns all groups as an array.
   */
  function getAllGroups() {
    return [...groups.values()].map(g => ({ ...g }));
  }

  /**
   * Triggers onCreated listeners for a window.
   */
  function triggerWindowCreated({ windowId, type = 'normal', incognito = false } = {}) {
    const win = windows.get(windowId) ?? { id: windowId, type, incognito, focused: false };
    onCreated.emit(win);
  }

  /**
   * Triggers onRemoved listeners for a window.
   */
  function triggerWindowRemoved(windowId) {
    onRemoved.emit(windowId);
  }

  /**
   * Resets all state (windows, tabs, groups, storage).
   */
  function resetAll() {
    store = {};
    sessionStore = {};
    windows.clear();
    tabs.clear();
    groups.clear();
    nextWindowId = 1000;
    nextTabId = 1;
    nextGroupId = 100;
  }

  return {
    // Storage helpers (backward compat)
    getStore: () => store,
    resetStore: (data = {}) => { store = { ...data }; },
    getSessionStore: () => sessionStore,
    resetSessionStore: (data = {}) => { sessionStore = { ...data }; },
    // New helpers
    resetAll,
    seedWindow,
    getWindowTabs,
    getGroup,
    getAllGroups,
    triggerWindowCreated,
    triggerWindowRemoved,
  };
}
