# Branching Model (GitFlow)

## Contents

- [The two long-lived branches](#the-two-long-lived-branches)
- [Diagram](#diagram)
- [Branch types](#branch-types)
- [Feature lifecycle](#feature-lifecycle)
- [Release lifecycle](#release-lifecycle)
- [Hotfix lifecycle](#hotfix-lifecycle)
- [Merge rules](#merge-rules)
- [Tag rules](#tag-rules)
- [Deleting branches](#deleting-branches)
- [Recovering from mistakes](#recovering-from-mistakes)

---

## The two long-lived branches

| Branch | Role | Receives | Never receives |
| :--- | :--- | :--- | :--- |
| `main` | Released, production-ready code. Every commit here is tagged. | Release merges, hotfix merges. | Feature PRs, direct pushes. |
| `develop` | Integration branch. The default base for every feature PR and the branch CI runs against. | Squashed feature PRs, release merges back, hotfix merges back. | Direct pushes. |

Everything else is a short-lived topic branch that exists only while the work is in flight.

## Diagram

```text
                    feature/port-allowlist
                   /                        \
                  /                          \
        (start)  o----[feature commits]------o  (squash merge)
                  \                          /        \
                   \                        /          v
                    o----------------------o      develop  o---------o
                                                      |         |
                             release/1.2.0  --------->|         |
                             (branch from develop)    |         |
                                                      v         |
                                                   main o      |
                                                        |       |
                             hotfix/token-expiry  ---->|       |
                             (branch from main)       |       |
                                                        v       v
                                                    tags v1.2.0  (merge back to develop)
```

Read it as: `develop` accumulates features, a release branch peels a stable line off `develop` towards `main`, and a hotfix peels a line off `main` that must be merged back into `develop`.

## Branch types

| Prefix | Base | Merges into | Merge commit style | Lifespan |
| :--- | :--- | :--- | :--- | :--- |
| `feature/<slug>` | `develop` | `develop` | Squash | Days to weeks |
| `release/<version>` | `develop` | `main` + `develop` | Merge commit (`--no-ff`) | Days |
| `hotfix/<slug>` | `main` | `main` + `develop` | Merge commit (`--no-ff`) | Hours to days |

Slugs are lowercase, hyphenated and descriptive: `feature/port-allowlist-validation`, `release/1.2.0`, `hotfix/session-token-expiry`. Use `release/<version>` with the plain version number (no `v` prefix) — the `v` belongs on the tag, not the branch.

## Feature lifecycle

```bash
# 1. Always branch from an up-to-date develop
git switch develop
git pull --rebase

# 2. Create the topic branch
git switch -c feature/port-allowlist-validation

# 3. Work, committing in small logical units
git add apps/desktop/src/ports/allowlist.ts
git commit -m "feat(desktop): validate ports against the allowlist"

# 4. Push and open the PR against develop
git push -u origin feature/port-allowlist-validation
gh pr create --base develop --title "feat(desktop): validate ports against the allowlist" --body-file /tmp/pr-body.md

# 5. After the PR is merged, clean up
git switch develop
git pull --rebase
git branch -d feature/port-allowlist-validation
git push origin --delete feature/port-allowlist-validation
```

Keep the branch in sync while it is open. Rebase onto `develop` instead of merging `develop` into it — a linear history on the topic branch makes the diff reviewable, and the squash merge into `develop` keeps the integration branch linear too.

```bash
git fetch origin
git rebase origin/develop
git push --force-with-lease
```

## Release lifecycle

```bash
# 1. Branch the release line off develop
git switch develop
git pull --rebase
git switch -c release/1.2.0

# 2. Bump versions, update CHANGELOG, run the full verification
#    (see release-process.md for the exact files to touch)

# 3. Open the PR against main
git push -u origin release/1.2.0
gh pr create --base main --title "chore(release): 1.2.0" --body-file /tmp/pr-body.md

# 4. Merge with a merge commit so the release line stays traceable on main
gh pr merge <pr> --merge --delete-branch

# 5. Tag the merge commit on main
git switch main
git pull
git tag -a v1.2.0 -m "Release 1.2.0"
git push origin v1.2.0

# 6. Merge the release branch back into develop so develop contains the release commits
git switch develop
git merge --no-ff origin/main -m "chore(release): merge 1.2.0 back into develop"
git push origin develop

# 7. Clean up the release branch
git branch -d release/1.2.0
git push origin --delete release/1.2.0
```

If the release PR needed changes while it was open, those changes live in `release/1.2.0`. Merge the release branch into `develop` first, then rebase or recreate the release branch from the updated `develop` — do not hand-merge `main` into `develop` halfway through a release.

## Hotfix lifecycle

A hotfix is the only branch that starts from `main`, because it fixes something that is already released.

```bash
# 1. Branch from main
git switch main
git pull
git switch -c hotfix/session-token-expiry

# 2. Fix, commit, push
git commit -m "fix(agent): refresh the session token before expiry"
git push -u origin hotfix/session-token-expiry

# 3. PR against main
gh pr create --base main --title "fix(agent): refresh the session token before expiry" --body-file /tmp/pr-body.md
gh pr merge <pr> --merge --delete-branch

# 4. Tag the hotfix release
git switch main
git pull
git tag -a v1.2.1 -m "Release 1.2.1"
git push origin v1.2.1
gh release create v1.2.1 --title "v1.2.1" --notes-file /tmp/notes.md

# 5. Bring the fix back into develop - this step is mandatory
git switch develop
git merge --no-ff origin/main -m "chore(release): merge hotfix v1.2.1 back into develop"
git push origin develop

# 6. Clean up
git branch -d hotfix/session-token-expiry
git push origin --delete hotfix/session-token-expiry
```

If the hotfix is still in review when the next release is cut, either wait for it or cut the release from `develop` and re-cut it afterwards — never ship `main` without the fix while `develop` still lacks it, and never leave the two branches diverged without a plan.

## Merge rules

| Merge | Command | Why |
| :--- | :--- | :--- |
| Feature → `develop` | `gh pr merge <pr> --squash --delete-branch` | Keeps `develop` linear and readable; the branch's history is not needed once the work is integrated. |
| Release → `main` | `gh pr merge <pr> --merge --delete-branch` | A merge commit preserves the identity of the release line on `main`. |
| Hotfix → `main` | `gh pr merge <pr> --merge --delete-branch` | Same reason; the hotfix stays traceable on `main`. |
| Release/hotfix → `develop` | `git merge --no-ff origin/main -m "chore(release): ..."` | Keeps the release merge identifiable in `develop` history. |

Use `--no-ff` for merges back into `develop` even when a fast-forward would be possible, so the merge point is visible in `git log --graph`.

## Tag rules

- Tags are **annotated** (`git tag -a`), never lightweight: an annotated tag carries the author, date and message, which is what makes a release auditable.
- The tag name is `v` + the version from `package.json`: `v1.2.0`, `v1.2.1`. No build metadata, no separate patch tags for the same version.
- Tags point at the **merge commit on `main`**, never at a topic branch commit.
- Tags are immutable. If a release is wrong, cut `v1.2.1` — do not move `v1.2.0`.
- Tag and push in the same operation window as the merge so the tag never points at a commit that is not on `main`:

```bash
git tag -a v1.2.0 -m "Release 1.2.0" && git push origin v1.2.0
```

## Deleting branches

Delete a topic branch once its PR is merged — the work lives in `develop`/`main` and a stale branch is noise in `git branch -a`:

```bash
git branch -d feature/port-allowlist-validation          # local, safe (fails if not merged)
git push origin --delete feature/port-allowlist-validation
```

Never delete `main`, `develop` or a branch that still has an open PR.

## Recovering from mistakes

| Situation | Recovery |
| :--- | :--- |
| Committed on `develop` by mistake | `git reset --soft HEAD~1` (keeps the change staged), move it to a `feature/` branch, then rebase that branch on `develop`. |
| Committed to the wrong branch | `git branch feature/fix-name` (keeps the commits), then `git switch develop && git reset --hard origin/develop` only if you are certain the commits are preserved on the new branch. |
| Pushed a broken commit to a `feature/` branch | `git rebase -i origin/develop` to edit, then `git push --force-with-lease`. |
| Pushed a broken commit to `develop` | Do not force-push. Open a `fix` PR that reverts it. |
| Needed to undo a merged PR | `git revert -m 1 <merge-sha>` on `develop`, then open a PR with the revert. |
| Merged into `develop` before the PR was approved | `git revert` the merge commit and redo it through the PR flow. |

In every recovery case, the invariant is the same: **no history is rewritten on a shared branch**. If a case is not covered here, stop and ask before running anything destructive.
