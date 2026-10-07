#!/usr/bin/env bash
# Tests every way the app can pull Reddit data, from a GitHub Actions runner.
#
# Runners have datacenter IPs, which Reddit treats worse than home
# connections, so the "direct" rows here are pessimistic. The proxy rows are
# representative, because the public proxies run in datacenters too.
set -u

UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
ORIGIN='https://nkiryakov.github.io'
SUMMARY="${GITHUB_STEP_SUMMARY:-/dev/null}"
WORK=$(mktemp -d)

# label|url|kind
FEEDS=(
  "JSON (raw_json)|https://www.reddit.com/r/all/hot.json?limit=10&raw_json=1|json"
  "JSON (plain)|https://www.reddit.com/r/all/hot.json?limit=10|json"
  "JSONP|https://www.reddit.com/r/all/hot.json?limit=10&jsonp=probeCb|jsonp"
  "RSS|https://www.reddit.com/r/all/hot/.rss?limit=10|rss"
  "old.reddit JSON|https://old.reddit.com/r/all/hot.json?limit=10|json"
  "old.reddit RSS|https://old.reddit.com/r/all/hot/.rss?limit=10|rss"
)
VIAS=(direct corsproxy.io allorigins codetabs)

wrap() {
  local encoded
  encoded=$(jq -rn --arg u "$2" '$u|@uri')
  case "$1" in
    direct) echo "$2" ;;
    corsproxy.io) echo "https://corsproxy.io/?url=$encoded" ;;
    allorigins) echo "https://api.allorigins.win/raw?url=$encoded" ;;
    codetabs) echo "https://api.codetabs.com/v1/proxy/?quest=$encoded" ;;
  esac
}

header() { grep -i "^$1:" "$WORK/head" | tail -1 | cut -d' ' -f2- | tr -d '\r' | cut -d';' -f1; }

row() { echo "$1" | tee -a "$SUMMARY"; }

row "| Format | Via | HTTP | CORS header | Content-Type | Rate limit left | Result | Time | First bytes |"
row "|---|---|---|---|---|---|---|---|---|"

for feed in "${FEEDS[@]}"; do
  IFS='|' read -r label url kind <<<"$feed"
  for via in "${VIAS[@]}"; do
    : >"$WORK/body"
    : >"$WORK/head"
    if out=$(curl -sS -m 20 -A "$UA" -H "Origin: $ORIGIN" -H 'Accept: */*' \
      -D "$WORK/head" -o "$WORK/body" -w '%{http_code} %{time_total}' "$(wrap "$via" "$url")" 2>"$WORK/err"); then
      code=${out%% *}
      secs=${out#* }
    else
      code="ERR"
      secs="-"
    fi

    case "$kind" in
      json) result=$(jq -r 'if (.data.children | type) == "array" then "\(.data.children | length) posts" else "JSON, not a listing" end' "$WORK/body" 2>/dev/null || echo "not JSON") ;;
      jsonp) if head -c 200 "$WORK/body" | grep -q 'probeCb('; then result="callback works"; else result="no callback"; fi ;;
      rss) result="$(grep -o '<entry>' "$WORK/body" | wc -l | tr -d ' ') entries" ;;
    esac
    [ "$code" = "ERR" ] && result="$(head -c 60 "$WORK/err" | tr '\n|' '  ')"

    first=$(head -c 70 "$WORK/body" | tr -d '\r' | tr '\n|`' '   ')
    cors=$(header access-control-allow-origin)
    ctype=$(header content-type)
    remaining=$(header x-ratelimit-remaining)
    row "| $label | $via | $code | ${cors:--} | ${ctype:--} | ${remaining:--} | ${result:-empty} | ${secs}s | \`${first:- }\` |"
    sleep 2
  done
done
