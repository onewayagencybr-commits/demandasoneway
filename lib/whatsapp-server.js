'use strict';
// One Way · Assistente de WhatsApp — chamadas externas (WhatsApp, OpenAI, Claude, Supabase).
// Todas as chaves ficam nas variáveis de ambiente da Vercel. Nada disso vai para o navegador.
const {url,serviceHeaders}=require('./oneway-server');
const core=require('./whatsapp-core');

const env=k=>String(process.env[k]||'').trim();
const provider=()=>env('WHATSAPP_PROVIDER').toLowerCase()==='360dialog'?'360dialog':'meta';
const graph=()=>`https://graph.facebook.com/${env('WHATSAPP_GRAPH_VERSION')||'v23.0'}`;
const D360='https://waba-v2.360dialog.io';

function config(){
  const p=provider();
  return {
    provider:p,
    webhookSecret:!!env('WHATSAPP_WEBHOOK_SECRET'),
    verifyToken:!!env('WHATSAPP_VERIFY_TOKEN'),
    whatsappToken:p==='360dialog'?!!env('D360_API_KEY'):!!env('WHATSAPP_TOKEN'),
    phoneNumberId:p==='360dialog'?true:!!env('WHATSAPP_PHONE_NUMBER_ID'),
    anthropic:!!env('ANTHROPIC_API_KEY'),
    openai:!!env('OPENAI_API_KEY'),
    supabase:!!(url()&&env('SUPABASE_SERVICE_ROLE_KEY')),
    autoReply:env('WHATSAPP_AUTO_REPLY').toLowerCase()!=='off'
  };
}

async function http(full,options={},timeout=60000){
  const r=await fetch(full,{...options,signal:AbortSignal.timeout(timeout)});
  const type=r.headers.get('content-type')||'';
  const body=type.includes('json')?await r.json().catch(()=>({})):await r.text().catch(()=>'');
  if(!r.ok){
    const msg=body?.error?.message||body?.message||(typeof body==='string'?body.slice(0,200):'')||`HTTP ${r.status}`;
    throw Object.assign(new Error(String(msg)),{status:r.status});
  }
  return body;
}

/* ---------- Supabase ---------- */
async function db(path,options={}){
  return http(url()+'/rest/v1/'+path,{...options,headers:{...serviceHeaders(),...(options.headers||{})}},20000);
}
async function insertItem(row){
  // Ignora repetição: a Meta reenvia a mesma mensagem se demorarmos a responder.
  const rows=await db('whatsapp_items?on_conflict=wa_message_id',{method:'POST',headers:{Prefer:'resolution=ignore-duplicates,return=representation'},body:JSON.stringify(row)});
  return Array.isArray(rows)?rows[0]||null:null;
}
async function updateItem(id,patch){
  await db('whatsapp_items?id=eq.'+encodeURIComponent(id),{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({...patch,updated_at:new Date().toISOString()})});
}
async function getContact(phone){
  const rows=await db('whatsapp_contacts?phone=eq.'+encodeURIComponent(phone)+'&select=*');
  return Array.isArray(rows)?rows[0]||null:null;
}
async function clientNames(){
  try{
    const rows=await db('app_state?id=eq.main&select=clients:data->clients');
    const list=Array.isArray(rows?.[0]?.clients)?rows[0].clients:[];
    const seen=new Map();
    for(const c of list){
      if(!c||c.deletedAt||c.mergedInto)continue;
      const n=String(c.name||'').trim();
      if(n&&!seen.has(n.toLowerCase()))seen.set(n.toLowerCase(),n);
    }
    return [...seen.values()].slice(0,80);
  }catch{return []}
}

/* ---------- WhatsApp ---------- */
function waHeaders(){
  return provider()==='360dialog'
    ?{'D360-API-KEY':env('D360_API_KEY'),'Content-Type':'application/json'}
    :{Authorization:'Bearer '+env('WHATSAPP_TOKEN'),'Content-Type':'application/json'};
}
async function sendText(to,body){
  const text=core.clip(body,3800).trim();
  if(!text)return null;
  const endpoint=provider()==='360dialog'?D360+'/messages':`${graph()}/${env('WHATSAPP_PHONE_NUMBER_ID')}/messages`;
  return http(endpoint,{method:'POST',headers:waHeaders(),body:JSON.stringify({messaging_product:'whatsapp',recipient_type:'individual',to,type:'text',text:{preview_url:false,body:text}})},20000);
}
async function downloadMedia(mediaId){
  const p=provider();
  const info=await http(p==='360dialog'?`${D360}/${encodeURIComponent(mediaId)}`:`${graph()}/${encodeURIComponent(mediaId)}`,{headers:waHeaders()},20000);
  let link=String(info?.url||'');
  if(!link)throw new Error('A mídia não tem link de download.');
  if(p==='360dialog')link=link.replace(/^https:\/\/lookaside\.fbsbx\.com/,D360);
  const r=await fetch(link,{headers:waHeaders(),signal:AbortSignal.timeout(60000)});
  if(!r.ok)throw new Error(`Falha ao baixar o áudio (HTTP ${r.status}).`);
  const buf=Buffer.from(await r.arrayBuffer());
  if(buf.length>25*1024*1024)throw new Error('Áudio maior que 25 MB. Divida em partes menores.');
  return {buffer:buf,mime:String(info?.mime_type||'audio/ogg')};
}

/* ---------- IA ---------- */
async function transcribe({buffer,mime}){
  if(!env('OPENAI_API_KEY'))throw new Error('Chave OPENAI_API_KEY não configurada na Vercel.');
  const ext=/mpeg|mp3/.test(mime)?'mp3':/mp4|m4a|aac/.test(mime)?'m4a':/wav/.test(mime)?'wav':'ogg';
  const form=new FormData();
  form.append('file',new Blob([buffer],{type:mime.split(';')[0]||'audio/ogg'}),'audio.'+ext);
  form.append('model',env('OPENAI_TRANSCRIBE_MODEL')||'whisper-1');
  form.append('language','pt');
  const out=await http('https://api.openai.com/v1/audio/transcriptions',{method:'POST',headers:{Authorization:'Bearer '+env('OPENAI_API_KEY')},body:form},240000);
  return core.clip(out?.text,200000).trim();
}
async function claude(system,user,maxTokens=1500){
  if(!env('ANTHROPIC_API_KEY'))throw new Error('Chave ANTHROPIC_API_KEY não configurada na Vercel.');
  const out=await http('https://api.anthropic.com/v1/messages',{
    method:'POST',
    headers:{'x-api-key':env('ANTHROPIC_API_KEY'),'anthropic-version':'2023-06-01','Content-Type':'application/json'},
    body:JSON.stringify({model:env('ANTHROPIC_MODEL')||'claude-sonnet-5-5',max_tokens:maxTokens,system,messages:[{role:'user',content:user}]})
  },120000);
  return (Array.isArray(out?.content)?out.content:[]).filter(b=>b.type==='text').map(b=>b.text).join('\n');
}

/* ---------- processamento de uma mensagem ---------- */
async function processMessage(msg){
  const contact=await getContact(msg.from).catch(()=>null);
  const isTeam=!!contact?.is_team;
  const route=core.routeMessage(msg,{isTeam});
  if(route==='ignore')return {skipped:'tipo sem texto nem áudio'};

  const item=await insertItem({
    wa_message_id:msg.id,phone:msg.from,contact_name:contact?.contact_name||msg.name||'',
    client_name:contact?.client_name||'',message_type:msg.type,text:msg.text||'',
    kind:route==='meeting'?'reuniao':route==='note'?'nota':'outro',status:'processando'
  });
  if(!item)return {skipped:'mensagem repetida'};

  const cfg=config();
  try{
    const names=await clientNames();
    let text=msg.text||'',transcript='';
    if(route==='transcribe'||route==='meeting'){
      transcript=await transcribe(await downloadMedia(msg.mediaId));
      text=transcript;
    }
    const asMeeting=route==='meeting'||(route==='transcribe'&&transcript.length>=core.MEETING_MIN_CHARS);

    if(route==='note'){
      await updateItem(item.id,{kind:'nota',summary:core.clip(text,600),status:'novo'});
      return {id:item.id,kind:'nota'};
    }

    if(asMeeting){
      const raw=await claude(core.meetingPrompt({clientNames:names,knownClient:contact?.client_name,caption:msg.text}),'Transcrição:\n'+transcript,4000);
      const m=core.cleanMeeting(core.parseJsonReply(raw));
      const client=contact?.client_name||m.client;
      await updateItem(item.id,{kind:'reuniao',transcript,client_name:client,summary:m.summary||m.title,details:m,status:'novo'});
      if(cfg.autoReply&&isTeam){
        await sendText(msg.from,`✅ Reunião transcrita${client?` (${client})`:''}.\n${m.plan.length} tarefa${m.plan.length===1?'':'s'} no plano de ação. Está no One Way Demandas, em WhatsApp › Reuniões.`).catch(()=>{});
      }
      return {id:item.id,kind:'reuniao'};
    }

    const raw=await claude(core.classifyPrompt({agencyInfo:env('WHATSAPP_AGENCY_INFO'),clientNames:names,knownClient:contact?.client_name,contactName:contact?.contact_name||msg.name}),(transcript?'(Áudio transcrito) ':'')+text,800);
    const c=core.cleanClassification(core.parseJsonReply(raw));
    let reply='';
    if(cfg.autoReply&&c.reply&&c.kind!=='outro'){
      await sendText(msg.from,c.reply);
      reply=c.reply;
    }
    await updateItem(item.id,{
      kind:c.kind,transcript,client_name:contact?.client_name||c.client,summary:c.summary,
      details:{deadline:c.deadline,scheduleAt:c.scheduleAt,needsHuman:c.needsHuman},
      reply,status:c.kind==='outro'?'arquivado':'novo'
    });
    return {id:item.id,kind:c.kind};
  }catch(error){
    console.error('WhatsApp: falha ao processar mensagem',error?.message);
    await updateItem(item.id,{status:'erro',error:core.clip(error?.message||'Erro desconhecido',500)}).catch(()=>{});
    return {id:item.id,error:true};
  }
}

module.exports={config,db,sendText,processMessage,clientNames,provider};
