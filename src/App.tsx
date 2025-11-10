import React, { useEffect, useMemo, useRef, useState } from "react";
import { WAR_COLLEGE_LESSONS } from "./companion/chapters-war-college";
import type { Lesson, AutoStep } from "./companion/chapters-war-college";
import { SCENARIOS } from "./training/GuidedTraining";
import { THEATERS } from "./theaters/config";
import type { TheaterId, ModeId } from "./theaters/config";

/* ---------- Utility ---------- */
const clamp01 = (x:number)=>Math.max(0,Math.min(1,x));
const rnd = ()=>Math.random();
const avg = (xs:number[])=>xs.reduce((s,v)=>s+v,0)/(xs.length||1);
const bin = (v:number,thr=0.5)=> (v>=thr?1:0);
const unitNoise=()=> rnd()+rnd()-1;
const S_high=(S:number)=> (S>=0.6?1:0);

/* ---------- Structural Parameters ---------- */
type Params = {
  baseS:number; aW:number; aM:number; nS:number;
  baseT:number; bS:number; nT:number;
  cW:number; thrT:number;
};
const DEFAULT: Params = {
  baseS:0.75, aW:0.45, aM:0.25, nS:0.15,
  baseT:0.15, bS:0.85, nT:0.10,
  cW:0.12, thrT:0.60
};

/* ---------- SCM ---------- */
function fS(W:number,M:number,epsS:number,P:Params){
  return clamp01(P.baseS - P.aW*W - P.aM*(1-M) + P.nS*epsS);
}
function gT(S:number,epsT:number,P:Params){
  return clamp01(P.baseT + P.bS*S + P.nT*epsT);
}
function hI(T:number,W:number,P:Params){
  return (T - P.cW*W > P.thrT) ? 1 : 0;
}

/* ---------- Row type ---------- */
type Row = { W:number; M:number; S:number; T:number; I:0|1; epsS:number; epsT:number };

/* ---------- Sample N units ---------- */
function simulateDataset(N:number, Wm:number, Mm:number, P:Params): Row[] {
  const rows:Row[] = [];
  for(let i=0;i<N;i++){
    const Wi = clamp01(Wm + 0.20*(rnd()+rnd()-1));
    const Mi = clamp01(Mm + 0.20*(rnd()+rnd()-1));
    const epsS = unitNoise(), epsT=unitNoise();
    const S=fS(Wi,Mi,epsS,P), T=gT(S,epsT,P), I=hI(T,Wi,P) as 0|1;
    rows.push({W:Wi,M:Mi,S,T,I,epsS,epsT});
  }
  return rows;
}

/* ---------- Back-door ATE(S→I | {W,M}) ---------- */
function ateBackDoor(rows:Row[]){
  const groups:Record<string,Row[]> = {};
  for(const r of rows){
    const z=`W${bin(r.W)}_M${bin(r.M)}`; (groups[z] ||= []).push(r);
  }
  let ate=0;
  for(const grp of Object.values(groups)){
    if(grp.length<4) continue;
    const x1=grp.filter(r=>S_high(r.S)===1), x0=grp.filter(r=>S_high(r.S)===0);
    if(x1.length<2||x0.length<2) continue;
    const Ey1=avg(x1.map(r=>r.I)), Ey0=avg(x0.map(r=>r.I)), pz=grp.length/rows.length;
    ate += (Ey1-Ey0)*pz;
  }
  return ate;
}

/* ---------- Counterfactuals ---------- */
function counterfactual_I(r:Row, forcedS:number, P:Params){
  const S = clamp01(forcedS);
  const T = gT(S,r.epsT,P);
  return hI(T,r.W,P) as 0|1;
}
/* UNUSED: keeping for reference
function _PN(rows:Row[],P:Params){
  const losers=rows.filter(r=>r.I===0); if(!losers.length) return 0;
  const flips=losers.filter(r=>counterfactual_I(r,0.9,P)===1).length;
  return flips/losers.length;
}
*/
/* UNUSED: keeping for reference
function _PS(rows:Row[],P:Params){
  const lowLost=rows.filter(r=>r.I===0 && S_high(r.S)===0); if(!lowLost.length) return 0;
  const flips=lowLost.filter(r=>counterfactual_I(r,0.9,P)===1).length;
  return flips/lowLost.length;
}
*/

/* ---------- Transport ---------- */
function ateTransport(A:Row[], B:Row[]){
  const Az:Record<string,{x1:number;x0:number;n1:number;n0:number;}> = {};
  const countB:Record<string,number> = {};
  for(const r of A){
    const z=`W${bin(r.W)}_M${bin(r.M)}`; const b=(Az[z] ||= {x1:0,x0:0,n1:0,n0:0});
    if(S_high(r.S)){ b.x1+=r.I; b.n1++; } else { b.x0+=r.I; b.n0++; }
  }
  for(const r of B){ const z=`W${bin(r.W)}_M${bin(r.M)}`; countB[z]=(countB[z]||0)+1; }
  const totalB=B.length||1;
  let ate=0;
  for(const [z,b] of Object.entries(Az)){
    const pzB=(countB[z]||0)/totalB;
    if(b.n1>1&&b.n0>1){
      const Ey1=b.x1/b.n1, Ey0=b.x0/b.n0; ate+=(Ey1-Ey0)*pzB;
    }
  }
  return ate;
}

/* ---------- Policy ---------- */
function policyUpliftExpectedWin(rows:Row[], budgetFrac:number, P:Params){
  const arr=rows.map(r=>({base:r.I, gain: counterfactual_I(r,0.9,P)-r.I}))
               .sort((a,b)=>b.gain-a.gain);
  const K = Math.floor(rows.length*clamp01(budgetFrac));
  let wins=0;
  for(let i=0;i<rows.length;i++){
    wins+= (i<K ? (arr[i].base===1?1:(arr[i].gain>0?1:0)) : arr[i].base);
  }
  return 100*wins/rows.length;
}

/* ---------- Tiny Chart ---------- */
function TinyChart({data}: { data:number[]}) {
  const ref=useRef<HTMLCanvasElement|null>(null);
  useEffect(()=>{
    const c=ref.current; if(!c) return;
    const g=c.getContext("2d"); if(!g) return;
    const W=c.width,H=c.height,pad=8;
    g.clearRect(0,0,W,H);
    g.strokeStyle="#2a2a2a"; g.strokeRect(0.5,0.5,W-1,H-1);
    if(data.length<2) return;
    const step=(W-2*pad)/(data.length-1);
    g.strokeStyle="rgba(165,180,252,1)";
    g.lineWidth=2; g.beginPath();
    data.forEach((v,i)=>{ const x=pad+i*step, y=pad+(H-2*pad)*(1-v/100); i?g.lineTo(x,y):g.moveTo(x,y);});
    g.stroke();
  },[data]);
  return <canvas ref={ref} width={520} height={160} style={{width:"100%",height:160}}/>;
}

/* ---------- Animated DAG ---------- */
type DagLabels = { W:string; M:string; S:string; T:string; I:string };

function DagCanvas({ P, backdoorOK, frontdoorOK, labels }: { P: Params; backdoorOK: boolean; frontdoorOK: boolean; labels?: DagLabels; }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const c = ref.current; if (!c) return;
    const g = c.getContext("2d"); if (!g) return;

    const L: DagLabels = labels ?? {
      W: "Weather (W)",
      M: "Morale (M)",
      S: "Supply (S)",
      T: "Tempo (T)",
      I: "Initiative (I)"
    };

    const nodes = {
      W: { x: 120, y: 80,  label: L.W },
      M: { x: 120, y: 220, label: L.M },
      S: { x: 320, y: 150, label: L.S },
      T: { x: 520, y: 150, label: L.T },
      I: { x: 720, y: 150, label: L.I }
    };

    const lerp = (a:number,b:number,t:number)=>a+(b-a)*t;
    const edge = (coef:number,min=1.6,max=5)=>lerp(min,max,clamp01(coef));

    const drawNode = (n:{x:number;y:number;label:string}) => {
      g.fillStyle = "rgba(255,255,255,0.05)";
      g.strokeStyle = "#2a2a2a";
      g.lineWidth = 1.5;
      g.beginPath();
      const r = 10;
      g.roundRect(n.x-70, n.y-24, 140, 48, r);
      g.fill(); g.stroke();
      g.fillStyle = "#eaeaea"; g.font = "14px Inter";
      g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText(n.label, n.x, n.y);
    };

    const arrow = (a:any,b:any,w:number,color:string,dashed=false,dOffset=0)=>{
      g.save();
      g.strokeStyle=color; g.lineWidth=w;
      if(dashed){ g.setLineDash([8,6]); g.lineDashOffset=dOffset; }
      g.beginPath(); g.moveTo(a.x+70,a.y); g.lineTo(b.x-70,b.y); g.stroke();
      const ang=Math.atan2(b.y-a.y,b.x-a.x), hx=b.x-70,hy=b.y;
      g.beginPath();
      g.moveTo(hx,hy);
      g.lineTo(hx-10*Math.cos(ang-Math.PI/6),hy-10*Math.sin(ang-Math.PI/6));
      g.lineTo(hx-10*Math.cos(ang+Math.PI/6),hy-10*Math.sin(ang+Math.PI/6));
      g.closePath(); g.fillStyle=color; g.fill();
      g.restore();
    };

    const halo = (n:any, base:[number,number,number], t:number)=>{
      const alpha=0.18+0.09*(0.5+0.5*Math.sin(t));
      const radius=66+6*(0.5+0.5*Math.sin(t));
      const [r,gc,b]=base;
      const grd=g.createRadialGradient(n.x,n.y,4,n.x,n.y,radius);
      grd.addColorStop(0,`rgba(${r},${gc},${b},${alpha})`);
      grd.addColorStop(1,`rgba(${r},${gc},${b},0)`);
      g.fillStyle=grd; g.beginPath(); g.arc(n.x,n.y,radius,0,Math.PI*2); g.fill();
    };

    const render = (tMs:number)=>{
      const Wc=c.width,Hc=c.height;
      g.clearRect(0,0,Wc,Hc);
      const t=tMs*0.004, dash=-tMs*0.05;

      if (backdoorOK) { halo(nodes.W,[46,204,113],t); halo(nodes.M,[46,204,113],t); }
      if (frontdoorOK) { halo(nodes.T,[236,72,153],t+1.2); }

      drawNode(nodes.W); drawNode(nodes.M); drawNode(nodes.S); drawNode(nodes.T); drawNode(nodes.I);

      arrow(nodes.W,nodes.S,edge(P.aW),"#60a5fa");
      arrow(nodes.M,nodes.S,edge(P.aM),"#60a5fa");
      arrow(nodes.S,nodes.T,edge(P.bS),"#a1a1aa");
      arrow(nodes.T,nodes.I,2.4,"#a1a1aa");
      if (P.cW>0) arrow(nodes.W,nodes.I,edge(P.cW),"#f59e0b",true,dash);

      rafRef.current = requestAnimationFrame(render);
    };

    rafRef.current = requestAnimationFrame(render);
    return ()=>{ if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [ backdoorOK, frontdoorOK, labels]);

  return <canvas ref={ref} width={840} height={320} style={{width:"100%",height:320}}/>;
}

/* ---------- Identifiability ---------- */
function identifiability(P:Params){
  return {backdoorOK:true, frontdoorOK:(P.cW===0)};
}

/* ---------- UI Helpers (small, unchanged) ---------- */
const fmtDelta=(x:number)=> (x>=0?"+":"")+x.toFixed(3);
const Card=({title,children}: { title:string;children:any})=><div style={st.card}>
  <div style={st.cardTitle}>{title}</div>{children}
</div>;
const Hint=({children}: { children:any})=><div style={st.hint}>{children}</div>;
const Number=({value,on,min,max,step}: { value:number;on:(n:number)=>void;min:number;max:number;step:number})=>
  <input type="number" value={value} min={min} max={max} step={step}
    onChange={e=>on(parseInt(e.target.value||"1000",10))} style={st.number}/>;
const Slider=({label,value,set}: { label:string;value:number;set:(v:number)=>void})=>
<div style={{marginBottom:8}}>
  <div style={st.sliderRow}><div>{label}</div><div style={st.sliderVal}>{value.toFixed(2)}</div></div>
  <input type="range" min={0} max={1} step={0.01} value={value}
   onChange={e=>set(parseFloat(e.target.value))} style={{width:"100%"}}/>
</div>;
const Metric=({label,value,fmt="raw"}: { label:string;value:number;fmt?:string})=>{
  let display=value.toFixed(3);
  if(fmt==="pct")display=`${(value*100).toFixed(1)}%`;
  if(fmt==="pct100")display=`${value.toFixed(1)}%`;
  if(fmt==="delta")display=(value>=0?"+":"")+value.toFixed(3);
  return <div style={st.metric}><div style={st.metricLabel}>{label}</div><div style={st.metricValue}>{display}</div></div>;
};
const Section=({label,children}: { label:string;children:any})=>
<div style={st.section}><div style={st.sectionLabel}>{label}</div><div style={st.knobs}>{children}</div></div>;
const Knob=({label,v,set}: { label:string;v:number;set:(x:number)=>void})=>
<div style={st.knob}>
  <div style={st.knobLabel}>{label}</div>
  <input type="range" min={0} max={1.2} step={0.01} value={v} onChange={e=>set(parseFloat(e.target.value))}/>
  <div style={st.knobVal}>{v.toFixed(2)}</div>
</div>;
const Badge=({ok,label}: { ok:boolean;label:string})=>
<span style={{...st.badge,background:ok?"#12321a":"#3a1a1a",borderColor:ok?"#2f9e44":"#b91c1c"}}>{label}</span>;

const st:Record<string,React.CSSProperties>={
  page:{minHeight:"100vh",background:"#0b0b0c",color:"#eaeaea",padding:"16px"},
  wrap:{},
  columns:{display:"grid",gridTemplateColumns:"minmax(420px,1fr) minmax(820px,2fr)",gap:16},
  left:{},right:{},
  card:{border:"1px solid #2a2a2a",borderRadius:14,padding:16,background:"rgba(255,255,255,0.04)",marginBottom:12},
  cardTitle:{fontWeight:600,marginBottom:8},
  hint:{color:"#9aa0a6",fontSize:12,marginTop:6},
  number:{width:"100%",background:"#111113",color:"#eaeaea",border:"1px solid #2a2a2a",borderRadius:8,padding:"8px 10px"},
  sliderRow:{display:"flex",justifyContent:"space-between",marginBottom:4},
  sliderVal:{fontVariantNumeric:"tabular-nums"},
  metric:{border:"1px solid #2a2a2a",borderRadius:14,padding:16,background:"rgba(255,255,255,0.04)"},
  metricLabel:{color:"#9aa0a6",fontSize:11,letterSpacing:0.6,textTransform:"uppercase"},
  metricValue:{marginTop:6,fontWeight:700,fontVariantNumeric:"tabular-nums"},
  section:{border:"1px dashed #363636",borderRadius:12,padding:10,marginTop:8},
  sectionLabel:{fontSize:12,color:"#cbd5e1",marginBottom:6},
  knobs:{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8},
  knob:{background:"rgba(255,255,255,0.03)",border:"1px solid #2a2a2a",borderRadius:10,padding:8},
  knobLabel:{fontSize:12,color:"#9aa0a6",marginBottom:4},
  knobVal:{fontSize:12,textAlign:"right",marginTop:4},
  sliderValNum:{},
  badge:{display:"inline-block",border:"1px solid",borderRadius:999,padding:"4px 8px",fontSize:12,color:"#e6f4ea"},
};

/* -------------------------- TrainingHub (Right Panel) -------------------------- */
type TrainingTab = "lesson" | "scenario";

function TrainingHub({
  scenarioIdx, stepIdx, onClose, onPrev, onNext, onPickScenario, lessons, lesson, setLesson,
}: {
  scenarioIdx: number;
  stepIdx: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  onPickScenario: (i: number) => void;
  lessons: Lesson[];
  lesson: Lesson;
  setLesson: (l: Lesson) => void;
}) {
  const [tab, setTab] = React.useState<TrainingTab>("lesson");
  const scenario: any = SCENARIOS[scenarioIdx] ?? { title: "Scenario", steps: [] };
  const step: any = scenario.steps?.[stepIdx] ?? null;
  const totalSteps = scenario.steps?.length ?? 0;

  return (
    <div className="flex flex-col h-full">
      {/* Header with tabs */}
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">Guided Training</span>
          <div className="inline-flex rounded bg-white/5 p-0.5">
            <button onClick={() => setTab("lesson")} className={`px-2 py-1 text-xs rounded ${tab === "lesson" ? "bg-white/10" : "opacity-70 hover:opacity-100"}`}>Lessons</button>
            <button onClick={() => setTab("scenario")} className={`px-2 py-1 text-xs rounded ${tab === "scenario" ? "bg-white/10" : "opacity-70 hover:opacity-100"}`}>Scenarios</button>
          </div>
        </div>
        <button onClick={onClose} className="rounded bg-white/10 px-2 py-1 text-xs hover:bg-white/15">Hide help</button>
      </div>

      {/* Fixed summary bar */}
      <div className="border-b border-white/10 px-3 py-2 text-[12px] text-gray-300">
        {tab === "lesson" ? (
          <div><b>Right Panel — Guided Lessons</b>. Narrative, step-by-step concepts with small exercises.</div>
        ) : (
          <div><b>Scenario Playbook</b>. Multi-step A/B runs: orders → observe → interpret.</div>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-3 py-2">
        {tab === "lesson" && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase tracking-wide text-gray-400">Lesson</span>
              <select
                value={String(lesson.id)}
                onChange={(e) => {
                  const picked = lessons.find(L => String(L.id) === e.target.value) || lessons[0];
                  setLesson(picked);
                }}
                className="bg-[#0f131c] border border-white/10 rounded px-2 py-1 text-sm min-w-[14rem]"
              >
                {lessons.map(L => (
                  <option key={String(L.id)} value={String(L.id)}>{L.title}</option>
                ))}
              </select>
            </div>
            <div className="rounded bg-[#121620] p-3 text-sm leading-6">
              <div className="text-[13px] font-semibold mb-2">{lesson.title}</div>
              {Array.isArray((lesson as any).bullets) && (lesson as any).bullets.length > 0 && (
                <ul className="list-disc pl-5 space-y-1">
                  {(lesson as any).bullets.map((b: string, i: number) => (
                    <li key={i} className="text-gray-300">{b}</li>
                  ))}
                </ul>
              )}
              {(lesson as any).markdown && (
                <pre className="mt-2 whitespace-pre-wrap text-[13px] text-gray-300">{(lesson as any).markdown}</pre>
              )}
            </div>
          </div>
        )}

        {tab === "scenario" && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase tracking-wide text-gray-400">Scenario</span>
              <select
                value={String(scenarioIdx)}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onPickScenario(parseInt(e.currentTarget.value,10))}
                className="bg-[#0f131c] border border-white/10 rounded px-2 py-1 text-sm min-w-[14rem]"
              >
                {SCENARIOS.map((S, i) => (
                  <option key={i} value={String(i)}>{(S as any).title ?? `Scenario ${i + 1}`}</option>
                ))}
              </select>
            </div>
            <div className="rounded bg-[#121620] p-3 text-sm leading-6">
              <div className="text-[13px] font-semibold mb-1">{scenario.title}</div>
              {scenario.subtitle && <div className="text-[12px] text-gray-400 mb-2">{scenario.subtitle}</div>}
              {totalSteps > 0 ? (
                <>
                  <div className="mb-2 text-[12px] text-gray-400">Step: <b>{stepIdx + 1}</b> / {totalSteps}</div>
                  {step?.orders && (
                    <>
                      <div className="text-[12px] font-semibold">Orders</div>
                      <ul className="list-decimal pl-5 mb-2 space-y-1">
                        {step.orders.map((t: string, i: number) => (<li key={i} className="text-gray-300">{t}</li>))}
                      </ul>
                    </>
                  )}
                  {step?.observe && (
                    <>
                      <div className="text-[12px] font-semibold">Observe</div>
                      <ul className="list-disc pl-5 mb-2 space-y-1">
                        {step.observe.map((t: string, i: number) => (<li key={i} className="text-gray-300">{t}</li>))}
                      </ul>
                    </>
                  )}
                  {step?.interpretation && (
                    <>
                      <div className="text-[12px] font-semibold">Interpretation</div>
                      <div className="text-gray-300">{step.interpretation}</div>
                    </>
                  )}
                </>
              ) : (
                <div className="text-gray-400 text-[13px]">This scenario has no steps yet. Add them in <code>src/content/scenarios.ts</code>.</div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer controls */}
      <div className="border-t border-white/10 px-3 py-2 flex items-center justify-between">
        {tab === "scenario" ? (
          <>
            <button onClick={onPrev} className="rounded bg-white/10 px-3 py-1 text-xs hover:bg-white/15 disabled:opacity-40" disabled={totalSteps <= 1}>◀ Prev</button>
            <div className="text-[12px] text-gray-400">Step {Math.min(stepIdx + 1, Math.max(1, totalSteps))}/{Math.max(1, totalSteps)}</div>
            <button onClick={onNext} className="rounded bg-emerald-600/20 px-3 py-1 text-xs text-emerald-200 hover:bg-emerald-600/25 disabled:opacity-40" disabled={totalSteps <= 1}>Next ▶</button>
          </>
        ) : (
          <div className="text-[12px] text-gray-500">Use <b>Scenarios</b> to run A/B orders with observations.</div>
        )}
      </div>
    </div>
  );
}

export default function App(){
  /* ---------- touch module-scoped helpers so TS doesn't flag them when unused ---------- */
  // If Card/Hint/... are defined in this module but not rendered in the current layout,
  // reading them once clears TS6133 (“value is never read”) without changing behavior.
  // (These identifiers already exist in the file; otherwise TS would error earlier.)
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  void Card; void Hint; void Section; void Knob; void Badge;

  /* ---------- UI State ---------- */
  const [theater,setTheater]=useState<'A'|'B'>('A');
  const [W,setW]=useState(0.35); const [M,setM]=useState(0.65);
  const [WB,setWB]=useState(0.55);const [MB,setMB]=useState(0.45);
  const [N,setN]=useState(1000);
  const [P, setP] = useState<Params>(DEFAULT);
  const [guideOpen, setGuideOpen] = useState(true);

  // --- local storage helper
  const LS = {
    get<T>(k:string, fallback:T):T { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) as T : fallback; } catch { return fallback; } },
    set(k:string, v:any){ try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
  };

  // Left panel docs toggle (persisted)
  const [leftHelpOpen, setLeftHelpOpen] = useState<boolean>(LS.get("_leftHelpOpen", false));
  useEffect(()=>{ LS.set("_leftHelpOpen", leftHelpOpen); }, [leftHelpOpen]);
  // Center panel docs toggle (persisted)
  const [centerHelpOpen, setCenterHelpOpen] = useState<boolean>(LS.get("_centerHelpOpen", false));
  useEffect(()=>{ LS.set("_centerHelpOpen", centerHelpOpen); }, [centerHelpOpen]);
  // Right panel docs toggle (persisted)
  const [rightHelpOpen, setRightHelpOpen] = useState<boolean>(LS.get("_rightHelpOpen", false));
  useEffect(()=>{ LS.set("_rightHelpOpen", rightHelpOpen); }, [rightHelpOpen]);




  // setters for params
  const setBaseS = (v: number) => setP((p: Params) => ({ ...p, baseS: v }));
  const setAW    = (v: number) => setP((p: Params) => ({ ...p, aW: v }));
  const setAM    = (v: number) => setP((p: Params) => ({ ...p, aM: v }));
  const setNS    = (v: number) => setP((p: Params) => ({ ...p, nS: v }));
  const setBaseT = (v: number) => setP((p: Params) => ({ ...p, baseT: v }));
  const setBS    = (v: number) => setP((p: Params) => ({ ...p, bS: v }));
  const setNT    = (v: number) => setP((p: Params) => ({ ...p, nT: v }));
  const setCW    = (v: number) => setP((p: Params) => ({ ...p, cW: v }));
  const setThrT  = (v: number) => setP((p: Params) => ({ ...p, thrT: v }));
  const resetParams = () => setP(DEFAULT);

  const [auto,setAuto]=useState(false);
  const [series,setSeries]=useState<number[]>([]);
  const [budget,setBudget]=useState(0.15);

  /* ---------- Guided Training ---------- */
  const [scenarioIdx,setScenarioIdx]=useState(0);
  const [stepIdx,setStepIdx]=useState(0);
  const curScenario=SCENARIOS[scenarioIdx];

  /* ---------- Study Companion ---------- */
  const [lesson,setLesson]=useState<Lesson>(WAR_COLLEGE_LESSONS[0]);
  const [autoRunning,setAutoRunning]=useState(false);
  const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));

  /* ---------- Global Domain Theater + Mode ---------- */
  const [theaterId, setTheaterId] = useState<TheaterId>("war");
  const [modeId, setModeId] = useState<ModeId>("baseline");

  const [dagLabels, setDagLabels] = useState(THEATERS["war"].labels);
  const [policyTitle, setPolicyTitle] = useState(THEATERS["war"].policyName ?? "Commander Policy");

  // Ensure we start with a real theaterId
  useEffect(() => {
    if (!THEATERS?.[theaterId]) {
      const first = getTheaterList()[0];
      if (first) setTheaterId(first.id as TheaterId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When theater changes, ensure modeId valid
  useEffect(() => {
    const modes = getModes(theaterId);
    if (!modes.length) return;
    if (!modes.find((m: any) => m?.id === modeId)) {
      setModeId(modes[0].id as ModeId);
    }
  }, [theaterId]); 

  useEffect(() => {
    const T: any = THEATERS?.[theaterId];
    if (!T) return;

    // Update labels & policy name
    setDagLabels(T.labels);
    setPolicyTitle(T.policyName ?? "Commander Policy");

    // Current mode (normalized)
    const modes = getModes(theaterId);
    const chosen = modes.find((m: any) => m?.id === modeId) ?? modes[0] ?? null;

    // Push parameter presets if present
    const p = (chosen?.presets) || {};
    if (p.baseS !== undefined) setBaseS(p.baseS);
    if (p.aW   !== undefined) setAW(p.aW);
    if (p.aM   !== undefined) setAM(p.aM);
    if (p.nS   !== undefined) setNS(p.nS);
    if (p.baseT!== undefined) setBaseT(p.baseT);
    if (p.bS   !== undefined) setBS(p.bS);
    if (p.nT   !== undefined) setNT(p.nT);
    if (p.cW   !== undefined) setCW(p.cW);
    if (p.thrT !== undefined) setThrT(p.thrT);
  }, [theaterId, modeId]);

  async function runLessonAuto(steps:AutoStep[]){
    if(autoRunning)return; setAutoRunning(true);
    try{
      for(const st of steps){
        if(st.kind==="wait") await sleep(st.ms);
        if(st.kind==="play") setAuto(st.value);
        if(st.kind==="theater") setTheater(st.value);
        if(st.kind==="set"){
          if(st.target==="W") setW(st.value);
          if(st.target==="M") setM(st.value);
          if(st.target==="WB") setWB(st.value);
          if(st.target==="MB") setMB(st.value);
          if(st.target==="budget") setBudget(st.value);
        }
        if(st.kind==="param") setP((p: Params) =>({...p,[st.name]:st.value}));
      }
    }finally{ setAuto(false); setAutoRunning(false); }
  }

  /* ---------- Data ---------- */
  const dataA=useMemo(()=>simulateDataset(N,W,M,P),[N,W,M,P]);
  const dataB=useMemo(()=>simulateDataset(N,WB,MB,P),[N,WB,MB,P]);
  const active=(theater==='A'?dataA:dataB);

  /* ---------- Metrics ---------- */
  const sMean=avg(active.map(d=>d.S));
  const tMean=avg(active.map(d=>d.T));
  const iRate=100*avg(active.map(d=>d.I));
  const ate=useMemo(()=>ateBackDoor(active),[active]);
  const ateA=useMemo(()=>ateBackDoor(dataA),[dataA]);
  const ateB=useMemo(()=>ateBackDoor(dataB),[dataB]);
  const ateAtoB=useMemo(()=>ateTransport(dataA,dataB),[dataA,dataB]);
  const policyWin=useMemo(()=>policyUpliftExpectedWin(active,budget,P),[active,budget,P]);

  /* ---------- Auto-walk randomness (Play) ---------- */
  useEffect(()=>{
    if(!auto)return;
    const id=setInterval(()=>{
      if(theater==='A'){
        setW(w=>clamp01(w+(Math.random()-0.5)*0.06));
        setM(m=>clamp01(m+(Math.random()-0.5)*0.06));
      }else{
        setWB(w=>clamp01(w+(Math.random()-0.5)*0.06));
        setMB(m=>clamp01(m+(Math.random()-0.5)*0.06));
      }
      setSeries(prev=>{
        const next=[...prev,iRate]; return next.length>120?next.slice(-120):next;
      });
    },500);
    return()=>clearInterval(id);
  },[auto,iRate,theater]);

  useEffect(()=>{
    setSeries(prev=>{
      const next=[...prev,iRate]; return next.length>120?next.slice(-120):next;
    });
  },[iRate,theater,W,M,N]);

  const idFlags=identifiability(P);
  const tabCls = (active: boolean) =>
    `px-2 py-1 rounded transition-colors ${
      active ? 'bg-white/20 text-white' : 'bg-white/10 text-gray-300 hover:bg-white/15'
    }`;

  // ---------- Domain/Mode helpers ----------
  const modesForTheater = (thId: TheaterId) => {
    const raw: any = THEATERS[thId]?.modes;
    return Array.isArray(raw) ? raw : Object.values(raw ?? {});
  };
  /** Back-compat alias: keep older call sites working */
  const getModes = (thId: TheaterId) => modesForTheater(thId);
  const getTheaterList = () => {
    const e = Object.entries(THEATERS || {});
    return e.map(([id, t]: any) => ({ id, title: t?.title ?? id }));
  };

  // ---------- Resizable 3-column layout (named areas) ----------
  const wrapRef = useRef<HTMLDivElement>(null);
  // [left, center, right] in "fr" units
  const [cols, setCols] = useState<[number, number, number]>([1, 1, 1]);

  // Grid with gutters; center never disappears
  const gridCols = guideOpen
    ? `${cols[0]}fr 8px ${cols[1]}fr 8px ${cols[2]}fr`
    : `${cols[0]}fr 8px ${cols[1] + cols[2]}fr`;
  const gridAreas = guideOpen
    ? `"left gutter1 center gutter2 right"`
    : `"left gutter1 center"`;

  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  function startDrag(pair: "L-C" | "C-R") {
    return (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = wrapRef.current?.getBoundingClientRect();
      if (!rect) return;

      const startX = e.clientX;
      const start = [...cols] as [number, number, number];
      const total = start[0] + start[1] + start[2];
      // Snapshot width so TS knows it's defined inside the closure too
      const startWidth = rect.width;

      function onMove(ev: MouseEvent) {
        const dxPx = ev.clientX - startX;
        const frac = (dxPx / startWidth) * total; // px → fr delta

        if (pair === "L-C") {
          const left   = clamp(start[0] + frac, 0.6, 4);
          const center = clamp(start[1] - frac, 0.6, 6);
          setCols([left, center, start[2]]);
        } else {
          const center = clamp(start[1] + frac, 0.6, 6);
          const right  = clamp(start[2] - frac, 0.6, 4);
          setCols([start[0], center, right]);
        }
      }
      function onUp() {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      }
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    };
  }

  /* ================================================
     MAIN RENDER - RESIZABLE 3-COLUMN GRID (named areas)
     ================================================ */
  return (
    <div className="min-h-screen bg-[#0f131c] text-gray-100 p-6">
      {/* Header row: title + guide toggle */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Active Theater</h1>
        <button
          onClick={() => setGuideOpen(v => !v)}
          className="rounded-md bg-white/10 px-3 py-1.5 hover:bg-white/15"
          title={guideOpen ? "Hide guided training" : "Show guided training"}
        >
          {guideOpen ? "Hide Guide" : "Show Guide"}
        </button>
      </div>

      {/* Main grid */}
      <div
        ref={wrapRef}
        className="grid"
        style={{
          ...st.columns,
          gridTemplateColumns: gridCols,
          gridTemplateAreas: gridAreas,
          alignItems: "start",
        }}
      >
        {/* ================= LEFT SIDEBAR ================= */}
        <div style={{ gridArea: "left" }} className="min-w-0 pr-2">
          {/* Left column header + help */}
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-semibold text-gray-300">Simulation Controls</div>
            <button
              onClick={() => setLeftHelpOpen(v => !v)}
              className="text-xs rounded px-2 py-1 bg-white/10 hover:bg-white/15"
              title="Explain this panel"
              aria-expanded={leftHelpOpen}
            >
              {leftHelpOpen ? "Hide help" : "Help ?"}
            </button>
          </div>
          {leftHelpOpen && <LeftPanelGuide />}

          <div className="space-y-3">
            {/* Theater + Episode */}
            <div className="grid grid-cols-2 gap-3">
              {/* Theater selector (A/B — per-run) */}
              <div className="rounded-md bg-[#121620] p-2">
                <div className="text-xs uppercase tracking-wide text-gray-400 mb-1">Theater</div>
                <div className="flex gap-2">
                  <button className={tabCls(theater === "A")} onClick={() => setTheater("A")}>Theater A</button>
                  <button className={tabCls(theater === "B")} onClick={() => setTheater("B")}>Theater B</button>
                </div>
                <div className="text-[11px] text-gray-500 mt-1">A and B share structure (P) but differ in conditions.</div>
              </div>

              {/* Episode Count (N) + Play/Clear */}
              <div className="rounded-md bg-[#121620] p-2">
                <div className="text-xs uppercase tracking-wide text-gray-400 mb-1">Episode Count (N)</div>
                <Number value={N} on={setN} min={200} max={20000} step={200} />
                <div className="flex gap-2 mt-2">
                  <button onClick={() => setAuto(a => !a)} className="px-2 py-1 rounded bg-white/10 hover:bg-white/15">
                    {auto ? "⏸ Pause" : "▶️ Play"}
                  </button>
                  <button onClick={() => setSeries([])} className="px-2 py-1 rounded bg-white/10 hover:bg-white/15">
                    🧹 Clear Chart
                  </button>
                </div>
                <div className="text-[11px] text-gray-500 mt-1">Larger N → smoother estimates</div>
              </div>
            </div>

            {/* Theater A controls */}
            <div className="rounded-lg bg-[#1b1f2a] p-3">
              <div className="text-sm font-medium mb-2">Theater A Conditions</div>
              <div className="w-full"><Slider label="Weather (W_A)" value={W} set={setW} /></div>
              <div className="w-full"><Slider label="Morale (M_A)" value={M} set={setM} /></div>
            </div>

            {/* Theater B controls */}
            <div className="rounded-lg bg-[#1b1f2a] p-3">
              <div className="text-sm font-medium mb-2">Theater B Conditions</div>
              <div className="w-full"><Slider label="Weather (W_B)" value={WB} set={setWB} /></div>
              <div className="w-full"><Slider label="Morale (M_B)" value={MB} set={setMB} /></div>
            </div>

            {/* Metrics + tiny chart */}
            <div className="grid grid-cols-2 gap-3">
              <Metric label="Avg Supply (S)" value={sMean} fmt="pct" />
              <Metric label="Avg Tempo (T)" value={tMean} fmt="pct" />
              <Metric label="Initiative Success" value={iRate} fmt="pct100" />
              <Metric label="ATE(S→I) adj. {W,M}" value={ate} fmt="delta" />
            </div>

            <div className="rounded-lg bg-[#1b1f2a] p-3">
              <div className="text-[11px] text-gray-500 mb-1">Initiative Success (%) — rolling</div>
              <TinyChart data={series} />
            </div>
          </div>
        </div>

        {/* Gutter: Left ↔ Center */}
        <div
          style={{ gridArea: "gutter1" }}
          onMouseDown={startDrag("L-C")}
          className="h-full cursor-col-resize bg-white/5 hover:bg-white/10"
          aria-label="Resize left/center"
        />

        {/* ================= CENTER COLUMN (always rendered) ================= */}
        <div style={{ gridArea: "center" }} className="min-w-0 px-2">
          {/* Domain + Mode */}
          {/* Center column header + help */}
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-semibold text-gray-300">Causal Graph & Equations</div>
            <button
              onClick={() => setCenterHelpOpen(v => !v)}
              className="text-xs rounded px-2 py-1 bg-white/10 hover:bg-white/15"
              title="Explain this panel"
              aria-expanded={centerHelpOpen}
            >
              {centerHelpOpen ? "Hide help" : "Help ?"}
            </button>
          </div>
          {centerHelpOpen && <CenterPanelGuide
            idFlags={idFlags}
            P={P}
            ateA={ateA}
            ateB={ateB}
            ateAtoB={ateAtoB}
            policyWin={policyWin}
            policyTitle={policyTitle}
          />}

          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            {/* Domain Theater (global) */}
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase tracking-wide text-gray-400">Domain</span>
              <select
                value={theaterId}
                onChange={(e) => setTheaterId(e.target.value as TheaterId)}
                className="bg-[#0f131c] border border-white/10 rounded px-2 py-1 text-sm min-w-[12rem]"
              >
                {getTheaterList().map(t => (
                  <option key={t.id} value={t.id}>{t.title}</option>
                ))}
              </select>
            </div>

            {/* Mode (global) */}
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase tracking-wide text-gray-400">Mode</span>
              <select
                value={modeId}
                onChange={(e) => setModeId(e.target.value as ModeId)}
                className="bg-[#0f131c] border border-white/10 rounded px-2 py-1 text-sm min-w-[12rem]"
              >
                {getModes(theaterId).map((m: any) => (
                  <option key={m.id} value={m.id}>{m.title ?? m.name ?? String(m.id)}</option>
                ))}
              </select>
            </div>
          </div>

          {/* DAG Viewer */}
          <div className="rounded-lg bg-[#1b1f2a] p-3 mb-3 min-w-0">
            <div className="text-sm font-medium mb-2">DAG Viewer &amp; Identifiability</div>
            <DagCanvas P={P} backdoorOK={idFlags.backdoorOK} frontdoorOK={idFlags.frontdoorOK} labels={dagLabels}/>
            <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
              <span className={`px-2 py-0.5 rounded ${idFlags.backdoorOK ? "bg-emerald-600/20 text-emerald-300" : "bg-emerald-600/10 text-emerald-800"}`}>
                Back-door identifiable (adjust {`{W,M}`})
              </span>
              <span className={`px-2 py-0.5 rounded ${idFlags.frontdoorOK ? "bg-rose-600/20 text-rose-300" : "bg-rose-600/10 text-rose-800"}`}>
                Front-door identifiable
              </span>
            </div>
          </div>

          {/* Structural Equations */}
          <div className="rounded-lg bg-[#1b1f2a] p-3 mb-3 min-w-0">
            <div className="text-sm font-medium mb-2">Structural Equations (live)</div>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded bg-[#121620] p-2">
                <div className="text-[12px] text-gray-400 mb-1">S = base − aW·W − aM·(1−M) + nS·εS</div>
                <div className="w-full"><Slider label="base" value={P.baseS} set={setBaseS} /></div>
                <div className="w-full"><Slider label="aW"   value={P.aW}   set={setAW}    /></div>
                <div className="w-full"><Slider label="aM"   value={P.aM}   set={setAM}    /></div>
                <div className="w-full"><Slider label="nS"   value={P.nS}   set={setNS}    /></div>
              </div>
              <div className="rounded bg-[#121620] p-2">
                <div className="text-[12px] text-gray-400 mb-1">T = base + bS·S + nT·εT</div>
                <div className="w-full"><Slider label="base" value={P.baseT} set={setBaseT} /></div>
                <div className="w-full"><Slider label="bS"   value={P.bS}   set={setBS}    /></div>
                <div className="w-full"><Slider label="nT"   value={P.nT}   set={setNT}    /></div>
              </div>
              <div className="rounded bg-[#121620] p-2">
                <div className="text-[12px] text-gray-400 mb-1">I = step(T − cW·W − thrT)</div>
                <div className="w-full"><Slider label="cW (direct W→I)" value={P.cW}  set={setCW}  /></div>
                <div className="w-full"><Slider label="thrT"             value={P.thrT} set={setThrT} /></div>
              </div>
            </div>
            <div className="mt-2">
              <button onClick={resetParams} className="px-2 py-1 rounded bg-white/10 hover:bg-white/15">Reset</button>
            </div>
          </div>

          {/* Transport */}
          <div className="rounded-lg bg-[#1b1f2a] p-3 mb-3 min-w-0">
            <div className="text-sm font-medium mb-2">Transport (A → B)</div>
            <div className="space-y-1 text-sm">
              <div className="flex items-center justify-between"><span>ATE_A (obs):</span><b>{fmtDelta(ateA)}</b></div>
              <div className="flex items-center justify-between"><span>ATE_B (obs):</span><b>{fmtDelta(ateB)}</b></div>
              <div className="flex items-center justify-between"><span>ATE_A→B (transport est.):</span><b>{fmtDelta(ateAtoB)}</b></div>
            </div>
            <div className="text-[11px] text-gray-500 mt-1">Transport uses A's E[I|X,z] but weights by B's P(z).</div>
          </div>

          {/* Policy */}
          <div className="rounded-lg bg-[#1b1f2a] p-3 mb-3 min-w-0">
            <div className="text-sm font-medium mb-2">{policyTitle} — Supply Boost Allocation</div>
            <div className="w-full"><Slider label="Budget fraction" value={budget} set={setBudget} /></div>
            <div className="flex items-center justify-between text-sm mt-1">
              <span>Expected wins:</span>
              <b>{policyWin.toFixed(1)}%</b>
            </div>
          </div>

          {/* Study Companion */}
          <div className="rounded-lg bg-[#1b1f2a] p-3 min-w-0">
            <div className="text-sm font-medium mb-2">Study Companion — War College Mode</div>
            <div className="mb-2">
              <select
                value={lesson.id}
                onChange={(e) => {
                  const val = (e.target as HTMLSelectElement).value;
                  setLesson(
                    WAR_COLLEGE_LESSONS.find(L => String(L.id) === val) || WAR_COLLEGE_LESSONS[0]
                  );
                }}
                className="bg-[#0f131c] border border-white/10 rounded px-2 py-1 text-sm"
              >
                {WAR_COLLEGE_LESSONS.map(L => (
                  <option key={L.id} value={String(L.id)}>{L.title}</option>
                ))}
              </select>
            </div>
            <div className="mt-2">
              <button
                onClick={() => runLessonAuto(lesson.auto)}
                className="px-2 py-1 rounded bg-white/10 hover:bg-white/15"
                disabled={autoRunning}
              >
                ▶️ Run Lesson (Auto)
              </button>
            </div>
          </div>
        </div>

        {/* Gutter: Center ↔ Right (only when guide is open) */}
        {guideOpen && (
          <div
            style={{ gridArea: "gutter2" }}
            onMouseDown={startDrag("C-R")}
            className="h-full cursor-col-resize bg-white/5 hover:bg-white/10"
            aria-label="Resize center/right"
          />
        )}

        {/* ================= RIGHT RAIL (Guided Training) ================= */}
        {guideOpen && (
          <aside style={{ gridArea: "right" }} className="min-w-0 pl-2">
            <div className="rounded-xl bg-[#161922] p-3 md:p-2 shadow border-l border-white/10 h-full overflow-auto">
              {/* Right column header + help */}
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-semibold text-gray-300">Guided Training</div>
                <button
                  onClick={() => setRightHelpOpen(v => !v)}
                  className="text-xs rounded px-2 py-1 bg-white/10 hover:bg-white/15"
                  title="Explain this panel"
                  aria-expanded={rightHelpOpen}
                >
                  {rightHelpOpen ? "Hide help" : "Help ?"}
                </button>
              </div>
              {rightHelpOpen && <RightPanelGuide
                 scenarioIdx={scenarioIdx}
                 stepIdx={stepIdx}
                 totalSteps={(SCENARIOS[scenarioIdx]?.steps?.length)||1}
              />}

               <TrainingHub
                scenarioIdx={scenarioIdx}
                stepIdx={stepIdx}
                onClose={() => setGuideOpen(false)}
                onPrev={() => setStepIdx(s => Math.max(0, s - 1))}
                onNext={() => setStepIdx(s => Math.min(curScenario.steps.length - 1, s + 1))}
                onPickScenario={(i: number) => { setScenarioIdx(i); setStepIdx(0); }}
              
                /* —— These three props were missing —— */
                lessons={WAR_COLLEGE_LESSONS}
                lesson={lesson}
                setLesson={setLesson}
              />
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}


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

/* ---------------------------------------------
   In-app documentation for the CENTER panel
   --------------------------------------------- */
function CenterPanelGuide({
  idFlags,
  
  ateA,
  ateB,
  ateAtoB,
  policyWin,
  policyTitle
}: { 
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

/* ---------------------------------------------
   In-app documentation for the RIGHT panel
   --------------------------------------------- */
function RightPanelGuide({
  scenarioIdx,
  stepIdx,
  totalSteps
}: { 
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
