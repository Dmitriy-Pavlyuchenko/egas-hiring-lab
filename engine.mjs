import {createHash,randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';
import {Buffer} from 'node:buffer';
import {cases} from './case.mjs';
import {exportMaterial} from './exports.mjs';

const hour=3600000, maxImage=5*1024*1024;
const secret=()=>randomBytes(32).toString('base64url');
const digest=value=>createHash('sha256').update(value).digest('hex');
const matches=(value,hash)=>timingSafeEqual(Buffer.from(digest(value)),Buffer.from(hash));
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const date=n=>new Date(n).toISOString();
const text=(v,name,max=5000,min=1)=>{
  if(typeof v!=='string'||v.trim().length<min||v.trim().length>max) fail(400,'Проверьте поле «'+name+'».');
  return v.trim();
};
const number=(v,name,min,max)=>{
  if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max) fail(400,'Проверьте поле «'+name+'».');
  return v;
};
function candidateUrl(v){
  const value=text(v,'Ссылка на прототип',2048);
  try{
    const u=new URL(value);
    if(!['http:','https:'].includes(u.protocol)||u.username||u.password) throw Error();
    return u.href;
  }catch{fail(400,'Укажите полную ссылку HTTP или HTTPS.');}
}
async function json(req,limit=65536){
  if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||'')) fail(415,'Ожидается JSON.');
  let size=0;
  const chunks=[];
  for await(const part of req){
    size+=part.length;
    if(size>limit) fail(413,'Запрос слишком большой.');
    chunks.push(part);
  }
  try{
    const value=JSON.parse(Buffer.concat(chunks).toString());
    if(!value||typeof value!=='object'||Array.isArray(value)) throw Error();
    return value;
  }catch{fail(400,'Некорректный запрос.');}
}
function parseImage(file){
  if(!file||typeof file.data!=='string'||file.data.length>7_000_000||!(/^[A-Za-z0-9+/]+={0,2}$/).test(file.data)||file.data.length%4) fail(400,'Некорректное изображение.');
  const bytes=Buffer.from(file.data,'base64');
  if(!bytes.length||bytes.length>maxImage) fail(400,'Допустимо до 5 МБ на изображение.');
  let mime;
  if(bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'))) mime='image/png';
  if(bytes.subarray(0,3).equals(Buffer.from('ffd8ff','hex'))) mime='image/jpeg';
  if(bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP') mime='image/webp';
  if(!mime||mime!==file.type) fail(400,'Допустимы PNG, JPEG и WebP.');
  return {bytes,mime,id:randomUUID()};
}
function actionInput(kind,b){
  switch(kind){
    case 'message': return {text:text(b.text,'Сообщение',6000)};
    case 'offer':
      if(!['monthly','once'].includes(b.billing)) fail(400,'Выберите тип оплаты.');
      return {product:text(b.product,'Продукт',1500),price:number(b.price,'Цена',1,1e9),billing:b.billing,term:text(b.term,'Срок пилота',300),conditions:text(b.conditions,'Условия',3500)};
    case 'approval': {
      if(!['monthly','once'].includes(b.billing)) fail(400,'Выберите тип оплаты.');
      const clients=number(b.clients,'Клиентов для окупаемости',1,1e9);
      if(!Number.isSafeInteger(clients)) fail(400,'Укажите целое число клиентов.');
      return {
        price:number(b.price,'Цена для клиента',1,1e10),billing:b.billing,
        serviceCost:number(b.serviceCost,'Стоимость обслуживания клиента',0,1e10),
        acquisitionCost:number(b.acquisitionCost,'Стоимость привлечения клиента',0,1e10),
        payback:number(b.payback,'Срок окупаемости привлечения',0,1e6),
        clients,justification:text(b.justification,'Обоснование',3500)
      };
    }
    case 'prototype':
      if(!Array.isArray(b.images)||b.images.length>5) fail(400,'Допустимо до пяти изображений.');
      return {description:text(b.description,'Описание',3500),images:b.images.map(parseImage)};
    default: fail(400,'Неизвестное действие.');
  }
}
const blank=()=>({notes:[],messages:[],draft:'',submission:null});
const cookie=req=>(req.headers.cookie||'').match(/(?:^|;\s*)lab_admin=([A-Za-z0-9_-]{43})(?:;|$)/)?.[1];
export const schema=[
  "CREATE TABLE IF NOT EXISTS invite(id TEXT PRIMARY KEY, secret TEXT UNIQUE NOT NULL, label TEXT NOT NULL, created INTEGER NOT NULL, expires INTEGER NOT NULL, started INTEGER, revoked INTEGER, duration INTEGER NOT NULL, state TEXT NOT NULL, case_id TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS admin(hash TEXT PRIMARY KEY, expires INTEGER NOT NULL)",
  "CREATE TABLE IF NOT EXISTS action(invite TEXT NOT NULL REFERENCES invite(id), id TEXT NOT NULL, person TEXT NOT NULL, created INTEGER NOT NULL, day INTEGER NOT NULL, kind TEXT NOT NULL, status TEXT NOT NULL, PRIMARY KEY(invite,id))",
  "CREATE TABLE IF NOT EXISTS image(id TEXT PRIMARY KEY, invite TEXT NOT NULL REFERENCES invite(id), mime TEXT NOT NULL, bytes BLOB NOT NULL)",
  "CREATE TABLE IF NOT EXISTS image_chunk(image TEXT NOT NULL REFERENCES image(id) ON DELETE CASCADE, part INTEGER NOT NULL, bytes BLOB NOT NULL, PRIMARY KEY(image,part))",
  "CREATE TABLE IF NOT EXISTS state_chunk(invite TEXT NOT NULL REFERENCES invite(id) ON DELETE CASCADE, part INTEGER NOT NULL, bytes BLOB NOT NULL, PRIMARY KEY(invite,part))"
];

export function createHandler({load,db,tx,password,passwordHash=digest(password??''),origin,production=false,now=Date.now,reply}){
  if(!/^[a-f0-9]{64}$/.test(passwordHash)) throw Error('Invalid organizer password hash.');
  if(production&&((password!==undefined&&(password.length<16||password==='local-demo-change-me'))||passwordHash===digest('')||passwordHash===digest('local-demo-change-me'))) throw Error('Production requires a strong organizer password.');
  const availableCases=new Map(cases.map(({scenario,materials})=>[
    scenario.id,{
      scenario,materials,
      publicCase:{...scenario,people:scenario.people.map(({id,name,role,bio,limit,market})=>({id,name,role,bio,limit,market:!!market})),news:undefined},
      files:new Map(materials.map(m=>[m.id,exportMaterial(m,m.original?load('case-data/'+m.original):null)]))
    }
  ]));
  const assets=new Map([['/app.js','text/javascript; charset=utf-8'],['/style.css','text/css; charset=utf-8'],['/','text/html; charset=utf-8']].map(([path,type])=>[path,[type,load('public/'+(path==='/'?'index.html':path.slice(1)))]]));

  const {query,run,list}=db;
  const find=id=>query('SELECT * FROM invite WHERE id=?',id);
  const lookup=token=>query('SELECT * FROM invite WHERE secret=?',token);
  const chunkSize=512*1024;
  function putChunks(statement,id,bytes){
    for(let offset=0;offset<bytes.length;offset+=chunkSize) run(statement,id,offset/chunkSize,bytes.subarray(offset,offset+chunkSize));
  }
  const persist=(id,state)=>{
    const json=JSON.stringify(state), bytes=Buffer.from(json);
    run('DELETE FROM state_chunk WHERE invite=?',id);
    if(bytes.length>chunkSize) putChunks('INSERT INTO state_chunk VALUES(?,?,?)',id,bytes);
    run('UPDATE invite SET state=? WHERE id=?',bytes.length>chunkSize?'':json,id);
  };
  const period=row=>row.started===null?1:Math.min(3,1+Math.floor(Math.max(0,now()-row.started)/(row.duration*hour/3)));
  const dayLength=row=>row.duration*hour/3;
  const caseOf=row=>availableCases.get(row.case_id);
  const visibleNews=(row,day=period(row))=>row.started===null?[]:caseOf(row).scenario.news.filter(n=>n.day<=day);
  const stateOf=row=>JSON.parse(row.state||Buffer.concat(list('SELECT bytes FROM state_chunk WHERE invite=? ORDER BY part',row.id).map(p=>Buffer.from(p.bytes))).toString());
  function summary(row){
    const state=stateOf(row);
    return {
      id:row.id,label:row.label,created:date(row.created),expires:date(row.expires),
      started:row.started===null?null:date(row.started),revoked:!!row.revoked,
      expired:now()>=row.expires,submitted:state.submission?.at||null,
      caseId:row.case_id
    };
  }
  function ensure(row,{write=false,started=false}={}){
    if(!row) fail(404,'Приглашение не найдено.');
    if(row.revoked||now()>=row.expires) fail(410,row.revoked?'Организатор отозвал приглашение.':'Срок доступа к заданию истёк.');
    if(started&&row.started===null) fail(409,'Сначала начните симуляцию.');
    if(write&&stateOf(row).submission) fail(409,'Решение уже сдано.');
    return row;
  }
  function view(row){
    const day=period(row), state=stateOf(row);
    const {scenario,publicCase,materials,files}=caseOf(row);
    const catalog=materials.map(({id,title,type,category,description})=>({id,title,type,category,description,bytes:files.get(id)[1].length}));
    const usage={};
    for(const person of scenario.people){
      const messages=state.messages.filter(m=>m.person===person.id);
      usage[person.id]={
        messages:messages.filter(m=>m.day===day&&['prototype','message'].includes(m.kind)).length,
        offers:messages.filter(m=>m.kind==='offer').length,
        approvals:messages.filter(m=>m.kind==='approval').length
      };
    }
    return {...summary(row),serverTime:now(),day,days:3,nextDayAt:row.started!==null&&day<3?row.started+day*dayLength(row):null,case:publicCase,news:visibleNews(row,day),materials:catalog,usage,state};
  }
  function admin(req){
    const token=cookie(req);
    if(!token||!query('SELECT hash FROM admin WHERE hash=? AND expires>?',digest(token),now())) fail(401,'Войдите как организатор.');
  }
  const attempts=new Map();
  function allowLogin(req){
    const t=now(), key=req.socket.remoteAddress||'unknown';
    for(const [ip,attempt] of attempts) if(attempt.until<=t) attempts.delete(ip);
    const attempt=attempts.get(key)||{count:0,until:t+10*60000};
    if(attempt.count>=12) fail(429,'Слишком много попыток. Попробуйте позже.');
    if(attempts.size>=2000&&!attempts.has(key)) fail(429,'Попробуйте позже.');
    attempt.count++;
    attempts.set(key,attempt);
    return key;
  }
  function validOrigin(req){
    const supplied=req.headers.origin;
    if(req.headers['sec-fetch-site']==='cross-site'||(supplied&&supplied!==(origin||req.publicOrigin||'http://'+req.headers.host))) fail(403,'Запрос с другого сайта.');
  }
  function send(res,status,value,headers={}){
    if(res.destroyed) return;
    const body=Buffer.isBuffer(value)?value:Buffer.from(JSON.stringify(value));
    res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Content-Length':body.length,...headers});
    res.end(body);
  }
  function serveImage(res,id,image){
    const item=query('SELECT * FROM image WHERE invite=? AND id=?',id,image);
    if(!item) fail(404,'Изображение не найдено.');
    const bytes=item.bytes.byteLength?Buffer.from(item.bytes):Buffer.concat(list('SELECT bytes FROM image_chunk WHERE image=? ORDER BY part',image).map(p=>Buffer.from(p.bytes)));
    send(res,200,bytes,{'Content-Type':item.mime});
  }
  async function converse(req,res,row,personId){
    const person=caseOf(row).scenario.people.find(p=>p.id===personId);
    if(!person) fail(404,'Собеседник не найден.');
    ensure(row,{started:true});
    const body=await json(req,36*1024*1024);
    const requestId=text(body.requestId,'Номер операции',36,36);
    if(!/^[0-9a-f-]{36}$/i.test(requestId)) fail(400,'Некорректная операция.');
    const kind=body.kind;
    if(kind==='offer'&&!person.market||kind==='approval'&&person.id!=='finance') fail(400,'Действие недоступно этому собеседнику.');
    const input=actionInput(kind,body);
    const reserved=tx(()=>{
      const current=ensure(find(row.id),{started:true});
      const state=stateOf(current), day=period(current);
      const prior=query('SELECT * FROM action WHERE invite=? AND id=?',row.id,requestId);
      if(prior?.status==='done'){
        if(prior.kind!==kind||prior.person!==personId) fail(409,'Номер операции уже использован.');
        return null;
      }
      ensure(current,{write:true});
      run("DELETE FROM action WHERE invite=? AND status='pending' AND created<?",row.id,now()-30000);
      if(query("SELECT id FROM action WHERE invite=? AND person=? AND status='pending'",row.id,personId)) fail(409,'Дождитесь ответа собеседника.');
      const history=state.messages.filter(m=>m.person===personId);
      if(['message','prototype'].includes(kind)&&history.filter(m=>m.day===day&&['message','prototype'].includes(m.kind)).length>=person.limit) fail(409,'Дневной лимит исчерпан.');
      if(kind==='offer'&&history.filter(m=>m.kind===kind).length>=2) fail(409,'Лимит коммерческих предложений исчерпан.');
      if(kind==='approval'&&history.filter(m=>m.kind===kind).length>=3) fail(409,'Лимит согласований исчерпан.');
      const created=now();
      run('INSERT INTO action VALUES(?,?,?,?,?,?,?)',row.id,requestId,personId,created,day,kind,'pending');
      return {day,created,history,news:visibleNews(current,day)};
    });
    if(!reserved) return send(res,200,view(find(row.id)));
    const images=input.images||[];
    const contextInput=kind==='prototype'?{description:input.description,images:images.map(i=>({mime:i.mime,data:i.bytes.toString('base64')}))}:input;
    const storedInput=kind==='prototype'?{description:input.description,images:images.map(i=>i.id)}:input;
    let answer;
    try{
      answer=await reply({person,kind,input:contextInput,history:reserved.history.slice(-14).map(m=>({kind:m.kind,input:m.input,reply:m.reply,status:m.status})),news:reserved.news});
      if(typeof answer?.text!=='string'||!answer.text.trim()||answer.text.length>8000||
        (kind==='offer'&&!['accepted','declined'].includes(answer.status))||
        (kind==='approval'&&!['approved','revise'].includes(answer.status))) throw Error();
    }catch{
      run("DELETE FROM action WHERE invite=? AND id=? AND created=? AND status='pending'",row.id,requestId,reserved.created);
      fail(503,'Собеседник временно недоступен. Попробуйте повторить отправку.');
    }
    tx(()=>{
      const active=query('SELECT * FROM action WHERE invite=? AND id=?',row.id,requestId);
      if(active?.status!=='pending'||active.created!==reserved.created) fail(409,'Запрос больше не активен.');
      const state=stateOf(find(row.id));
      for(const i of images){
        run('INSERT INTO image VALUES(?,?,?,?)',i.id,row.id,i.mime,Buffer.alloc(0));
        putChunks('INSERT INTO image_chunk VALUES(?,?,?)',i.id,i.bytes);
      }
      state.messages.push({id:requestId,person:personId,kind,input:storedInput,reply:answer.text,status:answer.status||null,day:reserved.day,at:date(reserved.created)});
      persist(row.id,state);
      run("UPDATE action SET status='done' WHERE invite=? AND id=?",row.id,requestId);
    });
    send(res,200,view(find(row.id)));
  }
  async function handler(req,res){
    const method=req.method;
    const path=new URL(req.url,'http://local').pathname;
    const parts=path.split('/').filter(Boolean);
    if(!['GET','POST'].includes(method)) fail(405,'Метод недоступен.');
    if(method==='POST') validOrigin(req);
    if(method==='GET'&&path==='/health') return send(res,200,{ok:true});
    if(method==='GET'&&assets.has(path)){
      const [type,body]=assets.get(path);
      return send(res,200,body,{'Content-Type':type});
    }
    if(method==='GET'&&['organizer','c'].includes(parts[0])){
      if(parts[0]==='c'&&!/^[A-Za-z0-9_-]{43}$/.test(parts[1]||'')) fail(404,'Приглашение не найдено.');
      return send(res,200,assets.get('/')[1],{'Content-Type':assets.get('/')[0]});
    }
    if(parts[0]==='api'&&parts[1]==='admin'){
      const [, , resource, id, operation, imageId]=parts;
      if(method==='POST'&&resource==='login'&&!id){
        const key=allowLogin(req), body=await json(req);
        if(!matches(text(body.password,'Пароль',512),passwordHash)) fail(401,'Неверный пароль.');
        attempts.delete(key);
        const token=secret();
        run('DELETE FROM admin WHERE expires<=?',now());
        run('INSERT INTO admin VALUES(?,?)',digest(token),now()+12*hour);
        return send(res,200,{ok:true},{'Set-Cookie':'lab_admin='+token+'; Path=/; HttpOnly; SameSite=Strict; Max-Age=43200'+(production?'; Secure':'')});
      }
      admin(req);
      if(method==='POST'&&resource==='logout'&&!id){
        run('DELETE FROM admin WHERE hash=?',digest(cookie(req)));
        return send(res,200,{ok:true},{'Set-Cookie':'lab_admin=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0'+(production?'; Secure':'')});
      }
      if(resource!=='invites') fail(404,'Страница не найдена.');
      if(method==='GET'&&!id) return send(res,200,{
        cases:cases.map(({scenario:{id,title,defaultHours}})=>({id,title,defaultHours:defaultHours??72})),
        invites:list('SELECT * FROM invite ORDER BY created DESC').map(summary)
      });
      if(method==='POST'&&!id){
        const body=await json(req), label=text(body.label,'Метка кандидата',100);
        const caseId=body.caseId??cases[0].scenario.id;
        if(!availableCases.has(caseId)) fail(400,'Выберите доступный кейс.');
        const duration=number(body.hours,'Срок в часах',1,720), id=randomUUID(), token=secret(), created=now();
        run('INSERT INTO invite VALUES(?,?,?,?,?,NULL,NULL,?,?,?)',id,token,label,created,created+duration*hour,duration,JSON.stringify(blank()),caseId);
        return send(res,201,{...summary(find(id)),path:'/c/'+token+'/'});
      }
      const row=find(id);
      if(!row) fail(404,'Приглашение не найдено.');
      if(method==='GET'&&operation==='image') return serveImage(res,id,imageId);
      if(method==='GET'&&!operation) return send(res,200,{...view(row),path:'/c/'+row.secret+'/'});
      if(method==='POST'&&operation==='extend'){
        const body=await json(req), hours=number(body.hours,'Продление в часах',1,720);
        if(row.revoked) fail(409,'Приглашение отозвано.');
        run('UPDATE invite SET expires=max(expires,?)+? WHERE id=?',now(),hours*hour,id);
        return send(res,200,summary(find(id)));
      }
      if(method==='POST'&&operation==='revoke'){
        run('UPDATE invite SET revoked=COALESCE(revoked,?) WHERE id=?',now(),id);
        return send(res,200,summary(find(id)));
      }
    }
    if(parts[0]==='api'&&parts[1]==='c'){
      const [,,token,resource,key,mode]=parts;
      if(!/^[A-Za-z0-9_-]{43}$/.test(token||'')) fail(404,'Приглашение не найдено.');
      const row=ensure(lookup(token));
      if(method==='GET'&&!resource) return send(res,200,view(row));
      if(method==='POST'&&resource==='start'){
        run('UPDATE invite SET started=COALESCE(started,?) WHERE id=?',now(),row.id);
        return send(res,200,view(find(row.id)));
      }
      ensure(row,{started:true});
      if(method==='GET'&&resource==='image') return serveImage(res,row.id,key);
      if(method==='GET'&&resource==='material'){
        const {materials,files}=caseOf(row);
        const material=materials.find(m=>m.id===key);
        if(!material) fail(404,'Материал не найден.');
        if(!mode){
          const {original,...preview}=material;
          return send(res,200,preview);
        }
        if(['download','inline'].includes(mode)){
          const [mime,bytes]=files.get(key);
          if(mode==='inline'&&material.type!=='pdf') fail(404,'Просмотр недоступен.');
          return send(res,200,bytes,{'Content-Type':mime,'Content-Disposition':(mode==='download'?'attachment':'inline')+'; filename="'+key+'.'+material.type+'"'});
        }
      }
      if(method==='POST'&&resource==='people') return await converse(req,res,row,key);
      if(method==='POST'&&['note','draft','submit'].includes(resource)){
        const body=await json(req,128*1024);
        return tx(()=>{
          const current=ensure(find(row.id),{started:true}), state=stateOf(current);
          if(resource==='submit'&&state.submission) return send(res,200,view(current));
          ensure(current,{write:true});
          if(resource==='note'){
            if(body.operation==='create'){
              if(state.notes.length>=100) fail(409,'Достигнут лимит заметок.');
              state.notes.unshift({id:randomUUID(),title:'',body:'',updated:date(now())});
            }else{
              const note=state.notes.find(n=>n.id===key);
              if(!note) fail(404,'Заметка не найдена.');
              if(body.operation==='delete') state.notes=state.notes.filter(n=>n.id!==key);
              else{
                const title=text(body.title,'Название',160,0);
                if(typeof body.body!=='string'||body.body.length>16000) fail(400,'Заметка слишком длинная.');
                const content=body.body;
                if(note.updated!==body.version) fail(409,'Заметка изменена в другой вкладке. Откройте её заново.');
                Object.assign(note,{title,body:content,updated:date(Math.max(now(),Date.parse(note.updated)+1))});
              }
            }
          }else{
            state.draft=resource==='draft'&&body.url===''?'':candidateUrl(body.url);
            if(resource==='submit'){
              if(query("SELECT id FROM action WHERE invite=? AND status='pending' AND created>=?",row.id,now()-30000)) fail(409,'Дождитесь ответа собеседника перед сдачей.');
              state.submission={url:state.draft,at:date(now())};
            }
          }
          persist(row.id,state);
          return send(res,200,view(find(row.id)));
        });
      }
    }
    fail(404,'Страница не найдена.');
  }
  return (req,res)=>{
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('X-Frame-Options','SAMEORIGIN');
    res.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self' data:; frame-src 'self'; frame-ancestors 'self'; object-src 'none'; base-uri 'none'; form-action 'self'");
    return handler(req,res).catch(error=>{
      if(!error.status) console.error('Unexpected request failure:',error.code||error.name);
      send(res,error.status||500,{error:error.status?error.message:'Ошибка сервера. Попробуйте ещё раз.'});
    });
  };
}
