#!/usr/bin/env bash
set -euo pipefail

FILE="src/App.tsx"
BACKUP="src/App.tsx.before-left-guide-$(date +%s)"

if [[ ! -f "$FILE" ]]; then
  echo "❌ $FILE not found. Run this from your repo root." >&2
  exit 1
fi

echo "== Backing up =="
cp -v "$FILE" "$BACKUP"

# 1) Add LS helper + leftHelpOpen state after the guideOpen state, if not present
if ! grep -q "leftHelpOpen" "$FILE"; then
  echo "== Inserting leftHelpOpen state and LS helper =="
  awk '
    BEGIN{done=0}
    {
      print $0
      if (!done && $0 ~ /const \[guideOpen, setGuideOpen\]/) {
        print ""
        print "  // --- local storage helper"
        print "  const LS = {"
        print "    get<T>(k:string, fallback:T):T { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) as T : fallback; } catch { return fallback; } },"
        print "    set(k:string, v:any){ try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }"
        print "  };"
        print ""
        print "  // Left panel docs toggle (persisted)"
        print "  const [leftHelpOpen, setLeftHelpOpen] = useState<boolean>(LS.get(\"_leftHelpOpen\", false));"
        print "  useEffect(()=>{ LS.set(\"_leftHelpOpen\", leftHelpOpen); }, [leftHelpOpen]);"
        print ""
        done=1
      }
    }
  ' "$FILE" > "$FILE.tmp" && mv "$FILE.tmp" "$FILE"
else
  echo "… leftHelpOpen already present, skipping state insertion."
fi

# 2) Insert header + Help toggle and conditional <LeftPanelGuide/> inside left column
if ! grep -q "Simulation Controls</div>" "$FILE"; then
  echo "== Inserting left column header + Help toggle =="
  # We try to anchor near the left grid start. First preference: named areas.
  if grep -q 'style={{ gridArea: "left" }}' "$FILE"; then
    awk '
      BEGIN{in_left=0; inserted=0}
      {
        if ($0 ~ /style=\{\{ gridArea: "left" \}\}/) { in_left=1 }
        if (in_left && !inserted && $0 ~ /<div className="space-y-3">/) {
          print "          {/* Left column header + help */}"
          print "          <div className=\"flex items-center justify-between mb-2\">"
          print "            <div className=\"text-sm font-semibold text-gray-300\">Simulation Controls</div>"
          print "            <button"
          print "              onClick={() => setLeftHelpOpen(v => !v)}"
          print "              className=\"text-xs rounded px-2 py-1 bg-white/10 hover:bg-white/15\""
          print "              title=\"Explain this panel\""
          print "              aria-expanded={leftHelpOpen}"
          print "            >"
          print "              {leftHelpOpen ? \"Hide help\" : \"Help ?\"}"
          print "            </button>"
          print "          </div>"
          print "          {leftHelpOpen && <LeftPanelGuide />}"
          print ""
          inserted=1
        }
        print $0
      }
    ' "$FILE" > "$FILE.tmp" && mv "$FILE.tmp" "$FILE"
  else
    # Fallback: look for the left sidebar comment and the first space-y-3 after it
    awk '
      BEGIN{seen_comment=0; inserted=0}
      {
        if ($0 ~ /\*\*+ ================= LEFT SIDEBAR ================= \*\*+/) { seen_comment=1 }
        if (seen_comment && !inserted && $0 ~ /<div className="space-y-3">/) {
          print "          {/* Left column header + help */}"
          print "          <div className=\"flex items-center justify-between mb-2\">"
          print "            <div className=\"text-sm font-semibold text-gray-300\">Simulation Controls</div>"
          print "            <button"
          print "              onClick={() => setLeftHelpOpen(v => !v)}"
          print "              className=\"text-xs rounded px-2 py-1 bg-white/10 hover:bg-white/15\""
          print "              title=\"Explain this panel\""
          print "              aria-expanded={leftHelpOpen}"
          print "            >"
          print "              {leftHelpOpen ? \"Hide help\" : \"Help ?\"}"
          print "            </button>"
          print "          </div>"
          print "          {leftHelpOpen && <LeftPanelGuide />}"
          print ""
          inserted=1
        }
        print $0
      }
    ' "$FILE" > "$FILE.tmp" && mv "$FILE.tmp" "$FILE"
  fi
else
  echo "… header/help already present, skipping UI insertion."
fi

# 3) Append LeftPanelGuide component at end of file if not present
if ! grep -q "function LeftPanelGuide()" "$FILE"; then
  echo "== Appending <LeftPanelGuide/> component =="
  cat >> "$FILE" <<'TSX'

/* ---------------------------------------------
   In-app documentation for the Left Panel
   --------------------------------------------- */
function LeftPanelGuide(){
  return (
    <div className="rounded-lg bg-[#141924] border border-white/10 p-3 mb-3 text-sm leading-relaxed">
      <div className="font-medium text-gray-100 mb-2">Left Panel — What you’re seeing</div>

      <div className="space-y-3 text-gray-300">
        {/* Theaters */}
        <section>
          <div className="font-semibold text-gray-200">1) Two Theaters (A & B)</div>
          <p className="mt-1">
            You’re running the <b>same causal structure</b> in two environments: <b>Theater A</b> and <b>Theater B</b>.
            Structure = the equations and graph (S→T→I, with W and M as covariates). Environments differ only by
            <b> conditions</b> (the values of controls), not by the causal graph itself.
          </p>
          <ul className="list-disc pl-5 mt-1">
            <li><b>Theater switch</b> (A/B) changes which dataset is “active” for metrics.</li>
            <li>Both can run with different Weather/Morale baselines, so you can compare response surfaces.</li>
          </ul>
        </section>

        {/* Weather / Morale */}
        <section>
          <div className="font-semibold text-gray-200">2) Conditions: Weather (W) &amp; Morale (M)</div>
          <p className="mt-1">
            These are environment knobs. They feed into the structural equations and alter the distribution of outcomes.
            In the default model, <b>Supply S</b> decreases with harsh weather and low morale.
          </p>
          <div className="bg-black/20 rounded p-2 mt-2 text-[13px]">
            <div className="opacity-80 mb-1">Supply equation (conceptual):</div>
            <code>S = baseS − aW·W − aM·(1−M) + nS·ε<sub>S</sub></code>
            <div className="opacity-80 mt-2">Tempo and Initiative:</div>
            <code className="block">T = baseT + bS·S + nT·ε<sub>T</sub></code>
            <code className="block">I = step( T − cW·W − thrT )</code>
          </div>
          <ul className="list-disc pl-5 mt-2">
            <li><b>W↑</b> (worse weather) tends to <b>reduce S</b>, which can reduce T and lower chance of I=1.</li>
            <li><b>M↑</b> improves S (via 1−M term), often raising T and the chance of success.</li>
            <li>The direct term <b>cW·W</b> lets Weather affect Initiative even after controlling for T.</li>
          </ul>
        </section>

        {/* S/T/I cards */}
        <section>
          <div className="font-semibold text-gray-200">3) Metrics: S, T, and I</div>
          <ul className="list-disc pl-5 mt-1">
            <li><b>S (Supply)</b>: logistics/inputs readiness. Average shown is mean of simulated rows.</li>
            <li><b>T (Tempo)</b>: operational tempo derived from S. Higher S → likely higher T.</li>
            <li><b>I (Initiative)</b>: binary success indicator (0/1). We show <b>Initiative Success %</b>
                as the average of I×100.</li>
          </ul>
        </section>

        {/* Rolling chart + Play */}
        <section>
          <div className="font-semibold text-gray-200">4) Rolling Initiative Success (mini chart)</div>
          <p className="mt-1">
            When you press <b>Play</b>, the app gently jitters the active theater’s W and M every 500ms (bounded random
            walk). After each tick, we recompute the simulation and append the latest <b>I%</b> to the chart window
            (last 120 points). This lets you <b>see stability vs sensitivity</b> to changing conditions.
          </p>
          <ul className="list-disc pl-5 mt-1">
            <li><b>Pause</b> freezes the random walk; stats remain fixed until you move sliders.</li>
            <li><b>Clear Chart</b> wipes the rolling window (useful between experiments).</li>
            <li><b>N (Episode Count)</b> controls Monte Carlo sample size; larger N → smoother (less noisy) estimates.</li>
          </ul>
        </section>

        {/* Why A vs B matters */}
        <section>
          <div className="font-semibold text-gray-200">5) Why run two theaters?</div>
          <p className="mt-1">
            It demonstrates <b>transport</b>: learning an effect under one covariate distribution (A) and estimating
            what happens under another (B). If structure holds but conditions change, you practice moving from
            <i>“what worked here”</i> to <i>“what should work there.”</i>
          </p>
        </section>
      </div>
    </div>
  );
}
TSX
else
  echo "… LeftPanelGuide already present, skipping component append."
fi

echo "== Done. Try =="
echo "npm run build && npm run dev"

