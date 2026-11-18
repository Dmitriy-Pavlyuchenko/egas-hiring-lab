import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Readable} from 'node:stream';
import {request as httpRequest} from 'node:http';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test} from 'node:test';
import {createLab} from '../server.mjs';
import {simulate} from '../dialogue.mjs';

const hour=3600000;
async function fixture(t,options={}){
  let clock=Date.parse('2026-11-18T09:00:00Z');
  const server=createLab({database:':memory:',password:'test-password',now:()=>clock,reply:simulate,...options});
  const transport=process.env.LAB_SOCKET_TEST;
  const pipe=String.raw`\\.\pipe\egas-test-`+randomUUID();
  if(transport) await new Promise((resolve,reject)=>{
    const listening=transport==='pipe'?server.listen(pipe,resolve):server.listen(0,'127.0.0.1',resolve);
    listening.once('error',reject);
  });
  t.after(()=>transport?new Promise(resolve=>server.close(resolve)):server.emit('close'));
  const origin=transport==='1'?'http://127.0.0.1:'+server.address().port:'http://lab.test';
  let cookie;
  async function request(path,{data,expected=200,asAdmin=false,headers={}}={}){
    const requestOptions={
      method:data===undefined?'GET':'POST',
      headers:{...(data===undefined?{}:{'Content-Type':'application/json'}),...(asAdmin&&cookie?{Cookie:cookie}:{}),...headers},
      body:data===undefined?undefined:JSON.stringify(data)
    };
    const response=transport==='pipe'?await pipeRequest(pipe,path,requestOptions):
      transport==='1'?await fetch(origin+path,requestOptions):await dispatch(server,path,requestOptions);
    const mime=response.headers.get('content-type');
    const result=mime.startsWith('application/json')?await response.json():Buffer.from(await response.arrayBuffer());
    assert.equal(response.status,expected,JSON.stringify(result).slice(0,450));
    if(path==='/api/admin/login'&&expected===200) cookie=response.headers.get('set-cookie').split(';')[0];
    return {result,response};
  }
  const login=()=>request('/api/admin/login',{data:{password:'test-password'}});
  const create=async(label='Кандидат',hours=80)=>{
    const {result}=await request('/api/admin/invites',{data:{label,hours},expected:201,asAdmin:true});
    return {...result,api:'/api'+result.path.slice(0,-1),admin:'/api/admin/invites/'+result.id};
  };
  const candidate=(i,path='',data,expected=200)=>request(i.api+path,{data,expected}).then(v=>v.result);
  const action=(i,person,kind,data,expected,requestId=randomUUID())=>candidate(i,'/people/'+person,{kind,...data,requestId},expected);
  return {request,login,create,candidate,action,advance:h=>{clock+=h*hour;}};
}
function pipeRequest(socketPath,path,{method,headers,body}){
  return new Promise((resolve,reject)=>{
    const req=httpRequest({socketPath,path,method,headers},res=>{
      const chunks=[];
      res.on('data',chunk=>chunks.push(chunk));
      res.on('error',reject);
      res.on('end',()=>resolve(new Response(Buffer.concat(chunks),{status:res.statusCode,headers:res.headers})));
    });
    req.on('error',reject);
    req.end(body);
  });
}
function dispatch(server,url,{method,headers,body}){
  const req=Readable.from(body?[Buffer.from(body)]:[]);
  Object.assign(req,{method,url,headers:Object.fromEntries(Object.entries({Host:'lab.test',...headers}).map(([k,v])=>[k.toLowerCase(),v])),socket:{remoteAddress:'127.0.0.1'}});
  return new Promise(resolve=>{
    const outputHeaders={};
    let statusCode=200;
    server.emit('request',req,{
      setHeader:(name,value)=>{outputHeaders[name]=value;},
      writeHead:(status,extra)=>{statusCode=status;Object.assign(outputHeaders,extra);},
      end:payload=>resolve(new Response(payload,{status:statusCode,headers:outputHeaders}))
    });
  });
}
const proposal={product:'Локальная сверка расходов УК',price:95000,billing:'once',term:'Четыре недели',conditions:'Локальная обработка актов, два объекта, установка и обучение.'};
const financial={price:95000,billing:'once',serviceCost:50000,acquisitionCost:5000,payback:0,clients:38,justification:'Один пилот, локальная установка, настройка, внедрение и поддержка двух торговых центров.'};
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a/w0AAAAASUVORK5CYII=';

test('Полное прохождение, вложения и история организатора',async t=>{
  const {request,login,create,candidate,action}=await fixture(t);
  await request('/api/admin/invites',{expected:401});
  await login();
  assert.equal((await request('/api/admin/invites',{asAdmin:true})).result.cases[0].id,'novorechinsk-v1');
  await request('/api/admin/invites',{asAdmin:true,data:{caseId:'absent',label:'Тест',hours:80},expected:400});
  const first=await create(), other=await create('Второй');
  assert.notEqual(first.path,other.path);
  assert.equal(Date.parse(first.expires)-Date.parse(first.created),80*hour);
  await candidate(first,'/material/registry',undefined,409);
  const session=await candidate(first,'/start',{});
  assert.equal(session.materials.length,13);
  assert.equal(session.case.people.length,7);
  assert.equal(session.case.people[0].concerns,undefined);
  const registry=await candidate(first,'/material/registry');
  assert.equal(registry.rows.length,42);
  assert.equal(registry.rows[0][0],'N-01');
  const xlsx=await request(first.api+'/material/registry/download');
  assert.deepEqual(xlsx.result,readFileSync(new URL('../case-data/registry.xlsx',import.meta.url)));
  assert.equal(xlsx.result.subarray(0,2).toString(),'PK');
  assert.match(xlsx.response.headers.get('content-disposition'),/attachment/);
  const pdf=await request(first.api+'/material/uk-report/inline');
  assert.match(pdf.result.subarray(0,8).toString(),/^%PDF/);
  assert.match(pdf.response.headers.get('content-disposition'),/inline/);
  const notes=await candidate(first,'/note',{operation:'create'});
  const note=notes.state.notes[0];
  const updated=await candidate(first,'/note/'+note.id,{title:'Гипотеза',body:'Сверка расходов УК',version:note.updated});
  assert.equal(updated.state.notes[0].title,'Гипотеза');
  await candidate(first,'/note/'+note.id,{title:'Конфликт',body:'',version:note.updated},409);
  await action(first,'owner','message',{text:'Какой у вас бюджет на пилот?'});
  const feedback=await action(first,'owner','prototype',{description:'Сверяем документы',images:[{type:'image/png',data:png}]});
  const image=feedback.state.messages.at(-1).input.images[0];
  const attachment=await request(first.api+'/image/'+image);
  assert.equal(attachment.response.headers.get('content-type'),'image/png');
  assert.equal(attachment.result.toString('base64'),png);
  await candidate(other,'/start',{});
  await candidate(other,'/image/'+image,undefined,404);
  assert.equal((await candidate(other)).state.notes.length,0);
  assert.equal((await candidate(other)).state.messages.length,0);
  const accepted=await action(first,'owner','offer',proposal);
  assert.equal(accepted.state.messages.at(-1).status,'accepted');
  const approved=await action(first,'finance','approval',financial);
  assert.equal(approved.state.messages.at(-1).status,'approved');
  await candidate(first,'/draft',{url:'https://example.org/prototype'});
  assert.equal((await candidate(first)).state.draft,'https://example.org/prototype');
  const done=await candidate(first,'/submit',{url:'https://example.org/prototype'});
  assert.equal(done.state.submission.url,'https://example.org/prototype');
  assert.equal((await candidate(first,'/submit',{url:'https://example.org/other'})).submitted,done.submitted);
  await action(first,'owner','message',{text:'После сдачи'},409);
  const report=(await request(first.admin,{asAdmin:true})).result;
  assert.equal(report.state.notes[0].body,'Сверка расходов УК');
  assert.equal(report.state.messages.length,4);
  await request(first.admin+'/image/'+image,{asAdmin:true});
});

test('Дедлайн, продление, отзыв, смена дня и лимиты',async t=>{
  const {request,login,create,candidate,action,advance}=await fixture(t);
  await login();
  const invite=await create('Часы',3);
  advance(.5);
  await candidate(invite,'/start',{});
  for(let i=0;i<8;i++)await action(invite,'owner','message',{text:'Вопрос '+i});
  await action(invite,'owner','message',{text:'Лишний вопрос'},409);
  await action(invite,'owner','prototype',{description:'Показ',images:[]},409);
  advance(1);
  const fresh=await candidate(invite);
  assert.equal(fresh.day,2);
  assert.equal(fresh.news.length,2);
  assert.equal(fresh.usage.owner.messages,0);
  await action(invite,'owner','offer',{...proposal,price:1e6});
  await action(invite,'owner','offer',proposal);
  await action(invite,'owner','offer',proposal,409);
  for(let i=0;i<3;i++){
    const view=await action(invite,'finance','approval',{...financial,serviceCost:100000});
    assert.equal(view.state.messages.at(-1).status,'revise');
  }
  await action(invite,'finance','approval',financial,409);
  await action(invite,'director','approval',financial,400);
  advance(1.5);
  await candidate(invite,'',undefined,410);
  await candidate(invite,'/submit',{url:'https://example.org'},410);
  await request(invite.admin+'/extend',{data:{hours:2},asAdmin:true});
  const extended=await candidate(invite);
  assert.equal(extended.day,3);
  assert.equal(extended.state.messages.length,13);
  await request(invite.admin+'/revoke',{data:{},asAdmin:true});
  await candidate(invite,'',undefined,410);
  assert.equal((await request(invite.admin,{asAdmin:true})).result.revoked,true);
});
test('Ошибка модели, идемпотентность и параллельная отправка',async t=>{
  let attempts=0, release, entered;
  const waiting=new Promise(resolve=>{release=resolve;});
  const inbound=new Promise(resolve=>{entered=resolve;});
  const {login,create,candidate,action}=await fixture(t,{reply:async context=>{
    attempts++;
    if(attempts===1) throw Error('Offline');
    entered();
    await waiting;
    return simulate(context);
  }});
  await login();
  const invite=await create();
  await candidate(invite,'/start',{});
  const id=randomUUID(), message={text:'Тест'};
  await action(invite,'owner','message',message,503,id);
  assert.equal((await candidate(invite)).usage.owner.messages,0);
  const first=action(invite,'owner','message',message,200,id);
  await inbound;
  try{await action(invite,'owner','message',message,409);}
  finally{release();}
  await first;
  await action(invite,'owner','message',message,200,id);
  assert.equal((await candidate(invite)).usage.owner.messages,1);
  assert.equal(attempts,2);
});
test('Проверка ввода и границ доступа',async t=>{
  const {request,login,create,candidate,action}=await fixture(t);
  await request('/api/admin/login',{data:{password:'test-password'},headers:{origin:'https://elsewhere.example'},expected:403});
  await login();
  const invite=await create();
  await candidate(invite,'/start',{});
  await candidate(invite,'/submit',{url:'javascript:alert(1)'},400);
  await candidate(invite,'/submit',{url:'https://user:secret@example.org'},400);
  await action(invite,'owner','prototype',{description:'Тест',images:[{type:'image/webp',data:png}]},400);
  await request(invite.admin,{expected:401});
  await request('/api/admin/logout',{data:{},asAdmin:true});
  await request('/api/admin/invites',{expected:401,asAdmin:true});
});

test('Перезапуск сохраняет приглашение и черновик',async ()=>{
  const directory=mkdtempSync(join(tmpdir(),'egas-lab-'));
  const database=join(directory,'lab.sqlite');
  const options={database,password:'demo-password',reply:simulate};
  let server=createLab(options);
  const call=(url,body,cookie)=>dispatch(server,url,{
    method:body===undefined?'GET':'POST',
    headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},
    body:body===undefined?undefined:JSON.stringify(body)
  });
  try{
    const login=await call('/api/admin/login',{password:'demo-password'});
    const cookie=login.headers.get('set-cookie').split(';')[0];
    const issued=await call('/api/admin/invites',{label:'С перезапуском',hours:80},cookie);
    assert.equal(issued.status,201);
    const {path}=await issued.json();
    const endpoint='/api'+path.slice(0,-1);
    await call(endpoint+'/start',{});
    await call(endpoint+'/draft',{url:'https://example.org/demo'});
    server.emit('close');
    server=createLab(options);
    const reopened=await call(endpoint);
    assert.equal(reopened.status,200);
    assert.equal((await reopened.json()).state.draft,'https://example.org/demo');
    assert.equal((await call('/api/admin/invites',undefined,cookie)).status,200);
  }finally{
    server.emit('close');
    rmSync(directory,{recursive:true,force:true});
  }
});
