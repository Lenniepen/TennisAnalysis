// Baseline: the app's current ball detection (grabFrame/blobsFrom/linkTracks), copied 1:1 but on raw RGBA ROI frames.
// r = ROI {x,y,w,h} in video px, scale = ROI downscale, VW/VH = video size
function prep(d,cw,chh){const n=cw*chh,lum=new Uint8Array(n),yel=new Uint8Array(n);
  for(let i=0,j=0;i<n;i++,j+=4){const R=d[j],G=d[j+1],B=d[j+2];lum[i]=(R*3+G*6+B)/10;const yv=(R+G)/2-B;
    yel[i]=yv>45&&G>95&&R>85&&G>=0.8*R&&B<0.64*G?2:(yv>12&&G>60&&G>=0.72*R?1:0)}
  return{w:cw,h:chh,lum,yel}}
function blobsFrom(prev,cur,next,r,scale,VW,VH){
  const w=cur.w,h=cur.h,n=w*h,mask=new Uint8Array(n);
  for(let i=0;i<n;i++){const y=cur.yel[i];if(!y)continue;const c=cur.lum[i],d1=Math.abs(c-prev.lum[i]),d2=Math.abs(c-next.lum[i]);
    if(y===2&&d1>16&&d2>16)mask[i]=2;else if(d1>10&&d2>10)mask[i]=1}
  const lab=new Int32Array(n),strong=[],weak=[];let id=0;const stack=[];
  const maxA=Math.max(30,n*0.0015);
  for(let i=0;i<n;i++){if(!mask[i]||lab[i])continue;id++;let a=0,a2=0,sx=0,sy=0,x0=w,x1=0,y0=h,y1=0;stack.push(i);lab[i]=id;
    while(stack.length){const k=stack.pop(),x=k%w,y=(k/w)|0;a++;if(mask[k]===2)a2++;sx+=x;sy+=y;if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;
      for(const q of[k-1,k+1,k-w,k+w,k-w-1,k-w+1,k+w-1,k+w+1]){if(q<0||q>=n||lab[q]||!mask[q])continue;const qx=q%w;if(Math.abs(qx-x)>1)continue;lab[q]=id;stack.push(q)}}
    const bw=x1-x0+1,bh=y1-y0+1;if(a>maxA||Math.max(bw,bh)/Math.min(bw,bh)>7)continue;
    const o={x:(r.x+(sx/a+0.5)/scale)/VW,y:(r.y+(sy/a+0.5)/scale)/VH,a};
    if(a2>=Math.max(1,a*0.3))strong.push(o);else if(a<=40)weak.push(o)}
  return{s:strong.length>60?[]:strong,w:weak.length>200?[]:weak};
}
function linkTracks(frames,W,H){
  const tracks=[],live=[];
  for(const f of frames){
    const used=new Set(),usedW=new Set();
    for(const tr of live){
      const L=tr.pts[tr.pts.length-1],dt=f.t-L.t;let px_=L.x*W,py=L.y*H;
      if(tr.v){px_+=tr.v[0]*dt;py+=tr.v[1]*dt}
      const sp=tr.v?Math.hypot(tr.v[0],tr.v[1])*dt:0;
      const R=tr.v?Math.max(0.025*H,0.6*sp):0.09*H;
      let best=-1,bd=R,weak=false;
      f.c.forEach((c,i)=>{if(used.has(i))return;const d=Math.hypot(c.x*W-px_,c.y*H-py);if(d<bd){bd=d;best=i}});
      if(best<0&&tr.v&&tr.pts.length>=3){const Rw=Math.max(0.012*H,0.35*sp);bd=Rw;
        (f.w||[]).forEach((c,i)=>{if(usedW.has(i))return;const d=Math.hypot(c.x*W-px_,c.y*H-py);if(d<bd){bd=d;best=i}});weak=best>=0}
      if(best>=0){let c;if(weak){usedW.add(best);c=f.w[best]}else{used.add(best);c=f.c[best]}
        const nv=[(c.x-L.x)*W/dt,(c.y-L.y)*H/dt];tr.v=tr.v?[tr.v[0]*0.4+nv[0]*0.6,tr.v[1]*0.4+nv[1]*0.6]:nv;tr.pts.push({t:f.t,x:c.x,y:c.y,weak});tr.miss=0}
      else tr.miss++;
    }
    for(let i=live.length-1;i>=0;i--)if(live[i].miss>3){tracks.push(live[i]);live.splice(i,1)}
    f.c.forEach((c,i)=>{if(!used.has(i))live.push({pts:[{t:f.t,x:c.x,y:c.y}],v:null,miss:0})});
  }
  return tracks.concat(live).filter(t=>t.pts.length>=4&&t.pts.filter(p=>!p.weak).length>=3);
}
module.exports={prep,blobsFrom,linkTracks};
