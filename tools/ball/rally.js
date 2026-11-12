// Rally finder: where in a long video is the ball going back and forth?
// Works on a fast, coarse scan (frames as the video plays, irregular spacing), so everything uses real timestamps.
// A rally = a series of ball flights over the court, each starting at most `maxGap` s after the previous one ended,
// with at least `minShots` flights. Points, serves and in/out do not matter: in a lesson you often just keep playing.
const RALLYP={minShots:3,maxGap:2.5,pre:1.0,post:1.2,minTravel:0.07,minDur:0.15};
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
  const fl=[];
  for(const tr of tracks){const p=tr.pts,a=p[0],b=p[p.length-1],dur=b.t-a.t;if(dur<P.minDur)continue;
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
