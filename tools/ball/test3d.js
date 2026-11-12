// offline test of ball3d.rally3d on a debug dump of the app (window.__ballDbg, written by e2e_ball.js)
// usage: node test3d.js app_dbg.json markers.json
const fs=require('fs'),{ballCamera,rally3d,b3Points}=require('./ball3d.js');
const dbg=JSON.parse(fs.readFileSync(process.argv[2])),mk=JSON.parse(fs.readFileSync(process.argv[3]));
const cam=ballCamera(mk.court.pts,mk.court.k,mk.width,mk.height);
console.log(`camera: hoogte ${cam.C[2].toFixed(2)} m, ${(-cam.C[1]).toFixed(2)} m achter de baseline, X ${cam.C[0].toFixed(2)}, beeldhoek ${cam.fovH.toFixed(0)}°`);
const pts=b3Points(dbg.tracks.map(t=>t.pts));
const dts=pts.slice(1).map((p,i)=>p.t-pts[i].t).sort((a,b)=>a-b),dt=+process.env.DT||dts[Math.floor(dts.length*0.3)];
const boxesAt=t=>{let b=[],bd=1;for(const f of dbg.frames){const d=Math.abs(f.t-t);if(d<bd){bd=d;b=f.boxes}}return b||[]};
const hints=(dbg.bounces||[]).concat(dbg.hits||[]).map(e=>e.t);
const t0=Date.now(),r=rally3d(pts,boxesAt,cam,{dt,hints});
console.log(`punten ${pts.length}, frame-dt ${dt.toFixed(3)}, kandidaten ${r.nCand}, rekentijd ${((Date.now()-t0)/1000).toFixed(1)} s`);
console.log('vluchten:');for(const f of r.flights)console.log(`  ${f.t0.toFixed(2)}-${f.t1.toFixed(2)}  ${f.n} pt  fout ${f.rms.toFixed(1)} px  spin top ${f.spinT.toFixed(2)} zij ${f.spinS.toFixed(2)}`);
console.log('gebeurtenissen:');for(const e of r.events)console.log(`  ${e.t.toFixed(2)} ${e.type}${e.pre?' (vóór service)':''} ${e.P?e.P.join(' '):''}`);
console.log('STUITEN:',r.bounces.map(b=>`${b.t.toFixed(2)}${b.pred?'(voorspeld)':''}@Y${b.Y.toFixed(1)}`).join('  '));
console.log('SLAGEN :',r.hits.map(h=>`${h.t.toFixed(2)}/${h.half} Z${h.Z.toFixed(2)} ${h.kmh.toFixed(0)}km/u`).join('  '));
if(process.env.DIAG)for(const t of[6.68,9.0,9.8,14.28,14.8,17.4,18.84,19.28,20.24])console.log('diag',t,JSON.stringify(r.diag(t)));
console.log('verwacht (jouw feedback): stuiten 6.68 9.00 14.28 17.40 18.84 20.24 | slagen 9.80 14.80 19.28');
