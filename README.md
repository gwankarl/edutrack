# EduTrack

EduTrack is a free, teacher-curated, self-paced learning platform for Cameroon's Anglophone general secondary students in Forms 3–5.

The repository contains the technical foundation and the first identity workflows: registration, email verification, password recovery, login, server-managed sessions, authorization guards, and a user profile. The frontend, Fastify API, shared contracts, PostgreSQL/Drizzle infrastructure, and automated checks are organized as npm workspaces.

## Prerequisites

- Git.
- Node.js 24 LTS with npm. Use the same Node major as CI.
- PostgreSQL 18 for local database work and PostgreSQL integration tests.
- Chromium for Playwright E2E tests.

## Fresh checkout setup

Run commands from the repository root. npm workspaces use the single root `package-lock.json`.

```bash
git clone <repository-url> edutrack
cd edutrack
npm ci
```

Create a local PostgreSQL login and the development and test databases. For example, in pgAdmin's Query Tool connected as a PostgreSQL administrator:

```sql
CREATE ROLE edutrack WITH LOGIN PASSWORD 'replace-with-a-local-password';
CREATE DATABASE edutrack_dev OWNER edutrack;
CREATE DATABASE edutrack_test OWNER edutrack;
```

Skip `CREATE ROLE` if the role already exists. Copy the backend environment examples, then edit both URLs to use the password you chose:

```bash
cp backend/.env.example backend/.env
cp backend/.env.test.example backend/.env.test
```

`backend/.env` points to the local `edutrack_dev` database. `backend/.env.test` must point to `edutrack_test`; the integration-test setup rejects any other database name. These files are ignored by Git. Do not commit credentials.

Apply the checked-in identity schema migration to your local development database before using registration, sessions, or profile endpoints:

```bash
npm run db:migrate --workspace=backend
```

This command uses `backend/.env` and targets `edutrack_dev`. Do not use it for production; production migrations require a separately reviewed deployment procedure.

The development proxy setting is already provided in the tracked [frontend/.env.development](frontend/.env.development). Its default sends `/api/v1` requests to `http://localhost:5000`. Change `API_PROXY_TARGET` there only if the backend uses a different address.

## Run the applications

Start the backend and frontend in separate terminals from the repository root:

```bash
npm run dev --workspace=backend
```

```bash
npm run dev --workspace=frontend
```

Open <http://localhost:5173>. Check the API directly with:

```bash
curl http://localhost:5000/api/v1/health
```

The expected response is `{"status":"ok"}`. Vite proxies `/api/v1` during development. Production hosting must separately forward `/api/v1` to Fastify; the Vite proxy is development-only.

## Common checks

```bash
npm run lint
npm run format:check
npm run typecheck
npm run test:unit --workspace=backend
npm run test --workspace=frontend
npm run test:integration --workspace=backend
npx playwright install chromium
npm run test:e2e
npm run build --workspaces --if-present
```

PostgreSQL integration tests require PostgreSQL 18 and `backend/.env.test`. Unit tests do not require PostgreSQL. Playwright starts the backend and frontend using its `webServer` configuration; its smoke and API tests use no business data or database connection.

See [Technical architecture](docs/architecture.md) for workspace and database structure, and [Development, testing, and CI](docs/development-and-testing.md) for environment details, migration commands, and verification procedures.
