// Automatic tennis court detection: white-line pixels -> Hough lines -> court-model fit (homography).
// Pure function on RGBA pixels, so it runs in the browser and in node.
// Returns {pts:[nearLeft,nearRight,farRight,farLeft] (normalised 0..1, doubles corners), H (court->image px), score, quality}
function detectCourt(rgba,W,H,opt){
  opt=opt||{};
  const CL=23.77,HW=5.485,SHW=4.115,SV=5.485;
  const n=W*H,lum=new Float32Array(n),sat=new Float32Array(n);
  for(let i=0,j=0;i<n;i++,j+=4){const r=rgba[j],g=rgba[j+1],b=rgba[j+2],mx=Math.max(r,g,b),mn=Math.min(r,g,b);lum[i]=(r+g+b)/3;sat[i]=mx?(mx-mn)/mx:0}
  // 1. line pixels: brighter than both neighbours at distance tau (horizontally or vertically), and whitish
  const tau=Math.max(2,Math.round(W/240)),mask=new Uint8Array(n);
  // adaptive threshold: contrast relative to local brightness
  let cnt=0;
  for(let y=tau;y<H-tau;y++)for(let x=tau;x<W-tau;x++){const i=y*W+x,l=lum[i];if(sat[i]>0.38||l<70)continue;
    const t=Math.max(14,l*0.12);
    const hz=l-lum[i-tau]>t&&l-lum[i+tau]>t,vt=l-lum[i-tau*W]>t&&l-lum[i+tau*W]>t;
    if(hz||vt){mask[i]=1;cnt++}}
  // remove big bright blobs (lamps, windows, shirts): keep only thin structures
  const lab=new Int32Array(n),stack=[];let id=0;
  for(let i=0;i<n;i++){if(!mask[i]||lab[i])continue;id++;const comp=[];stack.push(i);lab[i]=id;let x0=W,x1=0,y0=H,y1=0;
    while(stack.length){const k=stack.pop();comp.push(k);const x=k%W,y=(k/W)|0;if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;
      for(const q of[k-1,k+1,k-W,k+W]){if(q<0||q>=n||lab[q]||!mask[q])continue;if(Math.abs((q%W)-x)>1)continue;lab[q]=id;stack.push(q)}}
    const ext=Math.max(x1-x0,y1-y0)+1;
    // a line segment is long relative to its area; drop small specks and filled blobs
    if(ext<W/60||comp.length>ext*tau*3.5)for(const k of comp)mask[k]=0}
  // 2. Hough transform
  const NT=180,diag=Math.ceil(Math.hypot(W,H)),NR=2*diag+1,acc=new Float32Array(NT*NR),cs=[],sn=[];
  for(let t=0;t<NT;t++){const a=t*Math.PI/NT;cs.push(Math.cos(a));sn.push(Math.sin(a))}
  const pix=[],ori=new Float32Array(n).fill(NaN);
  // orientation from the spread of neighbouring line pixels (PCA in a 13x13 window)
  const RW=6;
  for(let i=0;i<n;i++){if(!mask[i])continue;const x=i%W,y=(i/W)|0;if(x<RW||y<RW||x>=W-RW||y>=H-RW)continue;
    let m=0,sxx=0,syy=0,sxy=0;
    for(let dy=-RW;dy<=RW;dy++)for(let dx=-RW;dx<=RW;dx++){if(!mask[i+dy*W+dx])continue;m++;sxx+=dx*dx;syy+=dy*dy;sxy+=dx*dy}
    if(m<5)continue;const tr=sxx+syy,coh=Math.hypot(sxx-syy,2*sxy)/tr;if(coh<0.6)continue;
    let th=0.5*Math.atan2(2*sxy,sxx-syy)+Math.PI/2;// direction of spread -> normal
    th=((th%Math.PI)+Math.PI)%Math.PI;ori[i]=th;pix.push(i)}
  for(const i of pix){const x=i%W,y=(i/W)|0,t0=Math.round(ori[i]/Math.PI*NT);
    for(let d=-4;d<=4;d++){const t=(t0+d+NT)%NT,r=Math.round(x*cs[t]+y*sn[t])+diag;acc[t*NR+r]++}}
  const peaks=[];
  const minVotes=W/25;
  for(let t=0;t<NT;t++)for(let r=0;r<NR;r++){const v=acc[t*NR+r];if(v<minVotes)continue;let ok=true;
    for(let dt=-4;dt<=4&&ok;dt++)for(let dr=-8;dr<=8;dr++){if(!dt&&!dr)continue;const tt=(t+dt+NT)%NT,rr=(t+dt<0||t+dt>=NT)?(2*diag-r)-dr:r+dr;if(rr<0||rr>=NR)continue;const u=acc[tt*NR+rr];if(u>v||(u===v&&(dt<0||(dt===0&&dr<0)))){ok=false;break}}
    if(ok)peaks.push({t,r:r-diag,v})}
  peaks.sort((a,b)=>b.v-a.v);
  // refine each peak with a least-squares fit on nearby pixels; line as (a,b,c) with a*x+b*y=c, a^2+b^2=1
  const lines=[];
  for(const p of peaks.slice(0,40)){let a=cs[p.t],b=sn[p.t],c=p.r;
    for(let it=0;it<2;it++){let sx=0,sy=0,sxx=0,syy=0,sxy=0,m=0;
      const nt=Math.atan2(b,a);
      for(const i of pix){const x=i%W,y=(i/W)|0;if(Math.abs(a*x+b*y-c)>2.5)continue;const dd=Math.abs(Math.sin(ori[i]-nt));if(dd>0.1)continue;sx+=x;sy+=y;sxx+=x*x;syy+=y*y;sxy+=x*y;m++}
      if(m<10)break;const mx=sx/m,my=sy/m,cxx=sxx/m-mx*mx,cyy=syy/m-my*my,cxy=sxy/m-mx*my;
      const ang=0.5*Math.atan2(2*cxy,cxx-cyy);// direction of the line
      a=-Math.sin(ang);b=Math.cos(ang);c=a*mx+b*my}
    if(lines.some(q=>Math.abs(q.a*a+q.b*b)>0.995&&Math.abs(q.c*Math.sign(q.a*a+q.b*b)-c)<6))continue;
    lines.push({a,b,c,v:p.v})}
  // 3. split into two direction families
  const dir=l=>Math.atan2(l.a,-l.b);// line direction angle
  if(lines.length<4)return{fail:'lines',mask,lines,nLines:lines.length};
  let best=null;
  const fam=[[],[]];
  // family A: lines nearly parallel to the strongest line (in the image, transverse lines stay roughly parallel);
  // family B: the rest (longitudinal lines converge in perspective, so their angles differ a lot)
  {const a0=dir(lines[0]);for(const l of lines){const d=Math.abs(Math.sin(dir(l)-a0));(d<Math.sin(14*Math.PI/180)?fam[0]:fam[1]).push(l)}}
  // dilated mask for scoring
  const dil=new Uint8Array(n);for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){const i=y*W+x;if(mask[i]||mask[i-1]||mask[i+1]||mask[i-W]||mask[i+W])dil[i]=1}
  const inter=(p,q)=>{const d=p.a*q.b-p.b*q.a;if(Math.abs(d)<1e-6)return null;return[(p.c*q.b-p.b*q.c)/d,(p.a*q.c-p.c*q.a)/d]};
  const T=[0,SV,CL-SV,CL],X=[-HW,-SHW,SHW,HW];
  // model segments (x0,y0,x1,y1)
  const SEG=[[-HW,0,HW,0],[-HW,CL,HW,CL],[-HW,0,-HW,CL],[HW,0,HW,CL],[-SHW,0,-SHW,CL],[SHW,0,SHW,CL],[-SHW,SV,SHW,SV],[-SHW,CL-SV,SHW,CL-SV],[0,SV,0,CL-SV]];
  const proj=(Hm,x,y)=>{const w=Hm[6]*x+Hm[7]*y+Hm[8];return w>1e-9?[(Hm[0]*x+Hm[1]*y+Hm[2])/w,(Hm[3]*x+Hm[4]*y+Hm[5])/w]:null};
  // score = image length (px) of model lines lying on line pixels, minus half the length that does not; each pixel counts once
  const stamp=new Int32Array(n);let sid=0;
  const score=Hm=>{let hit=0,miss=0;sid++;
    for(const s of SEG){const a=proj(Hm,s[0],s[1]),b=proj(Hm,s[2],s[3]);if(!a||!b)return -1e9;
      const k=Math.min(3000,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/1.5)+1);
      for(let j=0;j<=k;j++){const u=j/k,p=proj(Hm,s[0]+u*(s[2]-s[0]),s[1]+u*(s[3]-s[1]));if(!p)return -1e9;const x=Math.round(p[0]),y=Math.round(p[1]);if(x<1||y<1||x>=W-1||y>=H-1)continue;const i=y*W+x;if(stamp[i]===sid)continue;stamp[i]=sid;if(dil[i])hit++;else miss++}}
    return hit-0.5*miss};
  const take=(f,k)=>f.slice().sort((a,b)=>b.v-a.v).slice(0,k);
  for(const swap of[0,1]){const FT=take(fam[swap],7),FL=take(fam[1-swap],7);
    for(let i=0;i<FT.length;i++)for(let j=i+1;j<FT.length;j++)for(let k=0;k<FL.length;k++)for(let l=k+1;l<FL.length;l++){
      const P=[inter(FT[i],FL[k]),inter(FT[i],FL[l]),inter(FT[j],FL[k]),inter(FT[j],FL[l])];if(P.some(p=>!p))continue;
      if(P.some(p=>p[0]<-W||p[0]>2*W||p[1]<-H||p[1]>2*H))continue;
      for(let ta=0;ta<4;ta++)for(let tb=0;tb<4;tb++){if(ta===tb)continue;for(let xa=0;xa<4;xa++)for(let xb=0;xb<4;xb++){if(xa===xb)continue;
        const src=[[X[xa],T[ta]],[X[xb],T[ta]],[X[xa],T[tb]],[X[xb],T[tb]]];
        const Hm=cHomog(src,P);if(!Hm)continue;
        // orientation: view from above (no mirror) and near baseline lower in image than far baseline
        const o=proj(Hm,0,CL/2),ox=proj(Hm,1,CL/2),oy=proj(Hm,0,CL/2+1);if(!o||!ox||!oy)continue;
        if((ox[0]-o[0])*(oy[1]-o[1])-(ox[1]-o[1])*(oy[0]-o[0])>=0)continue;
        const nb=proj(Hm,0,0),fb=proj(Hm,0,CL);if(!nb||!fb||nb[1]<=fb[1])continue;
        const nl=proj(Hm,-HW,0),nr=proj(Hm,HW,0);if(!nl||!nr||Math.hypot(nr[0]-nl[0],nr[1]-nl[1])<W/8)continue;
        const sc=score(Hm);if(!best||sc>best.sc)best={sc,Hm}}}}}
  if(!best)return{fail:'fit',mask,lines,nLines:lines.length,fam:fam.map(f=>f.length)};
  // 4. refine: least squares on all intersections of model lines with re-fitted image lines
  let Hm=best.Hm;
  for(let it=0;it<3;it++){const fitted=[];
    const MODEL=[{t:0},{t:SV},{t:CL-SV},{t:CL},{x:-HW},{x:-SHW},{x:SHW},{x:HW}];
    for(const m of MODEL){const a0=m.t!=null?[-HW,m.t]:[m.x,0],a1=m.t!=null?[HW,m.t]:[m.x,CL];
      const samp=[];const k=80;
      for(let j=0;j<=k;j++){const u=j/k,p=proj(Hm,a0[0]+u*(a1[0]-a0[0]),a0[1]+u*(a1[1]-a0[1]));if(!p)continue;
        // search perpendicular for the nearest line pixel
        const q=proj(Hm,a0[0]+Math.min(1,u+0.01)*(a1[0]-a0[0]),a0[1]+Math.min(1,u+0.01)*(a1[1]-a0[1]));if(!q)continue;
        let dx=q[0]-p[0],dy=q[1]-p[1];const dl=Math.hypot(dx,dy);if(dl<1e-6)continue;const nx=-dy/dl,ny=dx/dl;let sw=0,sx=0,sy=0;
        for(let s=-5;s<=5;s++){const x=Math.round(p[0]+nx*s),y=Math.round(p[1]+ny*s);if(x<0||y<0||x>=W||y>=H)continue;if(mask[y*W+x]){sw++;sx+=p[0]+nx*s;sy+=p[1]+ny*s}}
        if(sw)samp.push([sx/sw,sy/sw])}
      if(samp.length<12)continue;
      let mx=0,my=0;for(const s of samp){mx+=s[0];my+=s[1]}mx/=samp.length;my/=samp.length;let cxx=0,cyy=0,cxy=0;for(const s of samp){cxx+=(s[0]-mx)**2;cyy+=(s[1]-my)**2;cxy+=(s[0]-mx)*(s[1]-my)}
      const ang=0.5*Math.atan2(2*cxy,cxx-cyy);fitted.push({m,l:{a:-Math.sin(ang),b:Math.cos(ang),c:-Math.sin(ang)*mx+Math.cos(ang)*my},n:samp.length})}
    const src=[],dst=[];
    for(const f of fitted)if(f.m.t!=null)for(const g of fitted)if(g.m.x!=null){
      if((f.m.t===SV||f.m.t===CL-SV)&&Math.abs(g.m.x)===HW)continue;// service lines stop at singles lines
      const p=inter(f.l,g.l);if(p){src.push([g.m.x,f.m.t]);dst.push(p)}}
    if(src.length<4)break;const Hn=cHomogLS(src,dst);if(!Hn)break;const sc=score(Hn);if(sc<best.sc*0.95)break;Hm=Hn;best.sc=Math.max(best.sc,sc)}
  const corner=(x,y)=>{const p=proj(Hm,x,y);return{x:p[0]/W,y:p[1]/H}};
  // quality: fraction of visible model samples that hit a line pixel
  let hit=0,tot=0;for(const s of SEG){const k=40;for(let j=0;j<=k;j++){const u=j/k,p=proj(Hm,s[0]+u*(s[2]-s[0]),s[1]+u*(s[3]-s[1]));if(!p)continue;const x=Math.round(p[0]),y=Math.round(p[1]);if(x<1||y<1||x>=W-1||y>=H-1)continue;tot++;if(dil[y*W+x])hit++}}
  return{pts:[corner(-HW,0),corner(HW,0),corner(HW,CL),corner(-HW,CL)],H:Hm,score:best.sc,quality:tot?hit/tot:0,nLines:lines.length,mask,lines};
}
function cHomog(src,dst){const A=[],b=[];
  for(let i=0;i<4;i++){const[x,y]=src[i],[X,Y]=dst[i];A.push([x,y,1,0,0,0,-X*x,-X*y]);b.push(X);A.push([0,0,0,x,y,1,-Y*x,-Y*y]);b.push(Y)}
  return cSolve8(A,b)}
function cHomogLS(src,dst){// normal equations
  const M=Array.from({length:8},()=>new Array(8).fill(0)),v=new Array(8).fill(0);
  for(let i=0;i<src.length;i++){const[x,y]=src[i],[X,Y]=dst[i];for(const[r,t]of[[[x,y,1,0,0,0,-X*x,-X*y],X],[[0,0,0,x,y,1,-Y*x,-Y*y],Y]]){for(let a=0;a<8;a++){v[a]+=r[a]*t;for(let c=0;c<8;c++)M[a][c]+=r[a]*r[c]}}}
  return cSolve8(M,v)}
function cSolve8(A,b){A=A.map(r=>r.slice());b=b.slice();
  for(let c=0;c<8;c++){let p=c;for(let r=c+1;r<8;r++)if(Math.abs(A[r][c])>Math.abs(A[p][c]))p=r;[A[c],A[p]]=[A[p],A[c]];[b[c],b[p]]=[b[p],b[c]];if(Math.abs(A[c][c])<1e-12)return null;
    for(let r=0;r<8;r++){if(r===c)continue;const f=A[r][c]/A[c][c];for(let k=c;k<8;k++)A[r][k]-=f*A[c][k];b[r]-=f*b[c]}}
  const h=b.map((x,i)=>x/A[i][i]);return[h[0],h[1],h[2],h[3],h[4],h[5],h[6],h[7],1]}
if(typeof module!=='undefined')module.exports={detectCourt};
