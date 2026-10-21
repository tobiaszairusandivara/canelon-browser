# Commit Conventions

The normative source for the format is `.github/CONVENTIONAL_COMMITS_CHEATSHEET.md` in this repository. This reference is the operational version of it: the rules, the project scopes, and the mechanics of enforcing the format locally.

## Contents

- [Format](#format)
- [Types](#types)
- [Scopes](#scopes)
- [Description](#description)
- [Body](#body)
- [Footer and breaking changes](#footer-and-breaking-changes)
- [Examples](#examples)
- [The commit-msg hook](#the-commit-msg-hook)
- [Atomicity](#atomicity)
- [What never goes in a commit](#what-never-goes-in-a-commit)

---

## Format

```text
<type>(<optional scope>): <description>

<optional body>

<optional footer>
```

The header is a single line. The regex used by the local hook is:

```regex
^(feat|fix|refactor|perf|style|test|docs|build|ops|chore)(\([a-z0-9._/-]+\))?: .{1,100}$
```

A `!` before the colon (`feat(api)!: ...`) marks a breaking change and is accepted by the hook as well.

## Types

| Type | Use it when | Version impact |
| :--- | :--- | :--- |
| `feat` | You add, adjust or remove a feature of the API or the UI. | Minor |
| `fix` | You fix a bug introduced by a previous `feat` (or any other change). | Patch |
| `refactor` | You restructure code without changing behaviour. | None |
| `perf` | You change code for performance only (a special case of `refactor`). | Patch |
| `style` | Formatting, whitespace, semicolons — no behaviour change. | None |
| `test` | You add or correct tests. | None |
| `docs` | Documentation only. | None |
| `build` | Build tools, dependencies, project version. | None |
| `ops` | Infrastructure, deployment, CI/CD, monitoring, recovery procedures. | None |
| `chore` | Housekeeping: `.gitignore`, tooling, initial commit. | None |

If two types could apply, pick the one that describes the *intent* of the change, not the file it touched. A change to a Dockerfile that also restructures a workflow script is `ops` if the intent is operational.

## Scopes

The scope is optional, but when present it must name the area of the codebase the change belongs to. It is the fastest way for a reviewer to know where to look. Do not use issue identifiers as scopes.

Recommended scopes for this repository:

| Scope | Covers |
| :--- | :--- |
| `desktop` | `apps/desktop` — the Electron client, main/renderer processes, IPC. |
| `core` | `packages/core` — shared domain logic and utilities. |
| `contracts` | `packages/contracts`, `contracts/` — API schemas, event and type definitions, cryptographic payloads. |
| `agent` | `agent/` — telemetry agent and process supervisor. |
| `mock-server` | `mock-server/` — local API gateway stub. |
| `docker` | `docker/` — container definitions and Dockerfiles. |
| `openspec` | `openspec/` — OpenAPI and contract specifications. |
| `docs` | `docs/` and repository documentation. |
| `ci` | `.github/` workflows, pipelines and templates. |
| `repo` | Repository-wide concerns: tooling, configuration, dependencies. |

Scope names are lowercase. If a change spans two areas, choose the primary one — or split the commit.

## Description

- **Imperative, present tense:** "change", not "changed" or "changes". Read it as "this commit will ...".
- **Lowercase first letter**, no trailing period.
- **Length:** 1 to 100 characters. Aim for under 72 so it reads well in `git log --oneline` and in the GitHub commit list.
- **No issue identifiers in the description** — they belong in the footer.

Bad → good:

```text
Added the port allowlist feature.        →  feat(desktop): add port allowlist validation
Fixed a bug in the refresh logic.        →  fix(agent): refresh the session token before expiry
Update dependencies.                     →  build(repo): update electron to 44.2.1
```

## Body

The body explains **why** the change exists and how it differs from the previous behaviour. The diff already shows what changed; the body is where the reasoning goes.

```text
fix(agent): refresh the session token before expiry

The refresh trigger fired at 75% of the remaining TTL, which left a
window where an assessment could start after the token had expired.
Triggering at 90% keeps a full refresh cycle inside the validity window
while preserving the same request volume.
```

Use the imperative mood in the body as well. Wrap the body at roughly 72 characters.

## Footer and breaking changes

The footer is optional, but it is **mandatory** when the change is breaking.

```text
feat(contracts)!: replace the assessment session payload

The `attemptId` field is now nested under `attempt` to align with the
gateway contract. Consumers must migrate before upgrading.

BREAKING CHANGE: `payload.attemptId` moved to `payload.attempt.id`.
Closes #142
```

- Breaking indicator: a `!` right before the colon in the header (`feat(contracts)!:`).
- Breaking description: a footer line starting with `BREAKING CHANGE:`. For a multi-line description, put two newlines after the marker.
- Issue references: `Closes #123`, `Fixes #123`. Use one per line.

## Examples

```text
feat(desktop): add port allowlist validation

fix(contracts): align the submit payload with the gateway schema

refactor(core): extract the container tag builder

perf(agent): batch telemetry events into 5 second windows

docs(agent): document the event signing format

build(repo): bump vitest to 5.2.0

ops(docker): pin the code-server base image to 1.96.4

chore(repo): set up repository tooling and conventions
```

## The commit-msg hook

The repository ships a local hook that rejects malformed headers, so the format is enforced by the machine instead of by memory.

Install it once per clone:

```bash
bash .agents/skills/git-workflow/scripts/install-commit-hook.sh
```

The installer:

1. Detects the git hooks path (`git rev-parse --git-path hooks`, which respects `core.hooksPath`).
2. Backs up any existing `commit-msg` hook to `commit-msg.bak`.
3. Installs `scripts/commit-msg` as the active hook and makes it executable.
4. Reports the result.

The hook allows:

- A valid header matching the type/scope/description regex.
- Merge commits (`Merge branch '...'`), which git generates itself.
- Revert commits (`Revert "..."`), which git generates itself.

It rejects everything else with a message showing the accepted types and a valid example.

To bypass it for a one-off (rare, and it should be justified in the PR description):

```bash
git commit --no-verify -m "..."
```

If `git-conventional-commits` is installed on the machine, the installer offers to use it instead, since it also validates the whole message and can generate changelogs.

## Atomicity

One commit = one logical change. A commit should be revertible on its own, without reverting unrelated behaviour.

Signs that a commit is not atomic:

- It touches two unrelated subsystems.
- Its message needs the word "and".
- Half of it would fail its tests.
- It mixes a behaviour change with a reformat of the same files.

Split it:

```bash
git add -p                       # stage selected hunks
git commit -m "refactor(core): extract the container tag builder"
git commit -m "fix(desktop): tag the workspace volume as tpi.workspace"
```

`git add -p` is the practical tool for splitting a commit that mixed concerns.

## What never goes in a commit

- **Secrets of any kind.** The session token, the Ed25519 device key, API credentials. `.env` files with real values are gitignored already — keep it that way.
- **Generated build output.** `dist/`, `out/`, `node_modules/`, coverage reports.
- **Local tool state** (`.vscode/`, IDE caches, `.DS_Store`).
- **Large binaries** that can be replaced by a script or fetched by a build step.
- **Debug leftovers**: `console.log` calls, commented-out code, stray `TODO` without an owner.

Before every commit, check what is actually staged:

```bash
git diff --staged --stat
git diff --staged
```
