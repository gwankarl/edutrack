# Development, testing, and CI

## Environment files

| File                        | Purpose                                                                                                                | Git status                   |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| `backend/.env.example`      | Backend development defaults and `DATABASE_URL` template. Copy to `backend/.env` and replace the placeholder password. | Tracked example.             |
| `backend/.env.test.example` | Test environment template targeting `edutrack_test`. Copy to `backend/.env.test` and configure local credentials.      | Tracked example.             |
| `backend/.env`              | Local backend runtime configuration.                                                                                   | Ignored; do not commit.      |
| `backend/.env.test`         | Isolated local PostgreSQL integration-test configuration.                                                              | Ignored; do not commit.      |
| `frontend/.env.development` | Vite development proxy target.                                                                                         | Tracked; contains no secret. |

The backend requires `NODE_ENV`, `HOST`, `PORT`, and `DATABASE_URL` after validation. Defaults are `development`, `127.0.0.1`, and `5000`; `DATABASE_URL` must use the PostgreSQL scheme. The test setup explicitly loads `backend/.env.test`, overrides inherited values, and rejects every database name except `edutrack_test`.

For a fresh local setup, copy the templates:

```bash
cp backend/.env.example backend/.env
cp backend/.env.test.example backend/.env.test
```

Create a PostgreSQL login and two databases if they do not already exist. The URLs should have these database names:

```text
postgresql://edutrack:<local-password>@localhost:5432/edutrack
postgresql://edutrack:<local-password>@localhost:5432/edutrack_test
```

URL-encode special characters in a password. Never place real credentials in tracked examples, source files, or workflow files.

## Local development

Install the root workspaces once:

```bash
npm ci
```

In separate terminals from the repository root:

```bash
npm run dev --workspace=backend
```

```bash
npm run dev --workspace=frontend
```

The frontend is served at `http://localhost:5173`; Fastify defaults to `http://127.0.0.1:5000`. `frontend/.env.development` sets the Vite proxy target to `http://localhost:5000`. Change `API_PROXY_TARGET` if the backend host or port differs. The Vite proxy only runs during development; production hosting must provide the `/api/v1` reverse-proxy route.

## Local verification

### Code quality and types

```bash
npm run lint
npm run format:check
npm run typecheck
```

The root typecheck script invokes the `typecheck` scripts in frontend, backend, and contracts workspaces.

### Unit and component tests

```bash
npm run test:unit --workspace=backend
npm run test --workspace=frontend
```

Backend unit tests exclude `*.integration.test.ts` and mock database connections. Frontend Vitest uses jsdom and the setup in `frontend/src/test/setup.ts`. Neither unit suite requires PostgreSQL.

### PostgreSQL integration tests

Install PostgreSQL 18, create `edutrack_test`, configure `backend/.env.test`, then run:

```bash
npm run test:integration --workspace=backend
```

The integration setup refuses to run unless the URL targets exactly `edutrack_test`. The current database test connects through the existing pool and Drizzle client to execute read-only `SELECT 1`; it does not create or modify tables. The health route test uses Fastify `inject()` and does not start a listening server.

### Playwright end-to-end tests

Install Chromium once:

```bash
npx playwright install chromium
```

Run all smoke and API integration browser tests:

```bash
npm run test:e2e
```

Playwright starts and stops Fastify and Vite through `playwright.config.ts`. The E2E backend receives a synthetic unused database URL; these tests do not require PostgreSQL. On Linux CI, Chromium and system dependencies are installed with:

```bash
npx playwright install --with-deps chromium
```

### Production build

```bash
npm run build --workspaces --if-present
```

The frontend is currently the only workspace with a production build script. Backend runs TypeScript through `tsx`, and contracts exports source TypeScript for workspace consumers.

## GitHub Actions CI

The workflow is `.github/workflows/ci.yml`. It runs on pushes to `main` and pull requests targeting `main`, with `contents: read` permissions. Each job uses Node 24, npm caching keyed by the root `package-lock.json`, and `npm ci`.

| Job              | Checks                                                                                                                                  |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `quality`        | Lint, format check, and all-workspace typecheck.                                                                                        |
| `unit-build`     | Backend unit tests, frontend tests, and available workspace builds.                                                                     |
| `db-integration` | PostgreSQL 18 service and guarded `edutrack_test` integration suite using synthetic CI credentials.                                     |
| `e2e`            | Chromium Playwright suite; Playwright starts the Fastify and Vite servers. Failure reports and test artifacts are uploaded for 14 days. |

Each job installs dependencies independently because GitHub-hosted jobs use separate runners. A failed check or test fails its job. No deployment job or production secret is configured.

## Full local CI-equivalent sequence

With PostgreSQL 18 and `backend/.env.test` configured, run:

```bash
npm run lint
npm run format:check
npm run typecheck
npm run test:unit --workspace=backend
npm run test --workspace=frontend
npm run test:integration --workspace=backend
npm run build --workspaces --if-present
npx playwright install chromium
npm run test:e2e
```
