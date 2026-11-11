// find the time offset between the fragment and the original: compare tiny grey thumbnails
const{execFileSync}=require('child_process');
const grab=(v,ss,t,n)=>{const b=execFileSync('ffmpeg',['-v','error','-ss',String(ss),'-t',String(t),'-i',v,'-vf','scale=64:36,format=gray','-f','rawvideo','pipe:1'],{maxBuffer:1e9});const o=[];for(let i=0;i+2304<=b.length;i+=2304)o.push(b.subarray(i,i+2304));return o};
const frag=grab(process.argv[2],6,0.4),orig=grab(process.argv[3],+process.argv[4],+process.argv[5]);
const fps=25;let best=null;
for(let k=0;k<orig.length-frag.length;k++){let s=0;for(let j=0;j<frag.length;j++){const a=frag[j],b=orig[k+j];for(let i=0;i<2304;i+=3)s+=Math.abs(a[i]-b[i])}if(!best||s<best.s)best={s,k}}
console.log('fragment 6.00 s = origineel',(+process.argv[4]+best.k/fps).toFixed(3),'s  -> offset',(+process.argv[4]+best.k/fps-6).toFixed(3),'(score',best.s,')');
