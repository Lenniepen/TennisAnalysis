// usage: node run.js <video> <outPrefix> <impl.js> [t0] [t1]
// streams the video ROI through ffmpeg, runs detection + linking, writes JSON + an overlay contact sheet input
const{spawn,execFileSync}=require('child_process'),fs=require('fs'),path=require('path');
const[video,outP,implPath,T0='0',T1='999']=process.argv.slice(2);
const impl=require(path.resolve(implPath));const court=require('../court.js');
const VW=1920,VH=1080;
// 1. court from a 960 frame
const tmp=outP+'_c.rgba';execFileSync('ffmpeg',['-v','error','-y','-ss',String(+T0+1),'-i',video,'-frames:v','1','-vf','scale=960:540','-f','rawvideo','-pix_fmt','rgba',tmp]);
const cr=court.detectCourt(fs.readFileSync(tmp),960,540);if(cr.fail){console.log('court fail',cr.fail);process.exit(1)}
const k=cr.k||0,Hm=cr.H;const toImg=(X,Y)=>{const w=Hm[6]*X+Hm[7]*Y+Hm[8];const p=court.lensDist(k,960,540,(Hm[0]*X+Hm[1]*Y+Hm[2])/w,(Hm[3]*X+Hm[4]*Y+Hm[5])/w);return[p[0]*2,p[1]*2]};
if(impl.ballSpace&&!process.env.NOSPACE)impl.P.allowed=impl.ballSpace(toImg,VW,VH);
const cs=[[-6.5,-0.5],[6.5,-0.5],[6.5,24.8],[-6.5,24.8]].map(p=>toImg(p[0],p[1]));
let x0=Math.min(...cs.map(p=>p[0])),x1=Math.max(...cs.map(p=>p[0])),y0=Math.min(...cs.map(p=>p[1])),y1=Math.max(...cs.map(p=>p[1]));
y0-=0.35*VH;x0-=0.03*VW;x1+=0.03*VW;const cl=(a,b,c)=>Math.max(b,Math.min(c,a));
x0=cl(x0,0,VW-2)&~1;x1=cl(x1,x0+2,VW);y0=cl(y0,0,VH-2)&~1;y1=cl(y1,y0+2,VH);
const r={x:x0,y:y0,w:(Math.round(x1-x0))&~1,h:(Math.round(y1-y0))&~1};const scale=Math.min(1,1600/r.w);
const cw=Math.max(8,Math.round(r.w*scale))&~1,chh=Math.max(8,Math.round(r.h*scale))&~1;
console.log('court q',cr.quality.toFixed(2),'k',k.toFixed(3),'ROI',JSON.stringify(r),'scale',scale.toFixed(2),cw+'x'+chh);
const fps=+execFileSync('ffprobe',['-v','error','-select_streams','v','-show_entries','stream=avg_frame_rate','-of','csv=p=0',video]).toString().trim().split('/').reduce((a,b)=>a/b);
const ff=spawn('ffmpeg',['-v','error','-ss',T0,'-to',T1,'-i',video,'-vf',`crop=${r.w}:${r.h}:${r.x}:${r.y},scale=${cw}:${chh}`,'-f','rawvideo','-pix_fmt','rgba','pipe:1']);
const FS=cw*chh*4;let buf=Buffer.alloc(0),idx=0;const raw=[],frames=[];
ff.stdout.on('data',d=>{buf=Buffer.concat([buf,d]);while(buf.length>=FS){const fr=buf.subarray(0,FS);buf=buf.subarray(FS);
  const t=+T0+idx/fps;idx++;raw.push({t,g:impl.prep(Buffer.from(fr),cw,chh,r,scale,VW,VH)});
  if(raw.length>=3){const kk=raw.length-2;const bb=impl.blobsFrom(raw[kk-1].g,raw[kk].g,raw[kk+1].g,r,scale,VW,VH);frames.push({t:raw[kk].t,c:bb.s,w:bb.w})}
  if(raw.length>3)raw[raw.length-4].g=null}});
ff.on('close',()=>{
  const tracks=impl.linkTracks(frames,VW,VH);
  const nS=frames.reduce((a,f)=>a+f.c.length,0),nW=frames.reduce((a,f)=>a+f.w.length,0);
  console.log('frames',frames.length,'fps',fps.toFixed(2),'strong',nS,'weak',nW,'tracks',tracks.length);
  for(const t of tracks.sort((a,b)=>a.pts[0].t-b.pts[0].t))console.log(' track',t.pts[0].t.toFixed(2)+'-'+t.pts[t.pts.length-1].t.toFixed(2),'n',t.pts.length,'from',(t.pts[0].x*VW|0)+','+(t.pts[0].y*VH|0),'to',(t.pts[t.pts.length-1].x*VW|0)+','+(t.pts[t.pts.length-1].y*VH|0));
  fs.writeFileSync(outP+'.json',JSON.stringify({r,fps,frames,tracks}));
});

