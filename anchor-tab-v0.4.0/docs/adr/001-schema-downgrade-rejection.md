# ADR 001 — Schema Downgrade Rejection

**Status**: Accepted  
**Date**: 2026-04-23

## Context

AnchorTab stores user profile data in `chrome.storage.local` under the key `profiles`, with a
top-level `schemaVersion` integer. Each extension release may increment `SCHEMA_VERSION` when the
stored shape changes.

Chrome extensions persist their storage across updates and downgrades. If a user manually installs
an older extension version after a newer one has written data, the old code will read a store with
a `schemaVersion` it does not understand. Silent reads of unknown schemas risk silent data
corruption, incorrect sorting, or loss of fields that the old code does not know are meaningful.

`src/storage/migration.js` handles the upward migration path (`schemaVersion < current`).
This ADR addresses the downward case (`schemaVersion > current`).

## Decision

When `readStore()` in `profiles-repo.js` reads a store where
`schemaVersion !== undefined && schemaVersion > SCHEMA_VERSION`, it throws
`SchemaVersionTooNewError` (exported from `schema.js`) immediately, before returning any data.

`runMigrationIfNeeded()` in `migration.js` applies the same guard: if the stored version exceeds
`SCHEMA_VERSION`, it throws rather than attempting to overwrite the data.

`SchemaVersionTooNewError` carries `storedVersion` and `supportedVersion` properties so that callers
(UI, service worker) can surface a human-readable message directing the user to update the
extension.

## Consequences

**Positive**
- User data is never silently corrupted by a downgraded extension reading a schema it does not
  understand.
- The error is unambiguous and machine-readable (`err.name === 'SchemaVersionTooNewError'`), enabling
  targeted error UI.

**Negative**
- A user who manually downgrades the extension will find it non-functional until they reinstall the
  matching or newer version, or restore a compatible backup. This is intentional: data safety is
  preferred over degraded partial functionality.

## Alternatives Considered

**Silent ignore** — return an empty store as if no data exists. Rejected: the user's data is
present but inaccessible; the extension appears to have lost all profiles, which is worse UX than an
explicit error.

**Best-effort read** — read fields that exist in the old schema and ignore unknown fields. Rejected:
the v1→v2 change removes `order` and relies on array position; old code sorting by `order` on v2
data (where `order` is absent) would silently reorder everything to the same position.

## References

- `src/storage/schema.js` — `SchemaVersionTooNewError`, `SCHEMA_VERSION`
- `src/storage/profiles-repo.js` — `readStore()` guard implementation
- `src/storage/migration.js` — `runMigrationIfNeeded()` guard + `migrateV1ToV2()`
