#!/bin/sh
# Nahraje hru na GitHub Pages (https://katzithebeast.github.io/poke-idle/).
# APK si novou verzi stáhne samo při dalším spuštění.
set -e
cd "$(dirname "$0")"
V="$(date '+%Y-%m-%d %H:%M') · $(git rev-parse --short HEAD)"
printf "// verze hry – přepisuje ji deploy.sh při každém nahrání na GitHub Pages\nvar GAME_VERSION = '%s';\n" "$V" > version.js
python3 - "$V" <<'PY'
import re, sys, hashlib
v = hashlib.md5(sys.argv[1].encode()).hexdigest()[:8]
s = open('index.html').read()
s = re.sub(r'((?:src|href)="(?!https?:)[^"?]+\.(?:js|css))(\?v=[0-9a-f]+)?"', lambda m: m.group(1) + '?v=' + v + '"', s)
open('index.html', 'w').write(s)
PY
git add version.js index.html
git commit -q -m "Verze $V" || true
git push -q origin main
echo "Nahráno: $V – na GitHub Pages bude za ~1 minutu."
