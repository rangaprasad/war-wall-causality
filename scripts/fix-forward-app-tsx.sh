#!/usr/bin/env bash
set -euo pipefail

APP="src/App.tsx"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="src/App.tsx.before-fix-${STAMP}"

echo "→ Backing up $APP → $BACKUP"
cp "$APP" "$BACKUP"

echo "→ Remove duplicate P={P} on <DagCanvas ...>"
sed -i '' -E 's/<DagCanvas P=\{P\} P=\{P\}/<DagCanvas P={P}/g' "$APP"

echo "→ Strip stray 'P: Params;' fragments from prop type braces (global, safe for helpers)"
# Examples fixed:
#   const Card=({title,children}: { P: Params; title:string; ...})
#   function TinyChart({data}: { P: Params; data:number[]})
sed -i '' -E 's/\{[[:space:]]*P:[[:space:]]*Params;[[:space:]]*/{ /g' "$APP"

echo "→ Recompose the DagCanvas signature cleanly"
# Replace the whole multi-line function signature with a canonical one.
awk '
BEGIN{fixing=0}
# Start of DagCanvas signature
/^function[[:space:]]+DagCanvas[[:space:]]*\(/{
  print "function DagCanvas({ P, backdoorOK, frontdoorOK, labels }: { P: Params; backdoorOK: boolean; frontdoorOK: boolean; labels?: DagLabels; }) {";
  fixing=1; next
}
# Skip until the original signature closes with "}) {"
fixing==1 && /\}\)[[:space:]]*\{/ { fixing=0; next }
fixing==1 { next }
{ print }
' "$APP" > "$APP.tmp" && mv "$APP.tmp" "$APP"

echo "→ Ensure DagCanvas useEffect depends on P so strokes update when sliders move"
sed -i '' -E 's/\[ backdoorOK, frontdoorOK, labels \]/[ P, backdoorOK, frontdoorOK, labels ]/' "$APP"

echo "→ Build to verify"
npm run -s build

echo "✅ Fix-forward complete. Backup at $BACKUP"
