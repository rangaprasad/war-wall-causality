import React from "react";

/** Lesson steps for the slide-in Guided Training panel */
export type Step = {
  title: string;
  context: string;
  orders: string[];
  observe: string[];
  interpretation: string;
  emphasis?: { backdoorOK?: boolean; frontdoorOK?: boolean };
  lock?: string[]; // keys of controls to disable in this step (optional)
};

export type Scenario = { id: string; name: string; steps: Step[] };

export const SCENARIOS: Scenario[] = [
  {
    id: "corr-not-cause",
    name: "Lesson 1 — Correlation ≠ Causation",
    steps: [
      {
        title: "Co-movement is not influence",
        context:
          "Weather and Morale shift Supply; Supply and Tempo influence Initiative. Seeing S and I move together doesn’t prove S→I.",
        orders: [
          "Theater A: set Weather and Morale to mid values.",
          "Press ▶️ Play for ~30 ticks.",
          "Increase aW (Weather→Supply) and run again."
        ],
        observe: [
          "I tracks weather shifts through S even if your S-lever didn’t change."
        ],
        interpretation:
          "Confounding explains the illusion. The lever isn’t causal just because it co-moves.",
        emphasis: { backdoorOK: false, frontdoorOK: false }
      }
    ]
  },
  {
    id: "backdoor",
    name: "Lesson 2 — Back-Door Adjustment",
    steps: [
      {
        title: "Control {W,M} before judging S→I",
        context:
          "W and M point into S; they confound the S→I effect unless adjusted.",
        orders: [
          "Vary W quickly; watch S and I swing together.",
          "Now conceptually adjust for {W,M} (read ATE(S→I) adj.{W,M})."
        ],
        observe: [
          "Adjusted ATE stays stable while raw co-movement is noisy."
        ],
        interpretation:
          "Back-door: pick a set that blocks all spurious paths into S. Here it’s {W,M}.",
        emphasis: { backdoorOK: true }
      }
    ]
  },
  {
    id: "mediation",
    name: "Lesson 3 — Mediation (Front-Door when cW=0)",
    steps: [
      {
        title: "Supply must convert to Tempo to matter",
        context:
          "S doesn’t win directly; S→T and then T crosses a gate to capture I.",
        orders: [
          "Set cW=0 to remove direct W→I.",
          "Lower bS (weak S→T), press ▶️ Play.",
          "Raise bS high, press ▶️ Play."
        ],
        observe: [
          "Low bS: S changes don’t move I.",
          "High bS: S lifts T; I follows."
        ],
        interpretation:
          "Front-door needs cW=0 and an observed mediator T with S→T active.",
        emphasis: { frontdoorOK: true }
      }
    ]
  },
  {
    id: "transport",
    name: "Lesson 4 — Transportability (A → B)",
    steps: [
      {
        title: "Translate tactics, don’t copy",
        context:
          "Structure is shared; Theaters differ in W,M distributions. Effects shift with covariate mix.",
        orders: [
          "Set A high-morale, B low-morale.",
          "Compare ATE_A, ATE_B, and transported ATE_A→B."
        ],
        observe: ["A and B show different ATEs; transport rebases A’s law onto B."],
        interpretation:
          "External validity comes from combining the right law with the new covariate frequencies."
      }
    ]
  },
  {
    id: "counterfactual",
    name: "Lesson 5 — Counterfactual Command (PN/PS/PNS)",
    steps: [
      {
        title: "Was the order decisive?",
        context:
          "Counterfactuals ask: would the outcome flip if you had issued a different order?",
        orders: [
          "Make winning tough (raise thrT).",
          "Boost bS.",
          "Read PN, PS, PNS and note hinge-like regimes."
        ],
        observe: [
          "PN rises when victory depends on your order.",
          "PS rises when your order is sufficient to secure victory in many cases."
        ],
        interpretation:
          "PN ≈ necessity, PS ≈ sufficiency, PNS ≈ hinge power. It’s about credit assignment, not mere averages."
      }
    ]
  }
];

/** Slide-in training panel (minimal, clean, self-contained) */
export function TrainingPanel({
  open,
  scenarioIdx,
  stepIdx,
  onClose,
  onPrev,
  onNext,
  onPickScenario
}: {
  open: boolean;
  scenarioIdx: number;
  stepIdx: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  onPickScenario: (i: number) => void;
}) {
  if (!open) return null;

  const scenario = SCENARIOS[scenarioIdx] || SCENARIOS[0];
  const step = scenario.steps[stepIdx] || scenario.steps[0];

  return (
    <div
      style={{
        position: "fixed",
        top: 12,
        right: 12,
        bottom: 12,
        width: 380,
        borderRadius: 12,
        background: "#0f1115",
        border: "1px solid #1f2937",
        color: "#e5e7eb",
        boxShadow: "0 16px 40px rgba(0,0,0,0.45)",
        zIndex: 70,
        display: "flex",
        flexDirection: "column"
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          gap: 8,
          padding: "10px 12px",
          borderBottom: "1px solid #1f2937",
          alignItems: "center"
        }}
      >
        <select
          value={scenarioIdx}
          onChange={(e) => onPickScenario(+e.target.value)}
          style={{
            background: "#111827",
            color: "#e5e7eb",
            border: "1px solid #374151",
            borderRadius: 8,
            padding: "6px 8px",
            flex: 1
          }}
        >
          {SCENARIOS.map((s, i) => (
            <option key={s.id} value={i}>
              {s.name}
            </option>
          ))}
        </select>
        <button
          onClick={onClose}
          style={{
            border: "1px solid #374151",
            background: "#111827",
            color: "#e5e7eb",
            borderRadius: 8,
            padding: "6px 10px"
          }}
        >
          ✕
        </button>
      </div>

      {/* Body */}
      <div style={{ padding: 12, overflowY: "auto" }}>
        <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 4 }}>
          Step {stepIdx + 1} of {scenario.steps.length}
        </div>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>
          {step.title}
        </div>

        <Section label="Context">
          <p style={{ margin: 0 }}>{step.context}</p>
        </Section>

        <Section label="Orders">
          <ol style={{ margin: "6px 0 0 18px" }}>
            {step.orders.map((o, i) => (
              <li key={i} style={{ marginBottom: 6 }}>
                {o}
              </li>
            ))}
          </ol>
        </Section>

        <Section label="Observe">
          <ul style={{ margin: "6px 0 0 18px" }}>
            {step.observe.map((o, i) => (
              <li key={i} style={{ marginBottom: 6 }}>
                {o}
              </li>
            ))}
          </ul>
        </Section>

        <Section label="Interpretation">
          <p style={{ margin: 0 }}>{step.interpretation}</p>
        </Section>
      </div>

      {/* Footer */}
      <div
        style={{
          display: "flex",
          gap: 8,
          padding: 12,
          borderTop: "1px solid #1f2937"
        }}
      >
        <button
          onClick={onPrev}
          style={{
            border: "1px solid #374151",
            background: "#111827",
            color: "#e5e7eb",
            borderRadius: 8,
            padding: "8px 12px"
          }}
        >
          ◀ Prev
        </button>
        <div style={{ flex: 1 }} />
        <button
          onClick={onNext}
          style={{
            border: "1px solid #10b981",
            background: "#064e3b",
            color: "#ecfdf5",
            borderRadius: 8,
            padding: "8px 12px"
          }}
        >
          Next ▶
        </button>
      </div>
    </div>
  );
}

function Section({
  label,
  children
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontWeight: 700, color: "#e5e7eb", marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 14, lineHeight: 1.55 }}>{children}</div>
    </div>
  );
}

