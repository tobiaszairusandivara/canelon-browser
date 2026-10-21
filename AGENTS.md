# AGENTS.md

Instructions for AI agents working in this repository. Read this before touching code.

## What this repository is

`canelon-browser` is the **TPI Desktop Client**: an Electron desktop application for the TPI platform (*Trabajo Práctico Integrador*, UTN FRCórdoba). It runs on the student's machine and orchestrates the assessment experience — provisioning containerized workspaces, launching an isolated `code-server` IDE, recording signed telemetry and managing submissions.

Its architectural metaphor is *the classroom usher and stage setup manager*: it mounts and orchestrates the environment, but the assessment rules and grading stay strictly on the server side.

Full architecture documentation: [`docs/APP_CONTEXT.md`](docs/APP_CONTEXT.md). Read it before changing anything in the security, session or telemetry subsystems.

### Non-negotiable architectural principles

- **Zero-trust network model** — no public ports, no local database.
- **Gateway communication only** — everything goes through `API_GATEWAY_URL`.
- **Cryptographic identity** — an opaque session token plus an Ed25519 device key pair generated during pairing.

### Current state: scaffolding pending

The repository is currently **tooling and documentation only**. The source tree described below is the target layout; most of it does not exist yet:

| Path | Status |
| :--- | :--- |
| `docs/`, `.github/`, `.agents/` | Present |
| `apps/desktop/`, `packages/core/`, `packages/contracts/` | Pending scaffolding |
| `agent/`, `mock-server/`, `docker/`, `contracts/`, `openspec/`, `images/` | Pending scaffolding |

Consequences for agents working here today:

- There is no `package.json`, no build and no test suite yet. **Do not invent command output** — if a command cannot run, say so instead of assuming it passed.
- Commands documented below are the conventions to follow **when the scaffolding lands**; wire them into the root `package.json` scripts exactly as written so the two never drift.
- Structure decisions you make now (folder layout, workspace boundaries, package names) should match the layout above, because `docs/APP_CONTEXT.md` and the release process already assume it.

## Target repository structure

```text
apps/
  desktop/            # Primary Electron desktop client
packages/
  core/               # Shared domain logic & utility modules
  contracts/          # API schemas, events & type definitions
agent/                # Telemetry agent & process supervisor
mock-server/          # Local API gateway stub for development/testing
images/               # Static assets & branding resources
docker/
  desktop/            # Container definitions & Dockerfiles
contracts/            # Shared cryptographic & payload contracts
openspec/             # OpenAPI / API contract specifications
docs/                 # Extended architecture & design documentation
```

`packages/core` and `packages/contracts` are shared by both the desktop app and the agent; anything that both need belongs there, not duplicated. `contracts/` holds the cryptographic and payload schemas shared across process boundaries — treat changes there as breaking changes by default.

## Tech stack

| Category | Technology |
| :--- | :--- |
| Language & runtimes | TypeScript 6 (strict ESM), Node.js >= 24, npm workspaces |
| Frameworks | Electron 44, `electron-vite` 5, Vite 7 |
| Validation & specs | Zod 4, JSON Canonicalization Scheme (JCS) |
| Testing | Vitest 5 (coverage thresholds: 80% statements / 80% branch / 80% functions / 70% lines) |
| Code quality | ESLint 10, Prettier, `esbuild` |
| Containerization | Docker CLI via `execFile` (shell-less invocation) |
| Cryptography | Node Crypto, `safeStorage`, Ed25519 signing |

## Commands

Root `package.json` scripts (npm workspaces). Keep these names stable — CI and the release checklist depend on them.

```bash
npm install          # install workspace dependencies
npm run dev          # run the Electron app in development
npm run build        # production build of every workspace
npm run lint         # ESLint + Prettier check
npm run format       # Prettier write
npm run typecheck    # tsc --noEmit across workspaces
npm run test         # Vitest, single run
npm run test:watch   # Vitest in watch mode
npm run test:cov     # Vitest with coverage thresholds enforced
```

**Command order that matters:** `npm run typecheck && npm run lint && npm run test` before declaring a change done. When the change touches the main process, the agent supervisor or the Docker layer, also run `npm run build` — the type-level errors that matter in Electron code (IPC channel names, preload exposure) only surface at build time.

## Code conventions

- **Strict TypeScript, ESM only.** No `require`, no CommonJS interop, no default exports in shared packages.
- **No `any`.** Model external data with Zod schemas at the boundary and let the inferred type flow inward.
- **Docker calls go through `execFile` with argument arrays**, never through a shell string. This is the primary defense against command injection, and it is not negotiable.
- **No secrets in `argv`, environment variables or logs.** Signing keys live in secure memory; credentials are encrypted at rest with `safeStorage`. A secret that reaches a log line is a security incident.
- **The raw session token is never injected into the IDE container.** Keep that boundary intact when touching the workspace setup pipeline.
- **Every container and volume carries lifecycle tags** (`tpi.session`, `tpi.attempt`, `tpi.role`) so teardown never removes a workspace volume by accident.
- **Fail closed.** The network isolation checks (`assertNetworkIsolation`) and the `Host`/`Origin` validation in the editor gateway halt execution on drift rather than degrading gracefully.
- Prefer small, focused modules with explicit boundaries over large files; the assessment pipeline is a 7-stage state machine (`VALIDATING` → `PULLING_IMAGES` → `PREPARING_WORKSPACE` → `PROVISIONING_REPOSITORY` → `STARTING_IDE` → `REPORTING` → `READY`) and its transitions should stay readable in isolation.
- Match the existing code style of the file you are editing; do not reformat unrelated lines.

## Testing

- Vitest with the coverage thresholds above enforced in CI. New behaviour needs a test; a bug fix needs a regression test that fails without the fix.
- Keep tests deterministic: no network access, no real Docker daemon calls, no wall-clock dependencies. Use fakes for the Docker CLI and the gateway.
- The telemetry signing path and the token refresh timing are the areas where an untested change is most likely to hide a defect — cover them explicitly.

## Git workflow

This repository follows **GitFlow with Conventional Commits**. The full procedure lives in the `git-workflow` skill (`.agents/skills/git-workflow/SKILL.md`), which you should load before committing, branching, opening a PR or cutting a release.

The short version:

- `main` is production and only receives release/hotfix merges. `develop` is the integration branch and is the base of every feature PR. Neither is ever pushed to directly.
- Branches: `feature/<slug>` from `develop`, `release/<version>` from `develop`, `hotfix/<slug>` from `main`.
- Commits: `<type>(<scope>): <description>` with types `feat fix refactor perf style test docs build ops chore` and scopes such as `desktop core contracts agent mock-server docker openspec docs ci repo`. Imperative mood, lowercase, no trailing period, `!` plus a `BREAKING CHANGE:` footer for breaking changes.
- Feature PRs are squashed into `develop`; release and hotfix PRs are merged with a merge commit into `main` and merged back into `develop`.
- PRs use the templates in `.github/PULL_REQUEST_TEMPLATE/`; every section (including testing) must be filled.
- Install the local commit message validator once per clone: `bash .agents/skills/git-workflow/scripts/install-commit-hook.sh`.

Reference: `.github/CONVENTIONAL_COMMITS_CHEATSHEET.md` is the normative source for the commit format and the semver rules.

## Working as an agent in this repository

- **Never commit or push unless you were asked.** Prepare the change, show the diff, and propose the commit message; let the human confirm.
- **Never commit secrets**, generated build output or local tool state.
- **Never force-push to `main`, `develop`, `release/*` or `hotfix/*`**, and never amend a commit that is already pushed.
- **Do not fabricate command output.** If a build or test cannot run because the scaffolding does not exist yet, report that honestly.
- When a task touches the security-critical paths (network isolation, credential handling, telemetry signing, the submission signature), state explicitly which security property the change preserves and how it was verified.
