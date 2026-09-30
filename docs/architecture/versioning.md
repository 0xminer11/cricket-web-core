# Version policy

Application starts at 0.1.0. Module 0 supplies a VersionStamp but no concrete version constants: Module 1 initializes gameBalanceVersion and matchEngineVersion as strings "1" and schemaVersion as integer 1, respecting the original types. No values/formulas were rebalanced.

Change balance version when gameplay-affecting config changes, engine version when deterministic logic changes, schema version when persisted data changes, and application version for releases. Preserve versioned historical definitions needed by in-progress matches/replays. Future seed algorithms must be explicitly versioned; DefaultRandomSource is not replay-safe and must not be used for authoritative deterministic simulations.

Data migrations are explicit/forward-only. Recovery uses rehearsed backups and compatible application rollback; never auto-reset a database. Release automation should update root/package/config app versions together.

Module 2: DATA_SCHEMA_VERSION is now 2. Version 1 described Module 0's in-memory PlayerSave; version 2 is the first relational PostgreSQL persistence structure (migrations 0000-0001). Increment it, with a migration, when the persisted structure changes significantly; matches pin match_engine_version, game_balance_version and data_schema_version at creation, training sessions, reward grants, career events, contracts and sponsorships pin game_balance_version. The game_versions table records which triples have been live; source constants remain authoritative.
