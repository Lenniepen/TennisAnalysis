// copies a source file into index.html between /*NAME-BEGIN*/ and /*NAME-END*/ markers
// usage: node tools/inject.js <src.js> <index.html> [NAME]   (NAME default COURT-DETECT; also BALL-DETECT, BALL-3D)
const fs=require('fs');const[src,html,name='COURT-DETECT']=process.argv.slice(2);
let code=fs.readFileSync(src,'utf8').replace(/^if\(typeof module.*$/m,'').trim();
let h=fs.readFileSync(html,'utf8');
const re=new RegExp('/\\*'+name+'-BEGIN\\*/[\\s\\S]*?/\\*'+name+'-END\\*/');
if(!re.test(h))throw new Error('markers not found: '+name);
h=h.replace(re,()=>'/*'+name+'-BEGIN*/\n'+code+'\n/*'+name+'-END*/');
fs.writeFileSync(html,h);console.log('injected',code.length,'chars into',name);
