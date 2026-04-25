import { describe, it, expect, beforeEach } from 'vitest';
import { installChromeMock } from './chrome-mock.js';
import {
  listProfiles,
  getProfile,
  createProfile,
  updateProfile,
  deleteProfile,
  duplicateProfile,
  setDefault,
} from '../src/storage/profiles-repo.js';
const baseProfileInput = () => ({
  name: 'Work',
  mode: 'normal',
  isDefault: false,
  groups: [],
});

beforeEach(() => {
  installChromeMock();
});

describe('createProfile / getProfile', () => {
  it('creates a profile and retrieves it by id', async () => {
    const created = await createProfile(baseProfileInput());

    expect(typeof created.id).toBe('string');
    expect(created.name).toBe('Work');
    expect(created.mode).toBe('normal');
    expect(created.isDefault).toBe(false);
    expect(typeof created.createdAt).toBe('string');
    expect(typeof created.updatedAt).toBe('string');

    const fetched = await getProfile(created.id);
    expect(fetched).toEqual(created);
  });

  it('returns undefined for unknown id', async () => {
    const fetched = await getProfile('nonexistent');
    expect(fetched).toBeUndefined();
  });
});

describe('listProfiles', () => {
  it('returns all profiles when no mode filter', async () => {
    await createProfile({ ...baseProfileInput(), mode: 'normal' });
    await createProfile({ ...baseProfileInput(), mode: 'incognito' });
    const all = await listProfiles();
    expect(all).toHaveLength(2);
  });

  it('filters by mode', async () => {
    await createProfile({ ...baseProfileInput(), mode: 'normal' });
    await createProfile({ ...baseProfileInput(), mode: 'incognito' });
    const normal = await listProfiles({ mode: 'normal' });
    expect(normal).toHaveLength(1);
    expect(normal[0].mode).toBe('normal');
  });
});

describe('updateProfile', () => {
  it('patches fields and bumps updatedAt', async () => {
    const created = await createProfile(baseProfileInput());
    const originalUpdatedAt = created.updatedAt;

    // Small delay to ensure timestamp changes
    await new Promise(r => setTimeout(r, 10));

    const updated = await updateProfile(created.id, { name: 'Updated Work' });
    expect(updated.name).toBe('Updated Work');
    expect(updated.id).toBe(created.id);
    expect(updated.updatedAt).not.toBe(originalUpdatedAt);
  });

  it('throws for unknown id', async () => {
    await expect(updateProfile('bad-id', { name: 'x' })).rejects.toThrow();
  });
});

describe('deleteProfile', () => {
  it('removes the profile', async () => {
    const p = await createProfile(baseProfileInput());
    await deleteProfile(p.id);
    const fetched = await getProfile(p.id);
    expect(fetched).toBeUndefined();
  });

  it('is a no-op for nonexistent id', async () => {
    // Should not throw
    await expect(deleteProfile('ghost')).resolves.toBeUndefined();
  });
});

describe('duplicateProfile', () => {
  it('creates a copy with new id, isDefault=false, name with (copy)', async () => {
    const original = await createProfile({ ...baseProfileInput(), isDefault: true });
    const copy = await duplicateProfile(original.id);

    expect(copy.id).not.toBe(original.id);
    expect(copy.name).toBe(`${original.name} (copy)`);
    expect(copy.isDefault).toBe(false);
  });

  it('deep-clones groups', async () => {
    const original = await createProfile({
      ...baseProfileInput(),
      groups: [{ id: 'g1', name: 'G', color: 'blue', collapsed: false, tabs: [] }],
    });
    const copy = await duplicateProfile(original.id);

    expect(copy.groups).toHaveLength(1);
    // Mutating copy's group should not affect original
    copy.groups[0].name = 'Changed';
    const reloaded = await getProfile(original.id);
    expect(reloaded.groups[0].name).toBe('G');
  });

  it('throws for unknown id', async () => {
    await expect(duplicateProfile('nope')).rejects.toThrow();
  });
});

describe('setDefault', () => {
  it('sets the target as default and clears others in same mode', async () => {
    const p1 = await createProfile({ ...baseProfileInput(), isDefault: true });
    const p2 = await createProfile(baseProfileInput());

    await setDefault(p2.id);

    const all = await listProfiles();
    const updated1 = all.find(p => p.id === p1.id);
    const updated2 = all.find(p => p.id === p2.id);
    expect(updated1.isDefault).toBe(false);
    expect(updated2.isDefault).toBe(true);
  });

  it('does not affect incognito profiles when setting normal default', async () => {
    const normalP = await createProfile({ ...baseProfileInput(), mode: 'normal', isDefault: false });
    const incognitoP = await createProfile({ ...baseProfileInput(), mode: 'incognito', isDefault: true });

    await setDefault(normalP.id);

    const all = await listProfiles();
    const incog = all.find(p => p.id === incognitoP.id);
    expect(incog.isDefault).toBe(true); // unchanged
  });

  it('throws for unknown id', async () => {
    await expect(setDefault('bad')).rejects.toThrow();
  });
});
