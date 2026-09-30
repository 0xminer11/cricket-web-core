# Dependency rules

Enforced by lint's AST import/dependency check and package export maps. Applications cannot import applications. Cross-package relative imports and undeclared dependencies are rejected. Internal imports must use public package exports. Cycles fail lint. Game-core/match-engine cannot import Node, browser, React, Next, Phaser or persistence packages; domain tsconfig omits DOM and Node ambient libraries.

Allowed internal edges:

| Package                        | Dependencies                                                 |
| ------------------------------ | ------------------------------------------------------------ |
| core, shared-types, logger, ui | none                                                         |
| config, match-engine, testing  | game-core                                                    |
| database                       | config, game-core, logger                                    |
| server-kit                     | config, logger, shared-types                                 |
| web/admin                      | core, config, ui, shared-types                               |
| api                            | core, config, shared-types, logger, database, server-kit     |
| game-server                    | core, match-engine, config, shared-types, logger, server-kit |

Domain types are not copied into transport or persistence packages. Introduce explicit DTO mappings when API/database shapes differ. No runtime/browser state can become authoritative. Keep TypeScript strict, noUncheckedIndexedAccess and exactOptionalPropertyTypes enabled; there are no explicit any exceptions.

Module 2: `database` reads static definitions and version constants from `game-core` (validation of ids, seeds) and accepts a logger; its `schema/` never imports `game-core`, so drizzle-kit needs no build. Only `api` may depend on `database`; web/admin/game-server must not (see [database-security.md](database-security.md)).
