// AI ball detector: the WASB model (HRNet, NTT Communications, MIT license) trained on tennis.
// 3 consecutive frames in (512x288, RGB, ImageNet-normalised), one heatmap per frame out; runs in the browser with
// onnxruntime-web (Microsoft, MIT): WebGPU when available, otherwise WASM on the processor. Nothing to install.
// Model file: ball_model.wasm (= wasb_tennis.onnx, renamed for hosting). Converted with tools/model/export_wasb.py.
const BNN={sess:null,loading:null,ep:'',ort:null,cv:null,ctx:null,N:512*288};
async function ballNNLoad(){if(BNN.sess)return BNN.sess;
  if(!BNN.loading)BNN.loading=(async()=>{
    const u=p=>new URL(p,location.href).href,cdn='https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/';let ort=null;
    // local copy first (GitHub Pages), else the CDN (hosts that cannot serve the 22 MB runtime)
    for(const base of[u('ort/'),cdn]){try{ort=await import(base+'ort.webgpu.min.mjs');ort.env.wasm.wasmPaths=base;break}catch(e){console.warn('ort laden',base,e)}}
    if(!ort)throw new Error('onnxruntime-web kon niet geladen worden');
    ort.env.wasm.numThreads=1;// no cross-origin isolation on simple hosting
    const buf=await(await fetch(u('ball_model.wasm'))).arrayBuffer();
    for(const ep of(navigator.gpu?['webgpu','wasm']:['wasm'])){try{BNN.sess=await ort.InferenceSession.create(buf,{executionProviders:[ep]});BNN.ep=ep;break}catch(e){console.warn('balmodel',ep,e)}}
    if(!BNN.sess)throw new Error('balmodel start niet');BNN.ort=ort;return BNN.sess})();
  try{return await BNN.loading}catch(e){BNN.loading=null;throw e}}
// 16:9 crop around the court area (the model wants 16:9; a crop makes the ball bigger than the whole picture would)
function ballNNCrop(VW,VH,r){let w=Math.max(r.w,r.h*16/9),h=w*9/16;if(w>VW){w=VW;h=w*9/16}if(h>VH){h=VH;w=h*16/9}
  const cx=r.x+r.w/2,cy=r.y+r.h/2;return{x:Math.min(Math.max(0,cx-w/2),VW-w),y:Math.min(Math.max(0,cy-h/2),VH-h),w,h}}
// one frame -> planar float RGB, normalised
function ballNNPrep(src,crop){
  if(!BNN.cv){BNN.cv=document.createElement('canvas');BNN.cv.width=512;BNN.cv.height=288;BNN.ctx=BNN.cv.getContext('2d',{willReadFrequently:true});BNN.ctx.imageSmoothingEnabled=true;BNN.ctx.imageSmoothingQuality='high'}
  BNN.ctx.drawImage(src,crop.x,crop.y,crop.w,crop.h,0,0,512,288);
  const d=BNN.ctx.getImageData(0,0,512,288).data,n=BNN.N,o=new Float32Array(3*n);
  for(let i=0,j=0;i<n;i++,j+=4){o[i]=(d[j]/255-0.485)/0.229;o[n+i]=(d[j+1]/255-0.456)/0.224;o[2*n+i]=(d[j+2]/255-0.406)/0.225}
  return o}
// three prepped frames (old -> new) -> ball candidates in the middle frame [{x,y,s}] (normalised video coords)
async function ballNNRun(f0,f1,f2,crop,VW,VH,thr){thr=thr||0.5;const n=BNN.N,inp=new Float32Array(9*n);inp.set(f0,0);inp.set(f1,3*n);inp.set(f2,6*n);
  const out=await BNN.sess.run({frames:new BNN.ort.Tensor('float32',inp,[1,9,288,512])});
  const hm=out.heatmaps.data,base=n,seen=new Uint8Array(n),res=[],st=[];
  for(let i=0;i<n;i++){if(seen[i]||hm[base+i]<=thr)continue;let sw=0,sx=0,sy=0;st.push(i);seen[i]=1;
    while(st.length){const k=st.pop(),x=k%512,y=(k/512)|0,w=hm[base+k];sw+=w;sx+=x*w;sy+=y*w;
      for(const q of[k-1,k+1,k-512,k+512]){if(q<0||q>=n||seen[q]||hm[base+q]<=thr)continue;if(Math.abs((q%512)-x)>1)continue;seen[q]=1;st.push(q)}}
    res.push({x:(crop.x+(sx/sw+0.5)/512*crop.w)/VW,y:(crop.y+(sy/sw+0.5)/288*crop.h)/VH,s:sw})}
  return res.sort((a,b)=>b.s-a.s).slice(0,6)}
