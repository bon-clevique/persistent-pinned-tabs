// ---------------------------------------------------------------------------
// 起動時の二重展開回避
//   Chrome の「前回開いていたページを開く」設定でセッション復元される際、
//   復元される各ウィンドウに対して windows.onCreated が発火する。
//   そのタイミングで自動展開すると、固定タブが復元タブに上乗せされてしまう。
//   onStartup から一定時間以内のウィンドウは「復元由来」とみなして skip する。
// ---------------------------------------------------------------------------

const STARTUP_GRACE_MS = 5000; // 起動から 5 秒以内のウィンドウは復元由来とみなす

chrome.runtime.onStartup.addListener(async () => {
  await chrome.storage.session.set({ startupAt: Date.now() });
});

async function isStartupWindow() {
  const { startupAt } = await chrome.storage.session.get('startupAt');
  if (!startupAt) return false;
  return Date.now() - startupAt < STARTUP_GRACE_MS;
}

// ---------------------------------------------------------------------------
// マイグレーション: storage.sync → storage.local
// ---------------------------------------------------------------------------

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason !== 'update' && details.reason !== 'install') return;
  try {
    const { persistentTabs: syncTabs } = await chrome.storage.sync.get('persistentTabs');
    const { persistentTabs: localTabs } = await chrome.storage.local.get('persistentTabs');
    if (Array.isArray(syncTabs) && syncTabs.length > 0 && (!localTabs || localTabs.length === 0)) {
      await chrome.storage.local.set({ persistentTabs: syncTabs });
      await chrome.storage.sync.remove('persistentTabs');
      console.log('[AnchorTab] Migrated tabs from sync to local storage');
    }
  } catch (e) {
    console.error('[AnchorTab] Migration failed:', e);
  }
});

// ---------------------------------------------------------------------------
// メインロジック: 新規ウィンドウへの固定タブ展開
// ---------------------------------------------------------------------------

chrome.windows.onCreated.addListener(async (window) => {
  if (window.type !== 'normal') return;
  if (await isStartupWindow()) return;

  const { autoInject = true } = await chrome.storage.local.get('autoInject');
  if (!autoInject) return;

  const { persistentTabs = [] } = await chrome.storage.local.get('persistentTabs');
  if (persistentTabs.length === 0) return;

  await new Promise((resolve) => setTimeout(resolve, 150));

  const existingTabs = await chrome.tabs.query({ windowId: window.id });
  const existingUrls = new Set(existingTabs.map((t) => t.url));

  for (const url of persistentTabs) {
    if (existingUrls.has(url)) continue;
    try {
      await chrome.tabs.create({
        windowId: window.id,
        url,
        pinned: true,
        active: false
      });
    } catch (e) {
      console.error('[AnchorTab] Failed to create pinned tab:', url, e);
    }
  }

  if (existingTabs.length > 0) {
    await chrome.tabs.update(existingTabs[0].id, { active: true });
  }
});
