import { describe, it, expect, beforeEach } from 'vitest';
import { installChromeMock } from './chrome-mock.js';

let mock;

beforeEach(() => {
  mock = installChromeMock();
});

async function getRepo() {
  // Use dynamic import to get a fresh module reference
  return import('../src/storage/settings-repo.js');
}

describe('getNewWindowBehavior', () => {
  it('returns default "auto-open" when no settings stored', async () => {
    mock.resetStore({});
    const { getNewWindowBehavior } = await getRepo();
    expect(await getNewWindowBehavior()).toBe('auto-open');
  });

  it('returns stored value', async () => {
    mock.resetStore({ settings: { newWindowBehavior: 'badge' } });
    const { getNewWindowBehavior } = await getRepo();
    expect(await getNewWindowBehavior()).toBe('badge');
  });

  it('returns "off" when stored', async () => {
    mock.resetStore({ settings: { newWindowBehavior: 'off' } });
    const { getNewWindowBehavior } = await getRepo();
    expect(await getNewWindowBehavior()).toBe('off');
  });
});

describe('setNewWindowBehavior', () => {
  it('persists "auto-open"', async () => {
    mock.resetStore({});
    const { setNewWindowBehavior, getNewWindowBehavior } = await getRepo();
    await setNewWindowBehavior('auto-open');
    expect(await getNewWindowBehavior()).toBe('auto-open');
  });

  it('persists "badge"', async () => {
    mock.resetStore({});
    const { setNewWindowBehavior, getNewWindowBehavior } = await getRepo();
    await setNewWindowBehavior('badge');
    expect(await getNewWindowBehavior()).toBe('badge');
  });

  it('persists "off"', async () => {
    mock.resetStore({});
    const { setNewWindowBehavior, getNewWindowBehavior } = await getRepo();
    await setNewWindowBehavior('off');
    expect(await getNewWindowBehavior()).toBe('off');
  });

  it('throws TypeError for invalid value', async () => {
    mock.resetStore({});
    const { setNewWindowBehavior } = await getRepo();
    await expect(setNewWindowBehavior('invalid')).rejects.toThrow(TypeError);
  });

  it('throws TypeError for boolean true (old API)', async () => {
    mock.resetStore({});
    const { setNewWindowBehavior } = await getRepo();
    await expect(setNewWindowBehavior(true)).rejects.toThrow(TypeError);
  });

  it('does not mutate other settings keys', async () => {
    mock.resetStore({ settings: { legacyMigrationBannerSeen: true, newWindowBehavior: 'auto-open' } });
    const { setNewWindowBehavior } = await getRepo();
    await setNewWindowBehavior('off');
    const store = mock.getStore();
    expect(store.settings.legacyMigrationBannerSeen).toBe(true);
  });
});

describe('getLegacyMigrationBannerSeen / setLegacyMigrationBannerSeen', () => {
  it('returns default false when no settings stored', async () => {
    mock.resetStore({});
    const { getLegacyMigrationBannerSeen } = await getRepo();
    expect(await getLegacyMigrationBannerSeen()).toBe(false);
  });

  it('persists true', async () => {
    mock.resetStore({});
    const { setLegacyMigrationBannerSeen, getLegacyMigrationBannerSeen } = await getRepo();
    await setLegacyMigrationBannerSeen(true);
    expect(await getLegacyMigrationBannerSeen()).toBe(true);
  });
});
