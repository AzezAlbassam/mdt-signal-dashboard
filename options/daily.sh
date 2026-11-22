#!/usr/bin/env bash
# One update of the options data: run twice a day by a scheduled Claude task, or by hand with
# extra arguments for snapshot.js (e.g. --add HOOD, --only MSTR, --resummarize):
#
#   VAULT_PASS=... options/daily.sh [snapshot.js arguments]
#
# The data lives sealed on the options-data branch (options/vault.js). MarketData's token is
# added to each request by the network the task runs in. When the pass changes nothing (every
# ticker already has the newest session), nothing is checked, sealed or pushed. The push goes
# only over the commit the run started from, so two runs can never overwrite each other. Exit 1
# when the pass or the independent check failed; the data is pushed either way (it only adds
# flags). The last line says what happened: "options-data pushed" means deploy the site.
set -uo pipefail
: "${VAULT_PASS:?VAULT_PASS is not set}"
export NODE_NO_WARNINGS=1 # Node's notice that its proxy support is experimental, on every step
# git has no time-out of its own: a transfer that stalls for a minute gives up (a failed try)
# instead of holding the run past the scheduled session's limit.
export GIT_HTTP_LOW_SPEED_LIMIT=1 GIT_HTTP_LOW_SPEED_TIME=60
repo=$(cd "$(dirname "$0")/.." && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
work=$tmp/data
mkdir "$work" || exit 1
cd "$repo" || exit 1

git fetch -q origin options-data || { echo 'could not read the options-data branch'; exit 1; }
base=$(git rev-parse FETCH_HEAD)
url=$(git remote get-url origin)
git archive FETCH_HEAD | tar -x -C "$work" || exit 1
node options/vault.js open "$work" || exit 1
cp "$work/index.json" "$tmp/index.before" 2>/dev/null

failed=0
node options/snapshot.js "$work" "$@" || failed=1
if cmp -s "$tmp/index.before" "$work/index.json"; then
  echo 'nothing new: options-data not pushed'
  exit $failed
fi
node options/validate.js "$work" --write || failed=1
node options/vault.js seal "$work" || exit 1

{ git -C "$work" init -q -b options-data && git -C "$work" add -A &&
  git -C "$work" -c user.name='options-data' -c user.email='options-data@users.noreply.github.com' commit -q -m "Options snapshot $(date -u +%FT%TZ)"; } ||
  { echo 'could not commit the data'; exit 1; }
commit=$(git -C "$work" rev-parse HEAD)
# A fresh repository has nothing in common with the remote, so there is nothing to negotiate
# (negotiating failed on GitHub: "expected 'acknowledgments', received 'packfile'").
for try in 1 2 3; do
  if git -C "$work" -c push.negotiate=false push -q --force-with-lease="options-data:$base" "$url" options-data; then
    echo 'options-data pushed; deploy the site (pages.yml) to publish it'
    exit $failed
  fi
  # A refused lease and a dropped connection look alike: ask where the branch is now.
  seen=0
  if remote=$(git ls-remote "$url" refs/heads/options-data); then
    seen=1
    remote=${remote%%$'\t'*}
    if [ "$remote" = "$commit" ]; then # it went through; only the answer was lost
      echo 'options-data pushed; deploy the site (pages.yml) to publish it'
      exit $failed
    fi
    [ "$remote" != "$base" ] && { echo 'push refused: the options-data branch moved during this run; run again'; exit 1; }
  fi
  [ "$try" -lt 3 ] && sleep $((try * 20))
done
# Only say the branch did not move when it was read back: a push can land and lose its answer.
[ "$seen" = 1 ] && echo 'push failed (network or access); the branch did not move' ||
  echo 'push failed (network): the options-data branch could not be read back; deploy the site (pages.yml) in case it landed'
exit 1
