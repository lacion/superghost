# SuperGhost E2E Example App

A fullstack Task Manager app used to validate SuperGhost end-to-end against a real application.

## Quick Start

```bash
# Start the app (for manual testing / development)
bun run e2e:app
# Open http://localhost:3777

# Run smoke tests (requires an AI API key)
bun run e2e:smoke

# Run all tests
bun run e2e:all
```

## Architecture

- **App**: Bun fullstack server with React frontend and SQLite (in-memory) backend
- **API**: REST endpoints at `/api/*` for tasks CRUD and auth
- **Frontend**: React SPA with hash routing, semantic HTML for accessibility
- **Tests**: SuperGhost YAML configs exercising both browser and API test types

## Test Suites

| Script | Config | Tests | Purpose |
|--------|--------|-------|---------|
| `bun run e2e:smoke` | `smoke.superghost.yaml` | 2 | Quick CI validation |
| `bun run e2e:browser` | `browser.superghost.yaml` | 7 | Browser UI flows |
| `bun run e2e:api` | `api.superghost.yaml` | 7 | API endpoint tests |
| `bun run e2e:all` | All of the above | 16 | Full validation |

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/tasks` | List tasks (optional `?status=` filter) |
| POST | `/api/tasks` | Create task |
| GET | `/api/tasks/:id` | Get single task |
| PUT | `/api/tasks/:id` | Update task |
| DELETE | `/api/tasks/:id` | Delete task |
| POST | `/api/login` | Authenticate (username/password) |

## Seed Data

- **User**: `demo` / `password`
- **Tasks**: "Set up project" (done), "Write documentation" (in_progress), "Add unit tests" (todo)

## CI

The E2E tests skip gracefully when no AI API key is set. In CI, configure `ANTHROPIC_API_KEY` (or another supported provider key) as a secret to enable them.
