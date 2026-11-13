// headless Chrome: open video, make a "punt" clip t0..t1, run "Bal volgen", report the result and take screenshots
// usage: node e2e_ballsel.js <repoDir> <outDir> <video>
const http=require('http'),fs=require('fs'),path=require('path'),{spawn}=require('child_process');
const[repo,outDir,vid]=process.argv.slice(2);
const MIME={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.wasm':'application/wasm','.mp4':'video/mp4'};
const srv=http.createServer((q,s)=>{const p=path.join(repo,decodeURIComponent(q.url.split('?')[0]));fs.readFile(p,(e,d)=>{if(e){s.writeHead(404);s.end();return}s.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'});s.end(d)})}).listen(+(process.env.PORT||8766),'127.0.0.1');
const prof=path.join(outDir,'chrome-prof-'+Date.now());
const cp=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--remote-debugging-port='+(process.env.DBG||9334)+'','--user-data-dir='+prof,'--window-size=1500,900','--autoplay-policy=no-user-gesture-required','about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  let tabs;for(let i=0;i<50;i++){try{tabs=await (await fetch('http://127.0.0.1:'+(process.env.DBG||9334)+'/json')).json();if(tabs.length)break}catch(e){}await sleep(200)}
  const ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);
  let id=0;const pend={},logs=[];ws.onmessage=m=>{const d=JSON.parse(m.data);if(d.id&&pend[d.id]){pend[d.id](d);delete pend[d.id]}
    if(d.method==='Runtime.consoleAPICalled')logs.push(d.params.type+': '+d.params.args.map(a=>a.value||a.description).join(' '));
    if(d.method==='Runtime.exceptionThrown')logs.push('EXC: '+JSON.stringify(d.params.exceptionDetails.exception&&d.params.exceptionDetails.exception.description||d.params.exceptionDetails.text))};
  const send=(method,params={})=>new Promise(r=>{const i=++id;pend[i]=r;ws.send(JSON.stringify({id:i,method,params}))});
  const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,awaitPromise:true,returnByValue:true});return r.result&&r.result.result?r.result.result.value:r};
  const key=k=>ev(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'${k}',bubbles:true}));1`);
  const seekTo=async t=>{await ev(`(async()=>{const v=document.querySelector('video');v.pause();v.currentTime=${t};await new Promise(r=>v.addEventListener('seeked',r,{once:true}));return 1})()`);await sleep(150)};
  const toast=()=>ev("(document.querySelector('#toast')||{}).textContent||''");
  await send('Runtime.enable');await send('Page.enable');await send('DOM.enable');
  await send('Page.navigate',{url:'http://127.0.0.1:'+(process.env.PORT||8766)+'/index.html'});await sleep(2500);
  await ev("try{localStorage.clear()}catch(e){};1");
  const doc=await send('DOM.getDocument');const q=await send('DOM.querySelector',{nodeId:doc.result.root.nodeId,selector:'#fileIn'});
  await send('DOM.setFileInputFiles',{nodeId:q.result.nodeId,files:[path.resolve(vid)]});
  for(let i=0;i<80;i++){await sleep(250);if(/automatisch gekalibreerd|niet gevonden/.test(await toast()))break}
  console.log('kalibratie:',await toast());
  await seekTo(5.5);await key('i');await seekTo(7.5);await key('r');await sleep(300);
  await seekTo(9.0);await key('i');await seekTo(11.0);await key('r');await sleep(300);
  await ev("[...document.querySelectorAll('button,[data-tab]')].find(b=>/^\s*Bal\s*$/.test(b.textContent)).click();1");await sleep(300);
  console.log('knoppen zonder selectie:',await ev("document.querySelector('#bBallSel').textContent+' | disabled='+document.querySelector('#bBallSel').disabled+' | '+document.querySelector('#bBall').textContent"));
  await ev("(document.querySelectorAll('#list li')[1]||{click(){}}).click();1");await sleep(400);
  console.log('knoppen met selectie:',await ev("document.querySelector('#bBallSel').textContent+' | '+document.querySelector('#bBall').textContent"));
  await ev("document.querySelector('#bBallSel').click();1");
  for(let i=0;i<400;i++){await sleep(500);const t=await toast();if(/Bal gevolgd|mislukt|niet geladen/.test(t)&&!/Bal volgen in/.test(t)){console.log('melding:',t);break}}
  console.log('resultaat per clip:',await ev("(()=>{const k=Object.keys(localStorage).find(k=>k.startsWith('tcp:clips:'));const C=JSON.parse(localStorage.getItem(k)).clips;return C.map(c=>c.t0.toFixed(1)+'-'+c.t1.toFixed(1)+': '+(c.ball?'bal gevolgd':'niet')).join(' | ')})()"));
  console.log('knop daarna:',await ev("document.querySelector('#bBallSel').textContent"));
  console.log(logs.filter(l=>/EXC|error/i.test(l)).slice(0,10).join('\n')||'geen fouten in console');
  ws.close();cp.kill();srv.close();setTimeout(()=>process.exit(0),500);
})().catch(e=>{console.error(e);cp.kill();process.exit(1)});
