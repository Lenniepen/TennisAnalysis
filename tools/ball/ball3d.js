// Ball in 3D from one camera (like Hawk-Eye, but with a single camera).
// 1. ballCamera: camera position, angle and focal length from the court calibration (homography + lens k).
// 2. fit3d: a 3D flight per piece of track: gravity, air drag and spin (Magnus: topspin/slice pushes the ball down/up,
//    side spin sideways). Spin is estimated per flight (no need to know the stroke type), with a mild prior.
// 3. rally3d: splits the ball points into flights and labels every break as bounce / hit / gap, choosing the most likely
//    sequence that follows the tennis rules (dynamic programming). A bounce = the ball reaches height 0 and goes on in the
//    same direction; a hit = height 0.15-3.2 m, the ball turns back (the length direction reverses), near a player.
//    Rules (ITF): hits alternate between the sides; at most one bounce between two hits (second bounce = end of the point);
//    the return of serve must bounce first; bounces before the serve are the server bouncing the ball. In doubt: penalties,
//    never hard stops.
const B3={G:9.81,KD:0.0197,KM:0.0359,sig:1.5,hub:3,cap:14,spinSd:0.2,maxSeg:2.6,minPts:5,skip:12,NET:11.885,L:23.77,HW:5.485};
// pts: the 4 calibration points (normalised), ref: their court positions in metres (default: the two baselines)
function ballCamera(pts,k,W,H,ref){
  k=k||0;const s=Math.hypot(W,H)/2,cx=W/2,cy=H/2;
  const und=(x,y)=>{if(!k)return[x,y];const dx=(x-cx)/s,dy=(y-cy)/s,f=1/(1+k*(dx*dx+dy*dy));return[cx+dx*f*s,cy+dy*f*s]};
  const dis=(x,y)=>{if(!k)return[x,y];const dx=(x-cx)/s,dy=(y-cy)/s,ru=Math.hypot(dx,dy);if(ru<1e-9)return[x,y];const D=1-4*k*ru*ru;if(D<0)return null;const f=(1-Math.sqrt(D))/(2*k*ru)/ru;return[cx+dx*f*s,cy+dy*f*s]};
  ref=ref||[[-B3.HW,0],[B3.HW,0],[B3.HW,B3.L],[-B3.HW,B3.L]];const img=pts.map(p=>und(p.x*W,p.y*H));
  const A=[],b=[];for(let i=0;i<4;i++){const[x,y]=ref[i],[X,Y]=img[i];A.push([x,y,1,0,0,0,-X*x,-X*y]);b.push(X);A.push([0,0,0,x,y,1,-Y*x,-Y*y]);b.push(Y)}
  const h=b3Solve(A,b);if(!h)return null;const Hm=[...h,1];
  const col=j=>[Hm[j]-cx*Hm[6+j],Hm[3+j]-cy*Hm[6+j],Hm[6+j]],h1=col(0),h2=col(1),h3=col(2);
  const A1=h1[0]*h2[0]+h1[1]*h2[1],B1=-h1[2]*h2[2],A2=h1[0]**2+h1[1]**2-h2[0]**2-h2[1]**2,B2=-(h1[2]**2-h2[2]**2);
  const u=(A1*B1+A2*B2)/(A1*A1+A2*A2);if(!(u>0))return null;const f=1/Math.sqrt(u);
  const nrm=v=>Math.hypot(v[0],v[1],v[2]),ki=v=>[v[0]/f,v[1]/f,v[2]];
  let r1=ki(h1),r2=ki(h2),t=ki(h3);const lam=2/(nrm(r1)+nrm(r2));r1=r1.map(x=>x*lam);r2=r2.map(x=>x*lam);t=t.map(x=>x*lam);
  if(t[2]<0){r1=r1.map(x=>-x);r2=r2.map(x=>-x);t=t.map(x=>-x)}
  // make r1, r2 exactly orthonormal (split the error), r3 = r1 x r2
  {const n1=nrm(r1),n2=nrm(r2);r1=r1.map(x=>x/n1);r2=r2.map(x=>x/n2);const d=r1[0]*r2[0]+r1[1]*r2[1]+r1[2]*r2[2];
    const a=r1.map((x,i)=>x-d/2*r2[i]),c=r2.map((x,i)=>x-d/2*r1[i]),na=nrm(a),nc=nrm(c);r1=a.map(x=>x/na);r2=c.map(x=>x/nc)}
  const r3=[r1[1]*r2[2]-r1[2]*r2[1],r1[2]*r2[0]-r1[0]*r2[2],r1[0]*r2[1]-r1[1]*r2[0]];
  const R=[[r1[0],r2[0],r3[0]],[r1[1],r2[1],r3[1]],[r1[2],r2[2],r3[2]]];
  const C=[0,1,2].map(j=>-(R[0][j]*t[0]+R[1][j]*t[1]+R[2][j]*t[2]));
  if(!(C[2]>0.3&&C[2]<40)||!(f>W*0.15&&f<W*5))return null;// camera must stand above the ground, sane focal length
  const project=(X,Y,Z)=>{const c0=R[0][0]*X+R[0][1]*Y+R[0][2]*Z+t[0],c1=R[1][0]*X+R[1][1]*Y+R[1][2]*Z+t[1],c2=R[2][0]*X+R[2][1]*Y+R[2][2]*Z+t[2];
    if(c2<0.2)return null;return dis(f*c0/c2+cx,f*c1/c2+cy)};
  // viewing ray of an image point (normalised coords): world direction from C
  const ray=(xn,yn)=>{const p=und(xn*W,yn*H),d=[(p[0]-cx)/f,(p[1]-cy)/f,1];return[0,1,2].map(j=>R[0][j]*d[0]+R[1][j]*d[1]+R[2][j]*d[2])};
  const atHeight=(xn,yn,z)=>{const d=ray(xn,yn),s_=(z-C[2])/d[2];if(!(s_>0))return null;return[C[0]+s_*d[0],C[1]+s_*d[1],z]};
  return{f,R,t,C,W,H,k,project,ray,atHeight,fovH:2*Math.atan(W/2/f)*180/Math.PI};
}
function b3Solve(A,b){const m=b.length,M=A.map((r,i)=>[...r,b[i]]);
  for(let c=0;c<m;c++){let p=c;for(let r=c+1;r<m;r++)if(Math.abs(M[r][c])>Math.abs(M[p][c]))p=r;[M[c],M[p]]=[M[p],M[c]];
    if(Math.abs(M[c][c])<1e-14)return null;for(let r=0;r<m;r++){if(r===c)continue;const g=M[r][c]/M[c][c];if(g)for(let q=c;q<=m;q++)M[r][q]-=g*M[c][q]}}
  return M.map((r,i)=>r[m]/r[i])}
// flight: state s=[x,y,z,vx,vy,vz]; spin cT (>0 topspin, <0 slice) and cS (side), in lift-coefficient units
function b3Acc(s,cT,cS,o){const vx=s[3],vy=s[4],vz=s[5],v=Math.hypot(vx,vy,vz)||1e-9,hv=Math.hypot(vx,vy)||1e-9;
  const sx=vy/hv,sy=-vx/hv,ux=sy*vz/v,uy=-sx*vz/v,uz=(sx*vy-sy*vx)/v,m=B3.KM*v*v,d=B3.KD*v;
  o[0]=vx;o[1]=vy;o[2]=vz;o[3]=-d*vx+m*(-cT*ux+cS*sx);o[4]=-d*vy+m*(-cT*uy+cS*sy);o[5]=-B3.G-d*vz-m*cT*uz}
const _k1=new Float64Array(6),_k2=new Float64Array(6),_k3=new Float64Array(6),_k4=new Float64Array(6),_tmp=new Float64Array(6);
function b3Step(s,h,cT,cS){b3Acc(s,cT,cS,_k1);for(let i=0;i<6;i++)_tmp[i]=s[i]+h/2*_k1[i];b3Acc(_tmp,cT,cS,_k2);for(let i=0;i<6;i++)_tmp[i]=s[i]+h/2*_k2[i];
  b3Acc(_tmp,cT,cS,_k3);for(let i=0;i<6;i++)_tmp[i]=s[i]+h*_k3[i];b3Acc(_tmp,cT,cS,_k4);for(let i=0;i<6;i++)s[i]+=h/6*(_k1[i]+2*_k2[i]+2*_k3[i]+_k4[i])}
// states at the given times (sorted), starting from q (state at time t0) — forward and/or backward
function b3Sim(q,t0,times){const out=new Array(times.length),cT=q[6]||0,cS=q[7]||0;
  let s=Float64Array.from(q.slice(0,6)),tc=t0,i0=0;while(i0<times.length&&times[i0]<t0)i0++;
  for(let i=i0;i<times.length;i++){const dt=times[i]-tc,n=Math.max(1,Math.ceil(dt/0.02));for(let j=0;j<n;j++)b3Step(s,dt/n,cT,cS);tc=times[i];out[i]=Array.from(s)}
  s=Float64Array.from(q.slice(0,6));tc=t0;
  for(let i=i0-1;i>=0;i--){const dt=times[i]-tc,n=Math.max(1,Math.ceil(-dt/0.02));for(let j=0;j<n;j++)b3Step(s,dt/n,cT,cS);tc=times[i];out[i]=Array.from(s)}
  return out}
function b3Resid(q,obs,cam,spin){const S=b3Sim(q,obs[0].t,obs.map(o=>o.t)),r=[];let cost=0;
  for(let i=0;i<obs.length;i++){const s=S[i],p=cam.project(s[0],s[1],s[2]),o=obs[i];let ex,ey;
    if(!p){ex=ey=200}else{ex=p[0]-o.x*cam.W;ey=p[1]-o.y*cam.H}
    // Huber: residuals beyond hub px count linearly (a wrong candidate does not pull the flight)
    // capped: a point far off (racket, leg, noise) costs at most `cap`, like a point that is simply thrown away
    const a=Math.hypot(ex,ey)/B3.sig,hb=B3.hub/B3.sig,c=Math.min(B3.cap,a<=hb?a*a:hb*(2*a-hb)),w=a>1e-9?Math.sqrt(c)/a:1;
    r.push(ex/B3.sig*w,ey/B3.sig*w);cost+=c;
    const under=Math.max(0,-0.03-s[2])/0.05;r.push(under);cost+=under*under}// not below the ground
  // no tennis ball flies faster than ~250 km/h
  const v0=Math.hypot(q[3],q[4],q[5]),fast=Math.max(0,v0-65)/5;r.push(fast);cost+=fast*fast;
  const pr=spin?[q[6]/B3.spinSd,q[7]/B3.spinSd]:[];for(const x of pr){r.push(x);cost+=x*x}
  return{r,cost}}
function b3LM(q,obs,cam,spin,iters){const np=spin?8:6;q=q.slice();if(q.length<8)q.push(0,0);let lam=1e-2,cur=b3Resid(q,obs,cam,spin);
  for(let it=0;it<iters;it++){const r0=cur.r,J=[];
    for(let j=0;j<np;j++){const e=j<3?2e-3:j<6?2e-3:1e-3,qq=q.slice();qq[j]+=e;const r=b3Resid(qq,obs,cam,spin).r;J.push(r.map((x,i)=>(x-r0[i])/e))}
    const JtJ=[],Jtr=[];for(let a=0;a<np;a++){JtJ.push([]);let s=0;for(let i=0;i<r0.length;i++)s+=J[a][i]*r0[i];Jtr.push(-s);
      for(let b=0;b<np;b++){let t=0;for(let i=0;i<r0.length;i++)t+=J[a][i]*J[b][i];JtJ[a].push(t)}}
    let ok=false;
    for(let tr=0;tr<6;tr++){const M=JtJ.map((row,a)=>row.map((x,b)=>a===b?x*(1+lam)+1e-6:x)),dq=b3Solve(M,Jtr);if(!dq)break;
      const nq=q.slice();for(let j=0;j<np;j++)nq[j]+=dq[j];const c=b3Resid(nq,obs,cam,spin);
      if(c.cost<cur.cost){const imp=cur.cost-c.cost;q=nq;cur=c;lam=Math.max(1e-6,lam/3);ok=true;if(imp<1e-4*cur.cost+1e-3)it=iters;break}lam*=5}
    if(!ok)break}
  return{q,cost:cur.cost}}
// fit one flight on obs [{t,x,y}] (normalised image coords)
function fit3d(obs,cam){const n=obs.length;if(n<B3.minPts)return null;
  const a=obs[0],b=obs[n-1],T=b.t-a.t;if(T<=0)return null;let best=null;
  for(const z1 of[0.2,1.2,2.6])for(const z2 of[0.2,1.2,2.6]){const P=cam.atHeight(a.x,a.y,z1),Q=cam.atHeight(b.x,b.y,z2);if(!P||!Q)continue;
    if(Math.hypot(P[0]-Q[0],P[1]-Q[1])/T>70)continue;
    const q=[...P,(Q[0]-P[0])/T,(Q[1]-P[1])/T,(Q[2]-P[2])/T+B3.G*T/2,0,0],r=b3LM(q,obs,cam,false,6);if(!best||r.cost<best.cost)best=r}
  if(!best)return null;const r=b3LM(best.q,obs,cam,true,16);
  return{q:r.q,t0:a.t,t1:b.t,cost:r.cost,n,rms:Math.sqrt(Math.max(0,r.cost-(r.q[6]**2+r.q[7]**2)/B3.spinSd**2)/(2*n))*B3.sig}}
const b3At=(fit,t)=>b3Sim(fit.q,fit.t0,[t])[0];
// ---- the rally: points -> flights + events
// pts: [{t,x,y}] sorted (one per frame), boxesAt(t) -> person boxes (normalised), cam from ballCamera
function rally3d(pts,boxesAt,cam,opt={}){
  const n=pts.length;if(n<B3.minPts||!cam)return null;
  // frame step of the ball points themselves (the analysis may sample faster than the video has new frames)
  const sp_=pts.slice(1).map((p,i)=>p.t-pts[i].t).filter(x=>x>1e-3).sort((a,b)=>a-b),dtF=Math.max(opt.dt||0,sp_.length?sp_[Math.floor(sp_.length*0.3)]:0.04);
  // candidate breaks: between point a and a+1, where the 2D motion changes or a gap starts
  const v2=(i,j)=>{const p=pts[i],q=pts[j],dt=q.t-p.t||1e-3;return[(q.x-p.x)*cam.W/dt,(q.y-p.y)*cam.H/dt]};
  const cand=new Set(),sc=new Float64Array(n);
  for(let a=2;a<n-3;a++){const vi=v2(a-2,a),vo=v2(a+1,a+3),si=Math.hypot(...vi),so=Math.hypot(...vo);if(si<1||so<1){sc[a]=1;continue}
    const cos=Math.max(-1,Math.min(1,(vi[0]*vo[0]+vi[1]*vo[1])/(si*so))),ang=Math.acos(cos)*180/Math.PI,ay=vo[1]-vi[1];
    sc[a]=Math.max(ang/15,Math.abs(Math.log(so/si))/Math.log(1.4),-ay/Math.max(40,0.25*si))}
  for(let a=0;a<n-1;a++){const gap=pts[a+1].t-pts[a].t;if(gap>1.6*dtF){cand.add(a);continue}
    if(sc[a]>=1&&sc[a]>=Math.max(sc[a-1]||0,sc[a-2]||0,sc[a+1]||0,sc[a+2]||0))cand.add(a)}
  for(const t of opt.hints||[]){let a=0;while(a<n-2&&pts[a+1].t<t)a++;cand.add(a);if(a>0)cand.add(a-1)}
  const B=[-1,...[...cand].sort((a,b)=>a-b),n-1];// break p: segment = points (B[p]+1 .. B[q])
  const m=B.length,fits=new Map();
  const seg=(p,q)=>{const key=p*1000+q;if(fits.has(key))return fits.get(key);const i0=B[p]+1,i1=B[q],obs=pts.slice(i0,i1+1);let s;
    if(!obs.length)s=null;
    else{const dur=obs[obs.length-1].t-obs[0].t,junk={kind:'junk',cost:B3.cap*obs.length+12,obs,i0,i1};// dearer than absorbing the points in a flight
      if(obs.length>=B3.minPts&&dur<=B3.maxSeg){const f=fit3d(obs,cam);s=f?{kind:'flight',fit:f,cost:f.cost+20,obs,i0,i1}:junk}
      else s=obs.length<B3.minPts?junk:null}
    fits.set(key,s);return s};
  const side=Y=>Y<B3.NET?'near':'far';
  // event between flight A (ends) and flight B (starts)
  const evCost=(A,Bf,type)=>{
    const ta=A.obs[A.obs.length-1].t,tb=Bf.obs[0].t;
    if(type==='gap')return{cost:tb-ta>0.25?4:14,t:(ta+tb)/2};
    // meeting time: bounce = A reaches the ground, hit = where A and B are closest
    const N=8,ts=[];for(let i=0;i<=N;i++)ts.push(ta-0.02+(tb-ta+0.04)*i/N);
    const SA=b3Sim(A.fit.q,A.fit.t0,ts),SB=b3Sim(Bf.fit.q,Bf.fit.t0,ts);let bi=0,bd=Infinity;
    for(let i=0;i<=N;i++){const d=type==='bounce'?Math.abs(SA[i][2])+Math.abs(SB[i][2])+0.3*Math.hypot(SA[i][0]-SB[i][0],SA[i][1]-SB[i][1]):Math.hypot(SA[i][0]-SB[i][0],SA[i][1]-SB[i][1],SA[i][2]-SB[i][2]);if(d<bd){bd=d;bi=i}}
    const PA=SA[bi],PB=SB[bi],t=ts[bi],dist=Math.hypot(PA[0]-cam.C[0],PA[1]-cam.C[1],PA[2]-cam.C[2]);
    const sp=0.3+0.04*dist,sz=0.15+0.02*dist,gapPen=Math.min(30,((PA[0]-PB[0])**2+(PA[1]-PB[1])**2+(PA[2]-PB[2])**2)/sp/sp);
    let c=gapPen;const vA=PA.slice(3),vB=PB.slice(3);
    if(type==='bounce'){c+=Math.min(30,(PA[2]/sz)**2)+Math.min(30,(PB[2]/sz)**2);if(vA[2]>0)c+=20;if(vB[2]<0)c+=20;
      if(Math.sign(vA[1])!==Math.sign(vB[1])&&Math.abs(vA[1])>2&&Math.abs(vB[1])>2)c+=40;
      // a bounce costs speed: horizontally the ball keeps roughly 50-95% (topspin keeps more, slice less)
      const hA=Math.hypot(vA[0],vA[1]),hB=Math.hypot(vB[0],vB[1]);c+=Math.min(30,(Math.max(0,hB-0.95*hA)+Math.max(0,0.45*hA-hB))**2/(0.1*hA+1)**2)}
    else{const z=(PA[2]+PB[2])/2;if(z<0.15)c+=Math.min(40,((0.15-z)/sz)**2)+(z<0.1?10:0);// a hit at ground level is rareif(z>3.2)c+=Math.min(40,((z-3.2)/sz)**2);
      const flip=Math.sign(vA[1])!==Math.sign(vB[1]);if(!flip&&Math.abs(vA[1])>3)c+=40;
      // the hitter stands where the ball is: a near player hits a ball that was coming towards him (vA.y<0)
      const Y=(PA[1]+PB[1])/2;if(Math.abs(vA[1])>3&&((Y<B3.NET-2&&vA[1]>0)||(Y>B3.NET+2&&vA[1]<0)))c+=40;
      const ip=cam.project(PA[0],PA[1],PA[2]);
      const pers=ip&&(boxesAt?boxesAt(t):[]).some(b=>{const w=b.x1-b.x0,h=b.y1-b.y0,x=ip[0]/cam.W,y=ip[1]/cam.H;return x>b.x0-w*0.5&&x<b.x1+w*0.5&&y>b.y0-h*0.8&&y<b.y1});// up to a racket's length above the head (serve, smash)
      if(!pers)c+=6}
    return{cost:c,t,P:type==='bounce'?[(PA[0]+PB[0])/2,(PA[1]+PB[1])/2,0]:PA.slice(0,3).map((x,i)=>(x+PB[i])/2),vA,vB}};
  // rule state: phase 0 = before the serve, 1 = serve in the air (return must bounce), 2 = rally; nb = bounces since the last hit;
  // hs = side of the last hitter (0 unknown, 1 near, 2 far)
  const rule=(st,type,ev)=>{let[ph,nb,hs]=st,c=0;
    if(type==='gap')return{c:0,st:[ph===0&&ev.dirSide?1:ph,0,ev.dirSide||0]};// a fast ball after a gap: the serve was not seen
    if(type==='bounce'){if(ph===0)return{c:0,st:st,pre:true};const s=side(ev.P[1])==='near'?1:2;if(hs&&s===hs)c+=12;// did not cross the net
      if(nb>=1)c+=6;// second bounce: end of the point
      return{c,st:[ph,Math.min(2,nb+1),hs]}}
    const s=side(ev.P[1])==='near'?1:2;
    if(hs&&s===hs)c+=40;if(nb>=2)c+=30;if(ph===1&&nb===0)c+=25;
    return{c,st:[ph===0?1:2,0,s]}};
  // DP over (last segment p->q, rule state)
  const key=(p,q,st)=>p+','+q+','+st.join('');const best=new Map();
  const push=(p,q,st,cost,back)=>{const k=key(p,q,st),o=best.get(k);if(!o||cost<o.cost)best.set(k,{p,q,st,cost,back})};
  // start: a fast first flight means the serve already happened (direction tells who hit it)
  for(let q=1;q<m&&q<=B3.skip;q++){const s=seg(0,q);if(!s)continue;let st=[0,0,0];
    if(s.kind==='flight'){const s0=b3At(s.fit,s.fit.t0);if(Math.abs(s0[4])>8)st=[1,0,s0[4]>0?1:2]}push(0,q,st,s.cost,null)}
  for(let q=1;q<m-1;q++){
    const here=[...best.values()].filter(e=>e.q===q);if(!here.length)continue;
    for(const e of here){const A=seg(e.p,q);
      for(let r=q+1;r<m&&r<=q+B3.skip;r++){const Bs=seg(q,r);if(!Bs)continue;
        const types=A.kind==='flight'&&Bs.kind==='flight'?['bounce','hit','gap']:['gap'];
        for(const ty of types){let ev;
          // "gap" = the flight goes on unseen (or an event hides in it): cheap only when the ball was really lost for a while
          if(ty==='gap'){const g=Bs.obs[0].t-A.obs[A.obs.length-1].t;ev={cost:g>0.25?4:A.kind==='flight'&&Bs.kind==='flight'?25:3,t:Bs.obs[0].t};
            if(Bs.kind==='flight'){const s0=b3At(Bs.fit,Bs.obs[0].t);ev.dirSide=Math.abs(s0[4])>3?(s0[4]>0?1:2):0}}
          else ev=evCost(A,Bs,ty);
          const rr=rule(e.st,ty,ev);push(q,r,rr.st,e.cost+Bs.cost+ev.cost+rr.c,{e,ty,ev,pre:rr.pre})}}}}
  let fin=null;for(const e of best.values())if(e.q===m-1&&(!fin||e.cost<fin.cost))fin=e;
  if(!fin)return null;
  // back-track
  const chain=[];for(let e=fin;e;e=e.back&&e.back.e){chain.unshift(e)}
  const segs=chain.map(e=>seg(e.p,e.q)),evs=[];for(let i=1;i<chain.length;i++){const b=chain[i].back;evs.push({type:b.ty,...b.ev,pre:b.pre,serve:b.ty!=='bounce'&&b.e.st[0]===0&&chain[i].st[0]>=1})}// the moment the serve phase starts
  const bounces=[],hits=[],predicted=[];
  for(let i=0;i<evs.length;i++){const e=evs[i];
    if(e.type==='bounce'&&!e.pre){const ip=cam.project(e.P[0],e.P[1],0);bounces.push({t:e.t,x:ip?ip[0]/cam.W:NaN,y:ip?ip[1]/cam.H:NaN,X:e.P[0],Y:e.P[1],kmh:Math.hypot(...e.vA)*3.6,d3:true})}
    else if(e.type==='hit'){// mark it where the ball was last seen before the contact (the 3D point is extrapolated)
      const lo=segs[i].obs[segs[i].obs.length-1];hits.push({t:e.t,x:lo.x,y:lo.y,X:e.P[0],Y:e.P[1],Z:e.P[2],kmh:Math.hypot(...e.vB)*3.6,half:side(e.P[1])==='near'?'dichtbij':'ver'})}
    else if(e.type==='gap'){// Hawk-Eye style: a flight that goes into a gap and would land before it ends -> predicted bounce
      // only after a hit (after a bounce the next thing is a hit, not a second bounce)
      let prev=null;for(let j=i-1;j>=0;j--)if(evs[j].type!=='gap'){prev=evs[j];break}if(prev&&prev.type==='bounce')continue;
      const A=segs[i],Bs=segs[i+1];if(A.kind!=='flight')continue;const ta=A.obs[A.obs.length-1].t,tb=Bs.obs[0].t;if(tb-ta<0.12)continue;
      const ts=[];for(let t=ta;t<=tb;t+=0.01)ts.push(t);const S=b3Sim(A.fit.q,A.fit.t0,ts);const j=S.findIndex(s=>s[2]<=0);
      if(j>0&&S[j][5]<0){const s=S[j],ip=cam.project(s[0],s[1],0);if(ip&&Math.abs(s[0])<9&&s[1]>-4&&s[1]<B3.L+5)predicted.push({t:ts[j],x:ip[0]/cam.W,y:ip[1]/cam.H,X:s[0],Y:s[1],kmh:Math.hypot(s[3],s[4],s[5])*3.6,pred:true,d3:true})}}}
  // fitted curves (for drawing, also through gaps of a flight)
  // curves in the picture and in 3D ([t,X,Y,Z] in metres, for the 3D viewer); a flight is extended to its events
  // (built after the serve is known: the serve flight starts at the contact, the toss ends there)
  const curves=[],curves3d=[];let serveSeg=null,serveT=null;
  const mkCurves=()=>segs.forEach((s,i)=>{if(s.kind!=='flight')return;let ta=s.fit.t0,tb=s.fit.t1;
    const eb=evs[i-1],ea=evs[i];if(eb&&eb.type!=='gap'&&eb.t<ta)ta=eb.t;if(ea&&ea.type!=='gap'&&ea.t>tb)tb=ea.t;
    if(s===serveSeg&&serveT<ta)ta=serveT;if(segs[i+1]===serveSeg&&serveT>tb)tb=serveT;
    const ts=[];for(let t=ta;t<tb;t+=0.02)ts.push(t);ts.push(tb);const S=b3Sim(s.fit.q,s.fit.t0,ts);
    curves.push(S.map((st,j)=>{const p=cam.project(st[0],st[1],st[2]);return p?[+ts[j].toFixed(3),+(p[0]/cam.W).toFixed(4),+(p[1]/cam.H).toFixed(4)]:null}).filter(Boolean));
    curves3d.push(S.map((st,j)=>[+ts[j].toFixed(3),+st[0].toFixed(2),+st[1].toFixed(2),+Math.max(0,st[2]).toFixed(2)]))});
  const flights=segs.filter(s=>s.kind==='flight').map(s=>({t0:s.fit.t0,t1:s.fit.t1,rms:s.fit.rms,spinT:s.fit.q[6],spinS:s.fit.q[7],n:s.fit.n}));
  const diag=(t)=>{// debug: costs of the alternatives at the break nearest to time t in the chosen chain
    let bi=-1,bd=1;for(let i=0;i+1<segs.length;i++){const d=Math.abs(segs[i].obs[segs[i].obs.length-1].t-t);if(d<bd){bd=d;bi=i}}if(bi<0)return null;
    const A=segs[bi],Bs=segs[bi+1];if(A.kind!=='flight'||Bs.kind!=='flight')return{kinds:A.kind+'/'+Bs.kind,t:A.obs[A.obs.length-1].t};
    const o={t:A.obs[A.obs.length-1].t};for(const ty of['bounce','hit']){const e=evCost(A,Bs,ty);o[ty]=+e.cost.toFixed(1);o[ty+'P']=e.P.map(x=>+x.toFixed(2));o[ty+'vA']=e.vA.map(x=>+x.toFixed(1));o[ty+'vB']=e.vB.map(x=>+x.toFixed(1))}return o};
  // ---- the serve: flight after the serve hit (or the first fast flight when the hit itself was not seen)
  let serve=null;
  {let si=-1,hitEv=null;const k=evs.findIndex(e=>e.serve);if(k>=0){si=k+1;hitEv=evs[k]}else if(chain[0].st[0]===1&&segs[0].kind==='flight')si=0;
    const S=si>=0?segs[si]:null;
    if(S&&S.kind==='flight'){const fit=S.fit,s0=b3At(fit,fit.t0),dir=s0[4]>0?1:-1,nearSrv=dir>0;
      // server: the person whose feet stand near the baseline at the serving end
      let feet=null;const bl=nearSrv?0:B3.L;
      for(const b of(boxesAt?boxesAt(fit.t0-0.15):[])){const g=cam.atHeight((b.x0+b.x1)/2,b.y1,0);if(!g||Math.abs(g[1]-bl)>4)continue;if(!feet||Math.abs(g[1]-bl)<Math.abs(feet[1]-bl))feet=g}
      let C=null,tc=null;
      const yc=(feet?feet[1]:bl-dir*0.3)+dir*0.4;// contact plane: ~0.4 m in front of the feet
      const tossEnd=si>0&&segs[si-1]?segs[si-1].obs[segs[si-1].obs.length-1]:null;let how='';
      if(tossEnd&&tossEnd.t>fit.t0-0.4){
        // the toss was seen up to (almost) the contact: its last image point is exact, the depth comes from the server's
        // position. Much steadier than meeting two extrapolated flights.
        const d=cam.ray(tossEnd.x,tossEnd.y),s_=(yc-cam.C[1])/d[1];if(s_>0){C=cam.C.map((c,i)=>c+s_*d[i]);tc=tossEnd.t;how='opgooi'}}
      if(!C&&hitEv&&hitEv.type==='hit'){C=hitEv.P;tc=hitEv.t;how='3d'}
      if(!C){how='terug';// back along the flight to where the ball is ~0.4 m in front of the server's feet (contact is in front of the body)
        const ts=[];for(let t=fit.t0;t>=fit.t0-0.8;t-=0.005)ts.push(t);ts.reverse();
        const SS=b3Sim(fit.q,fit.t0,ts);for(let i=SS.length-1;i>=0;i--){if((SS[i][1]-yc)*dir<=0){C=SS[i].slice(0,3);tc=ts[i];break}}
        if(!C){C=s0.slice(0,3);tc=fit.t0}}
      const sc=b3Sim(fit.q,fit.t0,[Math.min(tc,fit.t0)])[0],kmh=Math.hypot(sc[3],sc[4],sc[5])*3.6;
      // over the net
      const tn=[];for(let t=fit.t0;t<=fit.t1+0.6;t+=0.005)tn.push(t);const SN=b3Sim(fit.q,fit.t0,tn);
      let net=null;for(const s of SN)if((s[1]-B3.NET)*dir>=0){const hN=0.914+(1.07-0.914)*Math.min(1,Math.abs(s[0])/(B3.HW+0.914));net={X:s[0],Z:s[2],clear:s[2]-hN};break}
      // landing: the first bounce after the serve, else where the flight reaches the ground
      let land=null;const ne=evs.slice(si).find(e=>e.type!=='gap');
      if(ne&&ne.type==='bounce')land={X:ne.P[0],Y:ne.P[1],t:ne.t};
      else{const g=SN.findIndex(s=>s[2]<=0&&s[5]<0);if(g>=0)land={X:SN[g][0],Y:SN[g][1],t:tn[g],pred:true}}
      const sX=feet?feet[0]:C[0];
      serve={t:tc,kmh,contact:C,how,feet,server:nearSrv?'dichtbij':'ver',side:(nearSrv?sX>0:sX<0)?'deuce':'ad',net,land};serveSeg=S;serveT=tc}}
  mkCurves();
  return{serve,diag,bounces:bounces.concat(predicted).sort((a,b)=>a.t-b.t),hits,curves,curves3d,cam:cam.C.map(x=>+x.toFixed(2)),flights,events:evs.map(e=>({type:e.type,t:e.t,pre:!!e.pre,P:e.P&&e.P.map(x=>+x.toFixed(2))})),cost:fin.cost,nCand:m}}
// ---- serve: judge it and turn the numbers into plain advice (no AI needed). h = player height in m (optional)
function serveJudge(s,h){if(!s)return null;const SV=6.40,SW=4.115,near=s.server==='dichtbij',dir=near?1:-1,out={fb:[]};
  const sx=s.side==='deuce'?(near?1:-1):(near?-1:1);// sign of X of the server's half; the target box is on the other half
  if(s.land){const X=s.land.X,Y=s.land.Y,dNet=(Y-B3.NET)*dir,xs=-sx*X;// xs: across the box, 0 = centre line, SW = side line
    const long=dNet-SV,wide=xs-SW,wrongHalf=-xs,m=0.08;
    out.call=dNet<0?'net':(long>m||wide>m||wrongHalf>m)?'uit':(long>-m&&long<=m)||(wide>-m&&wide<=m)||(wrongHalf>-m&&wrongHalf<=m)?'twijfel':'in';
    out.depth=-long;// metres in front of the service line (negative = long)
    out.zone=xs<SW/3?'T':xs<SW*2/3?'lichaam':'wijd';
    if(long>m)out.fb.push(`Te lang: ${Math.round(long*100)} cm achter de servicelijn. Raak de bal meer van boven en naar voren (pols klapt over de bal), dan duikt hij eerder.`);
    if(wide>m)out.fb.push(`Naast het vak (${Math.round(wide*100)} cm). Richt met je schouders en de zwaai, niet alleen met de pols.`);
    if(out.call==='in'&&-long<1.2)out.fb.push('Mooi diep in het vak.');
    if(out.call==='in'&&-long>2.8)out.fb.push(`Kort (${(-long).toFixed(1).replace('.',',')} m voor de servicelijn): makkelijk aan te vallen. Mik dieper, met meer snelheid of meer spin.`)}
  if(s.net){const c=s.net.clear;out.netClear=c;
    if(c<0)out.fb.push('In het net. Raak de bal hoger (helemaal gestrekt) en gooi hem iets verder het veld in.');
    else if(c<0.15)out.fb.push(`Krap over het net (${Math.round(c*100)} cm). Voor meer marge: meer topspin/kick, of iets hoger mikken.`);
    else if(c>1.0&&out.call==='uit')out.fb.push(`Ruim over het net (${c.toFixed(1).replace('.',',')} m) maar uit: je raakt hem te veel omhoog. Raak de bal verder naar voren.`)}
  const C=s.contact;out.z=C[2];
  if(h>1.2){const ideal=1.31*h+0.5;out.ideal=ideal;
    if(C[2]<ideal*0.88)out.fb.push(`Raakpunt op ${C[2].toFixed(2).replace('.',',')} m; met jouw lengte kan rond ${ideal.toFixed(1).replace('.',',')} m. Gooi iets hoger op en raak met gestrekte arm op het hoogste punt, niet als de bal al zakt.`)}
  if(s.feet&&s.how==='3d'){const fwd=(C[1]-s.feet[1])*dir;out.front=fwd;
    if(fwd<0.1)out.fb.push('Raakpunt boven of achter je hoofd: gooi de bal iets verder naar voren het veld in, zodat je erin kunt leunen.');
    else if(fwd>1.1)out.fb.push('Raakpunt ver voor je: de opgooi gaat te ver naar voren; je moet erachteraan duiken.')}
  return out}
// merge track pieces into one point list (one point per frame; on overlap keep the point of the longer piece)
function b3Points(flights){const all=[];flights.forEach(f=>{for(const p of f)all.push({t:p.t,x:p.x,y:p.y,len:f.length})});
  all.sort((a,b)=>a.t-b.t||b.len-a.len);const out=[];for(const p of all)if(!out.length||p.t-out[out.length-1].t>0.005)out.push({t:p.t,x:p.x,y:p.y});return out}
if(typeof module!=='undefined')module.exports={B3,ballCamera,fit3d,rally3d,b3Points,b3Sim,serveJudge};
