# Configuration

Layering is source defaults → validated environment → deployment-provided environment → future versioned LiveOps snapshot. No live remote overrides exist yet. Future LiveOps must validate all overrides, authorize changes and pin the immutable definition version to each match.

All six feature flags are typed, source-configured and disabled. They indicate future capability, not authorization; placeholder routes remain discoverable. Add per-environment or LiveOps providers only when real behavior exists.

Shots, pitches, match formats, formulas, attributes and approved equipment definitions remain versioned source data. Shop rotations, schedules, availability, temporary bonuses and season settings may later be persisted/served by LiveOps. Do not duplicate all static definitions into a database. Source data is not mock data; factories live separately in testing.

BuildInfo is a transport-neutral type reserving optional commitSha/buildTime; runtime does not depend on Git. Release versions are exported from config and exposed through /version. Environment never silently overrides gameplay balance.
