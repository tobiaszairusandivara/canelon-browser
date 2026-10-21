# Pull Request Workflow

## Contents

- [Before you open a PR](#before-you-open-a-pr)
- [Choosing a template](#choosing-a-template)
- [Writing the PR](#writing-the-pr)
- [Opening the PR with gh](#opening-the-pr-with-gh)
- [Review](#review)
- [Merging](#merging)
- [After the merge](#after-the-merge)
- [PR titles](#pr-titles)
- [Common failures](#common-failures)

---

## Before you open a PR

A PR that is not ready wastes a reviewer's time. Check these first:

```bash
git status --short --branch        # nothing uncommitted, branch is up to date with origin
git log --oneline origin/develop..HEAD   # exactly the commits you intend to ship
git diff origin/develop...HEAD --stat    # the scope of the change
```

Then verify locally:

- The change builds (`npm run build`).
- Lint and typecheck pass (`npm run lint`).
- Tests pass, including the ones you added (`npm run test`).
- New behaviour is covered by a test. A bug fix without a regression test will be sent back.

## Choosing a template

Templates live in `.github/PULL_REQUEST_TEMPLATE/`. Use the one that matches the intent, and copy its section structure into the PR body.

| Intent | Template | Base branch | Merge strategy |
| :--- | :--- | :--- | :--- |
| New feature | `feature-template.md` | `develop` | Squash |
| Bug fix | `bugfix-template.md` | `develop` | Squash |
| Refactoring | `refactoring-template.md` | `develop` | Squash |
| Documentation | `documentation-template.md` | `develop` | Squash |
| UI/UX improvement | `ui-ux-improvement-template.md` | `develop` | Squash |
| Security patch | `security-patch-template.md` | `develop` | Squash |
| Hotfix | `hotfix-template.md` | `main` | Merge commit |
| Release | *(no template — use the release checklist)* | `main` | Merge commit |

If a change is a hotfix **and** a bug fix, it is a hotfix: it targets `main` and uses the hotfix template.

## Writing the PR

Fill every section of the chosen template. The sections that get skipped are the ones that block the review:

- **Description** — what changed and why. Link the issue (`Closes #123`).
- **Implementation details** — the approach and the decisions you made, especially the ones a reviewer would question.
- **Impact** — behaviour changes, new dependencies, performance, migration needs.
- **Testing conducted** — the exact commands you ran and what they covered. "Works locally" is not a test plan; "Added unit tests for the allowlist matcher, ran `npm run test`" is.
- **Checklist** — every box ticked, honestly. If a box cannot be ticked, say which one and why.

Screenshots or a short recording make UI changes reviewable in one pass instead of three.

## Opening the PR with gh

Write the body to a file first — it keeps the markdown readable and makes it re-usable if the push is rejected:

```bash
cat > /tmp/pr-body.md <<'EOF'
## Description

The embedded browser accepted any port in the `Host` header, which let a
malicious page in the IDE reach services that were supposed to be
internal-only.

Closes #142

## Implementation details

- Ports are matched against the allowlist before the request is forwarded.
- A mismatch closes the connection instead of returning an error page.

## Impact

Behaviour change only. No new dependencies.

## Testing

- `npm run test` (unit tests for the allowlist matcher)
- `npm run lint`
- Manual: requested a blocked port from inside the IDE container.

## Checklist

- [x] My code adheres to the coding and style guidelines of the project.
- [x] I have performed a self-review of my own code.
- [x] My changes generate no new warnings
EOF
```

Then:

```bash
git push -u origin feature/port-allowlist-validation
gh pr create \
  --base develop \
  --title "feat(desktop): validate ports against the allowlist" \
  --body-file /tmp/pr-body.md
```

Useful flags:

- `--draft` — open it for early feedback without requesting a review.
- `--reviewer <user>` — request a specific reviewer.
- `--label <name>` — apply labels.
- `--milestone <name>` — attach it to a milestone.
- `--fill` — use the commit message as title and body when the template is not needed.

To update an existing PR after pushing more commits:

```bash
gh pr edit <pr> --body-file /tmp/pr-body.md
gh pr comment <pr> --body "Pushed the allowlist matcher fix; unit tests now cover the IPv6 case."
```

## Review

As a reviewer:

```bash
gh pr list --base develop --state open
gh pr view <pr>
gh pr diff <pr>
gh pr checks <pr>
gh pr review <pr> --approve
gh pr review <pr> --request-changes --body "The token refresh still fires at 75% of the TTL; see the comment on the trigger condition."
```

As an author, respond to every comment, either with a code change or with an explicit reason for keeping it as is. A resolved conversation is marked with `gh pr review` or in the GitHub UI; unresolved conversations keep the PR in "changes requested" state.

Update the branch when the reviewer asks for changes:

```bash
git add <paths>
git commit -m "fix(desktop): reject IPv6 literals in the allowlist"
git push                                   # the PR picks it up automatically
```

Do not force-push a branch that a reviewer has already started reviewing unless the rebase is trivial — the reviewer has to re-read the diff.

## Merging

```bash
gh pr checks <pr>                       # required checks green?
gh pr merge <pr> --squash --delete-branch        # feature PR -> develop
gh pr merge <pr> --merge  --delete-branch        # release / hotfix PR -> main
```

Rules:

- Never merge with failing required checks.
- Never use `--admin` to bypass branch protection unless the user explicitly confirms the risk in writing.
- Use `--squash` for feature PRs: the branch history is already in the PR, and `develop` stays linear.
- Use `--merge` for release and hotfix PRs so the release line stays identifiable on `main`.
- After a squash merge, the commit subject on `develop` becomes the PR title — that is why the PR title must follow the Conventional Commit format.

## After the merge

```bash
git switch develop
git pull --rebase
git branch -d feature/port-allowlist-validation
git push origin --delete feature/port-allowlist-validation
```

Delete the branch as soon as it is merged. An open branch is a request for review; a merged branch left behind is noise.

## PR titles

The PR title becomes the commit message on `develop` after a squash merge, so it follows the same rules:

```text
<type>(<optional scope>): <description>
```

```text
feat(desktop): validate ports against the allowlist
fix(agent): refresh the session token before expiry
chore(release): 1.2.0
```

Do not prefix the title with `[WIP]`, `PR` or the ticket number — the type carries that information, and issue numbers belong in the body footer.

## Common failures

| Symptom | Cause | Fix |
| :--- | :--- | :--- |
| PR shows the wrong diff | Base branch is wrong, or the branch was created from `main` | Recreate the branch from `develop`, or change the base with `gh pr edit <pr> --base develop`. |
| "No commits between main and develop" | Branch created from the wrong base | `git rebase --onto origin/develop origin/main feature/<slug>` |
| Merge conflict in the PR | `develop` moved | `git fetch origin && git rebase origin/develop && git push --force-with-lease` |
| Checks never start | The workflow only runs on `develop` and `main` | Push the branch and open the PR; CI runs on the PR once it exists. |
| PR body is a wall of text | Template not used | Rewrite using the matching template from `.github/PULL_REQUEST_TEMPLATE/`. |
| Reviewer says "commits are messy" | Non-atomic commits | `git rebase -i origin/develop` and split the commits. |
