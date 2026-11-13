# Technical architecture

## Repository and npm workspaces

EduTrack is an npm-workspaces monorepo with one root `package-lock.json`:

| Workspace             | Package               | Responsibility                                                                        |
| --------------------- | --------------------- | ------------------------------------------------------------------------------------- |
| `frontend/`           | `@edutrack/frontend`  | React 19, TypeScript, Vite, React Router Data Mode, Tailwind CSS, and TanStack Query. |
| `backend/`            | `@edutrack/backend`   | Fastify API, validated environment, logging, PostgreSQL pool, and Drizzle client.     |
| `packages/contracts/` | `@edutrack/contracts` | Browser-safe Zod schemas and inferred API types shared by frontend and backend.       |

Install dependencies from the repository root with `npm ci`. Do not create workspace lockfiles; the root lockfile is the reproducible install source.

## Frontend structure

- `frontend/src/app/` contains the router, application layout, entry point, and providers.
- `frontend/src/features/{feature}/` contains feature-owned pages, components, API functions, hooks, schemas, and types. The current `system` feature holds backend health API and status UI.
- `frontend/src/components/layout/` contains shared layout components such as `Header` and `Footer`.
- `frontend/src/lib/api/` contains the framework-independent Fetch client and API error type.
- `frontend/src/styles/` contains the global stylesheet and Tailwind CSS v4 design tokens.
- `frontend/src/test/setup.ts` configures Testing Library and jest-dom for Vitest.

The app uses React Router client-side Data Mode. TanStack Query is provided once at the application entry point. Frontend requests use relative `/api/v1` URLs so the browser remains same-origin.

## Backend structure

- `backend/src/app/` contains Fastify application construction, module registration, and server startup.
- `backend/src/modules/{domain}/` contains domain-owned routes and tests. The current health route is registered at `/api/v1/health`.
- `backend/src/infrastructure/config/` validates environment values with Zod and loads dotenv configuration.
- `backend/src/infrastructure/logging/` configures Pino logging.
- `backend/src/infrastructure/database/` owns the reusable `pg.Pool`, Drizzle client, and database health helpers.
- `backend/src/shared/errors/` contains centralized HTTP error handling.

Routes, schemas, business services, and repositories remain separate as domain behavior is added. Business rules belong in services, and frontend code must not access PostgreSQL.

## API and shared contracts

The REST API is rooted at `/api/v1`. The health endpoint returns the shared `HealthResponse` contract from `packages/contracts/`. That package is safe for browser imports and must not contain Fastify, PostgreSQL, server secrets, private schemas, or answer keys.

In development, Vite reads `API_PROXY_TARGET` from `frontend/.env.development` and proxies `/api/v1` to Fastify. Production hosting must configure its own reverse proxy or web server to route `/api/v1` to the backend.

## PostgreSQL and migrations

The project targets PostgreSQL 18. The backend creates one configurable `pg.Pool`; Drizzle uses that same pool.

- Drizzle schema source: `backend/src/infrastructure/database/schema/`.
- Version-controlled SQL migrations: `backend/drizzle/`.
- Drizzle Kit configuration: `backend/drizzle.config.ts`.

No business schemas or SQL migrations exist yet. When approved schema changes are introduced, the backend workspace scripts are:

```bash
npm run db:generate --workspace=backend
npm run db:check --workspace=backend
npm run db:migrate --workspace=backend
npm run db:status --workspace=backend
```

Review and commit generated SQL migrations with the schema change. Apply migrations with `db:migrate`; do not use automatic schema pushing. The migration status command reads the Drizzle migration history and reports when that history table has not yet been created.
