// usage: node test.js <dir> name1 name2 ...   (expects <name>.rgba 960x540 and writes <name>_out.rgba)
const fs=require('fs'),path=require('path');const{detectCourt,lensDist}=require('./court.js');
const dir=process.argv[2],W=960,H=540;
for(const name of process.argv.slice(3)){
  const buf=fs.readFileSync(path.join(dir,name+'.rgba'));const t0=Date.now();
  const r=detectCourt(buf,W,H);const ms=Date.now()-t0;
  const out=Buffer.from(buf);
  const put=(x,y,c)=>{x=Math.round(x);y=Math.round(y);if(x<0||y<0||x>=W||y>=H)return;const j=(y*W+x)*4;out[j]=c[0];out[j+1]=c[1];out[j+2]=c[2]};
  if(r)for(let i=0;i<W*H;i++)if(r.mask[i]){out[i*4]=255;out[i*4+1]=0;out[i*4+2]=255}
  if(r)for(const l of r.lines){for(let s=-1200;s<=1200;s++){const x=l.a*l.c-l.b*s,y=l.b*l.c+l.a*s;put(x,y,[255,255,0])}}
  if(r&&r.fail){console.log(name,'FAIL',r.fail,r.nLines,JSON.stringify(r.fam||''))}
  if(r&&!r.fail){
    const Hm=r.H,proj=(x,y)=>{const w=Hm[6]*x+Hm[7]*y+Hm[8];const p=lensDist(r.k||0,W,H,(Hm[0]*x+Hm[1]*y+Hm[2])/w,(Hm[3]*x+Hm[4]*y+Hm[5])/w);return p||[-9,-9]};
    const CL=23.77,HW=5.485,SHW=4.115,SV=5.485;
    const SEG=[[-HW,0,HW,0],[-HW,CL,HW,CL],[-HW,0,-HW,CL],[HW,0,HW,CL],[-SHW,0,-SHW,CL],[SHW,0,SHW,CL],[-SHW,SV,SHW,SV],[-SHW,CL-SV,SHW,CL-SV],[0,SV,0,CL-SV],[-HW-0.9,CL/2,HW+0.9,CL/2]];
    for(const s of SEG)for(let j=0;j<=400;j++){const u=j/400,p=proj(s[0]+u*(s[2]-s[0]),s[1]+u*(s[3]-s[1]));put(p[0],p[1],[0,255,255]);put(p[0]+1,p[1],[0,255,255])}
  }
  fs.writeFileSync(path.join(dir,name+'_out.rgba'),out);
  console.log(name,ms+'ms',r&&!r.fail?('lines '+r.nLines+' score '+r.score.toFixed(0)+' quality '+r.quality.toFixed(2)+' k '+(r.k||0).toFixed(3)+' pts '+r.pts.map(p=>p.x.toFixed(3)+','+p.y.toFixed(3)).join(' ')):'GEEN');
}
