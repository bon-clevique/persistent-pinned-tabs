import {
  listProfiles,
  createProfile,
  updateProfile,
  deleteProfile,
  duplicateProfile,
  setDefault,
} from '../storage/profiles-repo.js';
import {
  getNewWindowBehavior,
  setNewWindowBehavior,
  getLegacyMigrationBannerSeen,
  setLegacyMigrationBannerSeen,
} from '../storage/settings-repo.js';
import { GROUP_COLORS, validateProfileCollection } from '../storage/schema.js';
import { captureCurrentWindow } from '../engine/capture.js';
import { downloadProfilesJson } from '../util/json-export.js';
import { openModal } from './components/modal.js';

/** @param {string} key @param {string[]} [subs] @returns {string} */
function t(key, subs = []) {
  const msg = chrome.i18n.getMessage(key);
  if (!msg) return key;
  return subs.reduce((s, sub, i) => s.replace(`$${i + 1}`, sub), msg);
}

/** @type {string | null} */
let selectedProfileId = null;

/** @type {{ profile: import('../storage/schema.js').Profile, action: 'overwrite'|'suffix'|'skip' }[]} */
let pendingImportConflicts = [];

/** @type {import('../storage/schema.js').Profile[]} */
let pendingImportNonConflicts = [];

// ─── Debounce helper ─────────────────────────────────────────────────────────

/**
 * Returns a debounced version of fn.
 * @template {(...args: unknown[]) => void} T
 * @param {T} fn
 * @param {number} [ms]
 * @returns {T}
 */
function debouncePatch(fn, ms = 250) {
  let timer = null;
  // @ts-ignore
  return (...args) => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => { timer = null; fn(...args); }, ms);
  };
}

// ─── Entry point ─────────────────────────────────────────────────────────────

export async function initOptions() {
  await render();
}

// ─── Main render ─────────────────────────────────────────────────────────────

async function render() {
  const [profiles, newWindowBehavior, bannerSeen] = await Promise.all([
    listProfiles(),
    getNewWindowBehavior(),
    getLegacyMigrationBannerSeen(),
  ]);

  document.body.innerHTML = buildPage(profiles, newWindowBehavior, bannerSeen);
  bindHandlers(profiles);
}

// ─── HTML builders ───────────────────────────────────────────────────────────

/**
 * @param {import('../storage/schema.js').Profile[]} profiles
 * @param {import('../storage/settings-repo.js').NewWindowBehavior} newWindowBehavior
 * @param {boolean} bannerSeen
 */
function buildPage(profiles, newWindowBehavior, bannerSeen) {
  const selected = selectedProfileId
    ? profiles.find(p => p.id === selectedProfileId) ?? profiles[0] ?? null
    : profiles[0] ?? null;
  if (selected && !selectedProfileId) selectedProfileId = selected?.id ?? null;

  // Empty-group warning for the currently selected profile
  const emptyGroupCount = selected
    ? selected.groups.filter(g => g.tabs.length === 0).length
    : 0;

  return `
<div id="app">
  ${bannerSeen === false ? buildLegacyBanner() : ''}
  <div id="banner-area"></div>

  <div id="toolbar">
    <button id="btn-new-window">${t('optionsNewFromWindowBtn')}</button>
    <button id="btn-new-empty">${t('optionsNewEmptyBtn')}</button>
    <button id="btn-export">${t('exportBtn')}</button>
    <button id="btn-import">${t('importBtn')}</button>
    <input type="file" id="file-input" accept="application/json" style="display:none" />
  </div>

  <div id="main">
    <div id="profile-list">
      ${profiles.length === 0
        ? `<p class="empty-msg">${t('optionsEmptyListMessage')}</p>`
        : profiles.map(p => buildProfileListItem(p, selected?.id)).join('')}
    </div>

    <div id="editor">
      ${emptyGroupCount > 0 ? buildEmptyGroupBanner(emptyGroupCount) : ''}
      ${selected ? buildEditor(selected) : ''}
    </div>
  </div>

  <section id="settings-section">
    <h2>${t('optionsSettingsHeader')}</h2>
    <fieldset id="new-window-behavior-group">
      <legend>${t('newWindowBehaviorLabel')}</legend>
      <label>
        <input type="radio" name="new-window-behavior" value="auto-open"
          ${newWindowBehavior === 'auto-open' ? 'checked' : ''} />
        ${t('newWindowBehaviorAutoOpen')}
      </label>
      <label>
        <input type="radio" name="new-window-behavior" value="badge"
          ${newWindowBehavior === 'badge' ? 'checked' : ''} />
        ${t('newWindowBehaviorBadge')}
      </label>
      <label>
        <input type="radio" name="new-window-behavior" value="off"
          ${newWindowBehavior === 'off' ? 'checked' : ''} />
        ${t('newWindowBehaviorOff')}
      </label>
    </fieldset>
  </section>
</div>`;
}

function buildLegacyBanner() {
  return `<div id="legacy-banner" class="banner banner-info">
    <span>${t('legacyMigratedBanner')}</span>
    <button id="btn-dismiss-legacy">${t('optionsDismissBtn')}</button>
  </div>`;
}

/** @param {number} count */
function buildEmptyGroupBanner(count) {
  const msg = t('optionsEmptyGroupBanner').replace('{N}', String(count));
  return `<div class="banner banner-info empty-group-banner">
    <span>${escHtml(msg)}</span>
  </div>`;
}

/** @param {import('../storage/schema.js').Profile} p @param {string|undefined} selectedId */
function buildProfileListItem(p, selectedId) {
  const isSelected = p.id === selectedId;
  return `<div class="profile-item${isSelected ? ' selected' : ''}" data-id="${escHtml(p.id)}">
    <span class="profile-name">${escHtml(p.name)}</span>
    <span class="mode-badge">${p.mode}</span>
    ${p.isDefault ? '<span class="default-star" title="default">★</span>' : ''}
  </div>`;
}

/** @param {import('../storage/schema.js').Profile} profile */
function buildEditor(profile) {
  return `
<div id="editor-inner" data-id="${escHtml(profile.id)}">
  <div class="editor-header">
    <input id="profile-name-input" type="text" value="${escHtml(profile.name)}"
      placeholder="${t('optionsProfileNamePlaceholder')}" />
  </div>

  <div class="editor-actions">
    <label>${t('optionsModeLabel')}
      <select id="mode-select">
        <option value="normal" ${profile.mode === 'normal' ? 'selected' : ''}>${t('optionsModeNormal')}</option>
        <option value="incognito" ${profile.mode === 'incognito' ? 'selected' : ''}>${t('optionsModeIncognito')}</option>
      </select>
    </label>
    <button id="btn-set-default">${t('optionsSetDefaultBtn')}</button>
    <button id="btn-duplicate">${t('optionsDuplicateBtn')}</button>
    <button id="btn-delete" class="danger">${t('optionsDeleteBtn')}</button>
  </div>

  <div id="groups-container">
    ${profile.groups
      .map((g, gi) => buildGroupBlock(g, gi, profile.groups.length))
      .join('')}
  </div>

  <button id="btn-add-group">${t('optionsAddGroupBtn')}</button>
</div>`;
}

/**
 * @param {import('../storage/schema.js').Group} group
 * @param {number} gi group index (in sorted order)
 * @param {number} total total groups count
 */
function buildGroupBlock(group, gi, total) {
  const colorOptions = GROUP_COLORS.map(c =>
    `<option value="${c}" ${group.color === c ? 'selected' : ''}>${c}</option>`
  ).join('');

  const tabs = group.tabs;

  const eid = escHtml(group.id);
  return `<div class="group-block" data-group-id="${eid}">
  <div class="group-header">
    <input class="group-name-input" type="text" value="${escHtml(group.name)}"
      placeholder="${t('optionsGroupNamePlaceholder')}" data-group-id="${eid}" />
    <label>${t('optionsGroupColorLabel')}
      <select class="group-color-select" data-group-id="${eid}">${colorOptions}</select>
    </label>
    <label>
      <input type="checkbox" class="group-collapsed-chk" data-group-id="${eid}"
        ${group.collapsed ? 'checked' : ''} />
      ${t('optionsGroupCollapsedLabel')}
    </label>
    <button class="btn-group-up" data-group-id="${eid}" ${gi === 0 ? 'disabled' : ''}>${t('optionsUpBtn')}</button>
    <button class="btn-group-down" data-group-id="${eid}" ${gi === total - 1 ? 'disabled' : ''}>${t('optionsDownBtn')}</button>
    <button class="btn-remove-group danger" data-group-id="${eid}">${t('optionsRemoveGroupBtn')}</button>
  </div>
  <div class="tabs-container" data-group-id="${eid}">
    ${tabs.map((tab, ti) => buildTabRow(tab, ti, tabs.length, group.id)).join('')}
  </div>
  <button class="btn-add-tab" data-group-id="${eid}">${t('optionsAddTabBtn')}</button>
</div>`;
}

/**
 * @param {import('../storage/schema.js').Tab} tab
 * @param {number} ti tab index
 * @param {number} total total tabs in group
 * @param {string} groupId
 */
function buildTabRow(tab, ti, total, groupId) {
  const egid = escHtml(groupId);
  return `<div class="tab-row" data-group-id="${egid}" data-tab-index="${ti}">
  <input class="tab-url-input" type="url" value="${escHtml(tab.url)}"
    placeholder="${t('optionsTabUrlPlaceholder')}" data-group-id="${egid}" data-tab-index="${ti}" />
  <label>
    <input type="checkbox" class="tab-pinned-chk" data-group-id="${egid}" data-tab-index="${ti}"
      ${tab.pinned ? 'checked' : ''} />
    ${t('optionsTabPinnedLabel')}
  </label>
  <button class="btn-tab-up" data-group-id="${egid}" data-tab-index="${ti}"
    ${ti === 0 ? 'disabled' : ''}>${t('optionsUpBtn')}</button>
  <button class="btn-tab-down" data-group-id="${egid}" data-tab-index="${ti}"
    ${ti === total - 1 ? 'disabled' : ''}>${t('optionsDownBtn')}</button>
  <button class="btn-remove-tab danger" data-group-id="${egid}" data-tab-index="${ti}">${t('optionsRemoveTabBtn')}</button>
</div>`;
}

// ─── Event binding ────────────────────────────────────────────────────────────

/** @param {import('../storage/schema.js').Profile[]} profiles */
function bindHandlers(profiles) {
  // Toolbar
  document.getElementById('btn-new-window')?.addEventListener('click', onNewFromWindow);
  document.getElementById('btn-new-empty')?.addEventListener('click', onNewEmpty);
  document.getElementById('btn-export')?.addEventListener('click', onExport);
  document.getElementById('btn-import')?.addEventListener('click', () => {
    document.getElementById('file-input')?.click();
  });
  document.getElementById('file-input')?.addEventListener('change', onFileSelected);

  // Legacy banner
  document.getElementById('btn-dismiss-legacy')?.addEventListener('click', async () => {
    await setLegacyMigrationBannerSeen(true);
    document.getElementById('legacy-banner')?.remove();
  });

  // Profile list clicks
  document.querySelectorAll('.profile-item').forEach(el => {
    el.addEventListener('click', () => {
      selectedProfileId = el.dataset.id ?? null;
      render();
    });
  });

  // Settings — new-window behavior radio group
  document.querySelectorAll('input[name="new-window-behavior"]').forEach(radio => {
    radio.addEventListener('change', async (e) => {
      if (e.target.checked) {
        await setNewWindowBehavior(/** @type {import('../storage/settings-repo.js').NewWindowBehavior} */ (e.target.value));
      }
    });
  });

  // Editor — only if there's a selected profile
  const selectedProfile = selectedProfileId
    ? profiles.find(p => p.id === selectedProfileId) ?? null
    : null;
  if (!selectedProfile) return;

  // ── Profile name — debounced patch, no render ────────────────────────────
  const debouncedPatchProfileName = debouncePatch(async (name) => {
    if (!name) return;
    await updateProfile(selectedProfile.id, { name });
  });

  document.getElementById('profile-name-input')?.addEventListener('input', (e) => {
    const name = e.target.value.trim();
    debouncedPatchProfileName(name);
  });

  // Mode — structural-enough to warrant re-render (badge in list changes)
  document.getElementById('mode-select')?.addEventListener('change', async (e) => {
    await updateProfile(selectedProfile.id, { mode: e.target.value });
    await render();
  });

  // Set default
  document.getElementById('btn-set-default')?.addEventListener('click', async () => {
    await setDefault(selectedProfile.id);
    await render();
  });

  // Duplicate
  document.getElementById('btn-duplicate')?.addEventListener('click', async () => {
    const copy = await duplicateProfile(selectedProfile.id);
    selectedProfileId = copy.id;
    await render();
  });

  // Delete
  document.getElementById('btn-delete')?.addEventListener('click', async () => {
    const confirmed = await openModal({
      title: t('optionsDeleteConfirmTitle'),
      body: t('optionsDeleteConfirm', [selectedProfile.name]),
      buttons: [
        { label: t('optionsConfirmCancelBtn'), value: null, variant: 'default' },
        { label: t('optionsDeleteBtn'), value: true, variant: 'danger' },
      ],
    });
    if (!confirmed) return;
    await deleteProfile(selectedProfile.id);
    selectedProfileId = null;
    await render();
  });

  // Add group
  document.getElementById('btn-add-group')?.addEventListener('click', async () => {
    const fresh = await listProfiles();
    const prof = fresh.find(p => p.id === selectedProfile.id);
    if (!prof) return;
    const newGroup = {
      id: crypto.randomUUID(),
      name: '',
      color: GROUP_COLORS[0],
      collapsed: false,
      tabs: [],
    };
    await updateProfile(selectedProfile.id, { groups: [...prof.groups, newGroup] });
    await render();
  });

  // Group-level controls (delegated)
  document.getElementById('groups-container')?.addEventListener('click', async (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    const groupId = target.dataset.groupId;
    if (!groupId) return;

    if (target.classList.contains('btn-remove-group')) {
      const fresh = await listProfiles();
      const prof = fresh.find(p => p.id === selectedProfile.id);
      if (!prof) return;
      await updateProfile(selectedProfile.id, { groups: prof.groups.filter(g => g.id !== groupId) });
      await render();
      return;
    }

    if (target.classList.contains('btn-group-up')) {
      await shiftGroup(selectedProfile.id, groupId, -1);
      return;
    }

    if (target.classList.contains('btn-group-down')) {
      await shiftGroup(selectedProfile.id, groupId, 1);
      return;
    }

    if (target.classList.contains('btn-add-tab')) {
      await addTab(selectedProfile.id, groupId);
      return;
    }

    if (target.classList.contains('btn-remove-tab')) {
      const tabIndex = Number(target.dataset.tabIndex);
      await removeTab(selectedProfile.id, groupId, tabIndex);
      return;
    }

    if (target.classList.contains('btn-tab-up')) {
      const tabIndex = Number(target.dataset.tabIndex);
      await shiftTab(selectedProfile.id, groupId, tabIndex, -1);
      return;
    }

    if (target.classList.contains('btn-tab-down')) {
      const tabIndex = Number(target.dataset.tabIndex);
      await shiftTab(selectedProfile.id, groupId, tabIndex, 1);
      return;
    }
  });

  // ── Group / tab field changes (delegated) ───────────────────────────────
  // Debounced patchers for text inputs: no render after patch
  const debouncedGroupName = debouncePatch(async (profileId, groupId, name) => {
    await patchGroup(profileId, groupId, { name });
  });

  const debouncedTabUrl = debouncePatch(async (profileId, groupId, tabIndex, url) => {
    await patchTab(profileId, groupId, tabIndex, { url });
  });

  // Text inputs: bind `input` event with debounced patch, no render
  document.getElementById('groups-container')?.addEventListener('input', (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    const groupId = target.dataset.groupId;
    if (!groupId) return;

    if (target.classList.contains('group-name-input')) {
      debouncedGroupName(selectedProfile.id, groupId, target.value);
      return;
    }

    if (target.classList.contains('tab-url-input')) {
      const tabIndex = Number(target.dataset.tabIndex);
      debouncedTabUrl(selectedProfile.id, groupId, tabIndex, target.value);
      return;
    }
  });

  // Checkboxes and selects: bind `change` event (immediate patch, no render)
  document.getElementById('groups-container')?.addEventListener('change', async (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    const groupId = target.dataset.groupId;
    if (!groupId) return;

    if (target.classList.contains('group-color-select')) {
      await patchGroup(selectedProfile.id, groupId, { color: target.value });
      return;
    }

    if (target.classList.contains('group-collapsed-chk')) {
      await patchGroup(selectedProfile.id, groupId, { collapsed: target.checked });
      return;
    }

    if (target.classList.contains('tab-pinned-chk')) {
      const tabIndex = Number(target.dataset.tabIndex);
      await patchTab(selectedProfile.id, groupId, tabIndex, { pinned: target.checked });
      return;
    }
  });
}

// ─── Toolbar handlers ─────────────────────────────────────────────────────────

async function onNewFromWindow() {
  const win = await chrome.windows.getCurrent();
  const captured = await captureCurrentWindow(win.id);

  const name = await openModal({
    title: t('optionsNamePrompt'),
    body: '',
    buttons: [
      { label: t('optionsConfirmCancelBtn'), value: null, variant: 'default' },
      { label: t('optionsConfirmOkBtn'), value: 'submit', variant: 'primary' },
    ],
    inputField: {
      placeholder: t('optionsProfileNamePlaceholder'),
      initialValue: captured.name,
      validate: (v) => v.trim() ? null : t('optionsNamePrompt'),
    },
  });

  if (name === null) return; // cancelled
  const profile = await createProfile({ ...captured, name: /** @type {string} */ (name).trim() || captured.name });
  selectedProfileId = profile.id;
  await render();
  showBanner('success', `✔ ${profile.name}`);
}

async function onNewEmpty() {
  const name = await openModal({
    title: t('optionsNamePrompt'),
    body: '',
    buttons: [
      { label: t('optionsConfirmCancelBtn'), value: null, variant: 'default' },
      { label: t('optionsConfirmOkBtn'), value: 'submit', variant: 'primary' },
    ],
    inputField: {
      placeholder: t('optionsProfileNamePlaceholder'),
      initialValue: '',
      validate: (v) => v.trim() ? null : t('optionsNamePrompt'),
    },
  });

  if (name === null) return;
  const trimmed = /** @type {string} */ (name).trim();
  if (!trimmed) return;
  const profile = await createProfile({ name: trimmed, mode: 'normal', isDefault: false, groups: [] });
  selectedProfileId = profile.id;
  await render();
}

async function onExport() {
  const profiles = await listProfiles();

  // Count empty groups across all profiles
  let totalEmptyGroups = 0;
  let profilesWithEmptyGroups = 0;
  for (const p of profiles) {
    const emptyCount = p.groups.filter(g => g.tabs.length === 0).length;
    if (emptyCount > 0) {
      totalEmptyGroups += emptyCount;
      profilesWithEmptyGroups++;
    }
  }

  if (totalEmptyGroups > 0) {
    const rawMsg = t('optionsExportEmptyGroupsConfirm');
    const msg = rawMsg
      .replace('{N}', String(totalEmptyGroups))
      .replace('{M}', String(profilesWithEmptyGroups));

    const confirmed = await openModal({
      title: t('exportBtn'),
      body: msg,
      buttons: [
        { label: t('optionsConfirmCancelBtn'), value: null, variant: 'default' },
        { label: t('exportBtn'), value: true, variant: 'primary' },
      ],
    });
    if (!confirmed) return;
  }

  downloadProfilesJson(profiles);
}

async function onFileSelected(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  // Reset so same file can be re-selected
  e.target.value = '';

  if (file.size > 5 * 1024 * 1024) {
    showBanner('error', t('optionsImportTooLarge'));
    return;
  }

  let parsed;
  try {
    const text = await file.text();
    parsed = JSON.parse(text);
  } catch {
    showBanner('error', t('optionsSchemaMismatchError'));
    return;
  }

  const result = validateProfileCollection(parsed);
  if (!result.ok) {
    showBanner('error', t('optionsSchemaMismatchError'));
    return;
  }

  if (parsed.profiles.length > 500) {
    showBanner('error', t('optionsImportTooManyProfiles'));
    return;
  }
  for (const p of parsed.profiles) {
    if (p.name.length > 200) {
      showBanner('error', t('optionsImportNameTooLong'));
      return;
    }
    if (p.groups.length > 100) {
      showBanner('error', t('optionsImportTooManyGroups'));
      return;
    }
    for (const g of p.groups) {
      if (g.name.length > 200) {
        showBanner('error', t('optionsImportNameTooLong'));
        return;
      }
      if (g.tabs.length > 500) {
        showBanner('error', t('optionsImportTooManyTabs'));
        return;
      }
      for (const tab of g.tabs) {
        if (tab.url.length > 2048) {
          showBanner('error', t('optionsImportUrlTooLong'));
          return;
        }
      }
    }
  }

  const existing = await listProfiles();
  const conflicts = [];
  const nonConflicts = [];

  for (const incoming of parsed.profiles) {
    const clash = existing.find(e => e.name === incoming.name && e.mode === incoming.mode);
    if (clash) {
      conflicts.push({ profile: incoming, action: 'overwrite' });
    } else {
      nonConflicts.push(incoming);
    }
  }

  if (conflicts.length === 0) {
    await applyImport(nonConflicts, []);
    await render();
    showBanner('success', `✔ Import complete`);
    return;
  }

  pendingImportConflicts = conflicts;
  pendingImportNonConflicts = nonConflicts;
  await showConflictModal();
}

// ─── Import conflict modal ────────────────────────────────────────────────────

async function showConflictModal() {
  // Build body as HTMLElement so we can keep radio buttons interactive
  const container = document.createElement('div');

  // Bulk action row
  const bulkRow = document.createElement('div');
  bulkRow.className = 'conflict-bulk';
  bulkRow.innerHTML = `${escHtml(t('optionsImportConflictApplyAll'))}: `;

  const bulkActions = ['overwrite', 'suffix', 'skip'];
  const bulkLabels = {
    overwrite: t('optionsImportConflictOverwrite'),
    suffix: t('optionsImportConflictSuffix'),
    skip: t('optionsImportConflictSkip'),
  };
  bulkActions.forEach((action) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'anchor-modal-btn';
    btn.textContent = bulkLabels[action];
    btn.dataset.bulk = action;
    bulkRow.appendChild(btn);
  });
  container.appendChild(bulkRow);

  // Conflict table
  const table = document.createElement('table');
  table.className = 'conflict-table';
  pendingImportConflicts.forEach((c, i) => {
    const tr = document.createElement('tr');

    const nameTd = document.createElement('td');
    nameTd.textContent = `${c.profile.name} (${c.profile.mode})`;
    tr.appendChild(nameTd);

    const actionTd = document.createElement('td');
    ['overwrite', 'suffix', 'skip'].forEach((val) => {
      const label = document.createElement('label');
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = `conflict-${i}`;
      radio.value = val;
      radio.checked = val === 'overwrite';
      label.appendChild(radio);
      label.append(` ${bulkLabels[val]}`);
      actionTd.appendChild(label);
    });
    tr.appendChild(actionTd);
    table.appendChild(tr);
  });
  container.appendChild(table);

  // Wire bulk buttons
  bulkRow.querySelectorAll('[data-bulk]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const action = btn.dataset.bulk;
      pendingImportConflicts.forEach((_, i) => {
        const radio = container.querySelector(`input[name="conflict-${i}"][value="${action}"]`);
        if (radio) radio.checked = true;
      });
    });
  });

  const result = await openModal({
    title: t('optionsImportConflictTitle'),
    body: container,
    buttons: [
      { label: t('optionsDismissBtn'), value: null, variant: 'default' },
      { label: t('applyBtn'), value: 'confirm', variant: 'primary' },
    ],
  });

  if (result !== 'confirm') return;

  // Read chosen actions from the DOM (modal is already gone, but container persists)
  const resolved = pendingImportConflicts.map((c, i) => {
    const chosen = container.querySelector(`input[name="conflict-${i}"]:checked`);
    return { profile: c.profile, action: chosen?.value ?? 'skip' };
  });

  await applyImport(pendingImportNonConflicts, resolved);
  await render();
  showBanner('success', `✔ Import complete`);
}

/**
 * @param {import('../storage/schema.js').Profile[]} nonConflicts
 * @param {{ profile: import('../storage/schema.js').Profile, action: string }[]} conflicts
 */
async function applyImport(nonConflicts, conflicts) {
  const existing = await listProfiles();

  for (const p of nonConflicts) {
    const { id: _id, createdAt: _ca, updatedAt: _ua, ...rest } = p;
    await createProfile({ ...rest, isDefault: false });
  }

  for (const { profile, action } of conflicts) {
    if (action === 'skip') continue;

    if (action === 'overwrite') {
      const clash = existing.find(e => e.name === profile.name && e.mode === profile.mode);
      if (!clash) continue;
      const { id: _id, createdAt: _ca, updatedAt: _ua, ...rest } = profile;
      await updateProfile(clash.id, { ...rest, isDefault: false });
    }

    if (action === 'suffix') {
      const { id: _id, createdAt: _ca, updatedAt: _ua, ...rest } = profile;
      await createProfile({ ...rest, name: `${profile.name} (imported)`, isDefault: false });
    }
  }
}

// ─── Group / tab helpers ──────────────────────────────────────────────────────

/**
 * @param {string} profileId
 * @param {string} groupId
 * @param {Partial<import('../storage/schema.js').Group>} patch
 */
async function patchGroup(profileId, groupId, patch) {
  const fresh = await listProfiles();
  const prof = fresh.find(p => p.id === profileId);
  if (!prof) return;
  const groups = prof.groups.map(g => g.id === groupId ? { ...g, ...patch } : g);
  await updateProfile(profileId, { groups });
}

/**
 * @param {string} profileId
 * @param {string} groupId
 * @param {number} tabIndex - array index of the tab within the group
 * @param {Partial<import('../storage/schema.js').Tab>} patch
 */
async function patchTab(profileId, groupId, tabIndex, patch) {
  const fresh = await listProfiles();
  const prof = fresh.find(p => p.id === profileId);
  if (!prof) return;
  const groups = prof.groups.map(g => {
    if (g.id !== groupId) return g;
    const tabs = g.tabs.map((tab, i) => i === tabIndex ? { ...tab, ...patch } : tab);
    return { ...g, tabs };
  });
  await updateProfile(profileId, { groups });
}

/** @param {string} profileId @param {string} groupId @param {number} direction -1 or 1 */
async function shiftGroup(profileId, groupId, direction) {
  const fresh = await listProfiles();
  const prof = fresh.find(p => p.id === profileId);
  if (!prof) return;

  const groups = prof.groups.slice();
  const idx = groups.findIndex(g => g.id === groupId);
  if (idx === -1) return;
  const swapIdx = idx + direction;
  if (swapIdx < 0 || swapIdx >= groups.length) return;

  // Splice-based swap: array position is the source of truth for order
  const [removed] = groups.splice(idx, 1);
  groups.splice(swapIdx, 0, removed);
  await updateProfile(profileId, { groups });
  await render();
}

/** @param {string} profileId @param {string} groupId @param {number} tabIndex @param {number} direction */
async function shiftTab(profileId, groupId, tabIndex, direction) {
  const fresh = await listProfiles();
  const prof = fresh.find(p => p.id === profileId);
  if (!prof) return;

  const group = prof.groups.find(g => g.id === groupId);
  if (!group) return;

  const tabs = group.tabs.slice();
  const swapIdx = tabIndex + direction;
  if (swapIdx < 0 || swapIdx >= tabs.length) return;

  // Splice-based swap: array position is the source of truth for order
  const [removed] = tabs.splice(tabIndex, 1);
  tabs.splice(swapIdx, 0, removed);
  const groups = prof.groups.map(g => g.id === groupId ? { ...g, tabs } : g);
  await updateProfile(profileId, { groups });
  await render();
}

/** @param {string} profileId @param {string} groupId */
async function addTab(profileId, groupId) {
  const fresh = await listProfiles();
  const prof = fresh.find(p => p.id === profileId);
  if (!prof) return;
  const group = prof.groups.find(g => g.id === groupId);
  if (!group) return;
  const newTab = { url: '', pinned: false };
  const groups = prof.groups.map(g => g.id === groupId ? { ...g, tabs: [...g.tabs, newTab] } : g);
  await updateProfile(profileId, { groups });
  await render();
}

/** @param {string} profileId @param {string} groupId @param {number} tabIndex */
async function removeTab(profileId, groupId, tabIndex) {
  const fresh = await listProfiles();
  const prof = fresh.find(p => p.id === profileId);
  if (!prof) return;
  const groups = prof.groups.map(g => {
    if (g.id !== groupId) return g;
    return { ...g, tabs: g.tabs.filter((_, i) => i !== tabIndex) };
  });
  await updateProfile(profileId, { groups });
  await render();
}

// ─── Banner utility ───────────────────────────────────────────────────────────

/** @param {'success'|'error'} type @param {string} msg — plain text, not HTML */
function showBanner(type, msg) {
  const area = document.getElementById('banner-area');
  if (!area) return;
  const div = document.createElement('div');
  div.className = `banner banner-${type}`;
  div.textContent = msg;
  area.innerHTML = '';
  area.appendChild(div);
  setTimeout(() => { area.innerHTML = ''; }, 4000);
}

// ─── Utility ──────────────────────────────────────────────────────────────────

/** @param {string} str */
function escHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
