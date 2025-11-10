#!/usr/bin/env bash
set -euo pipefail

FILE="src/App.tsx"
BACKUP="src/App.tsx.before-center-right-guide-$(date +%s)"

if [[ ! -f "$FILE" ]]; then
  echo "❌ $FILE not found. Run this from your repo root." >&2
  exit 1
fi

echo "== Backing up =="
cp -v "$FILE" "$BACKUP"

# 0) Ensure LS helper exists (from earlier left-panel script). If not, insert after guideOpen.
if ! grep -q "const LS =" "$FILE"; then
  echo "== Inserting LS helper =="
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
        done=1
      }
    }
  ' "$FILE" > "$FILE.tmp" && mv "$FILE.tmp" "$FILE"
else
  echo "… LS helper already present."
fi

# 1) Add centerHelpOpen + rightHelpOpen states after LS or leftHelpOpen
if ! grep -q "centerHelpOpen" "$FILE"; then
  echo "== Inserting centerHelpOpen state =="
  awk '
    BEGIN{done=0}
    {
      print $0
      if (!done && $0 ~ /LS\.set\("_leftHelpOpen"/) {  # after leftHelpOpen effect if present
        print "  // Center panel docs toggle (persisted)"
        print "  const [centerHelpOpen, setCenterHelpOpen] = useState<boolean>(LS.get(\"_centerHelpOpen\", false));"
        print "  useEffect(()=>{ LS.set(\"_centerHelpOpen\", centerHelpOpen); }, [centerHelpOpen]);"
        print ""
        done=1
      }
    }
  ' "$FILE" > "$FILE.tmp" && mv "$FILE.tmp" "$FILE"
else
  echo "… centerHelpOpen already present."
fi

if ! grep -q "rightHelpOpen" "$FILE"; then
  echo "== Inserting rightHelpOpen state =="
  awk '
    BEGIN{inserted=0}
    {
      print $0
      if (!inserted && $0 ~ /LS\.set\("_centerHelpOpen"/) {
        print "  // Right panel docs toggle (persisted)"
        print "  const [rightHelpOpen, setRightHelpOpen] = useState<boolean>(LS.get(\"_rightHelpOpen\", false));"
        print "  useEffect(()=>{ LS.set(\"_rightHelpOpen\", rightHelpOpen); }, [rightHelpOpen]);"
        print ""
        inserted=1
      }
    }
  ' "$FILE" > "$FILE.tmp" && mv "$FILE.tmp" "$FILE"
else
  echo "… rightHelpOpen already present."
fi

# 2) Insert Center header + Help toggle + <CenterPanelGuide/>
if ! grep -q "Center panel docs toggle (persisted)" "$FILE"; then
  : # just noise guard
fi

if ! grep -q "CenterPanelGuide" "$FILE"; then
  echo "== Inserting Center header + Help toggle =="
  if grep -q 'style={{ gridArea: "center" }}' "$FILE"; then
    # Anchor in the center area container
    awk '
      BEGIN{in_center=0; inserted=0}
      {
        if ($0 ~ /style=\{\{ gridArea: "center" \}\}/) { in_center=1 }
        if (in_center && !inserted && $0 ~ /<div className="mb-3/) {
          print "          {/* Center column header + help */}"
          print "          <div className=\"flex items-center justify-between mb-2\">"
          print "            <div className=\"text-sm font-semibold text-gray-300\">Causal Graph & Equations</div>"
          print "            <button"
          print "              onClick={() => setCenterHelpOpen(v => !v)}"
          print "              className=\"text-xs rounded px-2 py-1 bg-white/10 hover:bg-white/15\""
          print "              title=\"Explain this panel\""
          print "              aria-expanded={centerHelpOpen}"
          print "            >"
          print "              {centerHelpOpen ? \"Hide help\" : \"Help ?\"}"
          print "            </button>"
          print "          </div>"
          print "          {centerHelpOpen && <CenterPanelGuide"
          print "            idFlags={idFlags}"
          print "            P={P}"
          print "            ateA={ateA}"
          print "            ateB={ateB}"
          print "            ateAtoB={ateAtoB}"
          print "            policyWin={policyWin}"
          print "            policyTitle={policyTitle}"
          print "          />}"
          print ""
          inserted=1
        }
        print $0
      }
    ' "$FILE" > "$FILE.tmp" && mv "$FILE.tmp" "$FILE"
  else
    echo "⚠️ Could not find center grid area anchor; script expects named grid areas."
  fi
else
  echo "… Center UI hook already present (CenterPanelGuide found)."
fi

# 3) Insert Right header + Help toggle + <RightPanelGuide/> above <TrainingPanel/>
if ! grep -q "RightPanelGuide" "$FILE"; then
  echo "== Inserting Right header + Help toggle =="
  awk '
    BEGIN{in_right=0; inserted=0}
    {
      if ($0 ~ /style=\{\{ gridArea: "right" \}\}/) { in_right=1 }
      if (in_right && !inserted && $0 ~ /<TrainingPanel/) {
        print "              {/* Right column header + help */}"
        print "              <div className=\"flex items-center justify-between mb-2\">"
        print "                <div className=\"text-sm font-semibold text-gray-300\">Guided Training</div>"
        print "                <button"
        print "                  onClick={() => setRightHelpOpen(v => !v)}"
        print "                  className=\"text-xs rounded px-2 py-1 bg-white/10 hover:bg-white/15\""
        print "                  title=\"Explain this panel\""
        print "                  aria-expanded={rightHelpOpen}"
        print "                >"
        print "                  {rightHelpOpen ? \"Hide help\" : \"Help ?\"}"
        print "                </button>"
        print "              </div>"
        print "              {rightHelpOpen && <RightPanelGuide"
        print "                 scenarioIdx={scenarioIdx}"
        print "                 stepIdx={stepIdx}"
        print "                 totalSteps={(SCENARIOS[scenarioIdx]?.steps?.length)||1}"
        print "              />}"
        print ""
        inserted=1
      }
      print $0
    }
  ' "$FILE" > "$FILE.tmp" && mv "$FILE.tmp" "$FILE"
else
  echo "… Right UI hook already present (RightPanelGuide found)."
fi

# 4) Append guide components if missing
if ! grep -q "function CenterPanelGuide(" "$FILE"; then
  echo "== Appending <CenterPanelGuide/> component =="
  cat >> "$FILE" <<'TSX'

/* ---------------------------------------------
   In-app documentation for the CENTER panel
   --------------------------------------------- */
function CenterPanelGuide({
  idFlags,
  P,
  ateA,
  ateB,
  ateAtoB,
  policyWin,
  policyTitle
}:{
  idFlags: {backdoorOK:boolean; frontdoorOK:boolean};
  P: any;
  ateA: number;
  ateB: number;
  ateAtoB: number;
  policyWin: number;
  policyTitle: string;
}){
  return (
    <div className="rounded-lg bg-[#141924] border border-white/10 p-3 mb-3 text-sm leading-relaxed">
      <div className="font-medium text-gray-100 mb-2">Center Panel — DAG & Structural Model</div>

      <section className="space-y-2 text-gray-300">
        <div className="font-semibold text-gray-200">1) Causal Graph (DAG)</div>
        <p>
          The <b>DAG</b> lays out which variables cause which. Here, <b>S → T → I</b> is the core chain.
          Weather (<b>W</b>) and Morale (<b>M</b>) influence <b>S</b>; Weather may also directly affect <b>I</b> via <b>cW</b>.
        </p>
        <p>
          The badges reflect identifiability tests:
          <span className={`ml-2 px-2 py-0.5 rounded ${idFlags.backdoorOK ? "bg-emerald-600/20 text-emerald-300" : "bg-emerald-600/10 text-emerald-800"}`}>Back-door</span>
          <span className={`ml-2 px-2 py-0.5 rounded ${idFlags.frontdoorOK ? "bg-rose-600/20 text-rose-300" : "bg-rose-600/10 text-rose-800"}`}>Front-door</span>
        </p>
      </section>

      <section className="space-y-2 text-gray-300 mt-3">
        <div className="font-semibold text-gray-200">2) Structural Equations (live)</div>
        <p>We simulate with these equations (parameters are the sliders below each card):</p>
        <div className="bg-black/20 rounded p-2 text-[13px] leading-6">
          <code className="block">S = baseS − aW·W − aM·(1−M) + nS·ε<sub>S</sub></code>
          <code className="block">T = baseT + bS·S + nT·ε<sub>T</sub></code>
          <code className="block">I = step( T − cW·W − thrT )</code>
        </div>
        <p className="text-[13px] opacity-90">
          Adjusting these coefficients changes the <b>response surface</b> of outcomes under different W/M conditions.
        </p>
      </section>

      <section className="space-y-2 text-gray-300 mt-3">
        <div className="font-semibold text-gray-200">3) Transport & Policy</div>
        <ul className="list-disc pl-5">
          <li><b>ATE_A</b> and <b>ATE_B</b> are observed effects in each theater.</li>
          <li><b>ATE_A→B</b> estimates how A’s effect would look under B’s covariates (transport).</li>
          <li><b>{policyTitle}</b> computes expected success uplift from allocating a budget to boost Supply.</li>
        </ul>
        <div className="bg-black/20 rounded p-2 text-[13px] leading-6 mt-1">
          <div>ATE_A: <b>{ateA.toFixed(3)}</b> &nbsp; ATE_B: <b>{ateB.toFixed(3)}</b> &nbsp; ATE_A→B: <b>{ateAtoB.toFixed(3)}</b></div>
          <div>Policy expected wins: <b>{policyWin.toFixed(1)}%</b></div>
        </div>
      </section>
    </div>
  );
}
TSX
else
  echo "… CenterPanelGuide already present."
fi

if ! grep -q "function RightPanelGuide(" "$FILE"; then
  echo "== Appending <RightPanelGuide/> component =="
  cat >> "$FILE" <<'TSX'

/* ---------------------------------------------
   In-app documentation for the RIGHT panel
   --------------------------------------------- */
function RightPanelGuide({
  scenarioIdx,
  stepIdx,
  totalSteps
}:{
  scenarioIdx: number;
  stepIdx: number;
  totalSteps: number;
}){
  return (
    <div className="rounded-lg bg-[#141924] border border-white/10 p-3 mb-3 text-sm leading-relaxed">
      <div className="font-medium text-gray-100 mb-2">Right Panel — Guided Training</div>

      <section className="space-y-2 text-gray-300">
        <p>
          This panel walks you through <b>scenarios</b> composed of one or more <b>steps</b>. Each step can
          highlight a causal concept (e.g., back-door adjustment), tweak parameters, or instruct you to observe
          specific metrics/plots.
        </p>
        <ul className="list-disc pl-5">
          <li><b>Prev / Next</b> moves between steps inside the selected scenario.</li>
          <li><b>Scenario Picker</b> resets step index to 0 for the chosen scenario.</li>
          <li>If a scenario has a single step, Next/Prev won’t appear to “move”.</li>
        </ul>
        <div className="bg-black/20 rounded p-2 mt-2 text-[13px]">
          <div>Scenario index: <b>{scenarioIdx}</b></div>
          <div>Step: <b>{stepIdx+1}</b> / <b>{Math.max(1, totalSteps)}</b></div>
        </div>
        <p className="text-[13px] opacity-90 mt-2">
          To create multi-step flows, add more entries to <code>SCENARIOS[i].steps</code> in <code>src/content/scenarios.ts</code>.
          Steps can include <code>emphasis</code>, <code>param</code>, <code>set</code>, <code>wait</code>, or <code>play</code> actions.
        </p>
      </section>
    </div>
  );
}
TSX
else
  echo "… RightPanelGuide already present."
fi

echo "== Done. Try =="
echo "npm run build && npm run dev"

