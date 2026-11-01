#!/usr/bin/env bash
# Ajaa mcp-doctorin kaksi demoa perakkain nauhoitusta varten.
# Ei verkkoa, ei ulkoisia MCP-palvelimia: vain repon oma dist/bin.js
# ja examples/demo/-palvelimet.
# Kaytto: scripts/demo-nauhoitus.sh [tauko_sekunteina]   (oletus 4)
# Katso docs/demo-nauhoitus.md.
set -u

TAUKO="${1:-${DEMO_TAUKO:-4}}"
case "$TAUKO" in
  ''|*[!0-9]*) echo "Tauon pitaa olla kokonaisluku sekunteja." >&2; exit 2 ;;
esac

cd "$(dirname "$0")/.." || exit 2

if [ ! -f dist/bin.js ]; then
  echo "dist/bin.js puuttuu. Aja ensin: npm ci" >&2
  exit 2
fi

otsikko() {
  printf '\n'
  printf '=%.0s' $(seq 1 60); printf '\n'
  printf '  %s\n' "$1"
  printf '=%.0s' $(seq 1 60); printf '\n\n'
}

ajo() {
  # $1 = npm-skripti. --silent piilottaa npm:n oman virheilmoituksen,
  # kun mcp-doctor palauttaa odotetusti koodin 1.
  printf '$ npm run %s\n' "$1"
  npm run --silent "$1"
  koodi=$?
  printf '\n[poistumiskoodi: %s]\n' "$koodi"
}

clear 2>/dev/null || true
otsikko "1/2  ENNEN: palvelin vastaa kattelyyn, mutta on rikki"
sleep 2
ajo demo:ennen
sleep "$TAUKO"

otsikko "2/2  JALKEEN: sama palvelin korjattuna"
sleep 2
ajo demo:jalkeen
sleep "$TAUKO"
