export function simulate({person, kind, input, history, news}) {
  const lower = value => value.toLocaleLowerCase('ru');
  if(kind==='offer') {
    const relevant=person.concerns.some(word=>lower(input.product+' '+input.conditions).includes(word));
    const accepted=input.price<=person.max && relevant && input.term.length>=5 && input.conditions.length>=20;
    return {status:accepted?'accepted':'declined',text:accepted
      ? 'Готов(а) зафиксировать намерение провести пилот на предложенных условиях. Согласуем ответственных и критерии приёмки перед запуском.'
      : (input.price>person.max?'Цена выходит за мой бюджет. ':'Для согласия мне нужно больше конкретики. ')+person.objection+' Уточните объём пилота и его условия.'};
  }
  if(kind==='approval') {
    const margin=input.price-input.serviceCost;
    const reasons=[];
    if(margin<=0) reasons.push('Цена не покрывает стоимость обслуживания клиента.');
    if(margin>0&&input.billing==='monthly'&&Math.abs(input.payback-input.acquisitionCost/margin)>0.11) reasons.push('Срок окупаемости привлечения должен совпадать с отношением стоимости привлечения к ежемесячной марже.');
    if(input.billing==='once'){
      const net=margin-input.acquisitionCost;
      if(net<=0) reasons.push('Разовая оплата не покрывает обслуживание и привлечение.');
      if(net>0&&input.clients<Math.ceil(1_500_000/net)) reasons.push('Заявленного числа клиентов недостаточно, чтобы окупить 1,5 млн ₽.');
    }
    if(input.justification.length<50) reasons.push('Уточните, откуда взяты исходные цифры, кого вы привлекаете и в какие сроки.');
    if(reasons.length) return {status:'revise',text:'Верните модель на доработку. '+reasons.join(' ')};
    return {status:'approved',text:'Согласую модель для пилота. Маржа до затрат на привлечение — '+margin.toLocaleString('ru-RU')+' ₽ на клиента '+(input.billing==='monthly'?'в месяц.':'за разовую продажу.')+' Сверим допущения по итогам пилота.'};
  }
  if(kind==='prototype') return {text:'По присланному описанию проверил(а) бы, как прототип помогает решить мою задачу — '+person.focus+'. '+person.objection+' Предложите один пример для проверки и критерий успеха.'+(input.images.length?' Скриншоты сохранены для просмотра организатором.':'')};
  const message=lower(input.text);
  const event=news.find(item=>item.title.toLowerCase().split(' ').some(word=>word.length>5 && message.includes(word.slice(0,-2))));
  const options=[
    'Для меня важнее всего '+person.focus+'. '+person.objection+' Что вы хотите проверить в первую очередь?',
    'Могу обсудить конкретный объект или сценарий. Мой приоритет — '+person.focus+'. Назовите исходное допущение и какой результат вам нужен.',
    'Прежде чем двигаться дальше, давайте определим, как проверить ценность на одном примере. '+person.objection
  ];
  if(event) return {text:'Событие «'+event.title+'» действительно стоит учитывать. '+event.body+' В моей работе приоритет — '+person.focus+'. Как это влияет на ваше предложение?'};
  if(/пилот|цен[ауе]|бюджет|оплат/.test(message)) return {text:person.market?'Готов(а) обсуждать платный пилот, если согласуем объём, сроки и условия. '+person.objection:'Покажите единицу продажи, расчёт по одному периоду и что входит в затраты.'};
  return {text:options[history.length%options.length]};
}

export async function respond(context, config=process.env) {
  const baseline=simulate(context);
  if(context.kind==='offer'||context.kind==='approval') return baseline;
  if(config.OLLAMA_MODEL&&!config.CHAT_ADAPTER_URL){
    const origin=config.OLLAMA_ORIGIN||'http://127.0.0.1:11434';
    const {person,kind,input,history,news}=context;
    const message={
      role:'user',
      content:JSON.stringify({action:kind,text:input.text||input.description}),
      ...(input.images?.length?{images:input.images.map(image=>image.data)}:{})
    };
    const result=await rpc(new URL('/api/chat',origin),{
      model:config.OLLAMA_MODEL,stream:false,
      messages:[
        {role:'system',content:'Ты вымышленный участник деловой симуляции. Отвечай по-русски от лица персонажа на последнее сообщение. Различай данные кейса и утверждения кандидата. Не придумывай подтверждённые сделки, договоры или цифры. Обсуждай прототип и следующий проверяемый шаг. '+JSON.stringify({role:person.role,focus:person.focus,objection:person.objection,news})},
        ...history.flatMap(item=>[
          {role:'user',content:JSON.stringify({action:item.kind,text:item.input.text||item.input.description||item.input.product||item.input.justification||item.input.segment})},
          {role:'assistant',content:item.reply}
        ]),
        message
      ]
    });
    return validatedText(result.message?.content);
  }
  if(!config.CHAT_ADAPTER_URL) return baseline;
  const token=config.CHAT_ADAPTER_TOKEN;
  const result=await rpc(config.CHAT_ADAPTER_URL,context,token);
  return validatedText(result.text);
}

async function rpc(url,payload,token){
  const response=await fetch(url,{
    method:'POST',
    headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},
    body:JSON.stringify(payload),
    signal:AbortSignal.timeout(18000),
    redirect:'error'
  });
  if(!response.ok) throw Error('Adapter unavailable');
  return response.json();
}
function validatedText(value){
  if(typeof value!=='string'||!value.trim()||value.length>8000) throw Error('Invalid adapter response');
  return {text:value.trim()};
}
