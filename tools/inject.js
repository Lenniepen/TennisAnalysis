// copies court.js into index.html between the COURT-DETECT markers
const fs=require('fs');const[src,html]=process.argv.slice(2);
let code=fs.readFileSync(src,'utf8').replace(/^if\(typeof module.*$/m,'').trim();
let h=fs.readFileSync(html,'utf8');
const re=/\/\*COURT-DETECT-BEGIN\*\/[\s\S]*?\/\*COURT-DETECT-END\*\//;
if(!re.test(h))throw new Error('markers not found');
h=h.replace(re,()=>'/*COURT-DETECT-BEGIN*/\n'+code+'\n/*COURT-DETECT-END*/');
fs.writeFileSync(html,h);console.log('injected',code.length,'chars');
