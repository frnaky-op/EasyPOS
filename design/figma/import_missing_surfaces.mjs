import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const dir=path.dirname(fileURLToPath(import.meta.url));
const bridge=process.env.FIGMA_BRIDGE_PATH || path.resolve(dir,'../../../games/react-games/tools/figma-bridge/bridge.mjs');
const files=['16-commandes-en-attente','17-utilisateurs','18-categories','19-ajuster-stock','20-compte-utilisateur','21-configuration-reseau','22-premiere-configuration'];
const batchFile=path.join(dir,'import-batch.json');
function run(ops){
  fs.writeFileSync(batchFile,JSON.stringify({ops}));
  return JSON.parse(execFileSync('node',[bridge,'run',batchFile],{encoding:'utf8',maxBuffer:4*1024*1024}));
}
function list(){return run([{op:'list'}]).results[0].nodes;}
function names(id){return new Set(run([{op:'tree',id,maxNodes:1000}]).results[0].nodes.map(node=>node.name));}
for(const base of files){
  const source=JSON.parse(fs.readFileSync(path.join(dir,`${base}.json`),'utf8'));
  const [frame,...layers]=source.ops;
  let node=list().find(entry=>entry.name===frame.name);
  if(!node){const result=run([frame]);node={id:result.results[0].id};}
  let existing=names(node.id);
  let unchanged=0;
  while(true){
    const pending=layers.filter(layer=>!existing.has(layer.name));
    if(!pending.length)break;
    const batch=pending.slice(0,8).map(layer=>({...layer,parent:node.id}));
    try{run(batch);}catch(error){process.stdout.write(`${base}: bridge timeout, checking canvas\n`);}
    const next=names(node.id);
    if(next.size===existing.size){unchanged++;if(unchanged>=3)throw new Error(`No progress on ${base}: ${pending[0].name}`);}else unchanged=0;
    existing=next;
  }
  const preview=path.join(dir,`${base}-figma.png`);
  execFileSync('node',[bridge,'export',node.id,'--out',preview],{encoding:'utf8'});
  process.stdout.write(`${base}: ${layers.length} layers, frame ${node.id}, preview saved\n`);
}
