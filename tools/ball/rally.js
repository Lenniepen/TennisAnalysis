// Rally finder: where in a long video is the ball going back and forth?
// Works on a fast, coarse scan (frames as the video plays, irregular spacing), so everything uses real timestamps.
// A rally = a series of ball flights over the court, each starting at most `maxGap` s after the previous one ended,
// with at least `minShots` flights. Points, serves and in/out do not matter: in a lesson you often just keep playing.
// maxGap 2.8 s: a high lob + bounce + the next hit, with the far-side ball partly unseen, takes ~2.6 s (punt 3); a real
// break between rallies (fetching balls, walking) was 3.0 s or more in the test video
const RALLYP={minShots:3,maxGap:2.8,pre:1.0,post:1.2,minTravel:0.07,minDur:0.15};
// frames: [{t, c:[{x,y}]}] (normalised image coords) -> tracks [{pts:[{t,x,y}]}]
function rallyTracks(frames,W,H){
  const F=frames.map(f=>({t:f.t,c:f.c.map(c=>({x:c.x*W,y:c.y*H,nx:c.x,ny:c.y,used:false}))}));
  const vmax=6*H,vmin=0.12*H;// px per second
  const seeds=[];
  for(let k=1;k<F.length-1;k++){const A=F[k-1],B=F[k],C=F[k+1],d1=B.t-A.t,d2=C.t-B.t;if(d1<=0||d2<=0||d1>0.15||d2>0.15)continue;
    for(const b of B.c)for(const a of A.c){const vx=(b.x-a.x)/d1,vy=(b.y-a.y)/d1,sp=Math.hypot(vx,vy);if(sp>vmax||sp<vmin)continue;
      for(const c of C.c){const ex=c.x-(b.x+vx*d2),ey=c.y-(b.y+vy*d2),e=Math.hypot(ex,ey);if(e>3+0.35*sp*d2)continue;seeds.push({k,a,b,c,e:e/(1+sp*d2)})}}}
  seeds.sort((p,q)=>p.e-q.e);const tracks=[];
  for(const s of seeds){if(s.a.used||s.b.used||s.c.used)continue;const pts=[{k:s.k-1,c:s.a},{k:s.k,c:s.b},{k:s.k+1,c:s.c}];
    const grow=dir=>{let miss=0;while(miss<=2){const L=dir>0?pts[pts.length-1]:pts[0],L2=dir>0?pts[pts.length-2]:pts[1];const k=L.k+dir*(1+miss);if(k<0||k>=F.length)break;
        const dtL=F[L.k].t-F[L2.k].t;if(!dtL)break;const vx=(L.c.x-L2.c.x)/dtL,vy=(L.c.y-L2.c.y)/dtL,dt=F[k].t-F[L.k].t;if(Math.abs(dt)>0.25)break;
        const px=L.c.x+vx*dt,py=L.c.y+vy*dt,R=4+0.4*Math.hypot(vx,vy)*Math.abs(dt);let best=null,bd=R;
        for(const c of F[k].c){if(c.used)continue;const d=Math.hypot(c.x-px,c.y-py);if(d<bd){bd=d;best=c}}
        if(best){best.used=true;const e={k,c:best};if(dir>0)pts.push(e);else pts.unshift(e);miss=0}else miss++}};
    for(const p of pts)p.c.used=true;grow(1);grow(-1);
    if(pts.length<4){for(const p of pts)p.c.used=false;continue}
    tracks.push({pts:pts.map(p=>({t:F[p.k].t,x:p.c.nx,y:p.c.ny}))})}
  return tracks.sort((a,b)=>a.pts[0].t-b.pts[0].t)}
// tracks -> flights (long enough moves over the court) -> rallies [{t0,t1,shots,flights}]
function rallySegments(tracks,opt){const P={...RALLYP,...(opt||{})};
  // first chain the pieces of one flight: a ball on the far side moves slowly in the image and its track breaks into
  // pieces of ~0.5 s that each travel too little on their own (DJI_0094 at 14:00, 66.4-68.1 s: punt 3 was cut in two).
  // A piece continues a chain when it starts at most 0.6 s later, near where the chain was heading, in the same direction.
  const T=tracks.map(tr=>tr.pts).filter(p=>p.length>=2).sort((a,b)=>a[0].t-b[0].t),chains=[];
  const vel=p=>{const a=p[Math.max(0,p.length-4)],b=p[p.length-1],d=b.t-a.t||1e-3;return[(b.x-a.x)/d,(b.y-a.y)/d]};
  // only ball-like pieces chain (straight, moving): a slow, jittery track on a player must not swallow a ball piece
  const ballish=p=>{const a=p[0],b=p[p.length-1],d=b.t-a.t;if(d<=0)return false;let tr=0;for(let i=1;i<p.length;i++)tr+=Math.hypot(p[i].x-p[i-1].x,p[i].y-p[i-1].y);
    return tr>0&&Math.hypot(b.x-a.x,b.y-a.y)>=0.6*tr&&tr/d>=0.06};
  for(const p of T){let best=null,bd=1e9;const ok=ballish(p);
    for(const c of chains){if(!ok||!c.ball)continue;const e=c[c.length-1],gap=p[0].t-e.t;if(gap<-0.05||gap>0.6)continue;
      const v=vel(c),px=e.x+v[0]*gap,py=e.y+v[1]*gap,d=Math.hypot(p[0].x-px,p[0].y-py),sp=Math.hypot(...v);
      // same direction, also vertically: the shot count below counts up/down changes in the image, chaining over the top
      // of a lob would hide one (outdoor 0.2-11.8 s lost a rally that way)
      const q=p[p.length-1],dir=(q.x-p[0].x)*v[0]+(q.y-p[0].y)*v[1],c0=c[0],vsame=Math.sign(q.y-p[0].y)===Math.sign(e.y-c0.y);
      if(d<=Math.max(0.03,0.6*sp*Math.max(gap,0.04))&&dir>0&&vsame&&d<bd){bd=d;best=c}}
    if(best){for(const x of p)if(x.t>best[best.length-1].t)best.push(x)}else{const c=p.slice();c.ball=ok;chains.push(c)}}
  const fl=[];
  for(const p of chains){const a=p[0],b=p[p.length-1],dur=b.t-a.t;if(dur<P.minDur)continue;
    let travel=0;for(let i=1;i<p.length;i++)travel+=Math.hypot(p[i].x-p[i-1].x,p[i].y-p[i-1].y);
    if(travel<P.minTravel)continue;
    // straight-ish: net displacement at least half of the path (no jitter on a player)
    if(Math.hypot(b.x-a.x,b.y-a.y)<0.5*travel)continue;
    fl.push({t0:a.t,t1:b.t,dir:Math.sign(b.y-a.y)||1})}
  fl.sort((a,b)=>a.t0-b.t0);
  // pieces of one flight (a track broken in two): same direction, small gap -> join
  const F=[];for(const f of fl){const l=F[F.length-1];if(l&&f.dir===l.dir&&f.t0-l.t1<0.4&&f.t0>=l.t0)l.t1=Math.max(l.t1,f.t1);else if(l&&f.t0<l.t1)l.t1=Math.max(l.t1,f.t1);else F.push({...f})}
  const out=[];let cur=null;
  const close=()=>{if(cur&&cur.shots>=P.minShots)out.push({t0:Math.max(0,cur.t0-P.pre),t1:cur.t1+P.post,shots:cur.shots,flights:cur.n});cur=null};
  for(const f of F){if(cur&&f.t0-cur.t1<=P.maxGap){cur.t1=Math.max(cur.t1,f.t1);cur.n++;if(f.dir!==cur.dir){cur.shots++;cur.dir=f.dir}}
    else{close();cur={t0:f.t0,t1:f.t1,n:1,shots:1,dir:f.dir}}}
  close();return out}
if(typeof module!=='undefined')module.exports={RALLYP,rallyTracks,rallySegments};
