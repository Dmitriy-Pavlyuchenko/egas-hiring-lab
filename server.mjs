import {createServer} from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHandler,schema} from './engine.mjs';
import {respond} from './dialogue.mjs';

const root=dirname(fileURLToPath(import.meta.url));
export function createLab({database=process.env.DATABASE_PATH||resolve(root,'runtime','lab.sqlite'),password=process.env.ADMIN_PASSWORD||'local-demo-change-me',origin=process.env.PUBLIC_ORIGIN,production=process.env.NODE_ENV==='production',now=Date.now,reply=respond}={}){
  if(production&&(!origin?.startsWith('https://')||new URL(origin).origin!==origin)) throw Error('Production requires an HTTPS PUBLIC_ORIGIN.');
  if(database!==':memory:') mkdirSync(dirname(resolve(database)),{recursive:true});
  const sqlite=new DatabaseSync(database);
  sqlite.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
  sqlite.exec(schema.join(';'));
  const db={
    query:(sql,...args)=>sqlite.prepare(sql).get(...args),
    run:(sql,...args)=>sqlite.prepare(sql).run(...args),
    list:(sql,...args)=>sqlite.prepare(sql).all(...args)
  };
  const tx=fn=>{
    sqlite.exec('BEGIN IMMEDIATE');
    try{const value=fn();sqlite.exec('COMMIT');return value;}
    catch(error){sqlite.exec('ROLLBACK');throw error;}
  };
  const load=path=>readFileSync(resolve(root,path));
  const server=createServer(createHandler({load,db,tx,password,origin,production,now,reply}));
  server.on('close',()=>sqlite.close());
  return server;
}

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  const host=process.env.HOST||'127.0.0.1', port=Number(process.env.PORT||3080);
  createLab().listen(port,host,()=>console.log('Hiring Lab: http://'+host+':'+port));
}
