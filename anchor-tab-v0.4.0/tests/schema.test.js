import { describe, it, expect } from 'vitest';
import {
  SCHEMA_VERSION,
  GROUP_COLORS,
  isTab,
  isGroup,
  isProfile,
  validateProfileCollection,
} from '../src/storage/schema.js';

// v2 fixtures: no `order` field
const validTab = () => ({ url: 'https://example.com', pinned: false });
const validGroup = () => ({
  id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  name: 'Work',
  color: 'blue',
  collapsed: false,
  tabs: [validTab()],
});
const validProfile = () => ({
  id: '11111111-2222-3333-4444-555555555555',
  name: 'My Profile',
  mode: 'normal',
  isDefault: false,
  groups: [validGroup()],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

describe('isTab', () => {
  it('accepts valid tab', () => {
    expect(isTab(validTab())).toBe(true);
  });

  it('accepts pinned tab', () => {
    expect(isTab({ url: 'https://x.com', pinned: true })).toBe(true);
  });

  it('rejects missing url', () => {
    expect(isTab({ pinned: false })).toBe(false);
  });

  it('rejects empty url', () => {
    expect(isTab({ url: '', pinned: false })).toBe(false);
  });

  it('rejects non-boolean pinned', () => {
    expect(isTab({ url: 'https://x.com', pinned: 'yes' })).toBe(false);
  });

  it('no longer requires order field', () => {
    // v2: order is not required and must NOT be present
    expect(isTab({ url: 'https://x.com', pinned: false })).toBe(true);
  });

  it('rejects tab with order field (v1 leftover)', () => {
    expect(isTab({ url: 'https://x.com', pinned: false, order: 0 })).toBe(false);
  });

  it('rejects null', () => {
    expect(isTab(null)).toBe(false);
  });
});

describe('isGroup', () => {
  it('accepts valid group', () => {
    expect(isGroup(validGroup())).toBe(true);
  });

  it('accepts empty tabs array', () => {
    expect(isGroup({ ...validGroup(), tabs: [] })).toBe(true);
  });

  it('rejects invalid color', () => {
    expect(isGroup({ ...validGroup(), color: 'magenta' })).toBe(false);
  });

  it('rejects all valid colors pass', () => {
    for (const color of GROUP_COLORS) {
      expect(isGroup({ ...validGroup(), color })).toBe(true);
    }
  });

  it('rejects missing id', () => {
    const g = { ...validGroup() };
    delete g.id;
    expect(isGroup(g)).toBe(false);
  });

  it('rejects non-boolean collapsed', () => {
    expect(isGroup({ ...validGroup(), collapsed: 1 })).toBe(false);
  });

  it('rejects invalid tab inside tabs', () => {
    expect(isGroup({ ...validGroup(), tabs: [{ url: '', pinned: false }] })).toBe(false);
  });

  it('no longer requires order field', () => {
    const g = validGroup();
    expect(isGroup(g)).toBe(true);
    expect('order' in g).toBe(false);
  });

  it('rejects group with order field (v1 leftover)', () => {
    expect(isGroup({ ...validGroup(), order: 0 })).toBe(false);
  });
});

describe('isProfile', () => {
  it('accepts valid profile', () => {
    expect(isProfile(validProfile())).toBe(true);
  });

  it('accepts incognito mode', () => {
    expect(isProfile({ ...validProfile(), mode: 'incognito' })).toBe(true);
  });

  it('rejects invalid mode', () => {
    expect(isProfile({ ...validProfile(), mode: 'private' })).toBe(false);
  });

  it('rejects missing id', () => {
    const p = { ...validProfile() };
    delete p.id;
    expect(isProfile(p)).toBe(false);
  });

  it('rejects missing createdAt', () => {
    const p = { ...validProfile() };
    delete p.createdAt;
    expect(isProfile(p)).toBe(false);
  });

  it('rejects invalid group inside groups', () => {
    const p = { ...validProfile(), groups: [{ ...validGroup(), color: 'neon' }] };
    expect(isProfile(p)).toBe(false);
  });

  it('rejects non-boolean isDefault', () => {
    expect(isProfile({ ...validProfile(), isDefault: 1 })).toBe(false);
  });
});

describe('validateProfileCollection', () => {
  it('accepts valid collection', () => {
    const result = validateProfileCollection({
      schemaVersion: SCHEMA_VERSION,
      profiles: [validProfile()],
    });
    expect(result.ok).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('accepts empty profiles array', () => {
    const result = validateProfileCollection({ schemaVersion: SCHEMA_VERSION, profiles: [] });
    expect(result.ok).toBe(true);
  });

  it('rejects wrong schemaVersion', () => {
    const result = validateProfileCollection({ schemaVersion: 999, profiles: [] });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/schemaVersion/);
  });

  it('rejects non-array profiles', () => {
    const result = validateProfileCollection({ schemaVersion: SCHEMA_VERSION, profiles: null });
    expect(result.ok).toBe(false);
  });

  it('rejects null input', () => {
    const result = validateProfileCollection(null);
    expect(result.ok).toBe(false);
  });

  it('rejects invalid profile inside array', () => {
    const result = validateProfileCollection({
      schemaVersion: SCHEMA_VERSION,
      profiles: [{ id: '11111111-2222-3333-4444-555555555555', name: 'no mode', isDefault: false, groups: [], createdAt: '', updatedAt: '' }],
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/profiles\[0\]/);
  });

  it('rejects collection with v1 schemaVersion', () => {
    const result = validateProfileCollection({ schemaVersion: 1, profiles: [] });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/schemaVersion/);
  });

  it('rejects group with order field', () => {
    const profile = validProfile();
    profile.groups[0] = { ...profile.groups[0], order: 0 };
    const result = validateProfileCollection({ schemaVersion: SCHEMA_VERSION, profiles: [profile] });
    expect(result.ok).toBe(false);
  });

  it('rejects tab with order field', () => {
    const profile = validProfile();
    profile.groups[0].tabs[0] = { ...profile.groups[0].tabs[0], order: 0 };
    const result = validateProfileCollection({ schemaVersion: SCHEMA_VERSION, profiles: [profile] });
    expect(result.ok).toBe(false);
  });
});
