// copies court.js into index.html between the BALL-DETECT markers
const fs=require('fs');const[src,html]=process.argv.slice(2);
let code=fs.readFileSync(src,'utf8').replace(/^if\(typeof module.*$/m,'').trim();
let h=fs.readFileSync(html,'utf8');
const re=/\/\*BALL-DETECT-BEGIN\*\/[\s\S]*?\/\*BALL-DETECT-END\*\//;
if(!re.test(h))throw new Error('markers not found');
h=h.replace(re,()=>'/*BALL-DETECT-BEGIN*/\n'+code+'\n/*BALL-DETECT-END*/');
fs.writeFileSync(html,h);console.log('injected',code.length,'chars');

