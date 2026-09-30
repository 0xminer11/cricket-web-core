# Environment

Copy .env.example to root .env. Environment is loaded once by server commands, the frontend launcher and test runner. Existing process values take precedence. Turbo includes declared environment values and .env in cache inputs.

| Variable                                                  | Module 1 use                                                                                        |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| NODE_ENV                                                  | development, test or production (Next builds/start use production)                                  |
| APP_ENV                                                   | deployment label: development/test/staging/production                                               |
| WEB_PORT / ADMIN_PORT                                     | 3300 / 3301                                                                                         |
| API_PORT / GAME_SERVER_PORT                               | 4300 / 4310                                                                                         |
| CORS_ORIGINS                                              | comma-separated explicit origins; required for staging/production                                   |
| LOG_LEVEL                                                 | Pino level; info by default                                                                         |
| DATABASE_URL / REDIS_URL                                  | PostgreSQL / Redis connection strings; the API enables its pool and /ready when DATABASE_URL is set |
| DATABASE_POOL_MAX                                         | max pooled connections per process (default 10; .env.example uses 5)                                |
| DATABASE_IDLE_TIMEOUT_MS / DATABASE_CONNECTION_TIMEOUT_MS | idle client eviction (30000) / connect deadline (5000)                                              |
| DATABASE_STATEMENT_TIMEOUT_MS                             | per-statement timeout (15000); idle-in-transaction is twice this                                    |
| DATABASE_SLOW_QUERY_MS                                    | log transactions at least this slow; 0 disables (never logs SQL)                                    |
| TEST_DATABASE_URL                                         | optional server for integration tests; only cricketer_test_* databases are created/dropped          |
| APP_VERSION                                               | release identifier override for backend                                                             |
| NEXT_PUBLIC_API_URL / NEXT_PUBLIC_GAME_SERVER_URL         | public service locations; no credentials                                                            |

Staging uses NODE_ENV=production and APP_ENV=staging. Deployment must supply CORS origins. Never use local Compose credentials in deployment. Secrets such as JWT_SECRET and SESSION_SECRET belong to Module 3 and are intentionally not required now. Balance/engine/schema versions come from source-controlled game-core, not mutable environment values.

Next public values are release configuration: rebuild after changing them. Docker runtime must be configured explicitly. Admin is a development preview even when compiled using a production build command.
