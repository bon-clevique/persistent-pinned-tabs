import { listProfiles, createProfile, updateProfile } from '../storage/profiles-repo.js';
import { captureCurrentWindow } from '../engine/capture.js';
import { applyProfile, ProfileInUseError } from '../engine/apply.js';
import { t } from './i18n.js';
import { openModal } from './components/modal.js';

/** @type {chrome.windows.Window} */
let currentWindow;
/** @type {'normal'|'incognito'} */
let currentMode;
/** @type {import('../storage/schema.js').Profile[]} */
let profiles = [];
/** @type {string|null} */
let selectedProfileId = null;

// ── DOM refs (populated in initPopup) ────────────────────────────────────────

/** @type {HTMLElement} */ let modeBadge;
/** @type {HTMLElement} */ let errorBanner;
/** @type {HTMLElement} */ let errorMessage;
/** @type {HTMLButtonElement} */ let focusExistingBtn;
/** @type {HTMLElement} */ let infoBanner;
/** @type {HTMLElement} */ let infoMessage;
/** @type {HTMLElement} */ let profileList;
/** @type {HTMLElement} */ let emptyState;
/** @type {HTMLButtonElement} */ let saveAsNewBtn;
/** @type {HTMLButtonElement} */ let overwriteBtn;
/** @type {HTMLButtonElement} */ let useAsIsBtn;
/** @type {HTMLButtonElement} */ let openSettingsBtn;
/** @type {HTMLElement} */ let namePrompt;
/** @type {HTMLInputElement} */ let nameInput;
/** @type {HTMLButtonElement} */ let saveNameBtn;
/** @type {HTMLButtonElement} */ let cancelNameBtn;

// ── Error banner helpers ──────────────────────────────────────────────────────

/** @type {number|null} */
let focusWindowId = null;

function showError(message, windowIdForFocus = null) {
  hideInfo();
  errorMessage.textContent = message;
  focusWindowId = windowIdForFocus;
  focusExistingBtn.hidden = windowIdForFocus == null;
  errorBanner.hidden = false;
}

function hideError() {
  errorBanner.hidden = true;
  focusWindowId = null;
}

/**
 * Truncate a URL to maxLen chars, appending '…' if truncated.
 * @param {string} url
 * @param {number} [maxLen=60]
 * @returns {string}
 */
function truncateUrl(url, maxLen = 60) {
  return url.length <= maxLen ? url : url.slice(0, maxLen) + '…';
}

/**
 * Build a human-readable list of skipped URLs (max 3 shown, then "…and N more").
 * @param {Array<{url: string, reason: string}>} skipped
 * @returns {string}
 */
function formatSkippedUrls(skipped) {
  const shown = skipped.slice(0, 3).map(s => truncateUrl(s.url));
  const rest = skipped.length - shown.length;
  return rest > 0 ? shown.join(', ') + `, …and ${rest} more` : shown.join(', ');
}

/**
 * Show the info (non-error) banner. Does NOT auto-close.
 * @param {string} message
 */
function showInfo(message) {
  hideError();
  infoMessage.textContent = message;
  infoBanner.hidden = false;
}

function hideInfo() {
  infoBanner.hidden = true;
}

// ── Profile list rendering ────────────────────────────────────────────────────

function sortedProfiles(list) {
  return [...list].sort((a, b) => {
    if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

function renderProfileList() {
  profileList.innerHTML = '';
  selectedProfileId = null;
  overwriteBtn.disabled = true;

  const sorted = sortedProfiles(profiles);

  if (sorted.length === 0) {
    emptyState.hidden = false;
    return;
  }
  emptyState.hidden = true;

  sorted.forEach(profile => {
    const row = document.createElement('div');
    row.className = 'profile-row';

    // Radio
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'profile-select';
    radio.value = profile.id;
    radio.id = `radio-${profile.id}`;
    radio.addEventListener('change', () => {
      selectedProfileId = profile.id;
      overwriteBtn.disabled = false;
    });

    // Label
    const label = document.createElement('label');
    label.htmlFor = `radio-${profile.id}`;
    label.className = 'profile-name';
    label.textContent = profile.isDefault ? `★ ${profile.name}` : profile.name;

    // Apply button
    const applyBtn = document.createElement('button');
    applyBtn.className = 'btn btn-apply';
    applyBtn.textContent = t('applyBtn');
    applyBtn.addEventListener('click', () => handleApply(profile));

    row.appendChild(radio);
    row.appendChild(label);
    row.appendChild(applyBtn);
    profileList.appendChild(row);
  });
}

// ── Event handlers ────────────────────────────────────────────────────────────

async function handleApply(profile) {
  hideError();
  hideInfo();
  try {
    const result = await applyProfile(profile, currentWindow.id);
    if (result.created === 0) {
      // Nothing was created — show error banner so user knows
      const urls = formatSkippedUrls(result.skipped);
      showError(t('applySummaryAllSkipped', [String(result.skipped.length), urls]));
    } else if (result.skipped.length === 0) {
      // All tabs applied cleanly — close popup (current behavior)
      window.close();
    } else {
      // Partial success — show info banner, do not auto-close
      const urls = formatSkippedUrls(result.skipped);
      showInfo(t('applySummaryWithSkipped', [
        String(result.created),
        String(result.groups),
        String(result.skipped.length),
        urls,
      ]));
    }
  } catch (err) {
    if (err instanceof ProfileInUseError) {
      showError(t('profileInUseError'), err.existingWindowId);
    } else {
      showError(err.message ?? t('applyError'));
    }
  }
}

async function handleSaveNew() {
  const name = nameInput.value.trim();
  if (!name) {
    nameInput.focus();
    return;
  }
  try {
    const captured = await captureCurrentWindow(currentWindow.id, { name });
    await createProfile({ ...captured, mode: currentMode, isDefault: false });
    profiles = await listProfiles({ mode: currentMode });
    renderProfileList();
    hideNamePrompt();
    hideError();
  } catch (err) {
    showError(err.message ?? 'Save failed');
  }
}

async function handleOverwrite() {
  if (!selectedProfileId) return;
  const profile = profiles.find(p => p.id === selectedProfileId);
  if (!profile) return;

  const ok = await openModal({
    title: t('overwriteBtn'),
    body: t('overwriteConfirm', [profile.name]),
    buttons: [
      { label: t('cancelBtn'), value: null },
      { label: t('saveBtn'), value: true, variant: 'primary' },
    ],
  });
  if (!ok) return;

  try {
    const captured = await captureCurrentWindow(currentWindow.id);
    await updateProfile(selectedProfileId, { groups: captured.groups });
    profiles = await listProfiles({ mode: currentMode });
    renderProfileList();
    hideError();
  } catch (err) {
    showError(err.message ?? 'Overwrite failed');
  }
}

// ── Inline name prompt ────────────────────────────────────────────────────────

function showNamePrompt() {
  namePrompt.hidden = false;
  nameInput.value = '';
  nameInput.focus();
}

function hideNamePrompt() {
  namePrompt.hidden = true;
  nameInput.value = '';
}

// ── Init ──────────────────────────────────────────────────────────────────────

export async function initPopup() {
  // Grab DOM refs
  modeBadge = document.getElementById('mode-badge');
  errorBanner = document.getElementById('error-banner');
  errorMessage = document.getElementById('error-message');
  focusExistingBtn = document.getElementById('focus-existing-btn');

  // Create info banner dynamically (shares position with error banner)
  infoBanner = document.createElement('div');
  infoBanner.className = 'info-banner';
  infoBanner.hidden = true;
  infoMessage = document.createElement('span');
  infoMessage.className = 'info-message';
  infoBanner.appendChild(infoMessage);
  errorBanner.insertAdjacentElement('afterend', infoBanner);

  // Inject info banner styles
  const style = document.createElement('style');
  style.textContent = `.info-banner{display:flex;align-items:center;gap:8px;padding:8px 12px;background:#e8f4fd;border-bottom:1px solid #90c8f0;font-size:12px;}.info-banner[hidden]{display:none;}.info-message{flex:1;}`;
  document.head.appendChild(style);
  profileList = document.getElementById('profile-list');
  emptyState = document.getElementById('empty-state');
  saveAsNewBtn = document.getElementById('save-as-new-btn');
  overwriteBtn = document.getElementById('overwrite-btn');
  useAsIsBtn = document.getElementById('use-as-is-btn');
  openSettingsBtn = document.getElementById('open-settings-btn');
  namePrompt = document.getElementById('name-prompt');
  nameInput = document.getElementById('name-input');
  saveNameBtn = document.getElementById('save-name-btn');
  cancelNameBtn = document.getElementById('cancel-name-btn');

  // Apply i18n to all buttons and static text
  nameInput.placeholder = t('saveAsNewPrompt');
  focusExistingBtn.textContent = t('focusExistingBtn');
  saveAsNewBtn.textContent = t('saveAsNewBtn');
  overwriteBtn.textContent = t('overwriteBtn');
  useAsIsBtn.textContent = t('useAsIsBtn');
  openSettingsBtn.textContent = t('openSettingsBtn');
  saveNameBtn.textContent = t('saveBtn');
  cancelNameBtn.textContent = t('cancelBtn');
  emptyState.textContent = t('noProfilesForMode');

  // Get current window
  currentWindow = await chrome.windows.getCurrent();
  currentMode = currentWindow.incognito ? 'incognito' : 'normal';

  // Mode badge
  modeBadge.textContent = currentMode === 'incognito' ? t('modeIncognito') : t('modeNormal');
  modeBadge.className = `mode-badge mode-badge--${currentMode}`;

  // Load profiles
  profiles = await listProfiles({ mode: currentMode });
  renderProfileList();

  // Wire focus-existing button
  focusExistingBtn.addEventListener('click', async () => {
    if (focusWindowId != null) {
      await chrome.windows.update(focusWindowId, { focused: true });
    }
    window.close();
  });

  // Wire action bar
  saveAsNewBtn.addEventListener('click', () => {
    hideError();
    showNamePrompt();
  });

  overwriteBtn.addEventListener('click', handleOverwrite);

  useAsIsBtn.addEventListener('click', () => window.close());

  openSettingsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
    window.close();
  });

  // Wire inline name prompt
  saveNameBtn.addEventListener('click', handleSaveNew);

  nameInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') handleSaveNew();
    if (e.key === 'Escape') hideNamePrompt();
  });

  cancelNameBtn.addEventListener('click', hideNamePrompt);
}
