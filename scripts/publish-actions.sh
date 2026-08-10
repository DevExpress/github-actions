#!/usr/bin/env bash
#
# Requires: bash, git. On Windows, run via Git Bash (bundled with Git for
# Windows) or WSL -- there is no native cmd.exe/PowerShell equivalent here.
#
# Publishes into a separate worktree (a lightweight checkout of $BRANCH)
#
# ⚠️ WARNING: it runs `git push`, so test against a disposable clone
# before running it for real -- the push would otherwise land on your
# actual origin remote:
#
#   git clone --local /path/to/this/repo /tmp/publish-test
#   cd /tmp/publish-test
#   pnpm install && pnpm dist
#   BRANCH=... ACTION_DIRS=... WORKFLOW_FILES=... TAGS=... SHA=$(git rev-parse HEAD) GIT_USER_NAME=... GIT_USER_EMAIL=... ./scripts/publish-actions.sh
#
# Or, to test uncommitted edits to this script itself, run /path/to/this/repo/scripts/publish-actions.sh instead
#
# The clone's origin is your real repo, so the push lands release
# there, never on GitHub.

set -euo pipefail

WORKTREE="$(mktemp -d)"
trap 'git worktree remove --force "$WORKTREE" 2>/dev/null || rm -rf "$WORKTREE"' EXIT

git fetch origin "$BRANCH:refs/heads/$BRANCH" 2>/dev/null || true

if git show-ref --verify --quiet "refs/heads/$BRANCH"; then
  git worktree add "$WORKTREE" "$BRANCH"
else
  git worktree add --orphan -b "$BRANCH" "$WORKTREE"
fi

# Copy each built action into place, replacing whatever was there before.
for name in $ACTION_DIRS; do
  rm -rf "$WORKTREE/$name"
  cp -r "$name" "$WORKTREE/$name"
done

# Reusable workflows must live at .github/workflows/<file> on GitHub
mkdir -p "$WORKTREE/.github/workflows"
for file in $WORKFLOW_FILES; do
  cp "$file" "$WORKTREE/.github/workflows/$file"
done

cd "$WORKTREE"
git add -A

if git diff --cached --quiet; then
  echo "No changes to publish."
  exit 0
fi

# $SHA must already be a resolved commit hash, not a ref like "HEAD"
git -c user.name="$GIT_USER_NAME" -c user.email="$GIT_USER_EMAIL" commit -m "publish: $(git log -1 --format=%s "$SHA")"
git push origin "$BRANCH"

# An empty $TAGS would otherwise turn `git push origin --force $TAGS` into
# `git push origin --force` with no refspec, which defaults to force-pushing
# the current branch -- guard on whether $TAGS actually has any entries.
set -- $TAGS
if [ "$#" -gt 0 ]; then
  for tag in "$@"; do
    git -c tag.gpgsign=false -c tag.forceSignAnnotated=false tag -f "$tag" HEAD
  done
  git push origin --force -- "$@"
fi
