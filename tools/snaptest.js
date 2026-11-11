// simulate a rough manual calibration (corners off by up to ±12 px, no lens) and snap it onto the lines
const fs=require('fs'),path=require('path');const{detectCourt,lensUndist}=require('./court.js');
const dir=process.argv[2],W=960,H=540,CL=23.77,HW=5.485;
const ref=[[-HW,0],[HW,0],[HW,CL],[-HW,CL]];
function homog(src,dst){const A=[],b=[];for(let i=0;i<4;i++){const[x,y]=src[i],[X,Y]=dst[i];A.push([x,y,1,0,0,0,-X*x,-X*y]);b.push(X);A.push([0,0,0,x,y,1,-Y*x,-Y*y]);b.push(Y)}
  for(let c=0;c<8;c++){let p=c;for(let r=c+1;r<8;r++)if(Math.abs(A[r][c])>Math.abs(A[p][c]))p=r;[A[c],A[p]]=[A[p],A[c]];[b[c],b[p]]=[b[p],b[c]];for(let r=0;r<8;r++){if(r===c)continue;const f=A[r][c]/A[c][c];for(let k=c;k<8;k++)A[r][k]-=f*A[c][k];b[r]-=f*b[c]}}
  const h=b.map((x,i)=>x/A[i][i]);return[...h,1]}
for(const name of process.argv.slice(3)){const buf=fs.readFileSync(path.join(dir,name+'.rgba'));
  const auto=detectCourt(buf,W,H);let seed=7;const rnd=()=>{seed=(seed*16807)%2147483647;return seed/2147483647*2-1};
  const rough=auto.pts.map(p=>[p.x*W+12*rnd(),p.y*H+12*rnd()]);
  const r=detectCourt(buf,W,H,{init:{H:homog(ref,rough),k:0}});
  const err=(pts)=>Math.max(...pts.map((p,i)=>Math.hypot((p.x-auto.pts[i].x)*W,(p.y-auto.pts[i].y)*H)));
  console.log(name,'auto q',auto.quality.toFixed(2),'k',auto.k.toFixed(3),'| ruw max afwijking',err(rough.map(p=>({x:p[0]/W,y:p[1]/H}))).toFixed(1)+'px','| na vastklikken q',r.quality.toFixed(2),'k',r.k.toFixed(3),'max afwijking',err(r.pts).toFixed(1)+'px');
}
