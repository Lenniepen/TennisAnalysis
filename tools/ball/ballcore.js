// Ball detection v3: candidates from motion + shape (colour only as a bonus), tracks from physics (smooth path).
// Robust to surface, light and ball colour (motion blur mixes the ball with its background; under warm light it looks white).
function ballPrep(d,cw,chh){const n=cw*chh,R=new Uint8Array(n),G=new Uint8Array(n),B=new Uint8Array(n),lum=new Uint8Array(n);
  for(let i=0,j=0;i<n;i++,j+=4){R[i]=d[j];G[i]=d[j+1];B[i]=d[j+2];lum[i]=(d[j]*3+d[j+1]*6+d[j+2])/10}
  return{w:cw,h:chh,R,G,B,lum}}
const BALLP={motion:12,loose:6,maxA:260,iso:7,maxCand:30};
// the space where a ball can be: above the court (+ margin), up to the top of the picture.
// toImg(X,Y) maps court metres to video px. Returns allowed(x,y) in video px.
function ballSpace(toImg,VW,VH){const M=2.5,HW=5.485,L=23.77;
  // near side: the camera usually stands just behind the baseline, so use a small margin there (points behind the camera do not project)
  const nl=toImg(-HW-M,-1),nr=toImg(HW+M,-1),fr=toImg(HW+M,L+6),fl=toImg(-HW-M,L+6);
  if([nl,nr,fr,fl].some(p=>!p||!isFinite(p[0])||!isFinite(p[1])))return null;
  const side=(a,b,x,y)=>(b[0]-a[0])*(y-a[1])-(b[1]-a[1])*(x-a[0]);// sign: left/right of line a->b
  const sl=Math.sign(side(nl,fl,nr[0],nr[1])),sr=Math.sign(side(nr,fr,nl[0],nl[1])),sn=Math.sign(side(nl,nr,fl[0],fl[1]));
  const topY=Math.min(fl[1],fr[1]);
  // a high ball close to the camera (the serve toss, a lob over the near player) also shows up above the far end, but
  // wider: allow up to the near baseline corners there
  const c0=toImg(-HW,0),c1=toImg(HW,0),ux0=Math.min(fl[0],c0&&isFinite(c0[0])?c0[0]:fl[0])-0.03*VW,ux1=Math.max(fr[0],c1&&isFinite(c1[0])?c1[0]:fr[0])+0.03*VW;
  return(x,y)=>{
    if(side(nl,nr,x,y)*sn<0)return false;// in front of the near margin (closer to the camera)
    if(y>=topY)return side(nl,fl,x,y)*sl>=0&&side(nr,fr,x,y)*sr>=0;// ground area: between the (extended) sidelines
    return x>=ux0&&x<=ux1}}
// candidates in the middle frame: pixels that differ from BOTH neighbours (the object is here now, not before/after)
// noIso: skip the isolation test (near the hand at the moment of contact the ball touches the racket)
// prev2/next2 (optional, 2 frames away): a slow ball (top of a lob) moves less than its own width per frame and
// would hide in the overlap with its neighbours; comparing 2 frames away keeps it visible
function blobsFrom(prev,cur,next,r,scale,VW,VH,allowed,noIso,prev2,next2){const P=BALLP;
  const w=cur.w,h=cur.h,n=w*h,mask=new Uint8Array(n),loose=new Uint8Array(n);
  for(let i=0;i<n;i++){const c=cur.lum[i];let d1=Math.abs(c-prev.lum[i]),d2=Math.abs(c-next.lum[i]);
    if(prev2&&next2){d1=Math.max(d1,Math.abs(c-prev2.lum[i]));d2=Math.max(d2,Math.abs(c-next2.lum[i]))}
    if(d1>P.loose||d2>P.loose)loose[i]=1;if(d1>P.motion&&d2>P.motion)mask[i]=1}
  // integral image of loose motion, for the isolation test
  const I=new Int32Array((w+1)*(h+1));for(let y=0;y<h;y++){let s=0;for(let x=0;x<w;x++){s+=loose[y*w+x];I[(y+1)*(w+1)+x+1]=I[y*(w+1)+x+1]+s}}
  const box=(x0,y0,x1,y1)=>{x0=Math.max(0,x0);y0=Math.max(0,y0);x1=Math.min(w,x1);y1=Math.min(h,y1);if(x1<=x0||y1<=y0)return 0;return I[y1*(w+1)+x1]-I[y0*(w+1)+x1]-I[y1*(w+1)+x0]+I[y0*(w+1)+x0]};
  const lab=new Int32Array(n),out=[];let id=0;const stack=[];const maxA=P.maxA*scale*scale;
  for(let i=0;i<n;i++){if(!mask[i]||lab[i])continue;id++;let a=0,sx=0,sy=0,sxx=0,syy=0,sxy=0,x0=w,x1=0,y0=h,y1=0,ys=0;stack.push(i);lab[i]=id;
    while(stack.length){const k=stack.pop(),x=k%w,y=(k/w)|0;a++;sx+=x;sy+=y;sxx+=x*x;syy+=y*y;sxy+=x*y;if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;
      const bR=(prev.R[k]+next.R[k])/2,bG=(prev.G[k]+next.G[k])/2,bB=(prev.B[k]+next.B[k])/2;ys+=((cur.R[k]-bR)+(cur.G[k]-bG))/2-(cur.B[k]-bB);
      for(const q of[k-1,k+1,k-w,k+w,k-w-1,k-w+1,k+w-1,k+w+1]){if(q<0||q>=n||lab[q]||!mask[q])continue;if(Math.abs((q%w)-x)>1)continue;lab[q]=id;stack.push(q)}}
    const bw=x1-x0+1,bh=y1-y0+1;if(a<2||a>maxA*6)continue;
    // shape along the blob's own axis: round (slow ball) or a thin streak (fast ball, motion blur near the camera)
    const mx=sx/a,my=sy/a,cxx=sxx/a-mx*mx+1/12,cyy=syy/a-my*my+1/12,cxy=sxy/a-mx*my,tr=cxx+cyy,dt_=Math.sqrt(Math.max(0,(cxx-cyy)**2/4+cxy*cxy)),l1=tr/2+dt_,l2=Math.max(0.08,tr/2-dt_);
    const elong=Math.sqrt(l1/l2),streak=elong>3.5;
    // a streak may be long (a fast ball close to the camera smears over 50-100 px), so it may have a larger area than a round ball
    if(streak){if(elong>25||Math.sqrt(l2)>3.5*Math.max(scale,0.5)||a<5)continue}else if(a<0.3*bw*bh||a>maxA)continue;
    // isolation: a ball is a small island of motion; an arm/racket/leg sits in a big moving area
    const m=streak?Math.max(6,4*Math.sqrt(l2)):Math.max(6,Math.max(bw,bh)*1.5),around=box(x0-m,y0-m,x1+1+m,y1+1+m);if(!noIso&&around>P.iso*a+20+(streak?a:0))continue;
    const vx=r.x+(sx/a+0.5)/scale,vy=r.y+(sy/a+0.5)/scale;if(allowed&&!allowed(vx,vy))continue;
    const yel=ys/a;out.push({x:(r.x+(sx/a+0.5)/scale)/VW,y:(r.y+(sy/a+0.5)/scale)/VH,a,yel,sc:Math.sqrt(a)*(1+Math.max(0,yel)/30)})}
  out.sort((p,q)=>q.sc-p.sc);
  return{s:out.slice(0,P.maxCand),w:[]};
}
// physics linking: seeds = triples (k-1,k,k+1) with near-constant velocity; grow both ways with prediction, allow gaps
function linkTracks(frames,W,H){
  const F=frames.map(f=>({t:f.t,c:f.c.map(c=>({...c,X:c.x*W,Y:c.y*H,used:false}))}));
  const maxStep=0.12*H;// px per frame (fast serve near the camera)
  const seeds=[];
  for(let k=1;k<F.length-1;k++){const A=F[k-1].c,B=F[k].c,C=F[k+1].c;
    for(const b of B)for(const a of A){const vx=b.X-a.X,vy=b.Y-a.Y,sp=Math.hypot(vx,vy);if(sp>maxStep||sp<1.2)continue;
      for(const c of C){const ex=c.X-(b.X+vx),ey=c.Y-(b.Y+vy),err=Math.hypot(ex,ey);if(err>2.5+0.15*sp)continue;
        seeds.push({k,a,b,c,err,sp})}}}
  seeds.sort((p,q)=>p.err/(1+p.sp)-q.err/(1+q.sp));
  const tracks=[];
  for(const s of seeds){if(s.a.used||s.b.used||s.c.used)continue;
    const pts=[{k:s.k-1,c:s.a},{k:s.k,c:s.b},{k:s.k+1,c:s.c}];
    const grow=dir=>{let miss=0;while(miss<=3){const L=dir>0?pts[pts.length-1]:pts[0],L2=dir>0?pts[pts.length-2]:pts[1],L3=dir>0?pts[pts.length-3]:pts[2];
        const k=L.k+dir*(1+miss);if(k<0||k>=F.length)break;
        const dk1=(L.k-L2.k),vx=(L.c.X-L2.c.X)/dk1,vy=(L.c.Y-L2.c.Y)/dk1;
        // acceleration from the last three points (gravity in the image), damped
        const dk2=(L2.k-L3.k)||1,ax=L3?((L.c.X-L2.c.X)/dk1-(L2.c.X-L3.c.X)/dk2)/((dk1+dk2)/2)*0.5:0,ay=L3?((L.c.Y-L2.c.Y)/dk1-(L2.c.Y-L3.c.Y)/dk2)/((dk1+dk2)/2)*0.5:0;
        const n_=(1+miss)*dir;const px=L.c.X+vx*n_+0.5*ax*n_*n_,py=L.c.Y+vy*n_+0.5*ay*n_*n_;
        const sp=Math.hypot(vx,vy),R=4+0.35*sp*(1+miss*0.5);let best=null,bd=R;
        for(const c of F[k].c){if(c.used)continue;const d=Math.hypot(c.X-px,c.Y-py);if(d<bd){bd=d;best=c}}
        // a bounce or hit changes direction: second chance with a wider radius around the last position, only for the next frame
        if(!best&&miss===0){const R2=Math.max(10,1.2*sp);bd=R2;for(const c of F[k].c){if(c.used)continue;const d=Math.hypot(c.X-L.c.X,c.Y-L.c.Y);if(d<bd&&d>0.3*sp){bd=d;best=c}}
          if(best){// must be followed by a consistent next point, else ignore
            const k2=k+dir;if(k2<0||k2>=F.length)best=null;else{const v2x=best.X-L.c.X,v2y=best.Y-L.c.Y;let ok=false;for(const c of F[k2].c){if(c.used||c===best)continue;if(Math.hypot(c.X-(best.X+v2x),c.Y-(best.Y+v2y))<4+0.35*Math.hypot(v2x,v2y)){ok=true;break}}if(!ok)best=null}}}
        if(best){const e={k,c:best};if(dir>0)pts.push(e);else pts.unshift(e);best.used=true;miss=0}else miss++}};
    for(const p of pts)p.c.used=true;grow(1);grow(-1);
    if(pts.length<5){for(const p of pts)p.c.used=false;continue}
    tracks.push({pts:pts.map(p=>({t:F[p.k].t,x:p.c.x,y:p.c.y,weak:false}))})}
  return tracks.sort((a,b)=>a.pts[0].t-b.pts[0].t);
}
// Join track pieces into flights and find events. A bounce or a hit often breaks a track in two; the event sits in the gap.
// boxesAt(t) -> person boxes [{x0,x1,y0,y1}] (normalised) at time t. Event near a person and above the feet = hit, else
// a sharp change from "going down" to "going up (less down)" in the image = bounce.
// Returns {flights:[[{t,x,y}]], bounces:[{t,x,y}], hits:[{t,x,y}]}
// netY(xPx) -> image y (px) of the net at that x (optional): a bounce on the near half only counts when the ball came over the net
// (rules out bouncing the ball before the serve, and noise around the near player)
function ballEvents(tracks,boxesAt,W,H,netY){
  const T=tracks.map(t=>t.pts.slice()).sort((a,b)=>a[0].t-b[0].t);
  const vel=(p,i,dir)=>{// mean velocity (px/s) over up to 2 steps on one side of point i
    const j=Math.max(0,Math.min(p.length-1,i+2*dir));if(j===i)return null;const a=dir>0?p[i]:p[j],b=dir>0?p[j]:p[i],dt=b.t-a.t;if(dt<=0)return null;
    return[(b.x-a.x)*W/dt,(b.y-a.y)*H/dt]};
  // 1. chain pieces: B follows A when it starts shortly after A ends, close to where A was heading
  const used=new Set(),flights=[];
  for(let i=0;i<T.length;i++){if(used.has(i))continue;used.add(i);let path=T[i].slice();const joins=[];
    for(;;){const e=path[path.length-1],ve=vel(path,path.length-1,-1)||[0,0],sp=Math.hypot(ve[0],ve[1]);let bj=-1,bd=Infinity;
      for(let j=0;j<T.length;j++){if(used.has(j))continue;const s=T[j][0],gap=s.t-e.t;if(gap<=0||gap>0.25)continue;
        const d=Math.hypot((s.x-e.x)*W,(s.y-e.y)*H),lim=Math.max(0.05*H,sp*gap*1.6+0.02*H);if(d<lim&&d<bd){bd=d;bj=j}}
      if(bj<0)break;used.add(bj);joins.push(path.length);path=path.concat(T[bj])}
    flights.push({path,joins})}
  // 2. events: direction changes inside a flight, and every join
  const isHit=(p)=>{const bx=boxesAt?boxesAt(p.t):[];return bx.some(b=>{const mw=(b.x1-b.x0)*0.25,mh=(b.y1-b.y0)*0.1;return p.x>b.x0-mw&&p.x<b.x1+mw&&p.y>b.y0-mh*2&&p.y<b.y1-(b.y1-b.y0)*0.2})};
  const onPerson=(p)=>{const bx=boxesAt?boxesAt(p.t):[];return bx.some(b=>{const mw=(b.x1-b.x0)*0.1,mh=(b.y1-b.y0)*0.1;return p.x>b.x0-mw&&p.x<b.x1+mw&&p.y>b.y0-mh&&p.y<b.y1+mh})};
  const bounces=[],hits=[];
  for(const f of flights){const p=f.path;
    for(let i=1;i<p.length-1;i++){const vi=vel(p,i,-1),vo=vel(p,i,1);if(!vi||!vo)continue;
      const si=Math.hypot(vi[0],vi[1]),so=Math.hypot(vo[0],vo[1]);if(si<1||so<1)continue;
      const cos=(vi[0]*vo[0]+vi[1]*vo[1])/(si*so),dvy=vo[1]-vi[1];
      const turn=cos<Math.cos(35*Math.PI/180),dropDown=vi[1]>0&&dvy<-Math.max(0.06*H,0.35*si);
      if(!(turn||dropDown||f.joins.includes(i)))continue;
      const ev={t:p[i].t,x:p[i].x,y:p[i].y};
      if(isHit(p[i])){if(turn||f.joins.includes(i))hits.push(ev);continue}
      if(!dropDown)continue;
      // near half: only a ball that came over the net counts, also right at the player's feet. Bouncing the ball before
      // the serve, a leg or a racket never gets above the net in the picture. Without a net line: skip bounces on a player.
      if(netY){if(p[i].y*H>netY(p[i].x*W)){let over=false;for(let j=i-1;j>=0&&p[i].t-p[j].t<1.5;j--)if(p[j].y*H<netY(p[j].x*W)){over=true;break}if(!over)continue}}
      else if(onPerson(p[i]))continue;
      bounces.push(ev)}}
  const dedup=L=>{L.sort((a,b)=>a.t-b.t);const o=[];for(const e of L)if(!o.length||e.t-o[o.length-1].t>0.2)o.push(e);return o};
  return{flights:flights.map(f=>f.path),bounces:dedup(bounces),hits:dedup(hits)};
}
if(typeof module!=='undefined')module.exports={ballPrep,blobsFrom,linkTracks,BALLP,ballSpace,ballEvents};
