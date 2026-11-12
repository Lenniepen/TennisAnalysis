// ---- split-step timing ----
// For every hit of the opponent: when does the near player land his split-step, relative to that contact?
// A split-step = both feet move at the same time (small hop, landing on two feet, often spreading them), then both stand
// still for a moment. Walking/running moves one foot at a time, so it does not count. Foot = mean of ankle and toe,
// motion per frame in torso lengths (independent of distance to the camera).
// Rule of thumb: land ~0.15-0.25 s after the opponent's contact (2minuteTennis: 0.2 s; Aviles et al.: take-off -0.04 s,
// landing +0.16 s; Uzu et al. 2009: best landing ~0.18 s after the signal).
// frames: [{t,P}] with P = 33 MediaPipe landmarks {x,y,v} in 0..1; W,H = video size; hits: opponent contact times.
const SS={MOVE:0.06,STILL:0.075,MINF:2,MINSC:0.25,GAP:0.13,W0:-0.35,W1:0.6,NORM:[0.12,0.28]};
function ssMotion(frames,W,H){
  const ok=(P,...i)=>i.every(k=>P[k]&&(P[k].v==null||P[k].v>=0.4));
  const F=frames.filter(f=>f.P&&ok(f.P,11,12,23,24,27,28)),out=[];
  // the times are seek times (jittery); the real frame step is the median step
  const st=F.slice(1).map((f,i)=>f.t-F[i].t).filter(d=>d>0.005).sort((a,b)=>a-b),k=st.length?0.04/st[st.length>>1]:1;
  const foot=(P,a,b)=>ok(P,b)?[(P[a].x+P[b].x)/2*W,(P[a].y+P[b].y)/2*H]:[P[a].x*W,P[a].y*H];
  for(let i=1;i<F.length;i++){const P=F[i].P,Q=F[i-1].P,dt=F[i].t-F[i-1].t;if(dt>0.1)continue;
    const tor=Math.hypot((P[11].x+P[12].x-P[23].x-P[24].x)/2*W,(P[11].y+P[12].y-P[23].y-P[24].y)/2*H);if(!tor)continue;
    // motion per frame scaled to 25 fps (k), so 50/60 fps give the same numbers
    const L=foot(P,27,31),L0=foot(Q,27,31),R=foot(P,28,32),R0=foot(Q,28,32);
    const dl=Math.hypot(L[0]-L0[0],L[1]-L0[1])/tor*k,dr=Math.hypot(R[0]-R0[0],R[1]-R0[1])/tor*k;
    out.push({t:F[i].t,t0:F[i-1].t,m:Math.min(dl,dr),M:Math.max(dl,dr)})}
  return out}
function splitSteps(frames,W,H,hits){
  const S=ssMotion(frames,W,H),cands=[];
  // phases where both feet move, followed (within GAP) by a frame where both are still
  for(let i=0;i<S.length;){if(S[i].m<SS.MOVE){i++;continue}
    let j=i;while(j+1<S.length&&S[j+1].m>=SS.MOVE&&S[j+1].t-S[j].t<0.1)j++;
    const n=j-i+1;let still=-1;for(let q=j+1;q<S.length&&S[q].t-S[j].t<=SS.GAP;q++)if(S[q].M<=SS.STILL){still=q;break}
    if(n>=SS.MINF&&still>=0){let sc=0;for(let q=i;q<=j;q++)sc+=S[q].m;if(sc>=SS.MINSC)cands.push({off:S[i].t0,land:(S[still].t0+S[still].t)/2,score:sc})}
    i=j+1}
  return hits.map(th=>{
    const near=S.filter(s=>s.t>th-0.6&&s.t<th+0.7);if(near.length<10)return{t:th,ok:false,why:'speler niet goed in beeld'};
    const c=cands.filter(c=>c.land>=th+SS.W0&&c.land<=th+SS.W1).sort((a,b)=>b.score-a.score)[0];
    if(!c)return{t:th,ok:false,why:'geen split-step gezien'};
    const dl=c.land-th,adv=dl<SS.NORM[0]?'te vroeg: je landt voordat je de richting kunt zien; spring iets later in':dl>SS.NORM[1]?'te laat: spring eerder in, zodat je landt zodra de bal vertrekt':'goed getimed';
    return{t:th,ok:true,off:+(c.off-th).toFixed(2),land:+dl.toFixed(2),score:+c.score.toFixed(2),advice:adv}})}
if(typeof module!=='undefined')module.exports={splitSteps,ssMotion,SS};
