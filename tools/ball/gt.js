// recall check against hand-verified ball positions (matched within ±0.05 s and 14 px)
const fs=require('fs');const R=JSON.parse(fs.readFileSync(process.argv[2]));
const GT=[[6.24,915,184],[6.28,897,193],[6.32,882,201],[6.40,860,216],[6.44,851,223],[6.48,844,230],[6.52,839,236],[6.56,834,241],[6.64,826,253],[6.68,823,259],[7.48,815,173],[7.52,816,168],[7.56,817,163],[7.60,818,158],[7.64,819,153],[7.68,820,149],[7.72,821,145],[7.77,822,141]];
let hitC=0,inTrack=0;const lines=[];
for(const[t,x,y]of GT){const fs_=R.frames.filter(f=>Math.abs(f.t-t)<0.05);
  const cand=fs_.some(f=>f.c.concat(f.w||[]).some(c=>Math.hypot(c.x*1920-x,c.y*1080-y)<14));if(cand)hitC++;
  const tr=R.tracks.some(T=>T.pts.some(p=>Math.abs(p.t-t)<0.05&&Math.hypot(p.x*1920-x,p.y*1080-y)<14));if(tr)inTrack++;
  lines.push(`${t} kandidaat:${cand?'J':'-'} track:${tr?'J':'-'}`)}
if(process.argv[3])console.log(lines.join('\n'));
const cov=R.tracks.reduce((a,T)=>a+T.pts.length,0);
console.log(`bal als kandidaat ${hitC}/${GT.length}, in een track ${inTrack}/${GT.length}; tracks ${R.tracks.length}, trackpunten ${cov}`);
