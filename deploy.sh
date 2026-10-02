#!/bin/sh
# Nahraje hru na GitHub Pages (https://katzithebeast.github.io/poke-idle/).
# APK si novou verzi stáhne samo při dalším spuštění.
set -e
cd "$(dirname "$0")"
V="$(date '+%Y-%m-%d %H:%M') · $(git rev-parse --short HEAD)"
printf "// verze hry – přepisuje ji deploy.sh při každém nahrání na GitHub Pages\nvar GAME_VERSION = '%s';\n" "$V" > version.js
git add version.js
git commit -q -m "Verze $V" || true
git push -q origin main
echo "Nahráno: $V – na GitHub Pages bude za ~1 minutu."
