// src/theaters/config.ts
export type TheaterId = "war" | "policy" | "dl";
export type ModeId =
  | "baseline"
  | "confounding"      // strong back-door
  | "mediation"        // front-door friendly
  | "hard_win"         // hard threshold for counterfactuals
  | "domain_shift";    // transport A→B stress

export type Labels = {
  W: string; M: string; S: string; T: string; I: string;
  identChips?: { backdoor: string; frontdoor: string; nonid: string };
};

export type ParamPreset = Partial<{
  // S = baseS - aW*W - aM*(1-M) + nS*S
  baseS: number; aW: number; aM: number; nS: number;
  // T = baseT + bS*S + nT*T
  baseT: number; bS: number; nT: number;
  // I = step(T - (cW*W + thrT))
  cW: number; thrT: number;
}>;

export type ModeConfig = {
  name: string;
  explain: string;
  presets: ParamPreset;
};

export type TheaterConfig = {
  id: TheaterId;
  name: string;
  labels: Labels;
  modes: Record<ModeId, ModeConfig>;
  // Optional: rename "Commander Policy" for this theater
  policyName?: string;
};

export const THEATERS: Record<TheaterId, TheaterConfig> = {
  war: {
    id: "war",
    name: "WAR (S→T→I)",
    labels: {
      W: "Weather (W)",
      M: "Morale (M)",
      S: "Supply (S)",
      T: "Tempo (T)",
      I: "Initiative (I)",
      identChips: {
        backdoor: "Back-door identifiable (adjust {W,M})",
        frontdoor: "Front-door identifiable (only if cW=0)",
        nonid: "Non-identifiable? No (here)"
      }
    },
    policyName: "Commander Policy — Supply Boost Allocation",
    modes: {
      baseline: {
        name: "Baseline",
        explain: "Balanced causality; both W and M matter, S→T active.",
        presets: { aW: 0.45, aM: 0.35, bS: 0.65, cW: 0.10, thrT: 0.60, nS: 0.20, nT: 0.15 }
      },
      confounding: {
        name: "Confounding (back-door)",
        explain: "Strong W/M→S confounding; learn to adjust {W,M}.",
        presets: { aW: 0.75, aM: 0.55, bS: 0.55, cW: 0.20 }
      },
      mediation: {
        name: "Mediation (front-door)",
        explain: "Turn off W→I (cW=0); make S→T strong.",
        presets: { cW: 0.0, bS: 0.90, thrT: 0.58 }
      },
      hard_win: {
        name: "Hard to Win (counterfactuals)",
        explain: "Raise threshold so PN/PNS become informative.",
        presets: { thrT: 0.78, bS: 0.90, aW: 0.40, aM: 0.30 }
      },
      domain_shift: {
        name: "Domain Shift (transport A→B)",
        explain: "Use transport panel; vary A vs B morale/weather.",
        presets: { aW: 0.45, aM: 0.45, bS: 0.65, cW: 0.10, thrT: 0.60 }
      }
    }
  },

  policy: {
    id: "policy",
    name: "Policy (Lobby→Votes→Pass)",
    labels: {
      W: "Media Pressure (W)",
      M: "Public Support (M)",
      S: "Lobbying Spend (S)",
      T: "Vote Count (T)",
      I: "Bill Passes (I)",
      identChips: {
        backdoor: "Back-door: adjust Media & Support",
        frontdoor: "Front-door: if media doesn’t directly swing vote (cW=0)",
        nonid: "Non-identifiable? Avoid collider selection"
      }
    },
    policyName: "Chair Strategy — Spend Allocation",
    modes: {
      baseline: {
        name: "Baseline",
        explain: "Moderate media/support confounding; spend moves votes.",
        presets: { aW: 0.40, aM: 0.40, bS: 0.70, cW: 0.10, thrT: 0.62 }
      },
      confounding: {
        name: "Media-Driven Confounding",
        explain: "Media affects both spend and passage; adjust properly.",
        presets: { aW: 0.75, aM: 0.35, bS: 0.60, cW: 0.25 }
      },
      mediation: {
        name: "Whip Line (Mediation)",
        explain: "Votes fully mediate spend → passage; set cW=0.",
        presets: { cW: 0.0, bS: 0.92, thrT: 0.60 }
      },
      hard_win: {
        name: "Filibuster Floor",
        explain: "High threshold; credit assignment becomes sharp.",
        presets: { thrT: 0.80, bS: 0.88 }
      },
      domain_shift: {
        name: "New Districts (Shift)",
        explain: "External validity stress; use transport A→B.",
        presets: { aW: 0.45, aM: 0.50, bS: 0.65, cW: 0.05, thrT: 0.64 }
      }
    }
  },

  dl: {
    id: "dl",
    name: "Deep Learning (D→R→G)",
    labels: {
      W: "Data Quality/Shift (W)",
      M: "Model Capacity/Priors (M)",
      S: "Optimization Budget (S)",
      T: "Rep Quality (R)",
      I: "Generalization (G)",
      identChips: {
        backdoor: "Back-door: adjust {Data shift, Priors}",
        frontdoor: "Front-door: if direct data→G shortcut off (cW=0)",
        nonid: "Non-identifiable? Avoid label leakage (collider)"
      }
    },
    policyName: "Trainer Policy — Compute Allocation",
    modes: {
      baseline: {
        name: "Baseline",
        explain: "Reasonable data; optimizer lifts representation; generalizes.",
        presets: { aW: 0.35, aM: 0.35, bS: 0.70, cW: 0.10, thrT: 0.60, nS: 0.20, nT: 0.15 }
      },
      confounding: {
        name: "Spurious Correlation",
        explain: "Data shortcuts correlate with labels and optimizer path.",
        presets: { aW: 0.70, aM: 0.30, cW: 0.25, bS: 0.60 }
      },
      mediation: {
        name: "Representation Mediation",
        explain: "No direct data→G shortcut; optimizer must build R.",
        presets: { cW: 0.0, bS: 0.92, thrT: 0.58 }
      },
      hard_win: {
        name: "Hard Generalization",
        explain: "High threshold; PN/PNS = ‘was compute decisive?’",
        presets: { thrT: 0.80, bS: 0.90 }
      },
      domain_shift: {
        name: "OOD Shift",
        explain: "Train/test distribution shift; use transport A→B.",
        presets: { aW: 0.50, aM: 0.40, bS: 0.70, cW: 0.10, thrT: 0.62 }
      }
    }
  }
};

