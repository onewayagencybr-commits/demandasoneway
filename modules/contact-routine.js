/* One Way: Contato com clientes.
   Checklist semanal obrigatório da equipe (somente Administrador):
   segunda fala com todos, os outros dias seguem a prioridade de cada cliente,
   com checklist de conversa, checklist de acompanhamento e nota por contato.
   Tudo fica em state.contactRoutine (linha app_state "main"). */
(()=>{
'use strict';
const $=id=>document.getElementById(id);
const h=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const DAYS=[
 {k:'seg',label:'Segunda',type:'Bom dia no grupo + abertura da semana'},
 {k:'ter',label:'Terça',type:'Pedido de material'},
 {k:'qua',label:'Quarta',type:'Acompanhamento'},
 {k:'qui',label:'Quinta',type:'Ideia da semana'},
 {k:'sex',label:'Sexta',type:'Fechamento da semana'}
];
const PRIORITIES={
 alta:{label:'Alta',days:['ter','qua','qui','sex']},
 media:{label:'Média',days:['ter','qui','sex']},
 normal:{label:'Normal',days:['qua','sex']},
 leve:{label:'Leve',days:['sex']}
};
const PRIORITY_ORDER=['alta','media','normal','leve'];
// Prioridade inicial sugerida pela carteira atual (pode ser trocada na tela).
const PRESETS=[['cuiabaleiloes','alta'],['soldocerrado','alta'],['boreal','media'],['orocasa','media'],['medina','media'],['simonetto','normal'],['florealgodao','normal'],['familia','normal']];
const DEFAULT_CHECKLISTS={
 conversa:['Abriu a conversa (bom dia no grupo)','Mostrou o que vai ao ar','Pediu material com prazo','Levou uma ideia ou sugestão','Pediu aprovação'],
 acompanhamento:['Cliente respondeu','Material recebido','Aprovação recebida','Pendência anotada','Cobrança feita (24h sem resposta)']
};
const CHECK_TITLES={conversa:'Checklist de conversa',acompanhamento:'Checklist de acompanhamento'};

let view='semana',weekStart=null,openId=null,openNotesKey=null;

const allowed=()=>typeof isAdmin==='function'&&isAdmin();
const today=()=>calendarLocalISO(new Date());
const thisWeek=()=>calendarMonday(today());
const dayISO=(wk,idx)=>calendarAddDays(wk,idx);
const dm=iso=>{const [y,m,d]=String(iso).split('-');return d+'/'+m};
const stamp=iso=>{try{return new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Cuiaba',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(iso))}catch{return ''}};

function data(){
 if(!state.contactRoutine||typeof state.contactRoutine!=='object'||Array.isArray(state.contactRoutine))state.contactRoutine={};
 const d=state.contactRoutine;
 if(typeof d.responsible!=='string')d.responsible='';
 if(!d.clients||typeof d.clients!=='object')d.clients={};
 if(!d.weeks||typeof d.weeks!=='object')d.weeks={};
 if(!d.checklists||typeof d.checklists!=='object')d.checklists={};
 return d;
}
function checklist(kind){const list=data().checklists[kind];return Array.isArray(list)&&list.length?list:DEFAULT_CHECKLISTS[kind]}
function clientList(){
 if(typeof cmSelectableRecords!=='function')return [];
 return cmSelectableRecords().map(c=>({key:cmSelectionKey(c.name),name:c.name})).filter(c=>c.key);
}
function defaultPriority(key){if(key==='eag')return 'leve';const p=PRESETS.find(([k])=>key.includes(k));return p?p[1]:'normal'}
function cfg(key){
 const c=data().clients[key]||{};
 const priority=PRIORITIES[c.priority]?c.priority:defaultPriority(key);
 const custom=Array.isArray(c.days);
 const days=custom?c.days.filter(d=>d!=='seg'&&DAYS.some(x=>x.k===d)):PRIORITIES[priority].days;
 return {priority,days,custom};
}
function weekData(wk,create=false){
 const weeks=data().weeks;
 if(!weeks[wk]&&create)weeks[wk]={entries:{}};
 const w=weeks[wk];
 if(w&&(!w.entries||typeof w.entries!=='object'))w.entries={};
 return w||{entries:{}};
}
function entry(wk,id){const w=weekData(wk,true);if(!w.entries[id]||typeof w.entries[id]!=='object')w.entries[id]={};return w.entries[id]}
const hasChecks=e=>!!e&&['conversa','acompanhamento'].some(k=>e.checks&&e.checks[k]&&Object.values(e.checks[k]).some(Boolean));

function makeContact(id,c,orig,e,conf){
 const known=k=>DAYS.some(d=>d.k===k);
 const day=known(e?.day)?e.day:(known(orig)?orig:'seg');
 return {id,key:c.key,name:c.name,orig,day,idx:DAYS.findIndex(d=>d.k===day),entry:e||{},priority:conf.priority,
  type:e?.type||DAYS.find(d=>d.k===orig)?.type||'Contato extra',extra:!!e?.extra};
}
// Segunda: todos os clientes. Demais dias: os dias da prioridade (ou os escolhidos).
// Contatos já trabalhados (feitos, com nota, checklist ou extras) nunca somem.
function contacts(wk){
 const active=clientList(),byKey=new Map(active.map(c=>[c.key,c])),entries=weekData(wk).entries,list=[],seen=new Set();
 for(const c of active){
  const conf=cfg(c.key);
  for(const day of ['seg',...conf.days]){const id=c.key+'|'+day;seen.add(id);list.push(makeContact(id,c,day,entries[id],conf))}
 }
 for(const [id,e] of Object.entries(entries)){
  if(seen.has(id)||!e)continue;
  const key=id.split('|')[0],c=byKey.get(key);
  if(!c||!(e.extra||e.done||e.note||hasChecks(e)))continue;
  list.push(makeContact(id,c,id.split('|')[1],e,cfg(key)));
 }
 return list;
}
function status(c,wk){
 if(c.entry.done)return 'done';
 const iso=dayISO(wk,c.idx),t=today();
 return iso<t?'late':iso===t?'today':'next';
}
const sortContacts=list=>list.sort((a,b)=>PRIORITY_ORDER.indexOf(a.priority)-PRIORITY_ORDER.indexOf(b.priority)||a.name.localeCompare(b.name,'pt-BR',{sensitivity:'base'}));
function lateCount(wk=thisWeek()){return contacts(wk).filter(c=>status(c,wk)==='late').length}
function lastContact(key){
 let last='';
 for(const w of Object.values(data().weeks||{}))for(const [id,e] of Object.entries(w?.entries||{}))
  if(id.split('|')[0]===key&&e?.done&&e.doneAt&&e.doneAt>last)last=e.doneAt;
 return last;
}
function notesOf(key){
 const out=[];
 for(const [wk,w] of Object.entries(data().weeks||{}))for(const [id,e] of Object.entries(w?.entries||{})){
  if(id.split('|')[0]!==key||!e?.note)continue;
  const day=DAYS.find(d=>d.k===e.day)||DAYS.find(d=>d.k===id.split('|')[1])||DAYS[0];
  out.push({when:e.noteAt||'',wk,day:day.label,date:dayISO(wk,DAYS.indexOf(day)),note:e.note,by:e.noteBy||''});
 }
 return out.sort((a,b)=>String(b.date+b.when).localeCompare(String(a.date+a.when)));
}

async function commit(message){
 if(!allowed())return;
 render();badge();
 const ok=await saveState();
 if(ok&&message&&typeof toast==='function')toast(message,null,null,'success');
}

/* ---------- telas ---------- */
function header(wk){
 const d=data(),list=contacts(wk),done=list.filter(c=>c.entry.done).length,late=list.filter(c=>status(c,wk)==='late').length;
 const pct=list.length?Math.round(done/list.length*100):0,current=wk===thisWeek();
 const names=typeof collaboratorList==='function'?collaboratorList().map(c=>String(c.name).trim()):[];
 if(d.responsible&&!names.includes(d.responsible))names.push(d.responsible);
 const weekday=new Date(today()+'T12:00:00').getDay();
 const banner=current&&(weekday===4||weekday===5)
  ?`<div class="ow-cr-banner"><div><strong>${weekday===4?'Hoje é quinta: dia de remanejar.':'Semana quase no fim.'}</strong><span>Revise a próxima semana e mova os contatos que precisar.</span></div><button type="button" class="ow-cr-btn" data-act="next-week">Ver próxima semana</button></div>`:'';
 return `<div class="ow-cr-head">
  <div class="ow-cr-head-main">
   <span class="ow-cr-mandatory">Tarefa obrigatória da equipe</span>
   <label class="ow-cr-resp"><span>Responsável pela rotina</span>
    <select data-act="responsible"><option value="">Escolha quem organiza</option>${names.map(n=>`<option value="${h(n)}" ${n===d.responsible?'selected':''}>${h(n)}</option>`).join('')}</select>
   </label>
   ${d.responsible?'':'<p class="ow-cr-warn">! Defina quem é o responsável por esta rotina.</p>'}
  </div>
  <div class="ow-cr-progress">
   <div class="ow-cr-progress-top"><strong>${done} de ${list.length}</strong><span>contatos feitos</span>${late?`<span class="ow-cr-late-chip">! ${late} atrasado${late===1?'':'s'}</span>`:''}</div>
   <div class="ow-cr-bar"><i style="width:${pct}%"></i></div>
  </div>
 </div>
 ${banner}
 <div class="ow-cr-weeknav">
  <button type="button" class="ow-cr-icon" data-act="prev-week" aria-label="Semana anterior">‹</button>
  <strong>Semana de ${dm(wk)} a ${dm(dayISO(wk,4))}</strong>
  <button type="button" class="ow-cr-icon" data-act="next-week" aria-label="Próxima semana">›</button>
  ${current?'':'<button type="button" class="ow-cr-link" data-act="this-week">Voltar para esta semana</button>'}
 </div>
 <div class="ow-cr-tabs">${[['semana','Semana'],['clientes','Clientes e prioridades'],['checklists','Checklists']].map(([k,l])=>`<button type="button" class="${view===k?'active':''}" data-act="view" data-view="${k}">${l}</button>`).join('')}</div>`;
}

function card(c,wk){
 const st=status(c,wk),e=c.entry,open=openId===c.id;
 const checks=kind=>checklist(kind).map((item,i)=>`<label class="ow-cr-check"><input type="checkbox" data-act="check" data-id="${h(c.id)}" data-kind="${kind}" data-i="${i}" ${e.checks?.[kind]?.[item]?'checked':''}><span>${h(item)}</span></label>`).join('');
 const detail=open?`<div class="ow-cr-detail">
  <div class="ow-cr-lists">
   <div><h4>${CHECK_TITLES.conversa}</h4>${checks('conversa')}</div>
   <div><h4>${CHECK_TITLES.acompanhamento}</h4>${checks('acompanhamento')}</div>
  </div>
  <label class="ow-cr-note"><span>Nota do contato</span><textarea data-act="note" data-id="${h(c.id)}" rows="3" placeholder="O que o cliente disse, o que ficou combinado, próximos passos…">${h(e.note||'')}</textarea>${e.noteAt?`<small>Atualizada ${h(stamp(e.noteAt))}${e.noteBy?' por '+h(e.noteBy):''}</small>`:''}</label>
  <div class="ow-cr-detail-foot">
   <label>Remanejar para <select data-act="move" data-id="${h(c.id)}">${DAYS.map((d,i)=>`<option value="${d.k}" ${d.k===c.day?'selected':''}>${d.label} ${dm(dayISO(wk,i))}</option>`).join('')}</select></label>
   ${e.done&&e.doneAt?`<span class="ow-cr-meta">✓ Feito ${h(stamp(e.doneAt))}${e.doneBy?' por '+h(e.doneBy):''}</span>`:''}
   ${c.extra?`<button type="button" class="ow-cr-link danger" data-act="remove-extra" data-id="${h(c.id)}">Remover contato extra</button>`:''}
  </div>
 </div>`:'';
 const flag=st==='late'?'<span class="ow-cr-flag" title="Atrasado">!</span>':'';
 return `<div class="ow-cr-card st-${st} ${open?'open':''}">
  <div class="ow-cr-card-row">
   <label class="ow-cr-done" title="Marcar contato como feito"><input type="checkbox" data-act="done" data-id="${h(c.id)}" ${e.done?'checked':''}><span></span></label>
   <button type="button" class="ow-cr-card-main" data-act="open" data-id="${h(c.id)}"><strong>${h(c.name)}</strong><small>${h(c.type)}${c.day!==c.orig&&!c.extra?' · remanejado':''}${e.note?' · com nota':''}</small></button>
   <span class="ow-cr-pill p-${c.priority}">${PRIORITIES[c.priority].label}</span>${flag}
  </div>${detail}
 </div>`;
}

function weekView(wk){
 const list=contacts(wk),active=clientList();
 if(!active.length)return '<div class="ow-cr-empty">Nenhum cliente ativo. Cadastre os clientes em Gerenciar Clientes.</div>';
 return `<div class="ow-cr-week">${DAYS.map((d,i)=>{
  const items=sortContacts(list.filter(c=>c.idx===i)),done=items.filter(c=>c.entry.done).length,late=items.some(c=>status(c,wk)==='late'),iso=dayISO(wk,i);
  return `<section class="ow-cr-day ${iso===today()?'is-today':''} ${late?'has-late':''}">
   <header><div><strong>${d.label}</strong><span>${dm(iso)}</span></div><em>${late?'! ':''}${done}/${items.length}</em></header>
   ${i===0?'<p class="ow-cr-day-hint">Bom dia em todos os grupos.</p>':''}
   <div class="ow-cr-cards">${items.map(c=>card(c,wk)).join('')||'<p class="ow-cr-none">Sem contatos neste dia.</p>'}</div>
   <label class="ow-cr-add"><select data-act="add-extra" data-day="${d.k}"><option value="">+ Contato extra</option>${active.map(c=>`<option value="${h(c.key)}">${h(c.name)}</option>`).join('')}</select></label>
  </section>`}).join('')}</div>`;
}

function clientsView(){
 const active=clientList();
 if(!active.length)return '<div class="ow-cr-empty">Nenhum cliente ativo. Cadastre os clientes em Gerenciar Clientes.</div>';
 const rows=active.map(c=>({...c,conf:cfg(c.key)})).sort((a,b)=>PRIORITY_ORDER.indexOf(a.conf.priority)-PRIORITY_ORDER.indexOf(b.conf.priority)||a.name.localeCompare(b.name,'pt-BR',{sensitivity:'base'}));
 const week=7*86400000;
 return `<p class="ow-cr-help">Segunda é com todos. Os outros dias seguem a prioridade: Alta fala de terça a sexta, Média na terça, quinta e sexta, Normal na quarta e sexta, Leve na sexta. Toque nos dias pra ajustar um cliente.</p>
 <div class="ow-cr-clients">${rows.map(c=>{
  const last=lastContact(c.key),stale=!last||Date.now()-new Date(last).getTime()>week,notes=notesOf(c.key),open=openNotesKey===c.key;
  return `<div class="ow-cr-client">
   <div class="ow-cr-client-row">
    <strong class="ow-cr-client-name">${h(c.name)}</strong>
    <select class="ow-cr-pri p-${c.conf.priority}" data-act="priority" data-key="${h(c.key)}">${PRIORITY_ORDER.map(p=>`<option value="${p}" ${p===c.conf.priority?'selected':''}>${PRIORITIES[p].label}</option>`).join('')}</select>
    <div class="ow-cr-days"><span class="ow-cr-daychip on fixed" title="Segunda é com todos">Seg</span>${DAYS.slice(1).map(d=>`<button type="button" class="ow-cr-daychip ${c.conf.days.includes(d.k)?'on':''}" data-act="toggle-day" data-key="${h(c.key)}" data-day="${d.k}">${d.label.slice(0,3)}</button>`).join('')}${c.conf.custom?`<button type="button" class="ow-cr-link" data-act="reset-days" data-key="${h(c.key)}">Padrão</button>`:''}</div>
    <span class="ow-cr-last ${stale?'stale':''}">${stale?'! ':''}${last?'Último contato '+h(stamp(last)):'Sem contato registrado'}</span>
    <button type="button" class="ow-cr-link" data-act="notes" data-key="${h(c.key)}">${notes.length?`Notas (${notes.length})`:'Sem notas'}</button>
   </div>
   ${open?`<div class="ow-cr-notes">${notes.length?notes.map(n=>`<div class="ow-cr-noteitem"><small>${h(n.day)} ${dm(n.date)}${n.by?' · '+h(n.by):''}</small><p>${h(n.note)}</p></div>`).join(''):'<p class="ow-cr-none">Nenhuma nota ainda. As notas ficam nos contatos da aba Semana.</p>'}</div>`:''}
  </div>`}).join('')}</div>`;
}

function checklistView(){
 return `<p class="ow-cr-help">Um item por linha. Esses itens aparecem em todo contato, quando você abre o cliente na aba Semana.</p>
 <div class="ow-cr-config">${['conversa','acompanhamento'].map(k=>`<label><strong>${CHECK_TITLES[k]}</strong><textarea id="owCrList-${k}" rows="7">${h(checklist(k).join('\n'))}</textarea></label>`).join('')}</div>
 <div class="ow-cr-config-actions"><button type="button" class="ow-cr-btn" data-act="save-lists">Salvar checklists</button><button type="button" class="ow-cr-link" data-act="reset-lists">Restaurar padrão</button></div>`;
}

function render(){
 const el=$('contactRoutineContent');if(!el)return;
 if(!allowed()){el.innerHTML='';return}
 // Não apaga o que alguém está digitando quando chega atualização de outro usuário.
 const typing=document.activeElement;if(typing&&el.contains(typing)&&typing.tagName==='TEXTAREA')return;
 if(!weekStart)weekStart=thisWeek();
 const wk=weekStart;
 el.innerHTML=`<div class="ow-cr">${header(wk)}${view==='clientes'?clientsView():view==='checklists'?checklistView():weekView(wk)}</div>`;
}

function badge(){
 const btn=$('contactRoutineTab'),b=$('contactRoutineBadge');if(!btn||!b)return;
 const n=allowed()?lateCount():0;
 b.textContent=n>99?'99+':String(n);
 b.classList.toggle('hidden',!n);
 btn.classList.toggle('ow-cr-tab-late',!!n);
 btn.title=n?`Contato com clientes · ${n} atrasado${n===1?'':'s'}`:'Contato com clientes';
}

/* ---------- ações ---------- */
function onClick(ev){
 const t=ev.target.closest('[data-act]');if(!t||!allowed())return;
 const act=t.dataset.act;
 if(['done','check','move','add-extra','responsible','priority','note'].includes(act))return;
 const wk=weekStart;
 if(act==='view'){view=t.dataset.view;openId=null;render();return}
 if(act==='prev-week'){weekStart=calendarAddDays(wk,-7);openId=null;render();return}
 if(act==='next-week'){weekStart=calendarAddDays(t.closest('.ow-cr-banner')?thisWeek():wk,7);if(t.closest('.ow-cr-banner'))view='semana';openId=null;render();return}
 if(act==='this-week'){weekStart=thisWeek();openId=null;render();return}
 if(act==='open'){openId=openId===t.dataset.id?null:t.dataset.id;render();return}
 if(act==='notes'){openNotesKey=openNotesKey===t.dataset.key?null:t.dataset.key;render();return}
 if(act==='toggle-day'){
  const key=t.dataset.key,conf=cfg(key),days=new Set(conf.days);
  days.has(t.dataset.day)?days.delete(t.dataset.day):days.add(t.dataset.day);
  data().clients[key]={...(data().clients[key]||{}),priority:conf.priority,days:DAYS.map(d=>d.k).filter(k=>days.has(k))};
  commit();return;
 }
 if(act==='reset-days'){const c=data().clients[t.dataset.key];if(c)delete c.days;commit('Dias voltaram ao padrão da prioridade.');return}
 if(act==='remove-extra'){const w=weekData(wk);delete w.entries[t.dataset.id];openId=null;commit('Contato extra removido.');return}
 if(act==='save-lists'){
  for(const k of ['conversa','acompanhamento']){const lines=String($('owCrList-'+k)?.value||'').split('\n').map(s=>s.trim()).filter(Boolean);data().checklists[k]=lines.length?[...new Set(lines)].slice(0,15):DEFAULT_CHECKLISTS[k].slice()}
  commit('Checklists salvos.');return;
 }
 if(act==='reset-lists'){data().checklists={};commit('Checklists restaurados.');return}
}
function onChange(ev){
 const t=ev.target.closest('[data-act]');if(!t||!allowed())return;
 const act=t.dataset.act,wk=weekStart;
 if(act==='done'){
  const e=entry(wk,t.dataset.id);
  if(t.checked){e.done=true;e.doneAt=new Date().toISOString();e.doneBy=typeof currentUser==='string'?currentUser:''}
  else{delete e.done;delete e.doneAt;delete e.doneBy}
  commit();return;
 }
 if(act==='check'){
  const item=checklist(t.dataset.kind)[Number(t.dataset.i)];if(!item)return;
  const e=entry(wk,t.dataset.id);e.checks=e.checks||{};e.checks[t.dataset.kind]=e.checks[t.dataset.kind]||{};
  if(t.checked)e.checks[t.dataset.kind][item]=true;else delete e.checks[t.dataset.kind][item];
  commit();return;
 }
 if(act==='note'){
  const e=entry(wk,t.dataset.id),text=String(t.value||'').trim().slice(0,4000);
  if((e.note||'')===text)return;
  if(text){e.note=text;e.noteAt=new Date().toISOString();e.noteBy=typeof currentUser==='string'?currentUser:''}else{delete e.note;delete e.noteAt;delete e.noteBy}
  commit('Nota salva.');return;
 }
 if(act==='move'){const e=entry(wk,t.dataset.id),orig=t.dataset.id.split('|')[1];if(t.value===orig&&!e.extra)delete e.day;else e.day=t.value;commit('Contato remanejado.');return}
 if(act==='add-extra'){
  const key=t.value;if(!key)return;
  const id=key+'|x_'+(typeof uid==='function'?uid():Date.now().toString(36));
  weekData(wk,true).entries[id]={extra:true,day:t.dataset.day,type:'Contato extra'};
  openId=id;commit('Contato extra adicionado.');return;
 }
 if(act==='responsible'){data().responsible=t.value;commit(t.value?'Responsável definido.':'');return}
 if(act==='priority'){const key=t.dataset.key;data().clients[key]={...(data().clients[key]||{}),priority:t.value};commit();return}
}

function init(){
 const el=$('contactRoutineContent');if(!el)return;
 el.addEventListener('click',onClick);
 el.addEventListener('change',onChange);
 setInterval(()=>{badge();if(!el.classList.contains('hidden')&&!el.contains(document.activeElement))render()},5*60*1000);
 badge();
}
window.owContactRoutine={render,badge,_test:{contacts,status,cfg,lateCount,data}};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
