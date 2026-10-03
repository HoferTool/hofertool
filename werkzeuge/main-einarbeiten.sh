#!/usr/bin/env bash
# Holt Änderungen von main in den React-Zweig, solange auf main noch
# die alte einteilige index.html gepflegt wird.
#
# Git kann Änderungen an der alten index.html nicht von selbst in
# src/alt/app.js und src/alt/stil.css übertragen. Dieses Skript teilt
# die alte Datei vom gemeinsamen Ausgangspunkt und von main gleich auf
# wie beim Umbau und führt die Unterschiede mit „git merge-file“ in
# die beiden Dateien ein. Konflikte stehen danach wie gewohnt mit
# <<<<<<< in der Datei.
#
# Aufruf im Hauptordner:  bash werkzeuge/main-einarbeiten.sh
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

git fetch origin main
BASIS=$(git merge-base HEAD origin/main)
TMP=$(mktemp -d)

teilen() {   # $1 = Stand, $2 = Zielname
  git show "$1:index.html" > "$TMP/$2.html"
  node -e '
    const fs = require("fs");
    const t = fs.readFileSync(process.argv[1], "utf8");
    const s1 = t.indexOf("<style>\n") + 8, s2 = t.indexOf("</style>");
    const j0 = t.indexOf("<script type=\"module\">\n") + 23, j2 = t.lastIndexOf("</script>");
    fs.writeFileSync(process.argv[2] + ".css", t.slice(s1, s2));
    fs.writeFileSync(process.argv[2] + ".js", t.slice(j0, j2));
  ' "$TMP/$2.html" "$TMP/$2"
}

# Liegt am Ausgangspunkt schon die neue index.html (nach dem Umbau
# auf main), gibt es nichts zu übertragen: dann normal mergen.
if ! git show "$BASIS:index.html" | grep '<script type="module">$' > /dev/null; then
  echo "Auf main ist der Umbau schon angekommen. Einfach: git merge origin/main"
  exit 0
fi

teilen "$BASIS" basis
teilen origin/main main

# Erst die alten Teile übertragen …
STATUS=0
git merge-file -L hier -L basis -L main src/alt/app.js "$TMP/basis.js" "$TMP/main.js" || STATUS=1
git merge-file -L hier -L basis -L main src/alt/stil.css "$TMP/basis.css" "$TMP/main.css" || STATUS=1

# … dann den Rest normal mergen. Die index.html bleibt die neue.
git merge --no-commit --no-ff origin/main || true
git checkout HEAD -- index.html 2>/dev/null || git checkout --ours -- index.html
git add index.html src/alt/app.js src/alt/stil.css

if [ "$STATUS" -ne 0 ]; then
  echo "Konflikte in src/alt/ — bitte auflösen, dann committen."
else
  echo "Übertragen. Prüfen (npm run pruefen), dann: git commit"
fi
git status --short | grep -v '^M  \|^A  ' || true
rm -rf "$TMP"
