import { describe, it, expect, beforeEach } from 'vitest';
import { installChromeMock } from './chrome-mock.js';
import {
  register,
  unregister,
  unregisterProfile,
  getProfileIdForWindow,
  getWindowIdForProfile,
  resetCacheForTesting,
} from '../src/engine/active-window-map.js';

let mock;

beforeEach(() => {
  mock = installChromeMock();
  mock.resetSessionStore();
  // Reset in-memory cache so each test starts from a clean state.
  // Without this, the module-level cache would persist between tests
  // because ES modules are cached by the runtime.
  resetCacheForTesting();
});

describe('register / getWindowIdForProfile / getProfileIdForWindow', () => {
  it('registers a profileId → windowId mapping', async () => {
    await register('prof-1', 101);
    expect(await getWindowIdForProfile('prof-1')).toBe(101);
    expect(await getProfileIdForWindow(101)).toBe('prof-1');
  });

  it('overwrites an existing entry for the same profileId', async () => {
    await register('prof-1', 101);
    await register('prof-1', 202);
    expect(await getWindowIdForProfile('prof-1')).toBe(202);
  });

  it('returns undefined for unknown profileId', async () => {
    expect(await getWindowIdForProfile('ghost')).toBeUndefined();
  });

  it('returns undefined for unknown windowId', async () => {
    expect(await getProfileIdForWindow(999)).toBeUndefined();
  });

  it('handles multiple profiles in separate windows', async () => {
    await register('prof-a', 10);
    await register('prof-b', 20);
    expect(await getWindowIdForProfile('prof-a')).toBe(10);
    expect(await getWindowIdForProfile('prof-b')).toBe(20);
    expect(await getProfileIdForWindow(10)).toBe('prof-a');
    expect(await getProfileIdForWindow(20)).toBe('prof-b');
  });
});

describe('unregister (by windowId)', () => {
  it('removes the entry for the given windowId', async () => {
    await register('prof-1', 101);
    await unregister(101);
    expect(await getWindowIdForProfile('prof-1')).toBeUndefined();
    expect(await getProfileIdForWindow(101)).toBeUndefined();
  });

  it('is a no-op for an unknown windowId', async () => {
    await register('prof-1', 101);
    await unregister(999);
    expect(await getWindowIdForProfile('prof-1')).toBe(101);
  });

  it('only removes the entry matching windowId, not others', async () => {
    await register('prof-a', 10);
    await register('prof-b', 20);
    await unregister(10);
    expect(await getWindowIdForProfile('prof-a')).toBeUndefined();
    expect(await getWindowIdForProfile('prof-b')).toBe(20);
  });
});

describe('unregisterProfile (by profileId)', () => {
  it('removes the entry for the given profileId', async () => {
    await register('prof-1', 101);
    await unregisterProfile('prof-1');
    expect(await getWindowIdForProfile('prof-1')).toBeUndefined();
  });

  it('is a no-op for unknown profileId', async () => {
    await register('prof-1', 101);
    await unregisterProfile('ghost');
    expect(await getWindowIdForProfile('prof-1')).toBe(101);
  });
});

describe('absent key treated as empty map', () => {
  it('getWindowIdForProfile returns undefined when no map exists', async () => {
    expect(await getWindowIdForProfile('any')).toBeUndefined();
  });

  it('unregister does not throw when no map exists', async () => {
    await expect(unregister(1)).resolves.toBeUndefined();
  });
});
