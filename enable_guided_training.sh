#!/usr/bin/env bash
set -euo pipefail

ROOT="$(pwd)"
TARGET="src/training"
OUTFILE="${TARGET}/GuidedTraining.tsx"   # <- renamed from FILE

echo "➡️  Ensuring ${TARGET} exists…"
mkdir -p "${TARGET}"

echo "➡️  Writing ${OUTFILE}…"
cat > "${OUTFILE}" <<'TSX'
// --- GuidedTraining.tsx (self-contained) ---
import React from "react";

// Types
export type Step = {
  title: string;
  context: string;
  orders: string[];
  observe: string[];
  interpretation: string;
  emphasis?: { backdoorOK?: boolean; frontdoorOK?: boolean };
  lock?: string[]; // control keys to disable
};

export type Scenario = { id: string; name: string; steps: Step[] };

// Scenarios (Officer tone, concise)
export const SCENARIOS: Scenario[] = [
  {
    id: "corr-not-cause",
    name: "Lesson 1 — Correlation ≠ Causation",
    steps: [{
      title: "Separate co-movement from cause",
      context: "S and I often move together. That is not evidence of S→I causation.",
      orders: [
        "Theater A: set Weather & Morale to mid-range; press Play ~30 ticks.",
        "Increase aW (Weather→Supply). Run again."
      ],
      observe: ["When aW is high, I tracks weather shifts, not supply choices."],
      interpretation: "Co-movement was confounding. Revealing S’s dependence on W breaks the illusion."
    }]
  },
  {
    id: "backdoor",
    name: "Lesson 2 — Back-Door Adjustment",
    steps: [{
      title: "Control confounders before judging a lever",
      context: "W & M affect S before it propagates. They confound S→I.",
      orders: [
        "Vary Weather quickly and watch S and I swing together.",
        "Now hold Weather steady; adjust Supply only."
      ],
      observe: ["With Weather fixed, the true S→I effect becomes visible."],
      interpretation: "To estimate S→I, adjust for {W, M}. (Back-door criterion.)",
      emphasis: { backdoorOK: true },
      lock: ["aW","aM","cW","W_B","M_B"]
    }]
  },
  {
    id: "mediation",
    name: "Lesson 3 — Mediation S→T→I",
    steps: [{
      title: "Supply must convert to Tempo to matter",
      context: "Supply doesn’t win directly; it enables Tempo; Tempo captures Initiative.",
      orders: [
        "Lower bS; raise S manually; Play.",
        "Now raise bS and Play again."
      ],
      observe: ["Low bS: supply is inert. High bS: S→T spikes, Initiative follows."],
      interpretation: "Mediation: evaluating S requires the S→T→I pathway.",
      lock: ["aW","aM","cW","W_B","M_B"]
    }]
  },
  {
    id: "transport",
    name: "Lesson 4 — Transport A→B",
    steps: [{
      title: "Don’t copy tactics; transfer structure",
      context: "Same model, different frontline distributions.",
      orders: [
        "Theater A: high Morale. Theater B: low Morale. Play ~50 ticks.",
        "Increase aM in Theater B; Play again."
      ],
      observe: ["ATE_A ≠ ATE_B initially; improving aM in B narrows the gap."],
      interpretation: "Transportability: adjust structural drivers to move effects across theaters.",
      lock: ["aW","cW","W_A","W_B"]
    }]
  },
  {
    id: "counterfactual",
    name: "Lesson 5 — Counterfactual Command",
    steps: [{
      title: "Was the order decisive?",
      context: "Evaluate a past decision by asking what if it had been different.",
      orders: [
        "Play A until Initiative is won; note the moment.",
        "Counterfactual: mentally lower supply at that moment; would you still win?"
      ],
      observe: ["If victory flips, your order was necessary (PN high). If not, it wasn’t decisive."],
      interpretation: "Decisive actions are those that would change history if removed (PN/PS intuition).",
      lock: ["aW","aM","cW","W_B","M_B"]
    }]
  }
];

// Small presentational panel (slide-in)
export function TrainingPanel({
  open, scenarioIdx, stepIdx,
  onClose, onPrev, onNext, onPickScenario
}: {
  open: boolean;
  scenarioIdx: number;
  stepIdx: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  onPickScenario: (i:number)=>void;
}) {
  const scenario = SCENARIOS[scenarioIdx];
  const step = scenario.steps[stepIdx];

  return (
    <div style={{
      position: "fixed", top: 12, right: 12, bottom: 12,
      width: open ? 380 : 0, transition: "width 220ms ease",
      overflow: "hidden", borderRadius: 12, background: "#0f1115",
      boxShadow: open ? "0 10px 30px rgba(0,0,0,0.45)" : "none",
      border: "1px solid #1f2937", zIndex: 50, color: "#e5e7eb"
    }}>
      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 12px", borderBottom:"1px solid #1f2937" }}>
        <select
          value={scenarioIdx}
          onChange={(e)=> onPickScenario(+e.target.value)}
          style={{ background:"#111827", color:"#e5e7eb", border:"1px solid #374151", borderRadius:8, padding:"6px 8px" }}
        >
          {SCENARIOS.map((s, i)=>(<option key={s.id} value={i}>{s.name}</option>))}
        </select>
        <div style={{ marginLeft:"auto" }} />
        <button onClick={onClose} style={{ border:"1px solid #374151", background:"#111827", color:"#e5e7eb", borderRadius:8, padding:"6px 10px" }}>✕</button>
      </div>

      {/* Body */}
      <div style={{ padding:12, height:"calc(100% - 100px)", overflowY:"auto" }}>
        <div style={{ fontSize:12, color:"#9ca3af", marginBottom:4 }}>
          Step {stepIdx+1} of {scenario.steps.length}
        </div>
        <div style={{ fontSize:18, fontWeight:700, marginBottom:8 }}>{step.title}</div>

        <Section label="Context"><p style={{ margin:0 }}>{step.context}</p></Section>

        <Section label="Orders">
          <ol style={{ margin:"6px 0 0 18px" }}>
            {step.orders.map((o,i)=>(<li key={i} style={{ marginBottom:6 }}>{o}</li>))}
          </ol>
        </Section>

        <Section label="Observe">
          <ul style={{ margin:"6px 0 0 18px" }}>
            {step.observe.map((o,i)=>(<li key={i} style={{ marginBottom:6 }}>{o}</li>))}
          </ul>
        </Section>

        <Section label="Interpretation"><p style={{ margin:0 }}>{step.interpretation}</p></Section>

        {step.lock && step.lock.length>0 && (
          <div style={{ marginTop:10, fontSize:12, color:"#9ca3af" }}>
            Controls locked in this step: <code>{step.lock.join(", ")}</code>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ display:"flex", gap:8, padding:12, borderTop:"1px solid #1f2937" }}>
        <button onClick={onPrev} style={{ border:"1px solid #374151", background:"#111827", color:"#e5e7eb", borderRadius:8, padding:"8px 12px" }}>◀ Prev</button>
        <div style={{ flex:1 }} />
        <button onClick={onNext} style={{ border:"1px solid #10b981", background:"#064e3b", color:"#ecfdf5", borderRadius:8, padding:"8px 12px" }}>Next ▶</button>
      </div>
    </div>
  );
}

function Section({label, children}:{label:string; children:React.ReactNode}) {
  return (
    <div style={{ marginTop:12 }}>
      <div style={{ fontWeight:700, color:"#e5e7eb", marginBottom:6 }}>{label}</div>
      <div style={{ fontSize:14, lineHeight:1.55 }}>{children}</div>
    </div>
  );
}
// --- end file ---
TSX

echo "✅ Created ${OUTFILE}"
echo "Next: open src/App.tsx and apply the 3 minimal edits I print below."
echo ""
echo "1) Import the module:"
echo "   import { TrainingPanel, SCENARIOS } from \"./training/GuidedTraining\";"
echo ""
echo "2) Add training state near your other useState hooks:"
cat <<'EOS'
   const [trainingOpen, setTrainingOpen] = useState(false);
   const [scenarioIdx, setScenarioIdx] = useState(0);
   const [stepIdx, setStepIdx] = useState(0);

   const curScenario = SCENARIOS[scenarioIdx];
   const curStep = curScenario.steps[stepIdx];

   // Halos for DAG (optional)
   const haloBackdoor = !!curStep?.emphasis?.backdoorOK;
   const haloFrontdoor = !!curStep?.emphasis?.frontdoorOK;
EOS
echo ""
echo "3) Wire a button and render the panel (once, near end of JSX):"
cat <<'EOS'
   <button onClick={()=>{ setTrainingOpen(true); setScenarioIdx(0); setStepIdx(0); }}>Guided Training</button>

   <TrainingPanel
     open={trainingOpen}
     scenarioIdx={scenarioIdx}
     stepIdx={stepIdx}
     onClose={()=> setTrainingOpen(false)}
     onPrev={()=> setStepIdx(s => Math.max(0, s-1))}
     onNext={()=> setStepIdx(s => Math.min((curScenario.steps.length-1), s+1))}
     onPickScenario={(i)=> { setScenarioIdx(i); setStepIdx(0); }}
   />
EOS
echo ""
echo "Optional: pass halos to DagCanvas -> <DagCanvas P={P} backdoorOK={haloBackdoor} frontdoorOK={haloFrontdoor} />"
echo ""
echo "Rollback anytime:"
echo "  git restore src/App.tsx && git switch -"

