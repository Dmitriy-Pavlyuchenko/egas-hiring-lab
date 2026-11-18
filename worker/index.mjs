import {DurableObject} from 'cloudflare:workers';
import {createHandler,schema} from '../engine.mjs';
import {respond} from '../dialogue.mjs';
import {load} from './assets.generated.mjs';

function values(args){
  return args.map(value=>ArrayBuffer.isView(value)?value.buffer.slice(value.byteOffset,value.byteOffset+value.byteLength):value);
}

export class HiringState extends DurableObject {
  constructor(ctx,env){
    super(ctx,env);
    if(!env.ADMIN_PASSWORD_SHA256) return;
    const storage=ctx.storage;
    const execute=(sql,...args)=>storage.sql.exec(sql,...values(args));
    storage.transactionSync(()=>{for(const sql of schema) execute(sql);});
    const db={
      query:(sql,...args)=>execute(sql,...args).next().value,
      run:(sql,...args)=>execute(sql,...args),
      list:(sql,...args)=>execute(sql,...args).toArray()
    };
    this.handle=createHandler({
      load,db,tx:fn=>storage.transactionSync(fn),
      passwordHash:env.ADMIN_PASSWORD_SHA256,
      production:true,reply:context=>respond(context,env)
    });
  }

  async fetch(request){
    if(!this.handle) return Response.json({error:'Организатор ещё не завершил настройку платформы.'},{status:503});
    const url=new URL(request.url);
    const req={
      url:url.pathname+url.search,method:request.method,headers:Object.fromEntries(request.headers),
      socket:{remoteAddress:request.headers.get('cf-connecting-ip')||'unknown'},publicOrigin:url.origin,
      [Symbol.asyncIterator]:()=>request.body?.[Symbol.asyncIterator]()??[][Symbol.iterator]()
    };
    const headers=new Headers();
    let status=200,body=null;
    const res={
      setHeader:(name,value)=>headers.set(name,value),
      writeHead:(code,added)=>{status=code;for(const [name,value] of Object.entries(added)) headers.set(name,value);},
      end:value=>{body=value;}
    };
    await this.handle(req,res);
    return new Response(body,{status,headers});
  }
}

export default {
  fetch(request,env){
    return env.HIRING_STATE.getByName('hiring-lab-v1').fetch(request);
  }
};
