import { describe, it, expect } from 'vitest';
import { SCHEMA_VERSION, validateProfileCollection } from '../src/storage/schema.js';

const validTab = () => ({ url: 'https://example.com', pinned: false });
const validGroup = () => ({
  id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  name: 'Work',
  color: 'blue',
  collapsed: false,
  tabs: [validTab()],
});

function makeCollection(profileId) {
  return {
    schemaVersion: SCHEMA_VERSION,
    profiles: [
      {
        id: profileId,
        name: 'Test',
        mode: 'normal',
        isDefault: false,
        groups: [validGroup()],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
  };
}

describe('validateProfileCollection — UUID enforcement (XSS regression)', () => {
  it('rejects a profile id containing XSS payload', () => {
    const result = validateProfileCollection(
      makeCollection('x" onmouseover="alert(1)')
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/profiles\[0\]/);
  });

  it('rejects a profile id that is not a UUID', () => {
    const result = validateProfileCollection(makeCollection('not-a-uuid'));
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/profiles\[0\]/);
  });

  it('accepts a profile with a valid UUID id', () => {
    const result = validateProfileCollection(
      makeCollection('11111111-2222-3333-4444-555555555555')
    );
    expect(result.ok).toBe(true);
  });

  it('accepts a profile with a crypto.randomUUID()-style id', () => {
    // Use a literal well-formed UUID (crypto.randomUUID not available in test env)
    const result = validateProfileCollection(
      makeCollection('a3bb189e-8bf9-3888-9912-ace4e6543002')
    );
    expect(result.ok).toBe(true);
  });
});
