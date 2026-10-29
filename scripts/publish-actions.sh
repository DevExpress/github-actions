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
#   pnpm install --frozen-lockfile && pnpm dist
#   BRANCH=... ACTION_DIRS=... WORKFLOW_FILES=... TAGS=... SHA=$(git rev-parse HEAD) ./scripts/publish-actions.sh
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

# Remove every published action, so ones dropped from $ACTION_DIRS don't linger.
find "$WORKTREE" -mindepth 1 -maxdepth 1 -type d ! -name .git ! -name .github -exec rm -rf {} +

# Copy each built action into place.
for name in $ACTION_DIRS; do
  cp -r "$name" "$WORKTREE/$name"
done

# Reusable workflows must live at .github/workflows/<file> on GitHub
mkdir -p "$WORKTREE/.github/workflows"
for file in $WORKFLOW_FILES; do
  cp "$file" "$WORKTREE/.github/workflows/$file"
done

cd "$WORKTREE"
git add -A

# Every publish ends with a pin commit, so compare with the commit before it
if git diff --cached --quiet HEAD~1; then
  echo "No changes to publish."
  exit 0
fi

# $SHA must already be a resolved commit hash, not a ref like "HEAD".
# Publish commits keep the author and committer of the commit they publish.
commit() {
  git -c user.name="$(git log -1 --format=%cn "$SHA")" -c user.email="$(git log -1 --format=%ce "$SHA")" commit -a --author="$(git log -1 --format='%an <%ae>' "$SHA")" -m "$1"
}
commit "${MESSAGE:-$(git log -1 --format=%s "$SHA")}"

# Pin our actions in the workflows to the commit just made: some repositories accept only full-length commit SHAs.
ACTIONS_SHA=$(git rev-parse HEAD)
for file in $WORKFLOW_FILES; do
  sed "s|\(uses: DevExpress/github-actions/[^@]*\)@release|\1@$ACTIONS_SHA # release|" ".github/workflows/$file" > "$file.tmp" && mv "$file.tmp" ".github/workflows/$file"
done
commit "pin actions to ${ACTIONS_SHA:0:7}"

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
