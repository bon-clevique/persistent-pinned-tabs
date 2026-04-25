import { SCHEMA_VERSION } from '../storage/schema.js';

/**
 * Triggers a JSON download containing all profiles.
 * @param {import('../storage/schema.js').Profile[]} profiles
 */
export function downloadProfilesJson(profiles) {
  const date = new Date().toISOString().slice(0, 10);
  const payload = {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    profiles,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `anchortab-profiles-${date}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
