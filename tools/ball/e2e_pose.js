// headless Chrome: open video, make a "punt" clip t0..t1, run "Bal volgen", report the result and take screenshots
// usage: node e2e_pose.js <repoDir> <outDir> <video> <t0> <t1>  -> outDir/pose.json
const http=require('http'),fs=require('fs'),path=require('path'),{spawn}=require('child_process');
const[repo,outDir,vid,T0,T1]=process.argv.slice(2);
const MIME={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.wasm':'application/wasm','.mp4':'video/mp4'};
const srv=http.createServer((q,s)=>{const p=path.join(repo,decodeURIComponent(q.url.split('?')[0]));fs.readFile(p,(e,d)=>{if(e){s.writeHead(404);s.end();return}s.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'});s.end(d)})}).listen(8766,'127.0.0.1');
const prof=path.join(outDir,'chrome-prof-'+Date.now());
const cp=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--remote-debugging-port=9334','--user-data-dir='+prof,'--window-size=1500,900','--autoplay-policy=no-user-gesture-required','about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  let tabs;for(let i=0;i<50;i++){try{tabs=await (await fetch('http://127.0.0.1:9334/json')).json();if(tabs.length)break}catch(e){}await sleep(200)}
  const ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);
  let id=0;const pend={},logs=[];ws.onmessage=m=>{const d=JSON.parse(m.data);if(d.id&&pend[d.id]){pend[d.id](d);delete pend[d.id]}
    if(d.method==='Runtime.consoleAPICalled')logs.push(d.params.type+': '+d.params.args.map(a=>a.value||a.description).join(' '));
    if(d.method==='Runtime.exceptionThrown')logs.push('EXC: '+JSON.stringify(d.params.exceptionDetails.exception&&d.params.exceptionDetails.exception.description||d.params.exceptionDetails.text))};
  const send=(method,params={})=>new Promise(r=>{const i=++id;pend[i]=r;ws.send(JSON.stringify({id:i,method,params}))});
  const ev=async e=>{const r=await send("Runtime.evaluate",{expression:e,awaitPromise:true,returnByValue:true});return r.result&&r.result.result&&!r.result.exceptionDetails?r.result.result.value:r};
  const key=k=>ev(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'${k}',bubbles:true}));1`);
  const seekTo=async t=>{await ev(`(async()=>{const v=document.querySelector('video');v.pause();v.currentTime=${t};await new Promise(r=>v.addEventListener('seeked',r,{once:true}));return 1})()`);await sleep(150)};
  const toast=()=>ev("(document.querySelector('#toast')||{}).textContent||''");
  await send('Runtime.enable');await send('Page.enable');await send('DOM.enable');
  await send('Page.navigate',{url:'http://127.0.0.1:8766/index.html'});await sleep(2500);
  await ev("try{localStorage.clear()}catch(e){};1");
  const doc=await send('DOM.getDocument');const q=await send('DOM.querySelector',{nodeId:doc.result.root.nodeId,selector:'#fileIn'});
  await send('DOM.setFileInputFiles',{nodeId:q.result.nodeId,files:[path.resolve(vid)]});
  for(let i=0;i<80;i++){await sleep(250);if(/automatisch gekalibreerd|niet gevonden/.test(await toast()))break}
  console.log('kalibratie:',await toast());
  const t0=Date.now();
  const res=await ev(`(async()=>{const Q=window.__pose;await Q.loadPose();if(!window.__noFps)await Q.ensureFps();const fr=await Q.scanFrames(null,${+T0},${+T1},null,${process.env.TGT?JSON.stringify((([x,y,h])=>({x,y,h}))(process.env.TGT.split(",").map(Number))):"null"});
    const r=x=>+x.toFixed(4);const vv=document.querySelector("video");return JSON.stringify({W:vv.videoWidth,H:vv.videoHeight,frames:fr.map(f=>({t:+f.t.toFixed(3),P:f.P?f.P.map(p=>[r(p.x),r(p.y),+(p.v||0).toFixed(2)]):null}))})})()`);
  if(typeof res==='string'){fs.writeFileSync(path.join(outDir,'pose.json'),res);const D=JSON.parse(res);console.log('pose: beelden',D.frames.length,'met skelet',D.frames.filter(f=>f.P).length,'in',((Date.now()-t0)/1000).toFixed(0)+'s')}
  else console.log("fout",JSON.stringify(res.result||res).slice(0,800));
  console.log(logs.filter(l=>/EXC|error/i.test(l)).slice(0,10).join('\n')||'geen fouten in console');
  ws.close();cp.kill();srv.close();setTimeout(()=>process.exit(0),500);
})().catch(e=>{console.error(e);cp.kill();process.exit(1)});
