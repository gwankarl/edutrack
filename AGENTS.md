# EduTrack — Codex Development Instructions

## Project

EduTrack is a free, teacher-curated, self-paced learning platform
for Cameroon's Anglophone general secondary students (Forms 3–5).

Implement only the approved MVP requirements and current roadmap task.
Use synthetic demonstration accounts and data.

## Codex Operating Modes

### Manual Mode (Default)

- Always use Manual Mode unless explicitly instructed otherwise.
- May inspect files and run read-only commands.
- May run tests, linting, typechecking, and other non-destructive verification commands.
- Must not create, modify, move, or delete project files.
- Must not install, update, or remove dependencies.
- Must not automatically fix code or formatting.
- Provide numbered, step-by-step implementation instructions.
- Include exact Git Bash commands, file paths, and complete code.
- Include directory and file creation commands when needed.
- Provide verification commands and expected results.
- The user performs all code changes.

### Implementation Mode (Explicit Only)

- Activate only when explicitly asked to implement a task directly.
- Create or modify files only within the approved task scope.
- Install required dependencies when necessary.
- Run relevant tests and quality checks.
- Fix implementation problems within the approved scope.
- Report changed files, test results, and remaining issues.

### General Rules

- Never switch modes without explicit instruction.
- Follow the current numbered EduTrack roadmap task.
- Do not commit, push, merge, tag, or deploy without authorization.
- Do not change approved architecture or business rules.

## Technology

- Frontend: React, TypeScript, Vite, React Router Data Mode,
  Tailwind CSS, TanStack Query, React Hook Form, Zod.
- Backend: Node.js, TypeScript, Fastify, Zod.
- Database: PostgreSQL, Drizzle ORM, node-postgres, Drizzle Kit.
- Monorepo: npm workspaces with one root package-lock.json.
- Testing: Vitest, React Testing Library, Playwright.
- API: REST JSON under /api/v1.

## Architecture and File Placement

### Frontend — Feature-Based Architecture

- Application routing: frontend/src/app/router/
- Application layouts: frontend/src/app/layouts/
- Application providers: frontend/src/app/providers/
- Feature modules: frontend/src/features/{feature}/
- Feature pages: {feature}/pages/
- Feature components: {feature}/components/
- Feature hooks: {feature}/hooks/
- Feature API functions: {feature}/api/
- Feature validation: {feature}/schemas/
- Feature-specific types: {feature}/types/
- Reusable UI: frontend/src/components/ui/
- Shared layouts: frontend/src/components/layout/
- API client: frontend/src/lib/api/
- Shared utilities: frontend/src/lib/utils/
- Global styles and tokens: frontend/src/styles/

Approved frontend features:
auth, account, teacher-applications, catalog,
course-authoring, publication, enrollments,
learning, assessments, administration.

Keep feature-specific code within its feature.
Only promote components or utilities to shared directories
when genuinely reused across multiple features.

### Backend — Domain-Based Architecture

- Application startup: backend/src/app/
- Business domains: backend/src/modules/{domain}/
- Database infrastructure: backend/src/infrastructure/database/
- Drizzle schemas: backend/src/infrastructure/database/schema/
- Migrations: backend/drizzle/
- Sessions: backend/src/infrastructure/sessions/
- Email: backend/src/infrastructure/email/
- Configuration: backend/src/infrastructure/config/
- Logging: backend/src/infrastructure/logging/
- Shared authorization: backend/src/shared/authorization/
- Shared errors: backend/src/shared/errors/
- Shared types: backend/src/shared/types/

Approved backend domains:
identity, teachers, academic-catalog, courses,
publication, enrollments, learning, administration.

Each domain may contain:

- *.routes.ts — HTTP routes and request handling.
- *.schemas.ts — Zod validation and response schemas.
- *.service.ts — Business logic and domain rules.
- *.repository.ts — Database access.
- *.types.ts — Domain-specific TypeScript types.
- *.test.ts — Unit tests.
- *.integration.test.ts — Integration tests.

Do not create global controllers/, services/, or
repositories/ directories for business-domain code.

### Other Project Directories

- Browser-safe shared contracts: packages/contracts/
- End-to-end tests: tests/e2e/
- Technical documentation: docs/
- GitHub Actions: .github/workflows/

### Mandatory File Placement Rules

1. Inspect the existing directory structure before adding files.
2. Identify the owning feature or business domain.
3. Place feature/domain-specific files inside that module.
4. Separate routes, validation, services, and repositories.
5. Do not put business rules in HTTP routes or React components.
6. Do not access PostgreSQL directly from frontend code.
7. Keep shared contracts free of server-only dependencies.
8. Reuse existing structures before creating new abstractions.
9. Create directories only when their functionality is needed.
10. Avoid duplicate files, misplaced utilities, and unrelated folders.
11. Update imports and exports when files are moved or renamed.
12. Follow existing naming and testing conventions.
13. Never reorganize existing modules without approval.
14. If file ownership is unclear, explain the options before proceeding.

## Coding Standards

- Use strict TypeScript and descriptive names.
- Prefer small, focused functions and maintainable code.
- Use kebab-case for directories and backend files.
- Use PascalCase for React component files and names.
- Use camelCase for functions, variables, and JSON fields.
- Use snake_case for database tables and columns.
- Reuse existing patterns before introducing new abstractions.
- Avoid duplicate code, unnecessary dependencies, and overengineering.
- Keep related code inside its feature or domain.
- Create directories and files in their correct locations.
- Update imports and exports when moving or renaming files.
- Document public contracts, business invariants, and
  non-obvious logic using concise JSDoc.
- Avoid comments that merely repeat obvious code.

## Security and Data Integrity

- Enforce authentication, roles, ownership, and resource
  authorization on the backend.
- Use secure server-managed sessions and CSRF protection.
- Validate untrusted inputs.
- Use database constraints and transactions where required.
- Grade quizzes on the backend; preserve historical attempts.
- Never expose correct answers before valid submission.
- Never commit credentials, tokens, or private student data.

## Testing

- Write relevant unit and integration tests for backend changes.
- Add frontend component tests for important interactions.
- Use Playwright for approved end-to-end user journeys.
- Keep unit tests near source files.
- Name integration tests \*.integration.test.ts.
- Name Playwright tests \*.spec.ts.
- Run applicable lint, format, typecheck, build, and test commands.
- Report what passed, failed, or was not run.
- Never claim unexecuted tests passed.

## Testing Priority

- Prioritize unit and integration tests during feature development.
- Write backend unit tests for business logic and validation.
- Write backend integration tests for APIs and database operations.
- Write frontend unit/component tests using Vitest and React Testing Library.
- Add frontend integration tests where useful.
- Defer new Playwright E2E tests until the final integration and QA milestone (M8).
- Preserve existing E2E infrastructure and tests; do not remove them.
- Do not require E2E test completion to close individual M1–M7 tasks.
- Continue running relevant lint, typecheck, format, and build checks.

## Development Workflow

1. Work on one numbered roadmap task at a time.
2. Inspect existing code and conventions before modifying files.
3. Implement backend functionality and verify it.
4. Implement frontend functionality when required.
5. Run relevant integration and acceptance tests.
6. Keep changes limited to the current task.
7. Update documentation when behavior or configuration changes.
8. Summarize changes, verification results, and remaining issues.

Infrastructure-only tasks do not require artificial frontend changes.

## Git and Operational Rules

- Do not commit, push, merge, tag, or deploy unless explicitly asked.
- Do not modify unrelated files or introduce unapproved features.
- Do not change approved architectural decisions without approval.
- Explain any new dependency before adding it.
- Keep commit messages concise and conventional-style.
- Do not perform destructive operations without authorization.
- Ask before proceeding when a required decision is unresolved.

### Icon Library

- Use `lucide-react` as EduTrack's primary icon library.
- Import only the icons needed by each component.
- Use consistent icon sizes:
  - 16px for compact actions.
  - 20px for navigation and standard controls.
  - 24px for larger UI elements.
- Use Tailwind CSS design tokens for icon colors.
- Prefer consistent stroke widths and visual alignment.
- Include visible labels for important navigation and actions.
- Decorative icons must use `aria-hidden="true"`.
- Icon-only buttons must have accessible names (`aria-label`).
- Do not introduce another icon library without approval.
