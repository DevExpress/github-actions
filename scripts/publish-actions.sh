#!/usr/bin/env bash
#
# Requires: bash, git. On Windows, run via Git Bash (bundled with Git for
# Windows) or WSL -- there is no native cmd.exe/PowerShell equivalent here.
#
# ⚠️ WARNING: the script mutates the CURRENT checkout's HEAD and index -- running
# it directly against your real checkout will detach HEAD and wipe your
# index. Test against a disposable clone instead:
#
#   git clone --local /path/to/this/repo /tmp/publish-test
#   cd /tmp/publish-test
#   pnpm install && pnpm dist
#   BRANCH=... ACTION_DIRS=... SHA=$(git rev-parse HEAD) GIT_USER_NAME=... GIT_USER_EMAIL=... ./scripts/publish-actions.sh
#
#   OR, to test uncommitted edits to this script itself, run /path/to/this/repo/scripts/publish-actions.sh instead
#
# The clone's origin is your real repo, so the push lands release-actions
# there, never on GitHub:
#
#   git -C /path/to/this/repo log release-actions
#   git -C /path/to/this/repo branch -D release-actions   # clean up
#   rm -rf /tmp/publish-test

set -euo pipefail

git fetch origin "$BRANCH:refs/heads/$BRANCH" || true
git symbolic-ref HEAD "refs/heads/$BRANCH"
git reset

# -f: these paths are gitignored on main (they're pure build output there),
# but they must still be staged for the $BRANCH branch.
git add -A -f -- $ACTION_DIRS

if git diff --cached --quiet; then
  echo "No changes to publish."
  exit 0
fi

git config user.name "$GIT_USER_NAME"
git config user.email "$GIT_USER_EMAIL"

# $SHA must already be a resolved commit hash, not a ref like "HEAD" --
# by now HEAD has been switched to $BRANCH via symbolic-ref above.
git commit -m "publish: $(git log -1 --format=%s "$SHA")"
git push origin "$BRANCH"
