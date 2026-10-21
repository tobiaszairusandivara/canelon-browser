#!/usr/bin/env bash
#
# install-commit-hook.sh - installs the Conventional Commit commit-msg hook locally.
#
# The hook is local by design: it never touches the remote repository and it is
# installed per clone, so every collaborator gets it with one command.
#
# Usage:
#   bash .agents/skills/git-workflow/scripts/install-commit-hook.sh
#
# Options:
#   --force   overwrite an existing commit-msg hook without asking
#   --check   only report what is currently installed
#   --uninstall  remove a hook previously installed by this script

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_HOOK="$SCRIPT_DIR/commit-msg"

FORCE=0
CHECK_ONLY=0
UNINSTALL=0

for arg in "$@"; do
  case "$arg" in
    --force) FORCE=1 ;;
    --check) CHECK_ONLY=1 ;;
    --uninstall) UNINSTALL=1 ;;
    -h|--help)
      sed -n '3,17p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "unknown option: $arg" >&2
      exit 1
      ;;
  esac
done

if ! git rev-parse --git-dir >/dev/null 2>&1; then
  echo "error: not inside a git repository" >&2
  exit 1
fi

HOOKS_DIR="$(git rev-parse --git-path hooks)"
HOOK_TARGET="$HOOKS_DIR/commit-msg"
MARKER="# Installed by .agents/skills/git-workflow/scripts/install-commit-hook.sh"

if [[ "$UNINSTALL" == "1" ]]; then
  if [[ -f "$HOOK_TARGET" ]] && grep -qF "$MARKER" "$HOOK_TARGET"; then
    rm -f "$HOOK_TARGET"
    echo "commit-msg hook removed."
  else
    echo "no hook installed by this script; nothing to remove."
  fi
  exit 0
fi

if [[ "$CHECK_ONLY" == "1" ]]; then
  if [[ -f "$HOOK_TARGET" ]] && grep -qF "$MARKER" "$HOOK_TARGET"; then
    echo "commit-msg hook: installed ($HOOK_TARGET)"
  else
    echo "commit-msg hook: not installed"
  fi
  exit 0
fi

# git-conventional-commits provides a stricter, dependency-backed validator.
if command -v git-conventional-commits >/dev/null 2>&1; then
  echo "note: git-conventional-commits is installed on this machine."
  echo "      it can validate the full message and generate changelogs."
fi

if [[ -e "$HOOK_TARGET" ]]; then
  if grep -qF "$MARKER" "$HOOK_TARGET"; then
    echo "commit-msg hook already installed; refreshing it."
  elif [[ "$FORCE" == "1" ]]; then
    cp "$HOOK_TARGET" "$HOOK_TARGET.bak"
    echo "existing hook backed up to $HOOK_TARGET.bak"
  else
    echo "error: a commit-msg hook already exists at $HOOK_TARGET" >&2
    echo "       re-run with --force to back it up and replace it." >&2
    exit 1
  fi
fi

mkdir -p "$HOOKS_DIR"
cp "$SOURCE_HOOK" "$HOOK_TARGET"
chmod +x "$HOOK_TARGET"

# Keep the marker in the installed copy so --check/--uninstall can identify it.
printf '\n%s\n' "$MARKER" >>"$HOOK_TARGET"

echo "commit-msg hook installed at $HOOK_TARGET"
echo "Test it with:"
echo "  git commit --allow-empty -m 'bad header'   # must be rejected"
echo "  git commit --allow-empty -m 'feat(core): add the port matcher'   # must pass"
