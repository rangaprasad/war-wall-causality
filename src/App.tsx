import React, { useEffect, useMemo, useRef, useState } from "react";
import { WAR_COLLEGE_LESSONS } from "./companion/chapters-war-college";
import type { Lesson, AutoStep } from "./companion/chapters-war-college";
import { TrainingPanel, SCENARIOS } from "./training/GuidedTraining";

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
function PN(rows:Row[],P:Params){
  const losers=rows.filter(r=>r.I===0); if(!losers.length) return 0;
  const flips=losers.filter(r=>counterfactual_I(r,0.9,P)===1).length;
  return flips/losers.length;
}
function PS(rows:Row[],P:Params){
  const lowLost=rows.filter(r=>r.I===0 && S_high(r.S)===0); if(!lowLost.length) return 0;
  const flips=lowLost.filter(r=>counterfactual_I(r,0.9,P)===1).length;
  return flips/lowLost.length;
}
function PNS(pn:number,ps:number){ return pn*ps; }

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
function TinyChart({data}:{data:number[]}) {
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
function DagCanvas({P,backdoorOK,frontdoorOK}:{P:Params;backdoorOK:boolean;frontdoorOK:boolean;}){
  const ref=useRef<HTMLCanvasElement|null>(null);
  const rafRef=useRef<number|null>(null);

  useEffect(()=>{
    const c=ref.current; if(!c) return;
    const g=c.getContext("2d"); if(!g) return;

    const nodes={
      W:{x:120,y:80,label:"Weather (W)"},
      M:{x:120,y:220,label:"Morale (M)"},
      S:{x:320,y:150,label:"Supply (S)"},
      T:{x:520,y:150,label:"Tempo (T)"},
      I:{x:720,y:150,label:"Initiative (I)"}
    };

    const lerp=(a,b,t)=>a+(b-a)*t;
    const edge=(coef,min=1.6,max=5)=>lerp(min,max,clamp01(coef));

    const drawNode=n=>{
      g.fillStyle="rgba(255,255,255,0.05)";
      g.strokeStyle="#2a2a2a";
      g.lineWidth=1.5;
      g.beginPath();
      const r=10;
      g.roundRect(n.x-70,n.y-24,140,48,r);
      g.fill(); g.stroke();
      g.fillStyle="#eaeaea"; g.font="14px Inter"; g.textAlign="center"; g.textBaseline="middle";
      g.fillText(n.label,n.x,n.y);
    };

    const arrow=(a,b,w,color,dashed=false,dOffset=0)=>{
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

    const halo=(n,base,t)=>{
      const alpha=0.18+0.09*(0.5+0.5*Math.sin(t));
      const radius=66+6*(0.5+0.5*Math.sin(t));
      const [r,gc,b]=base;
      const grd=g.createRadialGradient(n.x,n.y,4,n.x,n.y,radius);
      grd.addColorStop(0,`rgba(${r},${gc},${b},${alpha})`);
      grd.addColorStop(1,`rgba(${r},${gc},${b},0)`);
      g.fillStyle=grd; g.beginPath(); g.arc(n.x,n.y,radius,0,Math.PI*2); g.fill();
    };

    const render=(tMs)=>{
      const Wc=c.width,Hc=c.height;
      g.clearRect(0,0,Wc,Hc);
      const t=tMs*0.004, dash=-tMs*0.05;
      if(backdoorOK){halo(nodes.W,[46,204,113],t);halo(nodes.M,[46,204,113],t);}
      if(frontdoorOK){halo(nodes.T,[236,72,153],t+1.2);}
      drawNode(nodes.W);drawNode(nodes.M);drawNode(nodes.S);drawNode(nodes.T);drawNode(nodes.I);
      arrow(nodes.W,nodes.S,edge(P.aW),"#60a5fa");
      arrow(nodes.M,nodes.S,edge(P.aM),"#60a5fa");
      arrow(nodes.S,nodes.T,edge(P.bS),"#a1a1aa");
      arrow(nodes.T,nodes.I,2.4,"#a1a1aa");
      if(P.cW>0) arrow(nodes.W,nodes.I,edge(P.cW),"#f59e0b",true,dash);
      rafRef.current=requestAnimationFrame(render);
    };
    rafRef.current=requestAnimationFrame(render);
    return()=>{if(rafRef.current)cancelAnimationFrame(rafRef.current);};
  },[P,backdoorOK,frontdoorOK]);

  return <canvas ref={ref} width={840} height={320} style={{width:"100%",height:320}}/>;
}

/* ---------- Identifiability ---------- */
function identifiability(P:Params){
  return {backdoorOK:true, frontdoorOK:(P.cW===0)};
}

/* ---------- UI Helpers (small, unchanged) ---------- */
const fmtDelta=(x:number)=> (x>=0?"+":"")+x.toFixed(3);
const Card=({title,children}:{title:string;children:any})=><div style={st.card}>
  <div style={st.cardTitle}>{title}</div>{children}
</div>;
const Hint=({children}:{children:any})=><div style={st.hint}>{children}</div>;
const Number=({value,on,min,max,step}:{value:number;on:(n:number)=>void;min:number;max:number;step:number})=>
  <input type="number" value={value} min={min} max={max} step={step}
    onChange={e=>on(parseInt(e.target.value||"1000",10))} style={st.number}/>;
const Slider=({label,value,set}:{label:string;value:number;set:(v:number)=>void})=>
<div style={{marginBottom:8}}>
  <div style={st.sliderRow}><div>{label}</div><div style={st.sliderVal}>{value.toFixed(2)}</div></div>
  <input type="range" min={0} max={1} step={0.01} value={value}
   onChange={e=>set(parseFloat(e.target.value))} style={{width:"100%"}}/>
</div>;
const Metric=({label,value,fmt="raw"}:{label:string;value:number;fmt?:string})=>{
  let display=value.toFixed(3);
  if(fmt==="pct")display=`${(value*100).toFixed(1)}%`;
  if(fmt==="pct100")display=`${value.toFixed(1)}%`;
  if(fmt==="delta")display=(value>=0?"+":"")+value.toFixed(3);
  return <div style={st.metric}><div style={st.metricLabel}>{label}</div><div style={st.metricValue}>{display}</div></div>;
};
const Section=({label,children}:{label:string;children:any})=>
<div style={st.section}><div style={st.sectionLabel}>{label}</div><div style={st.knobs}>{children}</div></div>;
const Knob=({label,v,set}:{label:string;v:number;set:(x:number)=>void})=>
<div style={st.knob}>
  <div style={st.knobLabel}>{label}</div>
  <input type="range" min={0} max={1.2} step={0.01} value={v} onChange={e=>set(parseFloat(e.target.value))}/>
  <div style={st.knobVal}>{v.toFixed(2)}</div>
</div>;
const Badge=({ok,label}:{ok:boolean;label:string})=>
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

export default function App(){

  /* ---------- UI State ---------- */
  const [theater,setTheater]=useState<'A'|'B'>('A');
  const [W,setW]=useState(0.35); const [M,setM]=useState(0.65);
  const [WB,setWB]=useState(0.55);const [MB,setMB]=useState(0.45);
  const [N,setN]=useState(1000);
  const [P,setP]=useState<Params>(DEFAULT);
  const [auto,setAuto]=useState(false);
  const [series,setSeries]=useState<number[]>([]);
  const [budget,setBudget]=useState(0.15);

  /* ---------- Guided Training ---------- */
  const [trainingOpen,setTrainingOpen]=useState(false);
  const [scenarioIdx,setScenarioIdx]=useState(0);
  const [stepIdx,setStepIdx]=useState(0);
  const curScenario=SCENARIOS[scenarioIdx];
  const curStep=curScenario.steps[stepIdx]||{};
  const haloBackdoor=!!curStep?.emphasis?.backdoorOK;
  const haloFrontdoor=!!curStep?.emphasis?.frontdoorOK;

  /* ---------- Study Companion ---------- */
  const [lesson,setLesson]=useState<Lesson>(WAR_COLLEGE_LESSONS[0]);
  const [autoRunning,setAutoRunning]=useState(false);
  const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
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
        if(st.kind==="param") setP(p=>({...p,[st.name]:st.value}));
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
  const pn=useMemo(()=>PN(active,P),[active,P]);
  const ps=useMemo(()=>PS(active,P),[active,P]);
  const pns=useMemo(()=>PNS(pn,ps),[pn,ps]);
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

  /* ---------- Render ---------- */
  return (
    <div style={st.page}>
      {/* Guided Training Modal */}
      <TrainingPanel
        open={trainingOpen}
        scenarioIdx={scenarioIdx}
        stepIdx={stepIdx}
        onClose={()=>setTrainingOpen(false)}
        onPrev={()=>setStepIdx(s=>Math.max(0,s-1))}
        onNext={()=>setStepIdx(s=>Math.min(curScenario.steps.length-1,s+1))}
        onPickScenario={i=>{setScenarioIdx(i);setStepIdx(0);}}
      />

      <button
        onClick={()=>{setTrainingOpen(true);setScenarioIdx(0);setStepIdx(0);}}
        style={{...st.button,marginBottom:16}}
      >
        🎯 Guided Training
      </button>

      <div style={st.wrap}>
        <div style={st.columns}>

          {/* LEFT */}
          <div style={st.left}>
            <h1 style={{fontSize:22,fontWeight:700,marginBottom:6}}>PearlKit — WAR-Wall (S→T→I)</h1>
            <p style={{color:"#9aa0a6",marginBottom:12}}>Adjust the theater, structure, and observe causal effects.</p>

            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <Card title="Active Theater">
                <div style={{display:"flex",gap:8}}>
                  <button onClick={()=>setTheater('A')} style={st.button}>Theater A</button>
                  <button onClick={()=>setTheater('B')} style={st.button}>Theater B</button>
                </div>
                <Hint>A and B share causal structure but differ in conditions.</Hint>
              </Card>

              <Card title="Episode Count (N)">
                <Number value={N} on={setN} min={200} max={20000} step={200}/>
                <div style={{display:"flex",gap:8,marginTop:8}}>
                  <button onClick={()=>setAuto(a=>!a)} style={st.button}>{auto?"⏸ Pause":"▶️ Play"}</button>
                  <button onClick={()=>setSeries([])} style={st.button}>🧹 Clear</button>
                </div>
              </Card>
            </div>

            <Card title="Theater A Conditions">
              <Slider label="Weather (W_A)" value={W} set={setW}/>
              <Slider label="Morale (M_A)" value={M} set={setM}/>
            </Card>

            <Card title="Theater B Conditions">
              <Slider label="Weather (W_B)" value={WB} set={setWB}/>
              <Slider label="Morale (M_B)" value={MB} set={setMB}/>
            </Card>

            <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:12}}>
              <Metric label="Avg Supply (S)" value={sMean} fmt="pct"/>
              <Metric label="Avg Tempo (T)" value={tMean} fmt="pct"/>
              <Metric label="Initiative Success" value={iRate} fmt="pct100"/>
              <Metric label="ATE(S→I) adj.{W,M}" value={ate} fmt="delta"/>
            </div>

            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginTop:8}}>
              <Metric label="PN (necessity)" value={pn} fmt="pct"/>
              <Metric label="PS (sufficiency)" value={ps} fmt="pct"/>
              <Metric label="PNS (hinge power)" value={pns} fmt="pct"/>
            </div>

            <div style={{marginTop:12}}>
              <div style={{color:"#9aa0a6",fontSize:12}}>Initiative Success (%) — rolling</div>
              <TinyChart data={series}/>
            </div>
          </div>

          {/* RIGHT */}
          <div style={st.right}>

            <Card title="DAG Viewer & Identifiability">
              <DagCanvas P={P} backdoorOK={haloBackdoor} frontdoorOK={haloFrontdoor}/>
              <div style={{display:"flex",gap:8,marginTop:8,flexWrap:"wrap"}}>
                <Badge ok={idFlags.backdoorOK} label="Back-door identifiable (adjust {W,M})"/>
                <Badge ok={idFlags.frontdoorOK} label="Front-door identifiable (if cW=0)"/>
              </div>
            </Card>

            <Card title="Structural Equations (live)">
              <Section label="S = base − aW*W − aM*(1−M) + nS*εS">
                <Knob label="base" v={P.baseS} set={x=>setP({...P,baseS:x})}/>
                <Knob label="aW" v={P.aW} set={x=>setP({...P,aW:x})}/>
                <Knob label="aM" v={P.aM} set={x=>setP({...P,aM:x})}/>
                <Knob label="nS" v={P.nS} set={x=>setP({...P,nS:x})}/>
              </Section>
              <Section label="T = base + bS*S + nT*εT">
                <Knob label="base" v={P.baseT} set={x=>setP({...P,baseT:x})}/>
                <Knob label="bS" v={P.bS} set={x=>setP({...P,bS:x})}/>
                <Knob label="nT" v={P.nT} set={x=>setP({...P,nT:x})}/>
              </Section>
              <Section label="I = step(T − cW*W > thr)">
                <Knob label="cW" v={P.cW} set={x=>setP({...P,cW:x})}/>
                <Knob label="thrT" v={P.thrT} set={x=>setP({...P,thrT:x})}/>
              </Section>
              <button style={st.button} onClick={()=>setP(DEFAULT)}>Reset</button>
            </Card>

            <Card title="Transport (A → B)">
              <div>{`ATE_A: ${fmtDelta(ateA)}`}</div>
              <div>{`ATE_B: ${fmtDelta(ateB)}`}</div>
              <div>{`ATE_A→B: ${fmtDelta(ateAtoB)}`}</div>
              <Hint>Transport uses A’s E[I|X,z], weighted by B’s P(z).</Hint>
            </Card>

            <Card title="Commander Policy — Supply Boost Allocation">
              <Slider label="Budget fraction" value={budget} set={setBudget}/>
              <div style={{marginTop:6}}>Expected wins: <b>{policyWin.toFixed(1)}%</b></div>
            </Card>

            <Card title="Study Companion — War College Mode">
              <div style={{marginBottom:6}}>
                <select value={lesson.id} onChange={e=>setLesson(WAR_COLLEGE_LESSONS.find(l=>l.id===+e.target.value)!)} style={st.number}>
                  {WAR_COLLEGE_LESSONS.map(l=><option key={l.id} value={l.id}>{l.title}</option>)}
                </select>
              </div>
              <div style={{marginBottom:10,fontWeight:600}}>Doctrine</div>
              <div style={{marginBottom:16,color:"#cbd5e1"}}>{lesson.doctrine}</div>

              <div style={{marginBottom:10,fontWeight:600}}>Manual Orders</div>
              <ol style={{marginLeft:18,marginBottom:16,color:"#cbd5e1"}}>
                {lesson.manualOrders.map((s,i)=><li key={i}>{s}</li>)}
              </ol>

              <div style={{marginBottom:10,fontWeight:600}}>Interpretation</div>
              <div style={{marginBottom:16,color:"#cbd5e1"}}>{lesson.interpretation}</div>

              <button disabled={autoRunning} onClick={()=>runLessonAuto(lesson.auto)} style={{...st.button,opacity:autoRunning?0.6:1}}>
                {autoRunning?"Running…":"▶️ Run Lesson (Auto)"}
              </button>
            </Card>

          </div>

        </div>
      </div>
    </div>
  );
}

