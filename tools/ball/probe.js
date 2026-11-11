// list moving blobs (any colour) with their mean colour, per frame, in a time window; full-res crop
const{spawn}=require('child_process');
const[video,T0,T1,cx,cy,cwS,chS]=process.argv.slice(2);const CW=+cwS,CH=+chS,X0=+cx,Y0=+cy;const fps=24.92;
const ff=spawn('ffmpeg',['-v','error','-ss',T0,'-to',T1,'-i',video,'-vf',`crop=${CW}:${CH}:${X0}:${Y0}`,'-f','rawvideo','-pix_fmt','rgb24','pipe:1']);
const FS=CW*CH*3;let buf=Buffer.alloc(0);const fr=[];
ff.stdout.on('data',d=>{buf=Buffer.concat([buf,d]);while(buf.length>=FS){fr.push(Buffer.from(buf.subarray(0,FS)));buf=buf.subarray(FS)}});
ff.on('close',()=>{const L=f=>{const o=new Float32Array(CW*CH);for(let i=0;i<CW*CH;i++)o[i]=(f[i*3]*3+f[i*3+1]*6+f[i*3+2])/10;return o};
  const lum=fr.map(L);
  for(let k=1;k<fr.length-1;k++){const m=new Uint8Array(CW*CH);for(let i=0;i<CW*CH;i++){const d1=lum[k][i]-lum[k-1][i],d2=lum[k][i]-lum[k+1][i];if(d1>18&&d2>18)m[i]=1}
    // blobs
    const lab=new Int32Array(CW*CH);let id=0;const out=[];
    for(let i=0;i<m.length;i++){if(!m[i]||lab[i])continue;id++;const st=[i];lab[i]=id;let a=0,sx=0,sy=0,R=0,G=0,B=0;
      while(st.length){const q=st.pop();a++;const x=q%CW,y=(q/CW)|0;sx+=x;sy+=y;R+=fr[k][q*3];G+=fr[k][q*3+1];B+=fr[k][q*3+2];
        for(const n of[q-1,q+1,q-CW,q+CW]){if(n<0||n>=m.length||!m[n]||lab[n])continue;lab[n]=id;st.push(n)}}
      if(a>=2&&a<=150)out.push({x:X0+sx/a|0,y:Y0+sy/a|0,a,c:[R/a|0,G/a|0,B/a|0]})}
    out.sort((p,q)=>(q.c[0]+q.c[1]-2*q.c[2])-(p.c[0]+p.c[1]-2*p.c[2]));
    console.log((+T0+k/fps).toFixed(2),out.slice(0,6).map(o=>`${o.x},${o.y} a${o.a} rgb(${o.c})`).join(' | '))}});
