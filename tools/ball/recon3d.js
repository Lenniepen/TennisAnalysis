// Feasibility test: 3D ball reconstruction from one camera.
// Camera from the court homography (+ lens k), then per event: fit a 3D flight (gravity + air drag) on the points
// just before and just after the event, and look at the height / side / direction at the event.
// usage: node recon3d.js app_dbg.json markers.json
const fs=require('fs');
const dbg=JSON.parse(fs.readFileSync(process.argv[2]));
const mk=JSON.parse(fs.readFileSync(process.argv[3]));
const W=mk.width,H=mk.height,court=mk.court,k=court.k||0;
const CRT={L:23.77,HW:5.485};
function lensUndist(x,y){if(!k)return[x,y];const cx=W/2,cy=H/2,s=Math.hypot(W,H)/2,dx=(x-cx)/s,dy=(y-cy)/s,f=1/(1+k*(dx*dx+dy*dy));return[cx+dx*f*s,cy+dy*f*s]}
function lensDist(x,y){if(!k)return[x,y];const cx=W/2,cy=H/2,s=Math.hypot(W,H)/2,dx=(x-cx)/s,dy=(y-cy)/s,ru=Math.hypot(dx,dy);if(ru<1e-9)return[x,y];
  const disc=1-4*k*ru*ru;if(disc<0)return null;const rd=(1-Math.sqrt(disc))/(2*k*ru),f=rd/ru;return[cx+dx*f*s,cy+dy*f*s]}
function solveH(src,dst){const A=[],b=[];
  for(let i=0;i<4;i++){const[x,y]=src[i],[X,Y]=dst[i];A.push([x,y,1,0,0,0,-X*x,-X*y]);b.push(X);A.push([0,0,0,x,y,1,-Y*x,-Y*y]);b.push(Y)}
  for(let c=0;c<8;c++){let p=c;for(let r=c+1;r<8;r++)if(Math.abs(A[r][c])>Math.abs(A[p][c]))p=r;
    [A[c],A[p]]=[A[p],A[c]];[b[c],b[p]]=[b[p],b[c]];
    for(let r=0;r<8;r++){if(r===c)continue;const f=A[r][c]/A[c][c];for(let q=c;q<8;q++)A[r][q]-=f*A[c][q];b[r]-=f*b[c]}}
  const h=b.map((x,i)=>x/A[i][i]);return[h[0],h[1],h[2],h[3],h[4],h[5],h[6],h[7],1]}
const ref=[[-CRT.HW,0],[CRT.HW,0],[CRT.HW,CRT.L],[-CRT.HW,CRT.L]];
const img=court.pts.map(p=>lensUndist(p.x*W,p.y*H));
const Hm=solveH(ref,img);// court -> undistorted pixels
// ---- camera from homography: principal point at the centre, square pixels
const cx=W/2,cy=H/2;
const col=j=>[Hm[j]-cx*Hm[6+j],Hm[3+j]-cy*Hm[6+j],Hm[6+j]];
const[h1,h2,h3]=[col(0),col(1),col(2)];
const A1=h1[0]*h2[0]+h1[1]*h2[1],B1=-h1[2]*h2[2],A2=h1[0]**2+h1[1]**2-h2[0]**2-h2[1]**2,B2=-(h1[2]**2-h2[2]**2);
const u=(A1*B1+A2*B2)/(A1*A1+A2*A2),f=1/Math.sqrt(u);
const ki=h=>[h[0]/f,h[1]/f,h[2]],n=v=>Math.hypot(...v);
let r1=ki(h1),r2=ki(h2),tt=ki(h3);const lam=2/(n(r1)+n(r2));r1=r1.map(x=>x*lam);r2=r2.map(x=>x*lam);tt=tt.map(x=>x*lam);
if(tt[2]<0){r1=r1.map(x=>-x);r2=r2.map(x=>-x);tt=tt.map(x=>-x)}
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
let r3=cross(r1,r2);r3=r3.map(x=>x/n(r3));
// R columns = r1,r2,r3 (world axes in camera frame). camera centre C = -R^T t
const R=[[r1[0],r2[0],r3[0]],[r1[1],r2[1],r3[1]],[r1[2],r2[2],r3[2]]];
const C=[0,1,2].map(j=>-(R[0][j]*tt[0]+R[1][j]*tt[1]+R[2][j]*tt[2]));
const fovH=2*Math.atan(W/2/f)*180/Math.PI;
console.log(`camera: f=${f.toFixed(0)} px (hor. beeldhoek ${fovH.toFixed(0)}°), positie X=${C[0].toFixed(2)} Y=${C[1].toFixed(2)} Z(hoogte)=${C[2].toFixed(2)} m, orthogonaliteit r1.r2=${(r1[0]*r2[0]+r1[1]*r2[1]+r1[2]*r2[2]).toFixed(3)} |r1|/|r2|=${(n(ki(h1))/n(ki(h2))).toFixed(3)}`);
function project(P){const c=[0,1,2].map(i=>R[i][0]*P[0]+R[i][1]*P[1]+R[i][2]*P[2]+tt[i]);if(c[2]<=0.1)return null;
  const d=lensDist(f*c[0]/c[2]+cx,f*c[1]/c[2]+cy);return d}
// check: net posts height 1.07 at X=+-6.4, net centre 0.914
for(const[P,name]of[[[0,CRT.L/2,0.914],'netmidden (0,914 m)'],[[-6.4,CRT.L/2,1.07],'netpaal L'],[[6.4,CRT.L/2,1.07],'netpaal R'],[[0,CRT.L/2,0],'net op de grond']]){const p=project(P);console.log('  ',name,'-> beeld',(p[0]/W).toFixed(3),(p[1]/H).toFixed(3))}
// ---- ball points
const all=[];for(const tr of dbg.tracks)for(const p of tr.pts)all.push(p);
all.sort((a,b)=>a.t-b.t);const pts=[];for(const p of all)if(!pts.length||Math.abs(p.t-pts[pts.length-1].t)>0.005)pts.push(p);
console.log('balpunten:',pts.length,'van',pts[0].t.toFixed(2),'tot',pts[pts.length-1].t.toFixed(2));
// ---- flight model: gravity + quadratic air drag (tennis ball: 0.5*rho*Cd*A/m ~ 0.019 /m), RK4 at 5 ms
const G=9.81,KD=0.019;
function state(p0,v0,dt){let s=[...p0,...v0];const acc=s=>{const v=Math.hypot(s[3],s[4],s[5]);return[s[3],s[4],s[5],-KD*v*s[3],-KD*v*s[4],-G-KD*v*s[5]]};
  const N=Math.max(1,Math.ceil(Math.abs(dt)/0.005)),h=dt/N;
  for(let i=0;i<N;i++){const a=acc(s),b=acc(s.map((x,j)=>x+h/2*a[j])),c=acc(s.map((x,j)=>x+h/2*b[j])),d=acc(s.map((x,j)=>x+h*c[j]));s=s.map((x,j)=>x+h/6*(a[j]+2*b[j]+2*c[j]+d[j]))}
  return s}
// params q = [P(te) 3, V(te) 3]; flight integrated from the event time te (forward or backward)
function resid(q,obs,te){const r=[];for(const o of obs){const s=state(q.slice(0,3),q.slice(3),o.t-te),p=project(s);
  if(!p){r.push(1e3,1e3);continue}r.push(p[0]-o.x*W,p[1]-o.y*H)}return r}
const ss=r=>r.reduce((a,x)=>a+x*x,0);
function solveLin(A,b){const m=b.length,M=A.map((r,i)=>[...r,b[i]]);for(let c=0;c<m;c++){let p=c;for(let r=c+1;r<m;r++)if(Math.abs(M[r][c])>Math.abs(M[p][c]))p=r;[M[c],M[p]]=[M[p],M[c]];
  if(Math.abs(M[c][c])<1e-15)return null;for(let r=0;r<m;r++){if(r===c)continue;const g=M[r][c]/M[c][c];for(let q=c;q<=m;q++)M[r][q]-=g*M[c][q]}}return M.map((r,i)=>r[m]/r[i])}
function jac(q,obs,te){const r0=resid(q,obs,te),J=r0.map(()=>[]);for(let j=0;j<6;j++){const e=j<3?1e-3:1e-3,qq=[...q];qq[j]+=e;const r=resid(qq,obs,te);for(let i=0;i<r.length;i++)J[i][j]=(r[i]-r0[i])/e}return{r0,J}}
function lm(q,obs,te){let lamb=1e-2,cur=ss(resid(q,obs,te));
  for(let it=0;it<60;it++){const{r0,J}=jac(q,obs,te);const JtJ=[...Array(6)].map((_,a)=>[...Array(6)].map((_,b)=>J.reduce((s,row)=>s+row[a]*row[b],0)));
    const Jtr=[...Array(6)].map((_,a)=>J.reduce((s,row,i)=>s+row[a]*r0[i],0));let ok=false;
    for(let tries=0;tries<8;tries++){const A=JtJ.map((row,a)=>row.map((x,b)=>a===b?x*(1+lamb)+1e-9:x)),dq=solveLin(A,Jtr.map(x=>-x));if(!dq)break;
      const nq=q.map((x,i)=>x+dq[i]),c=ss(resid(nq,obs,te));if(c<cur){q=nq;const imp=cur-c;cur=c;lamb/=3;ok=true;if(imp<1e-6*cur)it=99;break}lamb*=4}
    if(!ok)break}
  const{J}=jac(q,obs,te);const JtJ=[...Array(6)].map((_,a)=>[...Array(6)].map((_,b)=>J.reduce((s,row)=>s+row[a]*row[b],0)));
  return{q,cost:cur,JtJ}}
// ray through an image point at ground-distance guess: point P on viewing ray with world Y = Yg
function rayPoint(o,z){// point on the viewing ray of o with height z
  const ud=lensUndist(o.x*W,o.y*H),dc=[(ud[0]-cx)/f,(ud[1]-cy)/f,1];
  const dw=[0,1,2].map(j=>R[0][j]*dc[0]+R[1][j]*dc[1]+R[2][j]*dc[2]);// world direction
  const s=(z-C[2])/dw[2];if(!(s>0))return null;return C.map((c,i)=>c+s*dw[i])}
function fitSide(obs,te){let best=null;
  for(const z1 of[0,0.5,1,1.5,2.5,4])for(const z2 of[0,0.5,1,1.5,2.5,4]){
    const a=rayPoint(obs[0],z1),b=rayPoint(obs[obs.length-1],z2);if(!a||!b)continue;
    const T=obs[obs.length-1].t-obs[0].t,V=[(b[0]-a[0])/T,(b[1]-a[1])/T,(b[2]-a[2])/T+G*T/2];
    const s=state(a,V,te-obs[0].t);const r=lm(s,obs,te);if(!best||r.cost<best.cost)best=r}
  if(!best)return null;
  const m=obs.length*2,sig2=best.cost/Math.max(1,m-6),cov=inv6(best.JtJ);
  const sd=cov?[0,1,2].map(i=>Math.sqrt(Math.max(0,cov[i][i]*sig2))):[NaN,NaN,NaN];
  return{P:best.q.slice(0,3),V:best.q.slice(3),rms:Math.sqrt(best.cost/m),sd,n:obs.length}}
function inv6(A){const m=6,M=A.map((r,i)=>[...r,...[...Array(m)].map((_,j)=>i===j?1:0)]);for(let c=0;c<m;c++){let p=c;for(let r=c+1;r<m;r++)if(Math.abs(M[r][c])>Math.abs(M[p][c]))p=r;[M[c],M[p]]=[M[p],M[c]];
  if(Math.abs(M[c][c])<1e-18)return null;const d=M[c][c];for(let q=0;q<2*m;q++)M[c][q]/=d;for(let r=0;r<m;r++){if(r===c)continue;const g=M[r][c];for(let q=0;q<2*m;q++)M[r][q]-=g*M[c][q]}}return M.map(r=>r.slice(m))}
// ---- events to test (fragment time). truth from the user's feedback where known
const EV=[[6.68,'stuit (ver, service)'],[9.00,'stuit (dichtbij)'],[9.80,'SLAG (dichtbij)'],[10.13,'app: slag (?)'],[14.28,'stuit (ver)'],[14.80,'SLAG (ver)'],
  [17.40,'stuit (ver)'],[18.84,'stuit (dichtbij)'],[19.28,'SLAG (dichtbij)'],[20.24,'stuit (ver, uit)']];
const f2=x=>(x>=0?' ':'')+x.toFixed(2),f1=x=>x.toFixed(1);
console.log('\nper gebeurtenis: 3D-vlucht vóór en ná, teruggerekend naar het moment zelf (X breedte, Y lengte vanaf jouw baseline, Z hoogte; ± = onzekerheid)');
for(const[te,label]of EV){
  const pre=pts.filter(p=>p.t<te-0.02&&p.t>te-0.5),post=pts.filter(p=>p.t>te+0.02&&p.t<te+0.5);
  const out=[];
  for(const[nm,obs]of[['vóór',pre],['ná',post]]){
    if(obs.length<5){out.push(`${nm}: te weinig punten (${obs.length})`);continue}
    const r=fitSide(obs,te);if(!r){out.push(nm+': geen fit');continue}
    const sp=Math.hypot(...r.V)*3.6;
    out.push(`${nm} (${r.n} pt, fout ${f1(r.rms)} px): X${f2(r.P[0])} Y${f2(r.P[1])}±${f1(r.sd[1])} Z${f2(r.P[2])}±${f1(r.sd[2])}  vY ${f1(r.V[1])} m/s vZ ${f1(r.V[2])} m/s (${sp.toFixed(0)} km/u)`)}
  console.log(`\n${te.toFixed(2)}  ${label}\n   `+out.join('\n   '))}
