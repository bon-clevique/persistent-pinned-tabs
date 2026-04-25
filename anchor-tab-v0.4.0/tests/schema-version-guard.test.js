import { describe, it, expect, beforeEach } from 'vitest';
import { installChromeMock } from './chrome-mock.js';
import { SchemaVersionTooNewError, SCHEMA_VERSION } from '../src/storage/schema.js';
import { listProfiles, getProfile } from '../src/storage/profiles-repo.js';

let mock;

beforeEach(() => {
  mock = installChromeMock();
});

async function runMigration() {
  const { runMigrationIfNeeded } = await import('../src/storage/migration.js');
  await runMigrationIfNeeded();
}

describe('downgrade guard: profiles-repo', () => {
  it('listProfiles throws SchemaVersionTooNewError when store has future schemaVersion', async () => {
    mock.resetStore({
      profiles: { schemaVersion: 99, profiles: [] },
    });

    await expect(listProfiles()).rejects.toThrow(SchemaVersionTooNewError);
  });

  it('getProfile throws SchemaVersionTooNewError when store has future schemaVersion', async () => {
    mock.resetStore({
      profiles: { schemaVersion: 99, profiles: [] },
    });

    await expect(getProfile('any-id')).rejects.toThrow(SchemaVersionTooNewError);
  });

  it('thrown error has correct storedVersion and supportedVersion', async () => {
    mock.resetStore({
      profiles: { schemaVersion: 99, profiles: [] },
    });

    try {
      await listProfiles();
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(SchemaVersionTooNewError);
      expect(err.storedVersion).toBe(99);
      expect(err.supportedVersion).toBe(SCHEMA_VERSION);
      expect(err.message).toContain('99');
      expect(err.name).toBe('SchemaVersionTooNewError');
    }
  });

  it('does NOT throw when schemaVersion equals SCHEMA_VERSION', async () => {
    mock.resetStore({
      profiles: { schemaVersion: SCHEMA_VERSION, profiles: [] },
    });

    await expect(listProfiles()).resolves.toEqual([]);
  });

  it('does NOT throw when store has no schemaVersion (legacy v0.3 shape)', async () => {
    // Simulates a store that was never migrated — undefined schemaVersion is the legacy marker
    mock.resetStore({
      profiles: { profiles: [] },
    });

    // Should not throw — legacy shape is migration's responsibility
    await expect(listProfiles()).resolves.toBeDefined();
  });
});

describe('downgrade guard: migration', () => {
  it('migration throws SchemaVersionTooNewError for schemaVersion 99', async () => {
    mock.resetStore({
      profiles: { schemaVersion: 99, profiles: [] },
    });

    await expect(runMigration()).rejects.toThrow(SchemaVersionTooNewError);
  });

  it('migration does not modify store when throwing', async () => {
    const originalStore = { profiles: { schemaVersion: 99, profiles: ['sentinel'] } };
    mock.resetStore(originalStore);

    try {
      await runMigration();
    } catch {
      // expected
    }

    const store = mock.getStore();
    expect(store.profiles.schemaVersion).toBe(99);
    expect(store.profiles.profiles).toEqual(['sentinel']);
  });
});
