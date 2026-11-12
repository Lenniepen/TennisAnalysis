// app debug dump (+ court calibration) -> 3D events for a video overlay: bounces (in/out), hits (km/h, height), curves, serve
// usage: node events3d.js app_dbg.json markers_or_env.json out.json
const fs=require('fs'),{ballCamera,rally3d,b3Points,serveJudge}=require('./ball3d.js');
const dbg=JSON.parse(fs.readFileSync(process.argv[2])),mk=JSON.parse(fs.readFileSync(process.argv[3]));
const W=mk.width||mk.W||1920,H=mk.height||mk.H||1080,cam=ballCamera(mk.court.pts,mk.court.k,W,H);
const boxesAt=t=>{let b=[],bd=1;for(const f of dbg.frames){const d=Math.abs(f.t-t);if(d<bd){bd=d;b=f.boxes}}return b||[]};
const r=rally3d(b3Points(dbg.tracks.map(t=>t.pts)),boxesAt,cam,{hints:(dbg.bounces||[]).concat(dbg.hits||[]).map(e=>e.t)});
const inS=(X,Y)=>Math.abs(X)<=4.115+0.03&&Y>=-0.03&&Y<=23.77+0.03;
const out={bounces:r.bounces.map(b=>({t:b.t,x:b.x,y:b.y,X:b.X,Y:b.Y,pred:!!b.pred,call:inS(b.X,b.Y)?'in':'uit'})),
  hits:r.hits.map(h=>({t:h.t,x:h.x,y:h.y,kmh:h.kmh==null?null:Math.round(h.kmh),avg:h.kmhAvg==null?null:Math.round(h.kmhAvg),k3:Math.round(h.kmh3d),shot:h.kmhShot==null?null:Math.round(h.kmhShot),half:h.half,z:h.Z})),curves:r.curves,serve:r.serve,judge:serveJudge(r.serve,1.85),
  pts:b3Points(dbg.tracks.map(t=>t.pts))};
// first, simple stroke type: serve = the first hit; volley = no bounce since the previous hit; smash = contact above 2.3 m;
// otherwise forehand/backhand from the side of the body where the ball is hit (person box nearest to the ball).
// Near player (back to the camera): image left = his left. Far player (facing the camera): mirrored.
// Hand: near player = HAND (default left, the user); far player assumed right-handed.
const HAND=process.env.HAND||'links';
const evs=r.events.filter(e=>e.type!=='gap'&&!e.pre).sort((a,b)=>a.t-b.t);
out.hits.forEach((h,i)=>{const src=r.hits[i],near=src.half==='dichtbij';
  const prev=evs.filter(e=>e.t<h.t-0.02).pop();
  let type;
  if(r.serve&&Math.abs(r.serve.t-h.t)<0.25)type='service';
  else if(h.z>2.3)type='smash';
  else{const bx=boxesAt(h.t);let best=null,bd=1e9;for(const b of bx){const cx=(b.x0+b.x1)/2,d=Math.hypot((cx-h.x)*W,((b.y0+b.y1)/2-h.y)*H);if(d<bd){bd=d;best=b}}
    if(!best||bd>0.25*W)type='slag';
    else{const ballLeftInImage=h.x<(best.x0+best.x1)/2,playerLeft=near?ballLeftInImage:!ballLeftInImage,hand=near?HAND:'rechts';
      type=(playerLeft===(hand==='links'))?'forehand':'backhand'}
    // volley: no bounce since the previous hit, and played closer to the net than the baseline area (a missed bounce
    // on the far side would otherwise turn every groundstroke into a "volley")
    if(prev&&prev.type==='hit'&&Math.abs(src.Y-11.885)<8)type+=' volley'}
  h.type=type});
fs.writeFileSync(process.argv[4],JSON.stringify(out));
console.log('slagtypes',out.hits.map(h=>h.t.toFixed(2)+':'+h.type).join(' '));
console.log('stuiten',out.bounces.map(b=>b.t.toFixed(2)+(b.pred?'v':'')+'/'+b.call).join(' '));
console.log('slagen',out.hits.map(h=>h.t.toFixed(2)+'('+h.half+'):'+h.kmh+' [3d '+h.k3+' shot '+h.shot+' gem '+h.avg+'] '+h.z.toFixed(1)+'m').join(' '));
if(r.serve)console.log('service',r.serve.kmh.toFixed(0),'km/u, raakpunt',r.serve.contact[2].toFixed(2),'m, net',r.serve.net&&r.serve.net.clear.toFixed(2));
