/**
 * Thin wrapper around chrome.i18n.getMessage.
 * Falls back to the key itself so UI never shows empty strings.
 *
 * @param {string} key
 * @param {string | string[]} [subs]
 * @returns {string}
 */
export function t(key, subs) {
  return chrome.i18n.getMessage(key, subs) || key;
}

/**
 * Scans elements with [data-i18n] and sets their textContent
 * to the translated message for that key.
 */
export function applyI18nToDom() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const msg = t(key);
    if (msg) el.textContent = msg;
  });
}
