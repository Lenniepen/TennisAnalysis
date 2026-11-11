// draw candidates (strong=red, weak=blue) and tracks (green trail of last 0.6 s) onto the ROI video -> mp4
// usage: node render.js video result.json out.mp4 [t0] [t1]
const{spawn}=require('child_process'),fs=require('fs');
const[video,res,out,T0='0',T1='999']=process.argv.slice(2);const R=JSON.parse(fs.readFileSync(res));const r={x:Math.round(R.r.x)&~1,y:Math.round(R.r.y)&~1,w:Math.round(R.r.w)&~1,h:Math.round(R.r.h)&~1},VW=1920,VH=1080,W=r.w,H=r.h;
const ff=spawn('ffmpeg',['-v','error','-ss',T0,'-to',T1,'-i',video,'-vf',`crop=${W}:${H}:${r.x}:${r.y}`,'-f','rawvideo','-pix_fmt','rgb24','pipe:1']);
const enc=spawn('ffmpeg',['-v','error','-y','-f','rawvideo','-pix_fmt','rgb24','-s',W+'x'+H,'-r',String(R.fps),'-i','pipe:0','-c:v','libx264','-preset','veryfast','-crf','20','-pix_fmt','yuv420p',out]);
const FS=W*H*3;let buf=Buffer.alloc(0),idx=0;
const px=(f,x,y,c)=>{x=Math.round(x);y=Math.round(y);if(x<0||y<0||x>=W||y>=H)return;const j=(y*W+x)*3;f[j]=c[0];f[j+1]=c[1];f[j+2]=c[2]};
const ring=(f,x,y,rad,c)=>{for(let a=0;a<64;a++){px(f,x+rad*Math.cos(a/10),y+rad*Math.sin(a/10),c)}};
const toL=p=>[p.x*VW-r.x,p.y*VH-r.y];
ff.stdout.on('data',d=>{buf=Buffer.concat([buf,d]);while(buf.length>=FS){const f=Buffer.from(buf.subarray(0,FS));buf=buf.subarray(FS);const t=+T0+idx/R.fps;idx++;
  const fr=R.frames.find(q=>Math.abs(q.t-t)<0.5/R.fps);
  if(fr){for(const c of fr.c){const[x,y]=toL(c);ring(f,x,y,7,[255,40,40])}for(const c of (fr.w||[])){const[x,y]=toL(c);ring(f,x,y,5,[60,120,255])}
    for(const b of (fr.boxes||[])){const[a0,b0]=toL({x:b.x0,y:b.y0}),[a1,b1]=toL({x:b.x1,y:b.y1});for(let x=a0;x<=a1;x+=2){px(f,x,b0,[220,220,220]);px(f,x,b1,[220,220,220])}for(let y=b0;y<=b1;y+=2){px(f,a0,y,[220,220,220]);px(f,a1,y,[220,220,220])}}}
  for(const b of (R.bounces||[])){if(b.t>t+1e-3||t-b.t>1.5)continue;const[x,y]=toL(b);ring(f,x,y,12,[255,230,0]);ring(f,x,y,13,[255,230,0])}
  for(const k of (R.hits||[])){if(k.t>t+1e-3||t-k.t>1.5)continue;const[x,y]=toL(k);for(let s=-9;s<=9;s++){px(f,x+s,y+s,[255,255,255]);px(f,x+s,y-s,[255,255,255])}}
  for(const T of R.tracks){const pts=T.pts.filter(p=>p.t<=t+1e-3&&p.t>=t-0.6);for(let i=1;i<pts.length;i++){const[a,b]=[toL(pts[i-1]),toL(pts[i])];for(let s=0;s<=20;s++){const x=a[0]+(b[0]-a[0])*s/20,y=a[1]+(b[1]-a[1])*s/20;px(f,x,y,[40,255,60]);px(f,x+1,y,[40,255,60])}}}
  // time stamp bar
  const bw=Math.round((t-+T0)*40)%W;for(let y=0;y<4;y++)for(let x=0;x<bw;x++)px(f,x,y,[255,255,255]);
  enc.stdin.write(f)}});
ff.on('close',()=>enc.stdin.end());
