import {readdirSync,readFileSync,writeFileSync} from 'node:fs';
import {Buffer} from 'node:buffer';

const entries = Object.fromEntries(['public','case-data'].flatMap(dir =>
  readdirSync(dir,{withFileTypes:true})
    .filter(file=>file.isFile()&&!file.name.endsWith('.mjs'))
    .map(file=>{
      const name=dir+'/'+file.name;
      return [name,readFileSync(name).toString('base64')];
    })
));
const script='import {Buffer} from "node:buffer";\nconst assets='+JSON.stringify(entries)+';\n'+
  'export const load=path=>{if(!Object.hasOwn(assets,path))throw Error("Asset unavailable: "+path);return Buffer.from(assets[path],"base64");};\n';
writeFileSync('worker/assets.generated.mjs',script);
console.log('Embedded '+Object.keys(entries).length+' assets.');
