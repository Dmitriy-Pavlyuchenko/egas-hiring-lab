const $=(selector,parent=document)=>parent.querySelector(selector);
const app=$('#app'), modal=$('#modal'), notice=$('#notice');
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const e=escape;
const formatDate=value=>value?new Intl.DateTimeFormat('ru-RU',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value)):'—';
const price=value=>Number(value).toLocaleString('ru-RU')+' ₽';
const [area,code,section,detail]=location.pathname.split('/').filter(Boolean);
const base=area==='c'?'/c/'+code+'/':'';
const apiBase='/api'+base.slice(0,-1);
const adminBase='/api/admin/invites';
const tabs=[['','Рабочий стол'],['people','Люди'],['data','Данные рынка'],['news','Новости'],['notes','Блокнот'],['submit','Сдача']];
const iconPaths={
  '':'<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/>',
  people:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/><circle cx="9" cy="7" r="4"/>',
  data:'<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 4 18 4 18 0V5M3 12c0 4 18 4 18 0"/>',
  news:'<rect x="6" y="3" width="15" height="18" rx="2"/><path d="M6 19H3V7h3m4 0h7m-7 4h7m-7 4h7"/>',
  notes:'<path d="M8 3v18m-4-5h3m-3-4h3m-3-4h3m-3-4h3m8-1H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-7m-8 2 1-4 6-6 3 3-6 6z"/>',
  submit:'<path d="M13 21H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8l5 5v4m-5-9v6h5m-4 9 2 2 4-4"/>',
  time:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5h4"/>',
  arrow:'<path d="M5 12h14m-5-5 5 5-5 5"/>',
  file:'<path d="M13 22H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8l6 6v12a2 2 0 0 1-2 2zM14 2v6h6M8 12h8m-8 4h8"/>',
  search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
  send:'<path d="m22 2-7 20-4-9-9-4 20-7zm0 0L11 13"/>',
  screen:'<rect x="3" y="3" width="18" height="13" rx="2"/><path d="m8 21 4-5 4 5"/>',
  pen:'<path d="m16 4 4 4M4 20l5-1L21 7l-4-4L5 15l-1 5zm0 2h17"/>',
  check:'<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  trash:'<path d="M3 6h18m-13 0V3h8v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
  link:'<path d="M10 13a4 4 0 0 0 6 1l4-4a4 4 0 0 0-6-6l-2 2m2 5a4 4 0 0 0-6-1l-4 4a4 4 0 0 0 6 6l2-2"/>',
  close:'<path d="m6 6 12 12M18 6 6 18"/>'
};
const icon=name=>'<svg class="icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+iconPaths[name]+'</svg>';
const kinds={message:'Сообщение',offer:'Коммерческое предложение',approval:'Финансовая модель',prototype:'Показ прототипа'};
const decisions={accepted:'Письмо о намерениях',declined:'Предложение отклонено',approved:'Согласовано',revise:'На доработку'};
let state, clockOffset, toastTimer, tick, noteId, assetCategory='', actionKey='';
const notify=message=>{
  notice.textContent=message;
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>{notice.textContent='';},4500);
};
async function request(url,data){
  const response=await fetch(url,data===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  const value=await response.json();
  if(!response.ok) throw Object.assign(new Error(value.error||'Не удалось выполнить действие.'),{status:response.status});
  return value;
}
function busy(form, handler){
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    if(form.dataset.busy) return;
    form.dataset.busy='true';
    const buttons=[...form.querySelectorAll('button[type=submit],button:not([type])')].filter(b=>!b.disabled);
    buttons.forEach(b=>b.disabled=true);
    try{await handler(new FormData(form),event);}
    catch(error){notify(error.message);}
    finally{delete form.dataset.busy;buttons.forEach(b=>b.disabled=false);form.dispatchEvent(new Event('input'));}
  });
}
const heading=(title,desc='',side='')=>'<div class="titlebar"><div><h1>'+e(title)+'</h1>'+(desc?'<p>'+e(desc)+'</p>':'')+'</div>'+side+'</div>';
const button=(label,cls='',attrs='',symbol)=>'<button class="button '+cls+'" '+attrs+'>'+(symbol?icon(symbol):'')+e(label)+'</button>';
const card=(title,content)=>'<section class="card"><h2>'+e(title)+'</h2>'+content+'</section>';
const billingOptions=()=>'<fieldset class="billing"><legend>Оплата</legend><label><input type="radio" name="billing" value="monthly" checked> Ежемесячно</label><label><input type="radio" name="billing" value="once"> Разово</label></fieldset>';
const field=(label,name,options={})=>{
  const {type='text',value='',placeholder='',extra='',required=true}=options;
  return '<label class="field">'+e(label)+(type==='textarea'
    ? '<textarea name="'+name+'" placeholder="'+e(placeholder)+'" '+(required?'required ':'')+extra+'>'+e(value)+'</textarea>'
    : '<input name="'+name+'" type="'+type+'" value="'+e(value)+'" placeholder="'+e(placeholder)+'" '+(required?'required ':'')+extra+'>')+'</label>';
};
function shell(content,{candidate=false,organizer=false}={}){
  const brand='<a class="brand" href="'+(candidate?base:'/organizer')+'"><span class="stamp" aria-hidden="true">E</span><span>EGAS<small>Hiring Lab</small></span></a>';
  app.className=candidate?'candidate candidate-'+(section||'home'):'organizer';
  app.innerHTML=candidate?'<aside class="rail">'+brand+
    (state.started?'<nav class="nav" aria-label="Разделы кейса">'+tabs.map(([href,label])=>'<a href="'+base+href+'" '+((section||'')===href?'aria-current="page"':'')+'>'+icon(href)+label+'</a>').join('')+'</nav>':'')+
    '<div class="rail-footer"><div>'+e(state.label)+'</div><small>Новоречинск · симуляция</small></div></aside>'+
    '<header class="top candidate-top"><div><strong>EGAS Hiring Lab</strong><small>'+e(state.case.title)+'</small></div><div class="actions"><span class="tag day" id="day-label">День <b>'+state.day+' из 3</b></span><span class="tag clock">'+icon('time')+'<span>Осталось</span><time id="clock" aria-label="Осталось времени"></time></span></div></header><main class="page">'+content+'</main>':
    '<header class="top"><div class="shell brandrow">'+brand+(organizer?'<form id="logout">'+button('Выйти','','type="submit"')+'</form>':'')+'</div></header><main class="page">'+content+'</main>';
  const logout=$('#logout');
  if(logout) busy(logout,async()=>{await request('/api/admin/logout',{});location.href='/organizer';});
  clearInterval(tick);
  if(candidate){updateClock();tick=setInterval(updateClock,1000);}
}
function updateClock(){
  const el=$('#clock');
  if(!el)return;
  const current=Date.now()+clockOffset;
  const remaining=Math.max(0,Math.ceil((Date.parse(state.expires)-current)/1000));
  const parts=[Math.floor(remaining/3600),Math.floor(remaining/60)%60,remaining%60];
  el.textContent=parts.map(n=>String(n).padStart(2,'0')).join(':');
  el.title='Доступ до '+formatDate(state.expires);
  if(!remaining&&!document.querySelector('[data-busy]')) location.reload();
  if(state.nextDayAt&&current>=state.nextDayAt&&$('#day-label')){
    const editing=modal.open||document.querySelector('[data-busy]')||$('#chat textarea')?.value||
      $('#save-status')?.textContent==='Есть изменения'||$('#save-status')?.textContent==='Сохраняем…'||
      $('#save-status')?.textContent==='Ошибка сохранения'||($('#submit input')&&$('#submit input').value!==state.state.draft);
    if(editing) $('#day-label').textContent='Новый день · обновите страницу';
    else location.reload();
  }
}
function update(value){
  state=value;
  clockOffset=state.serverTime-Date.now();
}
function openDialog(title,fields,submit,handler){
  modal.setAttribute('aria-labelledby','dialog-title');
  modal.innerHTML='<form class="stack"><div class="row"><h2 id="dialog-title">'+e(title)+'</h2><button type="button" class="button icon-button right" aria-label="Закрыть" data-close>'+icon('close')+'</button></div>'+fields+'<div class="actions">'+button('Отмена','','type="button" data-close')+button(submit,'primary','type="submit"')+'</div></form>';
  const form=$('form',modal);
  for(const close of modal.querySelectorAll('[data-close]')) close.onclick=()=>{if(!form.dataset.busy) modal.close();};
  modal.oncancel=event=>{if(form.dataset.busy)event.preventDefault();};
  busy(form,handler);
  modal.showModal();
  $('input:not([type=hidden]),textarea,select',form)?.focus();
}
function noteBody(n){return n?.body||'';}
function renderNews(news,compact=false){
  return news.length?'<ul class="list '+(compact?'':'timeline')+'">'+[...news].reverse().map(n=>'<li><small>День '+n.day+' · '+e(n.time)+'</small><h3>'+e(n.title)+'</h3>'+(compact?'':'<p>'+e(n.body)+'</p>')+'</li>').join('')+'</ul>':'<p class="muted">Событий пока нет.</p>';
}
function panel(title,subtitle,content,action=''){
  return '<section class="card panel"><header><div><h2>'+e(title)+'</h2>'+(subtitle?'<small>'+e(subtitle)+'</small>':'')+'</div>'+action+'</header><div class="panel-body">'+content+'</div></section>';
}
function dashboard(){
  const offers=state.state.messages.filter(m=>m.status==='accepted');
  const approvals=state.state.messages.filter(m=>m.kind==='approval');
  const person=id=>state.case.people.find(p=>p.id===id).name;
  const shortcuts=[['people','Люди',state.case.people.length+' собеседников'],['data','Данные рынка','Реестры, сделки, отчёты'],['notes','Блокнот','Гипотезы и расчёты'],['submit','Сдача','Ссылка на прототип']];
  const latest=approvals.at(-1);
  return heading('Рабочий стол',state.case.brief)+
    '<div class="grid shortcuts">'+shortcuts.map(([url,label,sub])=>'<a class="card shortcut" href="'+base+url+'"><span class="tile-icon">'+icon(url)+'</span><span><h3>'+label+'</h3><small>'+sub+'</small></span>'+icon('arrow')+'</a>').join('')+'</div>'+
    '<div class="grid dashboard"><div class="stack">'+panel('Задание','Кратко — полная постановка была на стартовом экране','<ol class="steps">'+state.case.goals.map(g=>'<li>'+e(g)+'</li>').join('')+'</ol>')+
    panel('Письма о намерениях','Согласия клиентов, полученные через коммерческие предложения',offers.length?'<ul class="list">'+offers.map(m=>'<li class="offer-summary"><span>'+icon('check')+'</span><div><h3>'+e(person(m.person))+'</h3><small>'+e(m.input.product)+'</small></div><div><strong>'+price(m.input.price)+'</strong><small>'+(m.input.billing==='monthly'?'в месяц':'разово')+' · '+e(m.input.term)+'</small></div></li>').join('')+'</ul>':'<p class="muted">Согласованных пилотов пока нет.</p>','<span class="tag green">'+offers.length+'</span>')+'</div>'+
    '<div class="stack">'+panel('Согласование модели','Финансовый директор EGAS','<p class="muted">Использовано попыток: <strong>'+approvals.length+' из 3</strong></p><p><a class="text-link" href="'+base+'people/finance">Открыть переписку '+icon('arrow')+'</a></p>',latest?'<span class="tag '+(latest.status==='approved'?'green':'amber')+'">'+e(decisions[latest.status])+'</span>':'')+
    panel('Последние события','',renderNews(state.news,true),'<a class="text-link" href="'+base+'news">Все</a>')+'</div></div>';
}
function renderStart(){
  const item=state.case;
  const list=(lines,tag='ul')=>'<'+tag+'>'+lines.map(line=>'<li>'+e(line)+'</li>').join('')+'</'+tag+'>';
  const segment=(title,content)=>'<section class="brief-section"><h2>'+e(title)+'</h2>'+content+'</section>';
  const hours=Math.round((Date.parse(state.expires)-Date.parse(state.created))/3600000*100)/100;
  shell('<section class="hero"><p class="eyebrow">Тестовое задание</p><h1>'+e(item.title)+'</h1><p class="lead">'+e(item.brief)+'</p></section>'+
    '<div class="card brief-card stack">'+
    (item.market?segment('Город и рынок','<p>'+e(item.market.summary)+'</p>'+list(item.market.trends)):'')+
    segment('Что нужно сделать за '+(hours===72?'72 часа':hours+' ч.'),list(item.goals,'ol'))+
    (item.deliverable?segment('Что сдать',list([item.deliverable])):'')+
    (item.rules?segment('Правила',list(item.rules)):'')+
    '<p>Доступ до <strong>'+e(formatDate(state.expires))+'</strong>.</p><form id="start">'+button('Начать симуляцию','primary','type="submit"')+'</form></div>',{candidate:true});
  busy($('#start'),async()=>{await request(apiBase+'/start',{});location.replace(base);});
}
function attachments(message,imagePath){
  return (message.input.images||[]).map((id,i)=>'<a class="attachment" href="'+imagePath+id+'" target="_blank" rel="noopener"><img src="'+imagePath+id+'" alt="Скриншот '+(i+1)+'" loading="lazy"></a>').join('');
}
function inputText(m){
  const i=m.input;
  if(m.kind==='offer') return i.product+'\n'+price(i.price)+(i.billing==='monthly'?' в месяц':' разово')+'\nПилот: '+i.term+'\n'+i.conditions;
  if(m.kind==='approval'&&i.price!==undefined){
    return price(i.price)+(i.billing==='monthly'?' в месяц':' разово')+
      '\nОбслуживание: '+price(i.serviceCost)+' · привлечение: '+price(i.acquisitionCost)+
      '\nОкупаемость привлечения: '+i.payback.toLocaleString('ru-RU')+' мес. · клиентов: '+i.clients.toLocaleString('ru-RU')+'\n'+i.justification;
  }
  if(m.kind==='approval') return i.segment+'\nПериод: '+i.period+'\nВыручка: '+price(i.revenue)+' · затраты: '+price(i.cost)+'\n'+i.assumptions;
  return i.text||i.description;
}
const initials=person=>person.name.split(' ').map(part=>part[0]).slice(0,2).join('');
const avatar=(person,cls='')=>'<span aria-hidden="true" class="avatar '+(person.market?'':'internal ') +cls+'">'+e(initials(person))+'</span>';
const messageTime=m=>'<time class="message-date">День '+m.day+' · '+e(new Intl.DateTimeFormat('ru-RU',{hour:'2-digit',minute:'2-digit'}).format(new Date(m.at)))+'</time>';
function transcript(messages,imagePath){
  return messages.map(m=>{
    const person=state?.case.people.find(p=>p.id===m.person);
    return '<div class="message mine"><div class="bubble">'+(m.kind!=='message'?'<span class="tag">'+e(kinds[m.kind])+'</span><br>':'')+e(inputText(m))+attachments(m,imagePath)+'</div>'+messageTime(m)+'</div>'+
      '<div class="reply">'+(person?avatar(person,'compact'):'')+'<div class="message"><div class="bubble">'+e(m.reply)+'</div>'+(m.status?'<span class="tag status '+(['accepted','approved'].includes(m.status)?'green':'amber')+'">'+(m.status==='accepted'?icon('check'):'')+e(m.status==='accepted'?'Письмо о намерениях подписано':decisions[m.status])+'</span>':'')+messageTime(m)+'</div></div>';
  }).join('');
}
function renderPeople(){
  const people=state.case.people, selected=people.find(p=>p.id===detail)||people[0];
  const u=state.usage[selected.id], left=Math.max(0,selected.limit-u.messages), locked=!!state.submitted;
  const sidebar=['Рынок Новоречинска','Внутри EGAS'].map((label,index)=>'<div class="people-group"><p class="eyebrow">'+label+'</p>'+people.filter(p=>index?!p.market:p.market).map(p=>
    '<a class="item" href="'+base+'people/'+p.id+'" '+(p.id===selected.id?'aria-current="true"':'')+'>'+avatar(p)+'<span class="person-text"><strong>'+e(p.name)+'</strong><small>'+e(p.role)+'</small><small>Сегодня ещё '+Math.max(0,p.limit-state.usage[p.id].messages)+' из '+p.limit+'</small></span></a>').join('')+'</div>').join('');
  const messages=state.state.messages.filter(m=>m.person===selected.id);
  shell('<div class="workspace"><aside class="sidebar"><div class="people-heading"><h1>Люди</h1><p class="muted">Каждый отвечает ограниченное число раз в сутки</p></div>'+sidebar+'</aside>'+
    '<section class="conversation"><header class="row chatheader">'+avatar(selected)+'<div class="person-text"><h3>'+e(selected.name)+'</h3><small>'+e(selected.role)+(selected.bio?' · '+e(selected.bio):'')+'</small></div><span class="tag count right">'+left+' / '+selected.limit+' сегодня</span></header>'+
    '<div class="chatlog" id="chatlog" role="log">'+(messages.length?transcript(messages,apiBase+'/image/'):'<p class="muted">Переписка пока пуста.</p>')+'</div>'+
    (locked?'<div class="composer muted">Работа сдана. Переписка доступна для просмотра.</div>':'<form id="chat" class="composer"><div class="compose-box">'+field('Ваше сообщение','text',{type:'textarea',placeholder:left?'Ваше сообщение…':'Дневной лимит исчерпан',extra:'rows="1" maxlength="6000" '+(left?'':'disabled')})+
    '<div class="actions">'+(selected.market?button('Коммерческое предложение '+u.offers+'/2','','type="button" data-action="offer" '+(u.offers>=2?'disabled':''),'pen'):'')+
    (selected.id==='finance'?button('На согласование '+u.approvals+'/3','','type="button" data-action="approval" '+(u.approvals>=3?'disabled':''),'pen'):'')+
    button('Показать прототип','','type="button" data-action="prototype" '+(left?'':'disabled'),'screen')+button('Отправить','primary right','type="submit" disabled','send')+'</div></div></form>')+'</section></div>',{candidate:true});
  $('#chatlog').scrollTop=$('#chatlog').scrollHeight;
  if(locked)return;
  const form=$('#chat');
  const send=$('button[type=submit]',form);
  form.elements.text.addEventListener('keydown',event=>{
    if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing&&!send.disabled){event.preventDefault();form.requestSubmit();}
  });
  let lastText='';
  form.oninput=()=>{
    const entered=form.elements.text.value;
    if(entered!==lastText&&!form.dataset.busy) actionKey='';
    lastText=entered;
    send.disabled=!left||!entered.trim()||!!form.dataset.busy;
  };
  busy(form,async data=>{
    actionKey ||= crypto.randomUUID();
    await perform(selected,'message',{text:data.get('text')},actionKey);
    actionKey='';
    $('#chat textarea')?.focus();
  });
  for(const trigger of form.querySelectorAll('[data-action]')) trigger.onclick=()=>actionDialog(selected,trigger.dataset.action);
}
async function perform(person,kind,input,requestId){
  const value=await request(apiBase+'/people/'+person.id,{kind,requestId,...input});
  update(value);
  if(modal.open) modal.close();
  renderPeople();
}
function imageData(file){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onerror=()=>reject(new Error('Не удалось прочитать изображение.'));
    reader.onload=()=>resolve({type:file.type,data:reader.result.split(',')[1]});
    reader.readAsDataURL(file);
  });
}
function actionDialog(person,kind){
  const id=crypto.randomUUID();
  if(kind==='prototype'){
    const files=[];
    openDialog('Показать прототип','<p class="muted">'+e(person.name)+' посмотрит описание и скриншоты и скажет, что полезно, а что нет. Показ считается сообщением в дневном лимите.</p>'+field('Описание','description',{type:'textarea',placeholder:'Что делает прототип, как им пользоваться, ссылка, если есть',extra:'maxlength="3500"'})+
      '<div class="field">Скриншоты<div id="image-picker" class="image-picker"><label class="upload-tile">'+icon('plus')+'Добавить<input aria-label="Скриншоты" type="file" name="images" accept="image/png,image/jpeg,image/webp" multiple></label></div><small>До 5 изображений PNG, JPG или WebP, до 5 МБ каждое.</small></div>','Показать',async data=>{
      await perform(person,kind,{description:data.get('description'),images:await Promise.all(files.map(imageData))},id);
    });
    const picker=$('#image-picker',modal), input=$('input[type=file]',picker), upload=$('.upload-tile',picker);
    const draw=()=>{
      picker.querySelectorAll('.chosen-file').forEach(node=>node.remove());
      files.forEach((file,index)=>{
        const item=document.createElement('span');
        item.className='chosen-file';
        item.innerHTML='<span>'+e(file.name)+'</span><button type="button" class="button icon-button" aria-label="Удалить '+e(file.name)+'">'+icon('close')+'</button>';
        $('button',item).onclick=()=>{
          if($('form',modal).dataset.busy)return;
          files.splice(index,1);
          draw();
        };
        picker.insertBefore(item,upload);
      });
      upload.hidden=files.length===5;
    };
    input.onchange=()=>{
      const added=[...input.files];
      input.value='';
      if($('form',modal).dataset.busy)return;
      if(added.length+files.length>5||added.some(f=>!f.size||f.size>5*1024*1024||!['image/png','image/jpeg','image/webp'].includes(f.type))){
        notify('Допустимо до пяти изображений PNG, JPG или WebP по 5 МБ.');
        return;
      }
      files.push(...added);
      draw();
    };
    return;
  }
  if(kind==='offer'){
    return openDialog('Коммерческое предложение','<p class="muted">Официальное предложение для '+e(person.name)+'. Если условия подойдут, собеседник подпишет письмо о намерениях. Осталось предложений: '+(2-state.usage[person.id].offers)+'.</p>'+
      field('Продукт','product',{type:'textarea',placeholder:'Что именно вы предлагаете и какую задачу это решает',extra:'maxlength="1500"'})+
      '<div class="grid">'+field('Цена, ₽','price',{type:'number',placeholder:'120 000',extra:'min="1" max="1000000000" step="0.01"'})+
      '<fieldset class="billing"><legend>Оплата</legend><label><input type="radio" name="billing" value="monthly" checked> Ежемесячно</label><label><input type="radio" name="billing" value="once"> Разово</label></fieldset></div>'+
      field('Срок пилота','term',{placeholder:'Например: 3 месяца, один объект',extra:'maxlength="300"'})+field('Условия','conditions',{type:'textarea',placeholder:'Что входит, что требуется от клиента, гарантии',extra:'maxlength="3500"'}),'Отправить',async data=>{
        await perform(person,kind,{...Object.fromEntries(data),price:Number(data.get('price'))},id);
      });
  }
  const numeric=(label,name,step='0.01',min=0)=>field(label,name,{type:'number',extra:'min="'+min+'" max="10000000000" step="'+step+'"'});
  openDialog('Модель на согласование','<p class="muted">Попытка '+(state.usage[person.id].approvals+1)+' из 3. Финансовый директор проверит цену, юнит-экономику и окупаемость запуска.</p>'+
    '<div class="grid finance-grid">'+numeric('Цена для клиента, ₽','price','0.01',1)+billingOptions()+
    '<div>'+numeric('Стоимость обслуживания клиента, ₽','serviceCost')+'<small>за тот же период, что и цена</small></div>'+
    numeric('Стоимость привлечения клиента, ₽','acquisitionCost')+
    numeric('Срок окупаемости привлечения, мес.','payback')+
    numeric('Клиентов для окупаемости 1,5 млн ₽','clients','1',1)+'</div>'+
    field('Обоснование','justification',{type:'textarea',placeholder:'Сегмент, продукт, откуда цифры, сколько клиентов и когда',extra:'maxlength="3500"'}),'Отправить',async data=>{
      const values=Object.fromEntries(data);
      for(const name of ['price','serviceCost','acquisitionCost','payback','clients']) values[name]=Number(values[name]);
      await perform(person,kind,values,id);
    });

}
async function renderData(){
  if(detail){
    shell('<p>Открываем материал…</p>',{candidate:true});
    const data=await request(apiBase+'/material/'+encodeURIComponent(detail));
    let body;
    if(data.type==='pdf') body='<iframe class="pdf" title="'+e(data.title)+'" src="'+apiBase+'/material/'+data.id+'/inline"></iframe>';
    if(data.type==='md') body='<article class="card material-article"><h2>'+e(data.title)+'</h2>'+data.body.split(/\n\s*\n/).map(paragraph=>'<p>'+e(paragraph)+'</p>').join('')+'</article>';
    if(data.type==='xlsx') body='<div class="card"><div class="row material-toolbar">'+(data.caption?'<strong>'+e(data.caption)+'</strong>':'')+'<label class="field right">Фильтр строк<input id="row-filter" type="search" placeholder="Поиск по значениям"></label><p id="row-count" class="muted"></p></div>'+
      '<div class="tablewrap"><table><thead><tr>'+data.columns.map(c=>'<th scope="col">'+e(c)+'</th>').join('')+'</tr></thead><tbody id="rows"></tbody></table></div></div>';
    shell('<p><a href="'+base+'data">← Данные рынка</a></p>'+heading(data.title,data.description,'<a class="button" href="'+apiBase+'/material/'+data.id+'/download">Скачать оригинал</a>')+body,{candidate:true});
    if(data.type==='xlsx'){
      const filter=$('#row-filter');
      filter.oninput=()=>{
        const term=filter.value.trim().toLocaleLowerCase('ru');
        const rows=data.rows.filter(r=>!term||r.some(v=>String(v).toLocaleLowerCase('ru').includes(term)));
        $('#row-count').textContent=rows.length+' из '+data.rows.length;
        $('#rows').innerHTML=rows.map(r=>'<tr>'+r.map(v=>'<td>'+e(typeof v==='number'?v.toLocaleString('ru-RU',{maximumFractionDigits:12}):v)+'</td>').join('')+'</tr>').join('');
      };
      filter.oninput();
    }
    return;
  }
  const materials=state.materials, categories=['',...new Set(materials.map(v=>v.category))];
  shell(heading('Данные рынка','Источники разные и не всегда сходятся. Проверяйте цифры.','<label class="search-box">'+icon('search')+'<input aria-label="Поиск по названию" id="asset-search" type="search" placeholder="Поиск по названию"></label>')+
    '<div class="chips" id="asset-categories"></div><div class="assets" id="asset-list"></div>',{candidate:true});
  const search=$('#asset-search');
  const draw=()=>{
    const query=search.value.trim().toLocaleLowerCase('ru');
    $('#asset-categories').innerHTML=categories.map((c,i)=>'<button class="chip '+(c===assetCategory?'selected':'')+'" aria-pressed="'+(c===assetCategory)+'" data-category="'+i+'">'+e(c||'Все')+' '+materials.filter(m=>!c||m.category===c).length+'</button>').join('');
    $('#asset-list').innerHTML=materials.filter(m=>(!assetCategory||m.category===assetCategory)&&m.title.toLocaleLowerCase('ru').includes(query)).map(m=>
      '<a class="material" href="'+base+'data/'+m.id+'"><span class="tile-icon">'+icon('file')+'</span><span><h3>'+e(m.title)+'</h3><small>'+e(m.description)+'</small></span><span class="file-meta"><small>'+e(m.category)+'</small><small>'+e(m.type.toUpperCase())+(m.bytes?' · '+(m.bytes>=1024?Math.round(m.bytes/1024)+' КБ':m.bytes+' Б'):'')+'</small></span></a>').join('')||'<p class="empty-assets muted">Материалов по запросу нет.</p>';
  };
  search.oninput=draw;
  $('#asset-categories').onclick=event=>{const target=event.target.closest('[data-category]');if(target){assetCategory=categories[Number(target.dataset.category)];draw();$('#asset-categories [aria-pressed=true]').focus();}};
  draw();
}
function renderNotes(){
  const notes=state.state.notes, locked=!!state.submitted;
  const note=notes.find(n=>n.id===noteId)||notes[0];
  noteId=note?.id;
  const noteList=notes.map(n=>'<button type="button" class="item '+(n.id===noteId?'selected':'')+'" data-note="'+n.id+'"><strong>'+e(n.title||'Без названия')+'</strong><small>'+e(noteBody(n).split('\n')[0].slice(0,64)||'Пусто')+'</small></button>').join('');
  shell(heading('Блокнот','Гипотезы, расчёты, план. Сохраняется автоматически.',locked?'':button('Новая заметка','primary','type="button" id="new-note"','plus'))+
    '<div class="workspace"><aside class="card sidebar">'+(noteList||'<p class="muted">Заметок нет.</p>')+'</aside><section class="card note-editor">'+(note?
      '<form id="editor"><div class="row editor-head">'+field('Название','title',{value:note.title,required:false,placeholder:'Без названия',extra:'maxlength="160" '+(locked?'readonly':'')})+
      '<small id="save-status" class="right" role="status">Сохранено</small>'+(locked?'':'<button type="button" id="delete-note" class="button icon-button" aria-label="Удалить">'+icon('trash')+'</button>')+'</div>'+
      field('Заметка','body',{type:'textarea',value:note.body,required:false,placeholder:'Пишите здесь…',extra:'class="note-body" maxlength="16000" '+(locked?'readonly':'')})+'</form>':'<p>Создайте заметку, чтобы записать гипотезу или расчёт.</p>')+'</section></div>',{candidate:true});
  const endpoint=apiBase+'/note';
  const editor=$('#editor');
  let timer, chain=Promise.resolve(), saved=note?JSON.stringify([note.title,note.body]):'', version=note?.updated;
  const remember=()=>{
    if(locked||!editor)return Promise.resolve(true);
    clearTimeout(timer);
    return chain=chain.then(async()=>{
      const status=$('#save-status');
      if(!status)return true;
      const title=editor.elements.title.value, body=editor.elements.body.value;
      if(JSON.stringify([title,body])===saved)return true;
      status.textContent='Сохраняем…';
      try{
        const value=await request(endpoint+'/'+note.id,{title,body,version});
        update(value);
        const updated=state.state.notes.find(n=>n.id===note.id);
        version=updated.updated;
        saved=JSON.stringify([title,body]);
        status.textContent='Сохранено';
        const line=$('[data-note="'+note.id+'"]');
        if(line){$('strong',line).textContent=updated.title||'Без названия';$('small',line).textContent=updated.body.split('\n')[0].slice(0,64)||'Пусто';}
        return true;
      }catch(error){status.textContent='Ошибка сохранения';notify(error.message);return false;}
    });
  };
  if(editor&&!locked){
    editor.onsubmit=event=>{event.preventDefault();remember();};
    editor.oninput=()=>{clearTimeout(timer);$('#save-status').textContent='Есть изменения';timer=setTimeout(remember,350);};
    for(const a of document.querySelectorAll('.nav a,.brand')) a.addEventListener('click',async event=>{
      if(event.ctrlKey||event.metaKey||event.shiftKey||event.altKey||event.button!==0)return;
      event.preventDefault(); if(await remember())location.href=a.href;
    });
    $('#delete-note').onclick=()=>openDialog('Удалить заметку?','<p class="muted">Запись будет удалена из блокнота.</p>','Удалить',async()=>{
      await remember();
      update(await request(endpoint+'/'+note.id,{operation:'delete'}));
      modal.close();renderNotes();
    });
  }
  for(const b of document.querySelectorAll('[data-note]')) b.onclick=async()=>{if(await remember()){noteId=b.dataset.note;renderNotes();}};
  if($('#new-note')) $('#new-note').onclick=async()=>{
    try{
      if(!await remember())return;
      update(await request(endpoint,{operation:'create'}));
      noteId=state.state.notes[0].id;renderNotes();$('#editor input')?.focus();
    }catch(error){notify(error.message);}
  };
}
function external(url){return '<a href="'+e(url)+'" target="_blank" rel="noopener noreferrer">'+e(url)+'</a>';}
function renderSubmit(){
  const done=state.state.submission;
  shell(heading('Сдача','Пришлите ссылку на работающий прототип. Всё остальное мы увидим по ходу вашей работы.')+
    (done?'<div class="card narrow stack"><h2>Решение сдано</h2><time>'+e(formatDate(done.at))+'</time><p>'+external(done.url)+'</p></div>':
    '<form id="submit" class="card narrow stack"><div class="url-field">'+icon('link')+field('Ссылка на прототип','url',{type:'url',value:state.state.draft,placeholder:'https://…',extra:'maxlength="2048"'})+'</div>'+
    '<p class="muted">Прототип должен открываться по ссылке без нашей помощи: опубликованное приложение, демо-стенд или репозиторий с инструкцией запуска.</p><div class="actions">'+
    button('Сдать решение','primary','type="submit"','send')+button('Сохранить, сдам позже','','type="button" id="draft"')+'</div></form>'),{candidate:true});
  if(done)return;
  const form=$('#submit');
  const draft=$('#draft');
  const refreshActions=()=>{
    const value=form.elements.url.value.trim();
    draft.disabled=value===state.state.draft;
    $('button[type=submit]',form).disabled=!!form.dataset.busy||!value;
  };
  form.oninput=refreshActions;
  refreshActions();
  draft.onclick=async()=>{
    try{update(await request(apiBase+'/draft',{url:form.elements.url.value.trim()}));refreshActions();notify('Черновик сохранён.');}
    catch(error){notify(error.message);}
  };
  busy(form,async data=>{
    openDialog('Сдать решение?','<p>Организатор получит ссылку и историю прохождения. После сдачи работу можно просматривать.</p>','Сдать',async()=>{
      update(await request(apiBase+'/submit',{url:data.get('url')}));
      modal.close();renderSubmit();
    });
  });
}
const linkStatus=entry=>entry.revoked?'Отозвана':entry.expired?'Истекла':'Активна';
const status=entry=>entry.submitted?'Сдано':entry.started?'В работе':'Приглашён';
async function copyPath(path){
  const url=new URL(path,location.origin).href;
  if(navigator.clipboard&&window.isSecureContext){try{await navigator.clipboard.writeText(url);notify('Ссылка скопирована.');return;}catch{}}
  openDialog('Ссылка на задание',field('Ссылка','url',{value:url,extra:'readonly'}),'Готово',async()=>modal.close());
  $('input',modal).select();
}
async function renderOrganizer(){
  try{
    if(code){await renderInvite();return;}
    const data=await request(adminBase);
    shell(heading('Приглашения','Выпускайте ссылки на тестовое и проверяйте результаты.')+
      '<form id="invite" class="card inline-form"><label class="field">Кейс<select name="caseId">'+data.cases.map(c=>'<option value="'+e(c.id)+'">'+e(c.title)+'</option>').join('')+'</select></label>'+
      field('Имя или метка кандидата','label',{extra:'maxlength="100"'})+field('Срок доступа, часов','hours',{type:'number',value:data.cases[0]?.defaultHours??72,extra:'min="1" max="720" step="0.25"'})+
      button('Создать ссылку','primary','type="submit"')+'</form><div class="stack mutations">'+(data.invites.length?data.invites.map(item=>'<a class="card material" href="/organizer/'+item.id+'"><div class="row"><h3>'+e(item.label)+'</h3><span class="tag green">'+status(item)+'</span><span class="tag">'+linkStatus(item)+'</span></div><small>Дедлайн: '+e(formatDate(item.expires))+'</small></a>').join(''):'<p class="muted">Приглашений пока нет.</p>')+'</div>',{organizer:true});
    $('#invite').elements.caseId.onchange=event=>{$('#invite').elements.hours.value=data.cases.find(item=>item.id===event.target.value).defaultHours;};
    busy($('#invite'),async data=>{
      const item=await request(adminBase,{caseId:data.get('caseId'),label:data.get('label'),hours:Number(data.get('hours'))});
      location.href='/organizer/'+item.id;
    });
  }catch(error){
    if(error.status!==401)throw error;
    shell(heading('Вход для организатора')+'<form class="card narrow stack" id="login">'+field('Пароль','password',{type:'password',extra:'autocomplete="current-password" maxlength="512"'})+button('Войти','primary','type="submit"')+'</form>');
    busy($('#login'),async data=>{await request('/api/admin/login',{password:data.get('password')});await renderOrganizer();});
  }
}
async function renderInvite(){
  const url=adminBase+'/'+encodeURIComponent(code), item=await request(url);
  const messages=item.state.messages;
  shell('<p><a href="/organizer">← Все приглашения</a></p>'+heading(item.label,item.case.title,'<div class="actions"><span class="tag green">'+status(item)+'</span><span class="tag">'+linkStatus(item)+'</span></div>')+
    '<div class="grid"><section class="card stack"><h2>Доступ</h2><p>Выдано '+e(formatDate(item.created))+'<br>Дедлайн '+e(formatDate(item.expires))+'<br>Старт '+e(formatDate(item.started))+'</p>'+
    '<div class="actions">'+button('Копировать ссылку','','type="button" id="copy"')+(!item.revoked?button('Продлить','','type="button" id="extend"')+button('Отозвать','danger','type="button" id="revoke"'):'')+'</div></section>'+
    card('Результат',item.state.submission?'<p>'+external(item.state.submission.url)+'</p><small>Сдано '+e(formatDate(item.state.submission.at))+'</small>':'<p class="muted">Решение ещё не сдано.</p>')+
    card('Переговоры и согласование','<p>Писем о намерениях: '+messages.filter(m=>m.status==='accepted').length+'</p><p>Финансовых согласований: '+messages.filter(m=>m.kind==='approval').length+'</p>')+
    card('Заметки',item.state.notes.length?item.state.notes.map(n=>'<details><summary>'+e(n.title||'Без названия')+'</summary><p>'+e(n.body).replace(/\r?\n/g,'<br>')+'</p></details>').join(''):'<p class="muted">Заметок нет.</p>')+'</div>'+
    '<section class="card mutations stack"><h2>История прохождения</h2>'+item.case.people.map(person=>{
      const thread=messages.filter(m=>m.person===person.id);
      return '<details><summary>'+e(person.name)+' · '+thread.length+'</summary><div class="chatlog">'+(thread.length?transcript(thread,url+'/image/'):'<p class="muted">Переписка пуста.</p>')+'</div></details>';
    }).join('')+'</section>',{organizer:true});
  $('#copy').onclick=()=>copyPath(item.path);
  if($('#extend')) $('#extend').onclick=()=>openDialog('Продлить доступ',field('Дополнительные часы','hours',{type:'number',value:24,extra:'min="1" max="720" step="0.25"'}),'Продлить',async data=>{
    await request(url+'/extend',{hours:Number(data.get('hours'))});modal.close();await renderInvite();
  });
  if($('#revoke')) $('#revoke').onclick=()=>openDialog('Отозвать ссылку?','<p>Кандидат потеряет доступ. Сохранённые материалы останутся в этой карточке.</p>','Отозвать',async()=>{
    await request(url+'/revoke',{});modal.close();await renderInvite();
  });
}
async function main(){
  if(area!=='c'){await renderOrganizer();return;}
  update(await request(apiBase));
  if(!state.started){renderStart();return;}
  if(section==='people'){renderPeople();return;}
  if(section==='data'){await renderData();return;}
  if(section==='notes'){renderNotes();return;}
  if(section==='submit'){renderSubmit();return;}
  if(section==='news'){shell(heading('Новости','События на рынке Новоречинска. Люди о них знают и реагируют.')+renderNews(state.news),{candidate:true});return;}
  shell(dashboard(),{candidate:true});
}
main().catch(error=>shell(heading(error.status===410?'Доступ закрыт':'Не удалось открыть страницу',error.message)));
