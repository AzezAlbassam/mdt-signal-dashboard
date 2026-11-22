#!/usr/bin/env bash
# One update of the options data: run once a trading day by a scheduled Claude task, or by hand
# with extra arguments for snapshot.js (e.g. --add HOOD, --only MSTR, --resummarize):
#
#   VAULT_PASS=... options/daily.sh [snapshot.js arguments]
#
# The data lives sealed on the options-data branch (options/vault.js). MarketData's token is
# added to each request by the network the task runs in. The push goes only over the commit
# the run started from, so two runs can never overwrite each other. Exit 1 when the pass or the
# independent check failed; the data is pushed either way (it only adds flags).
set -uo pipefail
: "${VAULT_PASS:?VAULT_PASS is not set}"
repo=$(cd "$(dirname "$0")/.." && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
cd "$repo" || exit 1

git fetch -q origin options-data || { echo 'could not read the options-data branch'; exit 1; }
base=$(git rev-parse FETCH_HEAD)
git archive FETCH_HEAD | tar -x -C "$work" || exit 1
node options/vault.js open "$work" || exit 1

failed=0
node options/snapshot.js "$work" "$@" || failed=1
node options/validate.js "$work" --write || failed=1
node options/vault.js seal "$work" || exit 1

(
  cd "$work" && git init -q -b options-data && git add -A &&
    git -c user.name='options-data' -c user.email='options-data@users.noreply.github.com' commit -q -m "Options snapshot $(date -u +%FT%TZ)" &&
    git push -q --force-with-lease="options-data:${base}" "$(git -C "$repo" remote get-url origin)" options-data
) || { echo 'push refused: the options-data branch moved during this run; run again'; exit 1; }
echo 'options-data pushed; deploy the site (pages.yml) to publish it'
exit $failed
