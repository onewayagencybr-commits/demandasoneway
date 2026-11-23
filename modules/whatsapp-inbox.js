/* One Way: WhatsApp da agência (só Administrador).
   Mostra o que chegou pelo WhatsApp Business: solicitações, agendamentos, dúvidas,
   notas da equipe e reuniões transcritas com plano de ação.
   Os dados ficam nas tabelas whatsapp_items e whatsapp_contacts (Supabase),
   lidas só pelo servidor em /api/whatsapp. Daqui dá para virar demanda com um clique. */
(()=>{
'use strict';
const $=id=>document.getElementById(id);
const h=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const KIND={solicitacao:'Solicitação',agendamento:'Agendamento',duvida:'Dúvida',reuniao:'Reunião',nota:'Nota da equipe',outro:'Outro'};
const AREA_LABEL={arte:'Arte',video:'Vídeo',trafego:'Tráfego'};
const TABS=[['inbox','Caixa de entrada'],['meetings','Reuniões'],['contacts','Contatos'],['setup','Configuração']];
const FILTERS=[['','Pendentes'],['feito','Feitos'],['arquivado','Arquivados']];

let open=false,tab='inbox',filter='',data={items:[],contacts:[],clients:[],config:null},loading=false,err='',formFor=null,expanded=new Set(),newCount=0;

const allowed=()=>typeof isAdmin==='function'&&isAdmin();
const when=iso=>{try{return new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Cuiaba',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(iso))}catch{return ''}};
const phoneLabel=p=>{const s=String(p||'');return s.length>=12?`+${s.slice(0,2)} (${s.slice(2,4)}) ${s.slice(4,-4)}-${s.slice(-4)}`:s};
const notify=(msg,type)=>{try{if(typeof toast==='function')toast(msg,null,null,type)}catch{}};

async function api(action,opts={}){
 if(typeof supabaseClient==='undefined'||!supabaseClient)throw Error('Entre como administrador.');
 const {data:s,error}=await supabaseClient.auth.getSession();
 if(error||!s?.session?.access_token)throw Error('Sessão expirada. Faça login novamente.');
 const qs=new URLSearchParams({action,...(opts.query||{})});
 const res=await fetch('/api/whatsapp?'+qs,{method:opts.body?'POST':'GET',cache:'no-store',headers:{Authorization:'Bearer '+s.session.access_token,'Content-Type':'application/json'},body:opts.body?JSON.stringify(opts.body):undefined});
 const json=await res.json().catch(()=>({}));
 if(!res.ok){
  const m=String(json.error||'');
  if(/whatsapp_(items|contacts)/.test(m))throw Error('Falta criar as tabelas do WhatsApp no Supabase (arquivo supabase/migrations/20261123_whatsapp_assistant.sql).');
  throw Error(m||'Não foi possível falar com o servidor.');
 }
 return json;
}
async function load(){
 if(!allowed())return;
 loading=true;err='';render();
 try{data=await api('list',{query:filter?{status:filter}:{}});if(!filter)newCount=data.items.filter(i=>i.status==='novo'||i.status==='erro').length}
 catch(e){err=e.message}
 loading=false;render();badge();
}

/* ---------- clientes e demandas ---------- */
function records(){return typeof cmSelectableRecords==='function'?cmSelectableRecords():[]}
function clientOptions(selected){
 const names=new Map();
 for(const n of [...records().map(c=>c.name),...(data.clients||[])]){const k=String(n||'').trim();if(k&&!names.has(k.toLowerCase()))names.set(k.toLowerCase(),k)}
 const list=[...names.values()].sort((a,b)=>a.localeCompare(b,'pt-BR',{sensitivity:'base'}));
 if(selected&&!names.has(String(selected).toLowerCase()))list.unshift(selected);
 return '<option value="">— escolha o cliente —</option>'+list.map(n=>`<option value="${h(n)}" ${n===selected?'selected':''}>${h(n)}</option>`).join('');
}
function keyOf(name){return typeof cmSelectionKey==='function'?cmSelectionKey(name):String(name||'').toLowerCase().replace(/\s/g,'')}
async function createDemand({clientName,area,title,postDate,description}){
 if(!allowed()||typeof saveState!=='function'||typeof state==='undefined')throw Error('Acesso restrito aos administradores.');
 if(typeof adminAuthReady==='function'&&!adminAuthReady())throw Error('Conecte-se à nuvem como Administrador para criar a demanda.');
 if(!clientName)throw Error('Escolha o cliente.');
 if(!AREA_LABEL[area])throw Error('Escolha a área.');
 if(!String(title||'').trim())throw Error('Dê um nome para a demanda.');
 const today=typeof calendarLocalISO==='function'?calendarLocalISO(new Date()):new Date().toISOString().slice(0,10);
 const month=(postDate||today).slice(0,7),createdAt=new Date().toISOString(),norm=keyOf(clientName);
 const live=c=>c&&!c.mergedInto&&!c.deletedAt;
 let client=(state.clients||[]).find(c=>live(c)&&c.area===area&&keyOf(c.name)===norm),createdClientId=null,record=null,removed=[];
 const source=(state.clients||[]).find(c=>live(c)&&keyOf(c.name)===norm);
 if(!client){client={id:uid(),name:source?.name||clientName,area,type:source?.type||'fixed',startMonth:month,createdAt};state.clients.push(client);createdClientId=client.id}
 try{
  removed=(state.removedClientMonths||[]).filter(r=>r.clientId===client.id&&r.area===area&&r.month===month);
  state.removedClientMonths=(state.removedClientMonths||[]).filter(r=>!removed.includes(r));
  record={id:uid(),clientId:client.id,month,area,title:String(title).trim().slice(0,200),postDate:postDate||'',description:String(description||'').trim().slice(0,4000),status:'red',links:[],attachments:[],createdAt,createdDate:typeof demandCreationCalendarDate==='function'?demandCreationCalendarDate():today,source:'whatsapp'};
  if(typeof appendDemandActivity==='function')appendDemandActivity(record,'created','Demanda criada a partir do WhatsApp');
  state.demands.push(record);
  if(!await saveState({strictRemote:true}))throw Error('Não foi possível sincronizar a demanda na nuvem. Tente novamente.');
  if(typeof renderAll==='function')try{renderAll()}catch{}
  return record;
 }catch(e){
  if(record)state.demands=state.demands.filter(d=>d.id!==record.id);
  if(createdClientId&&!state.demands.some(d=>d.clientId===createdClientId))state.clients=state.clients.filter(c=>c.id!==createdClientId);
  state.removedClientMonths=[...(state.removedClientMonths||[]),...removed];
  throw e;
 }
}

/* ---------- desenho ---------- */
function demandForm(item,task){
 const id=item.id+(task!=null?'|'+task:'');
 if(formFor!==id)return '';
 const t=task!=null?(item.details?.plan||[])[task]:null;
 const title=t?t.task:item.summary||item.text;
 const area=t&&AREA_LABEL[t.area]?t.area:'arte';
 const desc=t?`Reunião: ${item.details?.title||''}\nResponsável: ${t.owner||'-'}\nPrazo combinado: ${t.deadline||'-'}`:`Pedido pelo WhatsApp (${item.contactName||phoneLabel(item.phone)}):\n${item.text||item.transcript||''}${item.details?.deadline?`\nPrazo citado: ${item.details.deadline}`:''}`;
 return `<form class="ow-wa-form" data-form="${h(id)}" data-item="${h(item.id)}">
  <label>Cliente<select name="client" required>${clientOptions(item.clientName)}</select></label>
  <label>Área<select name="area">${Object.entries(AREA_LABEL).map(([k,v])=>`<option value="${k}" ${k===area?'selected':''}>${v}</option>`).join('')}</select></label>
  <label class="wide">Demanda<input name="title" maxlength="200" value="${h(String(title||'').slice(0,200))}" required></label>
  <label>Data de postagem <small>(opcional)</small><input type="date" name="postDate"></label>
  <label class="wide">Descrição<textarea name="description" rows="3">${h(desc)}</textarea></label>
  <div class="ow-wa-formfoot"><button type="button" class="ow-wa-ghost" data-act="cancel-form">Cancelar</button><button type="submit" class="ow-wa-primary">Criar demanda</button></div>
 </form>`;
}
function itemCard(i){
 const d=i.details||{},noClient=!i.clientName;
 const meta=[i.contactName||'',phoneLabel(i.phone),when(i.createdAt)].filter(Boolean).map(h).join(' · ');
 const facts=[d.deadline&&`Prazo citado: ${d.deadline}`,d.scheduleAt&&`Horário pedido: ${d.scheduleAt.replace('T',' às ')}`,d.needsHuman&&'Precisa de alguém da equipe'].filter(Boolean);
 const original=i.transcript||i.text;
 return `<article class="ow-wa-card k-${h(i.kind)} s-${h(i.status)}">
  <header><span class="ow-wa-chip">${h(KIND[i.kind]||i.kind)}${i.messageType==='audio'?' · áudio':''}</span><strong>${h(i.clientName||'Sem cliente')}</strong><small>${meta}</small></header>
  ${i.status==='processando'?'<p class="ow-wa-muted">Processando…</p>':''}
  ${i.status==='erro'?`<p class="ow-wa-error">Não foi possível processar: ${h(i.error)}</p>`:''}
  ${i.summary?`<p class="ow-wa-summary">${h(i.summary)}</p>`:''}
  ${facts.length?`<ul class="ow-wa-facts">${facts.map(f=>`<li>${h(f)}</li>`).join('')}</ul>`:''}
  ${original&&original!==i.summary?`<details><summary>${i.transcript?'Ver transcrição':'Ver mensagem'}</summary><p class="ow-wa-original">${h(original)}</p></details>`:''}
  ${i.reply?`<p class="ow-wa-reply"><b>Resposta automática enviada:</b> ${h(i.reply)}</p>`:''}
  ${i.demandIds?.length?`<p class="ow-wa-ok">✓ ${i.demandIds.length} demanda${i.demandIds.length===1?'':'s'} criada${i.demandIds.length===1?'':'s'}</p>`:''}
  ${noClient&&i.phone?`<div class="ow-wa-link"><select data-act="link-client" data-phone="${h(i.phone)}" data-name="${h(i.contactName)}">${clientOptions('').replace('— escolha o cliente —','Vincular este número a um cliente…')}</select></div>`:''}
  <div class="ow-wa-actions">
   ${i.kind!=='nota'?`<button type="button" class="ow-wa-primary" data-act="form" data-id="${h(i.id)}">Virar demanda</button>`:''}
   ${i.status!=='feito'?`<button type="button" class="ow-wa-ghost" data-act="status" data-id="${h(i.id)}" data-status="feito">Feito</button>`:`<button type="button" class="ow-wa-ghost" data-act="status" data-id="${h(i.id)}" data-status="novo">Reabrir</button>`}
   ${i.status!=='arquivado'?`<button type="button" class="ow-wa-ghost" data-act="status" data-id="${h(i.id)}" data-status="arquivado">Arquivar</button>`:''}
   ${i.phone?`<a class="ow-wa-ghost" href="https://wa.me/${h(i.phone)}" target="_blank" rel="noopener">Abrir conversa</a>`:''}
  </div>
  ${demandForm(i,null)}
 </article>`;
}
function planText(i){
 const d=i.details||{};
 const lines=[`*${d.title||'Reunião'}*${i.clientName?` — ${i.clientName}`:''}`,'',d.summary||i.summary||''];
 if(d.decisions?.length)lines.push('','*Decisões*',...d.decisions.map(x=>'• '+x));
 if(d.plan?.length)lines.push('','*Plano de ação*',...d.plan.map((t,n)=>`${n+1}. ${t.task}${t.owner?` — ${t.owner}`:''}${t.deadline?` (até ${t.deadline})`:''}`));
 if(d.clientPending?.length)lines.push('','*Pendências do cliente*',...d.clientPending.map(x=>'• '+x));
 return lines.join('\n');
}
function meetingCard(i){
 const d=i.details||{},plan=d.plan||[];
 return `<article class="ow-wa-card k-reuniao s-${h(i.status)}">
  <header><span class="ow-wa-chip">Reunião</span><strong>${h(d.title||'Reunião')}</strong><small>${h(i.clientName||'Sem cliente')} · ${h(when(i.createdAt))}${i.contactName?' · enviada por '+h(i.contactName):''}</small></header>
  ${i.status==='processando'?'<p class="ow-wa-muted">Transcrevendo o áudio… reuniões longas levam alguns minutos.</p>':''}
  ${i.status==='erro'?`<p class="ow-wa-error">Não foi possível processar: ${h(i.error)}</p>`:''}
  ${d.summary?`<p class="ow-wa-summary">${h(d.summary)}</p>`:''}
  ${d.decisions?.length?`<h4>Decisões</h4><ul>${d.decisions.map(x=>`<li>${h(x)}</li>`).join('')}</ul>`:''}
  ${plan.length?`<h4>Plano de ação</h4><ol class="ow-wa-plan">${plan.map((t,n)=>`<li><div><span>${h(t.task)}</span><small>${[t.owner,t.deadline&&'até '+t.deadline,AREA_LABEL[t.area]].filter(Boolean).map(h).join(' · ')}</small></div><button type="button" class="ow-wa-mini" data-act="form" data-id="${h(i.id)}" data-task="${n}">→ demanda</button>${demandForm(i,n)}</li>`).join('')}</ol>`:''}
  ${d.clientPending?.length?`<h4>Pendências do cliente</h4><ul>${d.clientPending.map(x=>`<li>${h(x)}</li>`).join('')}</ul>`:''}
  ${i.transcript?`<details><summary>Ver transcrição completa</summary><p class="ow-wa-original">${h(i.transcript)}</p></details>`:''}
  ${i.demandIds?.length?`<p class="ow-wa-ok">✓ ${i.demandIds.length} demanda${i.demandIds.length===1?'':'s'} criada${i.demandIds.length===1?'':'s'} a partir desta reunião</p>`:''}
  <div class="ow-wa-actions">
   ${d.summary||plan.length?`<button type="button" class="ow-wa-primary" data-act="copy-plan" data-id="${h(i.id)}">Copiar plano para o grupo</button>`:''}
   ${!i.clientName?`<select data-act="set-client" data-id="${h(i.id)}">${clientOptions('').replace('— escolha o cliente —','Definir cliente da reunião…')}</select>`:''}
   ${i.status!=='feito'?`<button type="button" class="ow-wa-ghost" data-act="status" data-id="${h(i.id)}" data-status="feito">Concluída</button>`:`<button type="button" class="ow-wa-ghost" data-act="status" data-id="${h(i.id)}" data-status="novo">Reabrir</button>`}
   ${i.status!=='arquivado'?`<button type="button" class="ow-wa-ghost" data-act="status" data-id="${h(i.id)}" data-status="arquivado">Arquivar</button>`:''}
  </div>
 </article>`;
}
function contactsView(){
 const known=new Set(data.contacts.map(c=>c.phone));
 const unknown=[...new Map(data.items.filter(i=>i.phone&&!known.has(i.phone)).map(i=>[i.phone,i])).values()];
 return `<section class="ow-wa-box"><h4>Cadastrar número</h4>
  <p class="ow-wa-muted">Cadastre o número de quem fala por cada cliente. Números marcados como <b>equipe</b> mandam áudios de reunião: o sistema transcreve e monta o plano de ação.</p>
  <form class="ow-wa-form" data-form="contact">
   <label>WhatsApp (com DDI e DDD)<input name="phone" inputmode="numeric" placeholder="5565999990000" required></label>
   <label>Nome da pessoa<input name="contactName" maxlength="120" placeholder="Ex.: Ana"></label>
   <label>Cliente<select name="clientName">${clientOptions('')}</select></label>
   <label class="ow-wa-check"><input type="checkbox" name="isTeam"> É da equipe One Way</label>
   <div class="ow-wa-formfoot"><button type="submit" class="ow-wa-primary">Salvar número</button></div>
  </form></section>
  ${unknown.length?`<section class="ow-wa-box"><h4>Números que escreveram e ainda não estão cadastrados</h4>${unknown.map(i=>`<div class="ow-wa-row"><span><b>${h(i.contactName||'Sem nome')}</b> · ${h(phoneLabel(i.phone))}</span><select data-act="link-client" data-phone="${h(i.phone)}" data-name="${h(i.contactName)}">${clientOptions('').replace('— escolha o cliente —','Vincular a um cliente…')}</select></div>`).join('')}</section>`:''}
  <section class="ow-wa-box"><h4>Números cadastrados (${data.contacts.length})</h4>
   ${data.contacts.length?data.contacts.map(c=>`<div class="ow-wa-row"><span><b>${h(c.contact_name||'Sem nome')}</b> · ${h(phoneLabel(c.phone))}</span><span class="ow-wa-chip">${c.is_team?'Equipe':h(c.client_name||'Sem cliente')}</span><button type="button" class="ow-wa-mini danger" data-act="del-contact" data-phone="${h(c.phone)}">Remover</button></div>`).join(''):'<p class="ow-wa-muted">Nenhum número cadastrado ainda.</p>'}
  </section>`;
}
function setupView(){
 const c=data.config||{};
 const row=(ok,label,hint)=>`<li class="${ok?'ok':'no'}"><i>${ok?'✓':'✗'}</i><div><b>${label}</b>${hint?`<small>${hint}</small>`:''}</div></li>`;
 const origin=location.origin;
 return `<section class="ow-wa-box"><h4>O que já está ligado</h4><ul class="ow-wa-setup">
  ${row(c.supabase,'Banco de dados (Supabase)','SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY — já usadas pelo sistema.')}
  ${row(c.webhookSecret,'Segredo do webhook','Variável WHATSAPP_WEBHOOK_SECRET na Vercel.')}
  ${row(c.verifyToken,'Token de verificação','Variável WHATSAPP_VERIFY_TOKEN (só se ligar direto na Meta).')}
  ${row(c.whatsappToken,`Chave do WhatsApp (${c.provider==='360dialog'?'360dialog':'Meta'})`,c.provider==='360dialog'?'Variável D360_API_KEY.':'Variáveis WHATSAPP_TOKEN e WHATSAPP_PHONE_NUMBER_ID.')}
  ${row(c.anthropic,'Claude (resumos e planos de ação)','Variável ANTHROPIC_API_KEY.')}
  ${row(c.openai,'Transcrição de áudio','Variável OPENAI_API_KEY.')}
  ${row(c.autoReply,'Respostas automáticas',c.autoReply?'Ligadas. Para desligar: WHATSAPP_AUTO_REPLY = off.':'Desligadas (WHATSAPP_AUTO_REPLY = off).')}
 </ul></section>
 <section class="ow-wa-box"><h4>Endereço para colar no provedor (webhook)</h4>
  <code class="ow-wa-code">${h(origin)}/api/whatsapp?key=<b>SEU_SEGREDO</b></code>
  <p class="ow-wa-muted">Troque SEU_SEGREDO pelo mesmo valor que você colocou em WHATSAPP_WEBHOOK_SECRET na Vercel.</p></section>`;
}
function body(){
 if(err)return `<div class="ow-wa-error big">${h(err)}</div>`;
 if(tab==='contacts')return contactsView();
 if(tab==='setup')return setupView();
 const list=data.items.filter(i=>tab==='meetings'?i.kind==='reuniao':i.kind!=='reuniao');
 if(loading&&!list.length)return '<p class="ow-wa-muted">Carregando…</p>';
 if(!list.length)return `<div class="ow-wa-empty">${tab==='meetings'?'Nenhuma reunião aqui. Para transcrever, a equipe encaminha o áudio da reunião para o WhatsApp da agência.':'Nada por aqui. As mensagens dos clientes aparecem assim que chegarem.'}</div>`;
 return `<div class="ow-wa-list">${list.map(i=>tab==='meetings'?meetingCard(i):itemCard(i)).join('')}</div>`;
}
function render(){
 let root=$('owWaRoot');
 if(!open||!allowed()){if(root)root.remove();document.body.classList.remove('ow-wa-locked');return}
 if(!root){root=document.createElement('div');root.id='owWaRoot';document.body.appendChild(root);root.addEventListener('click',onClick);root.addEventListener('change',onChange);root.addEventListener('submit',onSubmit)}
 const counts={inbox:data.items.filter(i=>i.kind!=='reuniao').length,meetings:data.items.filter(i=>i.kind==='reuniao').length};
 root.innerHTML=`<div class="ow-wa-overlay" data-act="close"></div>
 <aside class="ow-wa-panel" role="dialog" aria-label="WhatsApp da agência">
  <header class="ow-wa-head"><div><span class="ow-wa-kicker">One Way · WhatsApp</span><h3>WhatsApp da agência</h3></div>
   <div class="ow-wa-headbtns"><button type="button" class="ow-wa-ghost" data-act="reload">${loading?'Atualizando…':'Atualizar'}</button><button type="button" class="ow-wa-round" data-act="close" aria-label="Fechar">×</button></div></header>
  <nav class="ow-wa-tabs">${TABS.map(([k,l])=>`<button type="button" class="${tab===k?'on':''}" data-act="tab" data-tab="${k}">${l}${counts[k]?` <em>${counts[k]}</em>`:''}</button>`).join('')}</nav>
  ${tab==='inbox'||tab==='meetings'?`<div class="ow-wa-filters">${FILTERS.map(([k,l])=>`<button type="button" class="${filter===k?'on':''}" data-act="filter" data-filter="${k}">${l}</button>`).join('')}</div>`:''}
  <div class="ow-wa-body">${body()}</div>
 </aside>`;
 document.body.classList.add('ow-wa-locked');
}

/* ---------- botão do topo ---------- */
function ensureButton(){
 const bar=document.querySelector('.top-actions'),ref=$('contactRoutineTab');
 if(!bar)return null;
 let b=$('owWaTab');
 if(!b){
  b=document.createElement('button');b.type='button';b.id='owWaTab';b.className='ghost small ow-wa-tab hidden';
  b.innerHTML='<span class="ow-wa-tab-icon" aria-hidden="true"></span>WhatsApp<span class="ow-wa-tab-badge hidden" id="owWaBadge"></span>';
  b.addEventListener('click',()=>{if(!allowed())return;open=true;render();load()});
  if(ref&&ref.parentNode===bar)ref.after(b);else bar.appendChild(b);
 }
 return b;
}
function badge(){
 const b=ensureButton();if(!b)return;
 b.classList.toggle('hidden',!allowed());
 const n=$('owWaBadge');if(!n)return;
 n.textContent=newCount>99?'99+':String(newCount);n.classList.toggle('hidden',!allowed()||!newCount);
 b.title=newCount?`${newCount} mensage${newCount===1?'m':'ns'} do WhatsApp para ver`:'WhatsApp da agência';
}
async function poll(){if(!allowed()||document.hidden)return;if(open)return load();try{const r=await api('list');newCount=r.items.filter(i=>i.status==='novo'||i.status==='erro').length;badge()}catch{}}

/* ---------- ações ---------- */
const findItem=id=>data.items.find(i=>i.id===id);
async function setItem(id,patch,msg){
 try{await api('item',{body:{id,...patch}});if(msg)notify(msg,'success');await load()}catch(e){notify(e.message)}
}
async function onClick(ev){
 const t=ev.target.closest('[data-act]');if(!t||!allowed())return;
 const act=t.dataset.act;
 if(['link-client','set-client'].includes(act))return;
 if(act==='close'){open=false;formFor=null;render();return}
 if(act==='reload'){load();return}
 if(act==='tab'){tab=t.dataset.tab;formFor=null;render();return}
 if(act==='filter'){filter=t.dataset.filter;formFor=null;load();return}
 if(act==='form'){const id=t.dataset.id+(t.dataset.task!=null?'|'+t.dataset.task:'');formFor=formFor===id?null:id;render();return}
 if(act==='cancel-form'){formFor=null;render();return}
 if(act==='status'){setItem(t.dataset.id,{status:t.dataset.status},t.dataset.status==='feito'?'Marcado como feito.':t.dataset.status==='arquivado'?'Arquivado.':'Reaberto.');return}
 if(act==='copy-plan'){const i=findItem(t.dataset.id);if(!i)return;try{await navigator.clipboard.writeText(planText(i));notify('Plano copiado. É só colar no grupo do cliente.','success')}catch{notify('Não foi possível copiar.')}return}
 if(act==='del-contact'){if(!confirm('Remover este número do cadastro?'))return;try{await api('contact-delete',{body:{phone:t.dataset.phone}});notify('Número removido.','success');load()}catch(e){notify(e.message)}return}
}
async function onChange(ev){
 const t=ev.target.closest('[data-act]');if(!t||!allowed()||!t.value)return;
 if(t.dataset.act==='link-client'){
  try{await api('contact',{body:{phone:t.dataset.phone,clientName:t.value,contactName:t.dataset.name||''}});notify('Número vinculado a '+t.value+'.','success');load()}catch(e){notify(e.message)}
 }
 if(t.dataset.act==='set-client')setItem(t.dataset.id,{clientName:t.value},'Cliente definido.');
}
async function onSubmit(ev){
 const f=ev.target.closest('form[data-form]');if(!f||!allowed())return;
 ev.preventDefault();
 const fd=Object.fromEntries(new FormData(f).entries()),btn=f.querySelector('[type=submit]');
 if(btn){btn.disabled=true}
 try{
  if(f.dataset.form==='contact'){
   await api('contact',{body:{phone:fd.phone,contactName:fd.contactName,clientName:fd.clientName,isTeam:!!fd.isTeam}});
   notify('Número salvo.','success');await load();return;
  }
  const item=findItem(f.dataset.item);if(!item)throw Error('Mensagem não encontrada. Atualize a lista.');
  const record=await createDemand({clientName:fd.client,area:fd.area,title:fd.title,postDate:fd.postDate,description:fd.description});
  const ids=[...(item.demandIds||[]),record.id];
  const isMeeting=item.kind==='reuniao';
  await api('item',{body:{id:item.id,demandIds:ids,...(isMeeting?{}:{status:'feito'}),...(!item.clientName?{clientName:fd.client}:{})}});
  formFor=null;notify(`Demanda criada em ${AREA_LABEL[fd.area]} · ${fd.client}.`,'success');await load();
 }catch(e){notify(e.message)}
 finally{if(btn&&btn.isConnected)btn.disabled=false}
}

function init(){
 ensureButton();badge();
 const ref=$('contactRoutineTab');
 // O botão aparece e some junto com o de Contatos (que segue o login de Administrador).
 if(ref)new MutationObserver(()=>{badge();if(!allowed()&&open){open=false;render()}}).observe(ref,{attributes:true,attributeFilter:['class']});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&open){e.preventDefault();e.stopImmediatePropagation();if(formFor){formFor=null}else{open=false}render()}},true);
 setTimeout(poll,4000);
 setInterval(poll,3*60*1000);
}
window.owWhatsApp={open:()=>{open=true;render();load()},_test:{planText,clientOptions,createDemand,phoneLabel}};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
