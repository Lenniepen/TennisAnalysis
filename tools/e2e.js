// headless Chrome test via CDP: serve the repo, open index.html, load a video, wait for auto-calibration, screenshot
// usage: node e2e.js <repoDir> <outDir> video1.mp4 video2.mp4 ...
const http=require('http'),fs=require('fs'),path=require('path'),{spawn}=require('child_process');
const[repo,outDir,...videos]=process.argv.slice(2);
const MIME={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.wasm':'application/wasm','.mp4':'video/mp4'};
const srv=http.createServer((q,s)=>{const p=path.join(repo,decodeURIComponent(q.url.split('?')[0]));fs.readFile(p.endsWith(path.sep)?p+'index.html':p,(e,d)=>{if(e){s.writeHead(404);s.end();return}s.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'});s.end(d)})}).listen(8765,'127.0.0.1');
const chrome='C:/Program Files/Google/Chrome/Application/chrome.exe';
const prof=path.join(outDir,'chrome-prof-'+Date.now());
const cp=spawn(chrome,['--headless=new','--remote-debugging-port=9333','--user-data-dir='+prof,'--window-size=1500,900','--autoplay-policy=no-user-gesture-required','about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  let tabs;for(let i=0;i<50;i++){try{tabs=await (await fetch('http://127.0.0.1:9333/json')).json();if(tabs.length)break}catch(e){}await sleep(200)}
  const page=tabs.find(t=>t.type==='page');const ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);
  let id=0;const pend={},logs=[];ws.onmessage=m=>{const d=JSON.parse(m.data);if(d.id&&pend[d.id]){pend[d.id](d);delete pend[d.id]}
    if(d.method==='Runtime.consoleAPICalled')logs.push(d.params.type+': '+d.params.args.map(a=>a.value||a.description).join(' '));
    if(d.method==='Runtime.exceptionThrown')logs.push('EXC: '+JSON.stringify(d.params.exceptionDetails.exception&&d.params.exceptionDetails.exception.description||d.params.exceptionDetails.text))};
  const send=(method,params={})=>new Promise(r=>{const i=++id;pend[i]=r;ws.send(JSON.stringify({id:i,method,params}))});
  const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,awaitPromise:true,returnByValue:true});return r.result&&r.result.result?r.result.result.value:r};
  await send('Runtime.enable');await send('Page.enable');await send('DOM.enable');
  await send('Page.navigate',{url:'http://127.0.0.1:8765/index.html'});await sleep(2500);
  for(const vid of videos){
    await ev("try{localStorage.clear()}catch(e){};1");
    const doc=await send('DOM.getDocument');const q=await send('DOM.querySelector',{nodeId:doc.result.root.nodeId,selector:'#fileIn'});
    await send('DOM.setFileInputFiles',{nodeId:q.result.nodeId,files:[path.resolve(vid)]});
    let court=null;const t0=Date.now();
    for(let i=0;i<120;i++){await sleep(250);court=await ev("(document.querySelector('#calInfo')||{}).textContent||''");if(/automatisch gevonden|gekalibreerd/.test(court))break}
    await ev("v.pause();v.currentTime=1;1");await sleep(1500);
    console.log(path.basename(vid),'na',((Date.now()-t0)/1000).toFixed(1)+'s','court =',court);
    await ev("showTab&&showTab('ball');1");await sleep(500);
    const shot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(outDir,'e2e_'+path.basename(vid)+'.png'),Buffer.from(shot.result.data,'base64'));
    console.log('toast:',await ev("(document.querySelector('#toast')||{}).textContent||''"));
  }
  console.log(logs.filter(l=>/EXC|error/i.test(l)).slice(0,10).join('\n')||'geen fouten in console');
  ws.close();cp.kill();srv.close();setTimeout(()=>process.exit(0),500);
})().catch(e=>{console.error(e);cp.kill();process.exit(1)});
