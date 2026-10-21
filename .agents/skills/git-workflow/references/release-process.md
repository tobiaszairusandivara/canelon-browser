# Release Process

A release turns the accumulated `develop` history into a tagged, published version on `main`. This reference covers the version decision, the files to change, the tag, the GitHub release, and the cleanup that has to happen afterwards.

## Contents

- [When to cut a release](#when-to-cut-a-release)
- [Deciding the version](#deciding-the-version)
- [Release checklist](#release-checklist)
- [Bumping versions](#bumping-versions)
- [Writing the changelog](#writing-the-changelog)
- [Opening the release PR](#opening-the-release-pr)
- [Merging and tagging](#merging-and-tagging)
- [Publishing the GitHub release](#publishing-the-github-release)
- [Merging back into develop](#merging-back-into-develop)
- [Hotfix releases](#hotfix-releases)
- [Verifying the release](#verifying-the-release)
- [Aborting a release](#aborting-a-release)

---

## When to cut a release

Cut one when `develop` contains a coherent set of changes and there is value in pinning them:

- A milestone or a batch of features is complete.
- A demo or delivery date requires a stable, tagged build.
- A security fix or a critical defect needs to ship immediately (that is a hotfix — see below).

Do not cut a release "because `develop` has a lot in it". The release is a promise about the state of the software; cutting it mid-work ships half-finished behaviour.

## Deciding the version

The version follows semantic versioning, and the increment is derived from the commit types that landed since the last tag — exactly the rule in `.github/CONVENTIONAL_COMMITS_CHEATSHEET.md`:

| Commits since the last tag | Increment | Example |
| :--- | :--- | :--- |
| Any commit with `!` or a `BREAKING CHANGE:` footer | **Major** | `1.2.0` → `2.0.0` |
| At least one `feat` | **Minor** | `1.2.0` → `1.3.0` |
| Only `fix`, `perf`, `refactor`, `test`, `docs`, `build`, `ops`, `chore` | **Patch** | `1.2.0` → `1.2.1` |

Inspect the range before deciding:

```bash
git fetch --tags
LAST_TAG=$(git describe --tags --abbrev=0)
git log --oneline "$LAST_TAG"..develop
git log --pretty=format:'%s' "$LAST_TAG"..develop | grep -E '^[a-z]+\(.*\)!:'   # breaking markers
git log --pretty=format:'%s' "$LAST_TAG"..develop | grep -E '^feat'           # features
```

Pre-release versions use the semver suffix with a hyphen: `1.3.0-rc.1`, `1.3.0-beta.1`. If a pre-release ships, the final release of that line is the plain version (`1.3.0`).

## Release checklist

Work through this list; each item is a step, not a suggestion.

1. `develop` is up to date with `origin/develop` and CI is green on it.
2. The version number is decided from the commit range.
3. The release branch `release/<version>` exists, branched from `develop`.
4. Every `package.json` in the repository carries the new version.
5. `CHANGELOG.md` lists the changes grouped by type.
6. The full verification suite passes: build, lint, typecheck, tests with coverage.
7. The release PR targets `main` and is merged with a merge commit.
8. The tag `v<version>` is annotated and pushed.
9. The GitHub release exists with notes.
10. `develop` contains the release commits and the release branch is deleted.

## Bumping versions

The repository uses npm workspaces, so the version lives in more than one file:

- the root `package.json` `version` field;
- the `version` field of every workspace package (`apps/desktop/package.json`, `packages/core/package.json`, `packages/contracts/package.json`, `agent/package.json`, `mock-server/package.json`).

Bump them consistently. `npm version <new-version> --workspaces --if-present` handles the workspaces; update the root by hand.

```bash
# on the release branch
npm version 1.3.0 --workspaces --if-present --no-git-tag-version
```

Then verify nothing was missed:

```bash
grep -rn '"version"' --include=package.json . | grep -v node_modules
```

Every workspace must report `1.3.0`.

## Writing the changelog

Keep a `CHANGELOG.md` at the repository root, newest release first, in this shape:

```markdown
# Changelog

All notable changes to this project are documented in this file.
The format is based on [Conventional Commits](https://www.conventionalcommits.org/).

## [1.3.0] - 2026-10-21

### Features

- Validate the IDE port against the allowlist before forwarding a request (`desktop`).
- Expose the telemetry event schema in `packages/contracts` (`contracts`).

### Bug fixes

- Refresh the session token at 90% of its TTL instead of 75% (`agent`).

### Security

- Reject `CONNECT` tunnelling attempts in the editor gateway (`docker`).

### Breaking changes

- `payload.attemptId` moved to `payload.attempt.id` (`contracts`).
```

Rules:

- One line per user-visible change, written in the past tense, ending without a period.
- Group by type, in this order: Features, Bug fixes, Performance, Security, Breaking changes, Documentation.
- Breaking changes always get their own section, and they name the migration step.
- The version heading carries the release date.

The notes of the GitHub release reuse this content, so write it once, well.

## Opening the release PR

```bash
git switch develop
git pull --rebase
git switch -c release/1.3.0

# bump versions + changelog + verification
npm version 1.3.0 --workspaces --if-present --no-git-tag-version
npm run build
npm run lint
npm run test

git add package.json "apps/*/package.json" "packages/*/package.json" agent/package.json mock-server/package.json CHANGELOG.md
git commit -m "chore(release): prepare 1.3.0"
git push -u origin release/1.3.0
```

The release PR body must state:

- the version and why that version (breaking / feature / fix);
- the highlights of the release;
- the migration steps for breaking changes;
- the verification results;
- the link to the changelog section.

```bash
gh pr create --base main \
  --title "chore(release): 1.3.0" \
  --body-file /tmp/release-body.md
```

## Merging and tagging

```bash
gh pr checks <pr>
gh pr merge <pr> --merge --delete-branch

git switch main
git pull
git log --oneline -3                 # confirm the merge commit is HEAD
git tag -a v1.3.0 -m "Release 1.3.0"
git push origin v1.3.0
```

Tag the **merge commit on `main`**, not a commit from the release branch. A tag that does not point at `main` is invisible to anyone installing from the release.

## Publishing the GitHub release

```bash
gh release create v1.3.0 \
  --title "v1.3.0" \
  --notes-file /tmp/release-notes.md \
  --target main
```

- The notes are the changelog section for that version.
- Use `--draft` if the release still needs a second pair of eyes, and publish it with `gh release edit v1.3.0 --draft=false`.
- Never delete a published release to fix a typo — edit the notes instead, and cut a new patch release for a code change.

## Merging back into develop

The release branch carries commits that `develop` does not have yet (the version bump, the changelog). Merging it back keeps `develop` consistent with what is released:

```bash
git switch develop
git merge --no-ff origin/release/1.3.0 -m "chore(release): merge 1.3.0 back into develop"
git push origin develop
git branch -d release/1.3.0
git push origin --delete release/1.3.0
```

If the release branch was already deleted by the merge, merge `main` instead:

```bash
git merge --no-ff origin/main -m "chore(release): merge 1.3.0 back into develop"
```

Either way, the next release starts from a `develop` that contains the previous release.

## Hotfix releases

A hotfix from `main` follows the same tagging steps, with a patch version, and it must be merged back into `develop`:

```bash
git switch main && git pull
git switch -c hotfix/session-token-expiry
# fix, test, commit: fix(agent): refresh the session token before expiry
git push -u origin hotfix/session-token-expiry
gh pr create --base main --title "fix(agent): refresh the session token before expiry" --body-file /tmp/pr-body.md
gh pr merge <pr> --merge --delete-branch

git switch main && git pull
git tag -a v1.3.1 -m "Release 1.3.1"
git push origin v1.3.1
gh release create v1.3.1 --title "v1.3.1" --notes-file /tmp/notes.md

git switch develop
git merge --no-ff origin/main -m "chore(release): merge hotfix v1.3.1 back into develop"
git push origin develop
```

## Verifying the release

```bash
git ls-remote --tags origin | grep v1.3.0        # the tag exists on the remote
gh release view v1.3.0                           # the release is published
git branch -r --contains v1.3.0                  # the tag is reachable from main
git log --oneline origin/develop -5              # develop contains the release merge
```

## Aborting a release

Before the merge, aborting is cheap:

```bash
git switch develop
git branch -D release/1.3.0
git push origin --delete release/1.3.0
```

After the merge and the tag, the release exists. Do not delete the tag or rewrite `main`. Instead:

1. Revert the merge commit on `main` with `git revert -m 1 <merge-sha>` through a PR.
2. Merge the revert back into `develop`.
3. Cut a new patch release with the corrected content.

The published artifact stays in the history, which is exactly what the tag promises.
