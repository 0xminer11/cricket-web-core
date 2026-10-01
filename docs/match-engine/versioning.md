# Version policy

`MATCH_ENGINE_VERSION = '2'`: first implemented deterministic engine, replacing the Module 1 v1 interface placeholder. Existing string version types are preserved. Game balance remains initial `'1'`; Module 0 configuration and new initial resolver weights comprise that first playable balance. Replay schema is 1; RNG has its own explicit algorithm tag.

After this module, algorithm/rules changes require an engine version bump; weight-only changes require a balance version bump. Archive old implementations/configurations or explicitly reject old replay versions. Never replay old inputs silently using new rules. Do not change golden output without documenting why and the corresponding version update.

State uses the existing data schema version; persistence migration numbering is independent. Engine events use deterministic numeric ordering instead of wall time.
