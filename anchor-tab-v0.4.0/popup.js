import { initPopup } from './src/ui/popup-view.js';

document.addEventListener('DOMContentLoaded', () => {
  initPopup().catch(err => {
    console.error('[popup] init failed:', err);
  });
});
