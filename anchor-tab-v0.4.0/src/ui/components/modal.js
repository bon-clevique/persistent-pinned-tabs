/**
 * Reusable in-page modal — replaces window.confirm / window.prompt.
 * No chrome.* API dependencies. No i18n strings embedded — callers pass labels.
 *
 * @module modal
 */

let styleInjected = false;

function injectStyle() {
  if (styleInjected) return;
  styleInjected = true;

  const style = document.createElement('style');
  style.textContent = `
.anchor-modal-overlay {
  position: fixed; inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex; align-items: center; justify-content: center;
  z-index: 9000;
}

.anchor-modal {
  background: #fff; border-radius: 8px; padding: 20px;
  max-width: 480px; width: 90%; max-height: 80vh;
  overflow-y: auto; box-shadow: 0 8px 32px rgba(0,0,0,0.18);
  display: flex; flex-direction: column; gap: 14px;
}

.anchor-modal-title {
  font-size: 15px; font-weight: 600; color: #111;
  margin: 0;
}

.anchor-modal-body {
  font-size: 14px; color: #333; line-height: 1.5;
}

.anchor-modal-input-wrap {
  display: flex; flex-direction: column; gap: 6px;
}

.anchor-modal-input {
  width: 100%; padding: 7px 10px;
  border: 1px solid #ccc; border-radius: 5px;
  font-size: 14px; outline: none;
  transition: border-color 0.15s;
}
.anchor-modal-input:focus { border-color: #5b8dee; }
.anchor-modal-input.error { border-color: #d32f2f; }

.anchor-modal-input-error {
  font-size: 12px; color: #d32f2f;
  min-height: 16px;
}

.anchor-modal-footer {
  display: flex; gap: 8px; justify-content: flex-end; flex-wrap: wrap;
}

.anchor-modal-btn {
  padding: 6px 16px; border-radius: 5px;
  border: 1px solid #ccc; background: #fff;
  cursor: pointer; font-size: 13px; white-space: nowrap;
}
.anchor-modal-btn:hover:not(:disabled) { background: #f0f0f0; }
.anchor-modal-btn:disabled { opacity: 0.45; cursor: default; }
.anchor-modal-btn.primary {
  background: #1a73e8; color: #fff; border-color: #1a73e8;
}
.anchor-modal-btn.primary:hover:not(:disabled) { background: #1558b8; }
.anchor-modal-btn.danger {
  background: #fff; color: #c62828; border-color: #ef9a9a;
}
.anchor-modal-btn.danger:hover:not(:disabled) { background: #fdecea; }
`;
  document.head.appendChild(style);
}

/**
 * @typedef {Object} ModalButton
 * @property {string} label
 * @property {unknown} value
 * @property {'primary'|'danger'|'default'} [variant]
 */

/**
 * @typedef {Object} ModalInputField
 * @property {string} [placeholder]
 * @property {string} [initialValue]
 * @property {(value: string) => string | null} [validate]
 */

/**
 * @typedef {Object} ModalOptions
 * @property {string} title
 * @property {string | HTMLElement} body
 * @property {ModalButton[]} buttons
 * @property {unknown} [defaultValue]
 * @property {ModalInputField} [inputField]
 */

/**
 * Opens a modal dialog and returns a Promise that resolves with the chosen value.
 *
 * - Esc / overlay click → resolves with `defaultValue ?? null`
 * - Button click → resolves with button's `value`
 * - If `inputField` is set and a button with value === 'submit' is clicked,
 *   the current input value is returned instead (after validation).
 *
 * @param {ModalOptions} options
 * @returns {Promise<unknown>}
 */
export function openModal(options) {
  const { title, body, buttons, defaultValue = null, inputField } = options;

  injectStyle();

  const previouslyFocused = document.activeElement;

  return new Promise((resolve) => {
    // Overlay
    const overlay = document.createElement('div');
    overlay.className = 'anchor-modal-overlay';

    // Dialog
    const dialog = document.createElement('div');
    dialog.className = 'anchor-modal';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'anchor-modal-title-el');

    // Title
    const titleEl = document.createElement('p');
    titleEl.className = 'anchor-modal-title';
    titleEl.id = 'anchor-modal-title-el';
    titleEl.textContent = title;
    dialog.appendChild(titleEl);

    // Body
    const bodyEl = document.createElement('div');
    bodyEl.className = 'anchor-modal-body';
    if (typeof body === 'string') {
      bodyEl.textContent = body;
    } else {
      bodyEl.appendChild(body);
    }
    dialog.appendChild(bodyEl);

    // Input field (optional)
    let inputEl = null;
    let errorEl = null;
    if (inputField) {
      const wrap = document.createElement('div');
      wrap.className = 'anchor-modal-input-wrap';

      inputEl = document.createElement('input');
      inputEl.type = 'text';
      inputEl.className = 'anchor-modal-input';
      inputEl.placeholder = inputField.placeholder ?? '';
      inputEl.value = inputField.initialValue ?? '';

      errorEl = document.createElement('div');
      errorEl.className = 'anchor-modal-input-error';
      errorEl.setAttribute('aria-live', 'polite');

      wrap.appendChild(inputEl);
      wrap.appendChild(errorEl);
      dialog.appendChild(wrap);
    }

    // Footer
    const footer = document.createElement('div');
    footer.className = 'anchor-modal-footer';

    function closeWith(value) {
      overlay.remove();
      document.removeEventListener('keydown', onKeyDown);
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        previouslyFocused.focus();
      }
      resolve(value);
    }

    buttons.forEach((btn) => {
      const el = document.createElement('button');
      el.className = `anchor-modal-btn${btn.variant && btn.variant !== 'default' ? ' ' + btn.variant : ''}`;
      el.textContent = btn.label;
      el.type = 'button';

      el.addEventListener('click', () => {
        // Submit button with input field
        if (inputField && btn.value === 'submit' && inputEl) {
          const currentValue = inputEl.value;
          if (inputField.validate) {
            const errMsg = inputField.validate(currentValue);
            if (errMsg !== null) {
              if (errorEl) {
                errorEl.textContent = errMsg;
              }
              inputEl.classList.add('error');
              inputEl.focus();
              return;
            }
          }
          closeWith(currentValue);
        } else {
          closeWith(btn.value);
        }
      });

      footer.appendChild(el);
    });

    dialog.appendChild(footer);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    // Focus trap
    function getFocusable() {
      return /** @type {HTMLElement[]} */ (
        Array.from(dialog.querySelectorAll(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'
        ))
      );
    }

    function onKeyDown(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeWith(defaultValue ?? null);
        return;
      }

      if (e.key === 'Tab') {
        const focusable = getFocusable();
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    }

    document.addEventListener('keydown', onKeyDown);

    // Click on overlay (not dialog body) closes
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        closeWith(defaultValue ?? null);
      }
    });

    // Auto-focus: input field if present, otherwise first button
    requestAnimationFrame(() => {
      if (inputEl) {
        inputEl.focus();
        // Place cursor at end
        const len = inputEl.value.length;
        inputEl.setSelectionRange(len, len);
      } else {
        const focusable = getFocusable();
        if (focusable.length > 0) focusable[0].focus();
      }
    });
  });
}
