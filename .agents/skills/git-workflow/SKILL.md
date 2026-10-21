---
name: git-workflow
description: Run this repository's full GitFlow workflow - Conventional Commits, feature/release/hotfix branch lifecycles, PR creation with gh and the correct .github template, semver bumps, annotated tags and GitHub releases. Use it whenever the user asks to commit, create a branch, push, open or review a PR, merge, cut a release, tag a version, cherry-pick a hotfix, or mentions conventional commits, git flow, release branches, hotfixes, changelogs or version bumps - even when they never say "git-workflow" or "git flow" by name.
license: MIT
compatibility: opencode, git, gh (GitHub CLI)
metadata:
  audience: contributors
  workflow: github
  opencode/slash: "true"
---

# Git Workflow (GitFlow + Conventional Commits)

This skill is the single source of truth for how git work happens in `canelon-browser`. It encodes the branching model, the commit format, the PR contract and the release process so that every change lands the same way regardless of who (or which agent) performs it.

**Load the reference file for the phase you are in.** Each phase has its own reference with the exact commands; the table below tells you which one to read.

| Phase | Reference | Read it when |
| :--- | :--- | :--- |
| Branch lifecycle, ancestry, merge rules | `references/branching-model.md` | Creating a branch, deciding where it branches from or merges back, or resolving "which base?" |
| Commit message format, scopes, hook | `references/commit-conventions.md` | Writing a commit message, installing the `commit-msg` hook, or marking a breaking change |
| PR creation, templates, review, merge | `references/pr-workflow.md` | Opening a PR, picking a template, reviewing, or merging |
| Version bump, changelog, tag, GitHub release | `references/release-process.md` | Cutting a release, tagging a version, or writing release notes |

---

## Repository facts

- **Remote:** `origin` → `https://github.com/tobiaszairusandivara/canelon-browser.git` (private, default branch `main`).
- **Long-lived branches:** `main` (released, production) and `develop` (integration branch, the default target of every PR).
- **PR templates:** `.github/PULL_REQUEST_TEMPLATE.md` plus per-type templates in `.github/PULL_REQUEST_TEMPLATE/` (`feature`, `bugfix`, `hotfix`, `refactoring`, `documentation`, `security-patch`, `ui-ux-improvement`).
- **Commit format reference:** `.github/CONVENTIONAL_COMMITS_CHEATSHEET.md` is the normative source for types, scopes and versioning rules.
- **Tooling:** `gh` CLI is authenticated for this repository, so PRs, reviews, releases and tags can be driven end to end without leaving the terminal.

---

## Hard rules

These are the mistakes that cost the team the most time. They are not style preferences.

1. **Never push directly to `main` or `develop`.** Both are protected by convention: `main` only receives release and hotfix merges, `develop` only receives squashed feature PRs. If a user asks you to push straight to `develop`, treat it as a request to open a PR instead and say why.
2. **Never `git push --force` to a shared branch** (`main`, `develop`, `release/*`, `hotfix/*`). Only force-push a `feature/*` branch that nobody else has checked out, and even then prefer `--force-with-lease`.
3. **Never `git commit --amend` a commit that is already pushed.** The history is shared; rewriting it silently breaks other people's clones. If the change needs correcting, make a new commit.
4. **Never commit secrets.** No `.env` with real values, no tokens, no private keys. The session token and the Ed25519 device key are handled by `safeStorage` at runtime and must never enter the repo or a commit message.
5. **Never merge without a green PR.** Check `gh pr checks` before merging; if a required check is pending or failing, say so instead of forcing the merge.
6. **Do not run `git push` without being asked.** Prepare the commit and the branch, then report the exact push command you propose.
7. **Do not rewrite published history.** No rebasing `develop`, no deleting tags, no force-updating `main`. If the user explicitly asks for a history rewrite, spell out the blast radius (every collaborator must re-clone or hard-reset) and get an explicit confirmation first.

---

## Decide what to do next

```text
Uncommitted changes exist?
├─ yes → commit (Phase 2) → then continue
└─ no  → the change is already committed; what is the goal?
    ├─ "ship it"            → feature/hotfix/release flow (Phases 3-6)
    ├─ "open a PR"          → Phase 4
    ├─ "cut a release"      → Phase 6
    └─ "review / merge"     → Phase 5
```

If the working tree is dirty when the user asks for something else, do not sweep the unrelated changes into the new commit. Stage deliberately (`git add <path>`), or ask.

---

## Phase 1 - Prepare the working tree

```bash
git status --short --branch     # what changed, which branch, is it ahead/behind
git fetch --prune               # refresh remote-tracking refs, drop deleted branches
git log --oneline -10           # match the repo's existing message style
```

Rules for this phase:

- If the branch is behind `origin/develop`, rebase onto it **before** adding commits: `git rebase origin/develop`. A stale base is the most common cause of a painful merge later.
- If you rebased a branch that was already pushed, push with `--force-with-lease` (still a `feature/*` branch only).
- Never `git pull` blindly on `develop`; use `git pull --rebase` there.

## Phase 2 - Commit

The commit is the permanent record of a change, so it is written to be read six months from now by someone who has no context.

```bash
git add <explicit paths>        # never `git add .` on a tree with unrelated changes
git commit -m "feat(desktop): add port allowlist validation" -m "Why the change was needed..."
```

Format: `<type>(<optional scope>): <description>` — see `references/commit-conventions.md` for the full type list, the project scope list, the breaking-change marker and the header regex used by the local hook.

Short version of the rules:

- **Type** is one of `feat`, `fix`, `refactor`, `perf`, `style`, `test`, `docs`, `build`, `ops`, `chore`.
- **Scope** is optional and names the area of the codebase (for example `desktop`, `core`, `contracts`, `agent`, `mock-server`, `docker`).
- **Description** is imperative, present tense, lowercase, no trailing period: `add port allowlist validation`, not `Added port allowlist validation.`
- **Body** explains *why*, not *what* — the diff already shows what.
- **Breaking changes** need a `!` before the colon **and** a `BREAKING CHANGE:` footer.

One logical change per commit. A commit that fixes a bug and reformats a file is two commits; splitting them keeps the history bisectable and makes the revert of either half trivial.

Install the local `commit-msg` hook once per clone so the format is enforced mechanically instead of by memory:

```bash
bash .agents/skills/git-workflow/scripts/install-commit-hook.sh
```

## Phase 3 - Branch

The branch type determines the base, the merge target and the merge strategy.

| Intent | Branch | Base | Merges into | Merge strategy |
| :--- | :--- | :--- | :--- | :--- |
| New feature / fix / refactor | `feature/<slug>` | `develop` | `develop` | Squash |
| Preparing a release | `release/<version>` | `develop` | `main` **and** `develop` | Merge commit |
| Critical fix in production | `hotfix/<slug>` | `main` | `main` **and** `develop` | Merge commit |

```bash
git switch develop
git pull --rebase
git switch -c feature/port-allowlist-validation
```

Slugs are short, lowercase and hyphenated: `feature/port-allowlist-validation`, `hotfix/token-refresh-race`. Keep branches alive only as long as the work takes; delete the local and remote branch right after the merge.

Details and the exact command for every transition (including "release already cut and a fix landed" and the cherry-pick back into `develop`) are in `references/branching-model.md`.

## Phase 4 - Push and open the PR

```bash
git push -u origin feature/port-allowlist-validation
gh pr create --base develop --title "feat(desktop): validate port allowlist" --body-file <body>
```

- The PR title follows the same Conventional Commit header as the branch's commits.
- The base is `develop` for features, `main` for hotfixes.
- Pick the matching template from `.github/PULL_REQUEST_TEMPLATE/` and fill every section: description, testing performed, impact, and the template checklist. A PR with an empty "Testing" section will be sent back.
- Link the issue with `Closes #123` in the body when one exists.

Full command reference, template selection table and review checklist: `references/pr-workflow.md`.

## Phase 5 - Review and merge

```bash
gh pr checks <pr>              # all required checks green?
gh pr review <pr> --approve    # if you are asked to review
gh pr merge <pr> --squash --delete-branch   # feature PR
gh pr merge <pr> --merge  --delete-branch   # release / hotfix PR
```

Never merge a PR that has failing required checks, and never use `--admin` to bypass protection unless the user explicitly confirms the risk.

## Phase 6 - Release (only when the user asks for a release)

```bash
git switch release/1.2.0        # from develop
# bump versions + changelog + tests green
git commit -m "chore(release): prepare 1.2.0"
git push
gh pr create --base main --title "chore(release): 1.2.0" --body-file <body>
gh pr merge <pr> --merge --delete-branch
git tag -a v1.2.0 -m "Release 1.2.0"
git push origin v1.2.0
gh release create v1.2.0 --title "v1.2.0" --notes-file <notes>
# then merge the release branch back into develop and delete it
```

The semver decision (major / minor / patch) comes from the commit types that landed since the last tag, exactly as described in `.github/CONVENTIONAL_COMMITS_CHEATSHEET.md`. The full checklist — version bumps across workspaces, changelog format, annotated tag, GitHub release notes and the merge-back into `develop` — is in `references/release-process.md`.

## Phase 7 - Hotfix (production emergency)

```bash
git switch main
git pull
git switch -c hotfix/session-token-expiry
# fix + commit: fix(agent): refresh session token before expiry
gh pr create --base main --title "fix(agent): refresh session token before expiry" --body-file <body>
gh pr merge <pr> --merge --delete-branch
git tag -a v1.2.1 -m "Release 1.2.1"
git push origin v1.2.1
# bring the fix back into develop
git switch develop && git merge --no-ff origin/main
```

A hotfix is not complete until the same fix is in `develop`; otherwise the next release re-introduces the bug. Details in `references/branching-model.md`.

---

## Reporting back

After each phase, tell the user what changed and what the next command would be. Concrete beats reassuring: name the branch, name the commit subject, show the PR URL, and state which checks are still pending. If a step was skipped or blocked, say so explicitly rather than implying the workflow finished.
