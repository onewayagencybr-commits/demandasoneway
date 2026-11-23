'use strict';
// One Way · Assistente de WhatsApp
// GET  ?hub.mode=subscribe...        → verificação do webhook (Meta / 360dialog)
// POST ?key=SEGREDO                  → mensagens recebidas do WhatsApp
// GET/POST ?action=...               → tela do painel (somente Administrador)
const {reply,admin}=require('../lib/oneway-server');
const core=require('../lib/whatsapp-core');
const wa=require('../lib/whatsapp-server');

const env=k=>String(process.env[k]||'').trim();
const q=(req,k)=>typeof req.query?.[k]==='string'?req.query[k]:'';

// Deixa o processamento rodar depois de responder 200 (a Meta exige resposta rápida).
function background(promise){
  try{
    const ctx=globalThis[Symbol.for('@vercel/request-context')]?.get?.();
    if(ctx&&typeof ctx.waitUntil==='function'){ctx.waitUntil(promise);return true}
  }catch{}
  return false;
}

function body(req){
  if(req.body&&typeof req.body==='object')return req.body;
  try{return JSON.parse(String(req.body||'{}'))}catch{return {}}
}

async function webhook(req,res){
  const secret=env('WHATSAPP_WEBHOOK_SECRET');
  if(!secret)return reply(res,503,{error:'Webhook ainda não configurado.'});
  if(!core.safeEqual(q(req,'key'),secret))return reply(res,401,{error:'Não autorizado.'});
  const messages=core.extractMessages(body(req)).filter(m=>!m.groupId);
  if(!messages.length)return reply(res,200,{ok:true,received:0});
  const job=(async()=>{for(const m of messages)await wa.processMessage(m)})().catch(e=>console.error('WhatsApp webhook:',e?.message));
  if(background(job))return reply(res,200,{ok:true,received:messages.length});
  await job;
  return reply(res,200,{ok:true,received:messages.length});
}

async function adminAction(action,req,res){
  await admin(req);
  if(action==='status'){
    return reply(res,200,{config:wa.config(),webhookPath:'/api/whatsapp?key=SEU_SEGREDO'});
  }
  if(action==='list'){
    const status=q(req,'status');
    const filter=core.STATUSES.includes(status)?'&status=eq.'+status:'&status=neq.arquivado';
    const [items,contacts,names]=await Promise.all([
      wa.db('whatsapp_items?select=*&order=created_at.desc&limit=200'+filter),
      wa.db('whatsapp_contacts?select=*&order=client_name.asc,contact_name.asc'),
      wa.clientNames()
    ]);
    return reply(res,200,{items:(items||[]).map(core.publicItem),contacts:contacts||[],clients:names,config:wa.config()});
  }
  if(req.method!=='POST')return reply(res,405,{error:'Use POST.'});
  const b=body(req);
  if(action==='contact'){
    const phone=core.normalizePhone(b.phone);
    if(phone.length<10)return reply(res,400,{error:'Informe o número com DDI e DDD. Ex.: 5565999990000'});
    const row={phone,client_name:core.clip(b.clientName,120).trim(),contact_name:core.clip(b.contactName,120).trim(),is_team:!!b.isTeam,updated_at:new Date().toISOString()};
    await wa.db('whatsapp_contacts?on_conflict=phone',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(row)});
    // Atualiza as mensagens antigas desse número que estavam sem cliente.
    if(row.client_name)await wa.db('whatsapp_items?phone=eq.'+phone+'&client_name=eq.',{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({client_name:row.client_name})}).catch(()=>{});
    return reply(res,200,{ok:true});
  }
  if(action==='contact-delete'){
    const phone=core.normalizePhone(b.phone);
    if(!phone)return reply(res,400,{error:'Número inválido.'});
    await wa.db('whatsapp_contacts?phone=eq.'+phone,{method:'DELETE',headers:{Prefer:'return=minimal'}});
    return reply(res,200,{ok:true});
  }
  if(action==='item'){
    const id=String(b.id||'');
    if(!/^[0-9a-f-]{36}$/i.test(id))return reply(res,400,{error:'Item inválido.'});
    const patch={updated_at:new Date().toISOString()};
    if(b.status!==undefined){if(!core.STATUSES.includes(b.status))return reply(res,400,{error:'Status inválido.'});patch.status=b.status}
    if(b.clientName!==undefined)patch.client_name=core.clip(b.clientName,120).trim();
    if(Array.isArray(b.demandIds))patch.demand_ids=b.demandIds.map(x=>core.clip(x,80)).filter(Boolean).slice(0,60);
    await wa.db('whatsapp_items?id=eq.'+id,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify(patch)});
    return reply(res,200,{ok:true});
  }
  if(action==='send'){
    const to=core.normalizePhone(b.phone),text=core.clip(b.text,3800).trim();
    if(to.length<10||!text)return reply(res,400,{error:'Informe número e mensagem.'});
    await wa.sendText(to,text);
    return reply(res,200,{ok:true});
  }
  return reply(res,404,{error:'Ação desconhecida.'});
}

module.exports=async function(req,res){
  try{
    if(req.method==='GET'&&q(req,'hub.mode')==='subscribe'){
      const token=env('WHATSAPP_VERIFY_TOKEN');
      if(token&&core.safeEqual(q(req,'hub.verify_token'),token)){res.setHeader('Content-Type','text/plain');return res.status(200).send(q(req,'hub.challenge'))}
      return reply(res,403,{error:'Token de verificação inválido.'});
    }
    const action=q(req,'action');
    if(action)return await adminAction(action,req,res);
    if(req.method==='POST')return await webhook(req,res);
    return reply(res,200,{ok:true,service:'One Way · WhatsApp'});
  }catch(error){
    const status=Number(error?.status)||500;
    return reply(res,status>=400&&status<600?status:500,{error:error?.message||'Erro inesperado.'});
  }
};
