export const NEWTAB_RE = /^(chrome:\/\/newtab\/?|chrome:\/\/newtab-takeover\/?|about:blank)$/i;

/**
 * Returns true if the URL is a new tab / empty page.
 * @param {string | undefined | null} url
 * @returns {boolean}
 */
export function isNewtabUrl(url) {
  if (!url) return true;
  return NEWTAB_RE.test(url);
}

/**
 * Returns true if the URL is safe to open in a Chrome tab (http/https/ftp).
 * Returns false for chrome://, chrome-extension://, javascript:, file://,
 * edge://, about:, view-source:, data:, or anything unrecognised.
 * @param {string | undefined | null} url
 * @returns {boolean}
 */
export function isOpenableUrl(url) {
  if (!url || typeof url !== 'string') return false;
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('ftp://')) {
    return true;
  }
  return false;
}
