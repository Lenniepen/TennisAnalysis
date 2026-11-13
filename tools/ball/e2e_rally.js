// headless Chrome: open a video, wait for the court calibration, run "Rally's zoeken", print what was found
// usage: node e2e_rally.js <repoDir> <outDir> <video> [rate] [minShots]
const http=require('http'),fs=require('fs'),path=require('path'),{spawn}=require('child_process');
const[repo,outDir,vid,rate='2',minShots='3']=process.argv.slice(2);
const MIME={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.wasm':'application/wasm','.mp4':'video/mp4'};
const srv=http.createServer((q,s)=>{const p=path.join(repo,decodeURIComponent(q.url.split('?')[0]));fs.readFile(p,(e,d)=>{if(e){s.writeHead(404);s.end();return}s.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'});s.end(d)})}).listen(8767,'127.0.0.1');
const prof=path.join(outDir,'chrome-prof-'+Date.now());
const cp=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--remote-debugging-port=9335','--user-data-dir='+prof,'--window-size=1500,900','--autoplay-policy=no-user-gesture-required','about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  let tabs;for(let i=0;i<50;i++){try{tabs=await (await fetch('http://127.0.0.1:9335/json')).json();if(tabs.length)break}catch(e){}await sleep(200)}
  const ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);
  let id=0;const pend={},logs=[];ws.onmessage=m=>{const d=JSON.parse(m.data);if(d.id&&pend[d.id]){pend[d.id](d);delete pend[d.id]}
    if(d.method==='Runtime.exceptionThrown')logs.push('EXC: '+JSON.stringify(d.params.exceptionDetails.exception&&d.params.exceptionDetails.exception.description||d.params.exceptionDetails.text))};
  const send=(method,params={})=>new Promise(r=>{const i=++id;pend[i]=r;ws.send(JSON.stringify({id:i,method,params}))});
  const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,awaitPromise:true,returnByValue:true});return r.result&&r.result.result?r.result.result.value:r};
  const toast=()=>ev("(document.querySelector('#toast')||{}).textContent||''");
  await send('Runtime.enable');await send('Page.enable');await send('DOM.enable');
  await send('Page.navigate',{url:'http://127.0.0.1:8767/index.html'});await sleep(2500);
  await ev("try{localStorage.clear()}catch(e){};1");
  const doc=await send('DOM.getDocument');const q=await send('DOM.querySelector',{nodeId:doc.result.root.nodeId,selector:'#fileIn'});
  await send('DOM.setFileInputFiles',{nodeId:q.result.nodeId,files:[path.resolve(vid)]});
  for(let i=0;i<80;i++){await sleep(250);if(/automatisch gekalibreerd|niet gevonden/.test(await toast()))break}
  console.log('kalibratie:',await toast());
  await ev(`document.querySelector('#rRate').value='${rate}';document.querySelector('#rMin').value='${minShots}';window.__rallyDbg=true;1`);
  const t0=Date.now();await ev("document.querySelector('#bRally').click();1");
  for(let i=0;i<2400;i++){await sleep(500);const t=await toast();if(/rally’s toegevoegd|Geen rally|mislukt|geannuleerd/.test(t)){console.log('na',((Date.now()-t0)/1000).toFixed(0)+'s:',t);break}}
  console.log('debug:',JSON.stringify(await ev("(()=>{const d=window.__rallyDbg;return d===true?null:{frames:d.frames,tracks:d.tracks,rates:(d.rates||[]).join(' ')}})()")));
  const clips=await ev(`(()=>{const k=Object.keys(localStorage).find(k=>k.startsWith('tcp:clips:'));if(!k)return null;return JSON.parse(localStorage.getItem(k)).clips.map(c=>c.t0.toFixed(1)+'-'+c.t1.toFixed(1)+' ('+c.shots+')')})()`);
  console.log('rally-clips:',JSON.stringify(clips));
  console.log(logs.slice(0,10).join('\n')||'geen fouten in console');
  ws.close();cp.kill();srv.close();setTimeout(()=>process.exit(0),500);
})().catch(e=>{console.error(e);cp.kill();process.exit(1)});
