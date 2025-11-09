// src/companion/chapters-war-college.ts

export type AutoStep =
  | { kind: "set"; target: "W" | "M" | "WB" | "MB" | "budget"; value: number }
  | { kind: "param"; name: "baseS" | "aW" | "aM" | "nS" | "baseT" | "bS" | "nT" | "cW" | "thrT"; value: number }
  | { kind: "theater"; value: "A" | "B" }
  | { kind: "play"; value: boolean }
  | { kind: "wait"; ms: number };

export type Lesson = {
  id: number;
  title: string;
  doctrine: string;
  manualOrders: string[];
  interpretation: string;
  auto: AutoStep[];
};

export const WAR_COLLEGE_LESSONS: Lesson[] = [
  {
    id: 1,
    title: "Ch.1 — Causation vs Association",
    doctrine: "Do not confuse signal with leverage. Correlation is not a command lever.",
    manualOrders: [
      "Set Weather_A ≈ 0.5, Morale_A ≈ 0.5. Press Play for a few seconds.",
      "Watch Avg Supply and Initiative sometimes move together.",
      "Now read ATE(S→I) adj{W,M}. If ≈ +0.000, you have association without causal leverage."
    ],
    interpretation: "Covariance without influence. Acting on Supply here wastes resources.",
    auto: [
      { kind: "play", value: true },
      { kind: "set", target: "W", value: 0.5 },
      { kind: "set", target: "M", value: 0.5 },
      { kind: "wait", ms: 2000 },
      { kind: "play", value: false }
    ]
  },
  {
    id: 2,
    title: "Ch.2 — Structural Equations (SCM)",
    doctrine: "Battles follow structure. Equations are the war engine.",
    manualOrders: [
      "Open Structural Equations.",
      "Increase aW to ~0.7 (Weather penalizes Supply harder).",
      "Observe Supply drop systematically; not random noise."
    ],
    interpretation: "Change structure → theater behavior changes. Causation is machinery.",
    auto: [
      { kind: "param", name: "aW", value: 0.70 },
      { kind: "wait", ms: 800 },
      { kind: "param", name: "aW", value: 0.45 }
    ]
  },
  {
    id: 3,
    title: "Ch.3 — DAGs & d-Separation",
    doctrine: "Arrows show where influence flows; what to block to see truth.",
    manualOrders: [
      "Set Theater A: W_A=0.2, M_A=0.8. Theater B: W_B=0.8, M_B=0.2.",
      "Compare ATE(S→I) adj{W,M} vs raw impressions.",
      "Stability after adjustment = back-door blocking is working."
    ],
    interpretation: "Adjusting {W,M} clears confounding fog.",
    auto: [
      { kind: "theater", value: "A" },
      { kind: "set", target: "W", value: 0.2 },
      { kind: "set", target: "M", value: 0.8 },
      { kind: "theater", value: "B" },
      { kind: "set", target: "WB", value: 0.8 },
      { kind: "set", target: "MB", value: 0.2 }
    ]
  },
  {
    id: 4,
    title: "Ch.4 — Identifiability",
    doctrine: "Know which effects can be estimated; some questions are unanswerable.",
    manualOrders: [
      "Note green Back-door identifiable badge.",
      "Set cW (direct W→I) to > 0.0 and observe Front-door badge turn invalid.",
      "Back-door still works with {W,M}."
    ],
    interpretation: "Front-door needs all S→I paths through T; cW breaks that.",
    auto: [
      { kind: "param", name: "cW", value: 0.30 },
      { kind: "wait", ms: 900 },
      { kind: "param", name: "cW", value: 0.12 }
    ]
  },
  {
    id: 5,
    title: "Ch.5 — do-Operator (Intervene vs Observe)",
    doctrine: "Observation is recon; intervention is command.",
    manualOrders: [
      "Press Play briefly to watch natural dynamics.",
      "Think of do(S=high) as a command; PN/PS compute unit-level flips under that command."
    ],
    interpretation: "Difference between watching the war and shaping it.",
    auto: [
      { kind: "play", value: true },
      { kind: "wait", ms: 1800 },
      { kind: "play", value: false }
    ]
  },
  {
    id: 6,
    title: "Ch.6 — Back-Door Adjustment",
    doctrine: "Estimate true effect of S by conditioning on {W,M}.",
    manualOrders: [
      "Set W_A high (0.8), M_A low (0.2).",
      "Observe ATE(S→I) adj{W,M} remains coherent while naive associations wobble."
    ],
    interpretation: "Adjustment reveals the true lever.",
    auto: [
      { kind: "set", target: "W", value: 0.8 },
      { kind: "set", target: "M", value: 0.2 }
    ]
  },
  {
    id: 7,
    title: "Ch.7 — Mediation (S→T→I)",
    doctrine: "Supply wins indirectly via Tempo.",
    manualOrders: [
      "Lower bS to ~0.4 and raise thrT to ~0.7.",
      "ATE(S→I) shrinks: Supply no longer crosses the Tempo threshold reliably."
    ],
    interpretation: "If S can’t convert to T, it can’t convert to I.",
    auto: [
      { kind: "param", name: "bS", value: 0.40 },
      { kind: "param", name: "thrT", value: 0.70 },
      { kind: "wait", ms: 1000 },
      { kind: "param", name: "bS", value: 0.85 },
      { kind: "param", name: "thrT", value: 0.60 }
    ]
  },
  {
    id: 8,
    title: "Ch.8 — Counterfactuals (PN/PS/PNS)",
    doctrine: "Quantify responsibility and decisiveness for units and decisions.",
    manualOrders: [
      "Harsh theater: W_A=0.85, M_A=0.15.",
      "PN/PS/PNS climb—many losses would flip if do(S=high)."
    ],
    interpretation: "Mathematics of ‘Was that decision pivotal?’",
    auto: [
      { kind: "theater", value: "A" },
      { kind: "set", target: "W", value: 0.85 },
      { kind: "set", target: "M", value: 0.15 }
    ]
  },
  {
    id: 9,
    title: "Ch.9 — Policy & Decision Theory",
    doctrine: "Allocate finite boosts where counterfactual uplift is largest.",
    manualOrders: [
      "Open Commander Policy. Set Budget to 0.15 → 0.30.",
      "Watch expected wins rise; this is uplift targeting by counterfactual gain."
    ],
    interpretation: "Optimal causal command under constraints.",
    auto: [
      { kind: "set", target: "budget", value: 0.15 },
      { kind: "wait", ms: 700 },
      { kind: "set", target: "budget", value: 0.30 }
    ]
  }
];

