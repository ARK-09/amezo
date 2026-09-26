#!/usr/bin/env bash
#
# Vercel "Ignored Build Step".
#
# Exit 0  -> skip the build.
# Exit 1  -> go ahead and build.
# (That is Vercel's convention, and it reads backwards from a normal script.)
#
# Two reasons to skip: the commit is not on main, or it did not touch the
# frontend. The backend deploys from render.yaml and the docs deploy nowhere, so
# a backend-only or docs-only commit has nothing for Vercel to rebuild.
#
# Wire it up in Project Settings -> Git -> Ignored Build Step as:
#     bash ../scripts/vercel-ignore-build.sh
# ...when the project's Root Directory is `frontend` (which it is - vercel.json
# lives there), or `bash scripts/vercel-ignore-build.sh` if that ever changes to
# the repository root.

# Run from the repository root whatever directory Vercel invoked this in. The
# path filter below is resolved against the current directory, so from `frontend`
# a bare `-- frontend/` would match nothing, report "no changes" and silently skip
# every build - including the ones that matter.
cd "$(git rev-parse --show-toplevel)" || exit 1

if [ "$VERCEL_GIT_COMMIT_REF" != "main" ]; then
  exit 0
fi

# On a shallow clone with a single commit HEAD^ does not resolve; git then exits
# non-zero, this test is false, and the build goes ahead. Building when we cannot
# tell is the right way round to be wrong.
if git diff HEAD^ HEAD --quiet -- frontend/; then
  exit 0
else
  exit 1
fi
