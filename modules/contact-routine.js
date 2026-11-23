/* One Way: Contatos — rotina semanal obrigatória de contato com clientes (só Administrador).
   Por dia: cartões dos clientes daquele dia com checklist curto (3 itens).
   Segunda é com todos; os outros dias seguem a prioridade de cada cliente.
   Notas ficam por cliente durante o mês inteiro e podem ser apagadas.
   Alerta no botão do topo: vermelho com checklist do dia incompleto; piscando
   quando um dia já passou sem o checklist 100%.
   Tudo fica em state.contactRoutine (linha app_state "main"). */
(()=>{
'use strict';
const $=id=>document.getElementById(id);
const h=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const DAYS=[
 {k:'seg',label:'Segunda',short:'Seg',type:'Bom dia no grupo e abertura da semana'},
 {k:'ter',label:'Terça',short:'Ter',type:'Pedido de material'},
 {k:'qua',label:'Quarta',short:'Qua',type:'Acompanhamento'},
 {k:'qui',label:'Quinta',short:'Qui',type:'Ideia da semana'},
 {k:'sex',label:'Sexta',short:'Sex',type:'Fechamento da semana'}
];
const PRIORITIES={
 alta:{label:'Alta',days:['ter','qua','qui','sex']},
 media:{label:'Média',days:['ter','qui','sex']},
 normal:{label:'Normal',days:['qua','sex']},
 leve:{label:'Leve',days:['sex']}
};
const PRIORITY_ORDER=['alta','media','normal','leve'];
const PRESETS=[['cuiabaleiloes','alta'],['soldocerrado','alta'],['boreal','media'],['orocasa','media'],['medina','media'],['simonetto','normal'],['florealgodao','normal'],['familia','normal']];
const CHECKS=[{k:'sent',label:'Mensagem enviada'},{k:'replied',label:'Cliente respondeu'},{k:'noted',label:'Combinado anotado'}];
const MONTHS=['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];

let weekStart=null,selDay=null,openId=null,managing=false;

const allowed=()=>typeof isAdmin==='function'&&isAdmin();
const today=()=>calendarLocalISO(new Date());
const thisWeek=()=>calendarMonday(today());
const dayISO=(wk,idx)=>calendarAddDays(wk,idx);
const dm=iso=>{const p=String(iso).split('-');return p[2]+'/'+p[1]};
const monthOf=iso=>String(iso).slice(0,7);
const monthLabel=key=>MONTHS[Number(key.slice(5,7))-1]||key;
const when=iso=>{try{return new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Cuiaba',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(iso))}catch{return ''}};
const who=()=>typeof currentUser==='string'?currentUser:'';
const newId=()=>typeof uid==='function'?uid():'id_'+Date.now().toString(36)+Math.random().toString(36).slice(2,7);

function data(){
 if(!state.contactRoutine||typeof state.contactRoutine!=='object'||Array.isArray(state.contactRoutine))state.contactRoutine={};
 const d=state.contactRoutine;
 if(typeof d.responsible!=='string')d.responsible='';
 for(const k of ['clients','weeks','notes'])if(!d[k]||typeof d[k]!=='object'||Array.isArray(d[k]))d[k]={};
 return d;
}
function allClients(){
 if(typeof cmSelectableRecords!=='function')return [];
 return cmSelectableRecords().map(c=>({key:cmSelectionKey(c.name),name:c.name})).filter(c=>c.key);
}
function defaultPriority(key){if(key==='eag')return 'leve';const p=PRESETS.find(([k])=>key.includes(k));return p?p[1]:'normal'}
function cfg(key){
 const c=data().clients[key]||{};
 const priority=PRIORITIES[c.priority]?c.priority:defaultPriority(key);
 const custom=Array.isArray(c.days);
 const days=custom?c.days.filter(d=>d!=='seg'&&DAYS.some(x=>x.k===d)):PRIORITIES[priority].days;
 // A própria agência não é cliente: fica fora até alguém incluir.
 const active=typeof c.active==='boolean'?c.active:!key.includes('oneway');
 return {priority,days,custom,active};
}
const activeClients=()=>allClients().filter(c=>cfg(c.key).active);
function weekData(wk,create=false){
 const weeks=data().weeks;
 if(!weeks[wk]&&create)weeks[wk]={entries:{}};
 const w=weeks[wk];
 if(w&&(!w.entries||typeof w.entries!=='object'))w.entries={};
 return w||{entries:{}};
}
function entry(wk,id){const w=weekData(wk,true);if(!w.entries[id]||typeof w.entries[id]!=='object')w.entries[id]={};return w.entries[id]}
const checksOf=e=>{const c=e&&e.checks&&typeof e.checks==='object'?e.checks:{};return {sent:!!(c.sent||e?.done),replied:!!c.replied,noted:!!c.noted}};
const checkCount=e=>{const c=checksOf(e);return CHECKS.filter(x=>c[x.k]).length};
const complete=e=>checkCount(e)===CHECKS.length;

function makeContact(id,c,orig,e,conf){
 const known=k=>DAYS.some(d=>d.k===k);
 const day=known(e?.day)?e.day:(known(orig)?orig:'seg');
 return {id,key:c.key,name:c.name,orig,day,idx:DAYS.findIndex(d=>d.k===day),entry:e||{},priority:conf.priority,
  type:e?.extra?'Contato extra':(DAYS.find(d=>d.k===orig)?.type||'Contato'),extra:!!e?.extra};
}
function contacts(wk){
 const active=activeClients(),byKey=new Map(active.map(c=>[c.key,c])),entries=weekData(wk).entries,list=[],seen=new Set();
 for(const c of active){
  const conf=cfg(c.key);
  for(const day of ['seg',...conf.days]){const id=c.key+'|'+day;seen.add(id);list.push(makeContact(id,c,day,entries[id],conf))}
 }
 for(const [id,e] of Object.entries(entries)){
  if(seen.has(id)||!e)continue;
  const key=id.split('|')[0],c=byKey.get(key);
  if(!c||!(e.extra||checkCount(e)))continue;
  list.push(makeContact(id,c,id.split('|')[1],e,cfg(key)));
 }
 return list;
}
function status(c,wk){
 if(complete(c.entry))return 'done';
 const iso=dayISO(wk,c.idx),t=today();
 return iso<t?'late':iso===t?'today':'next';
}
// Nível do alerta do topo: 'blink' (dia passado incompleto), 'red' (hoje incompleto), 'ok' (hoje 100%), '' (nada hoje).
function alertInfo(wk=thisWeek()){
 const list=contacts(wk),late=list.filter(c=>status(c,wk)==='late').length,todayOpen=list.filter(c=>status(c,wk)==='today').length;
 const todayIdx=DAYS.findIndex((d,i)=>dayISO(wk,i)===today()),todayTotal=todayIdx<0?0:list.filter(c=>c.idx===todayIdx).length;
 return {late,todayOpen,level:late?'blink':todayOpen?'red':todayTotal?'ok':''};
}
function notes(month,key){const m=data().notes[month];return m&&Array.isArray(m[key])?m[key]:[]}

async function commit(message){
 if(!allowed())return;
 render();badge();
 const ok=await saveState();
 if(ok&&message&&typeof toast==='function')toast(message,null,null,'success');
}

/* ---------------- tela ---------------- */
function defaultDay(wk){
 if(wk!==thisWeek())return 'seg';
 const idx=DAYS.findIndex((d,i)=>dayISO(wk,i)===today());
 return idx>=0?DAYS[idx].k:(today()>dayISO(wk,4)?'sex':'seg');
}
function top(wk,list){
 const d=data(),total=list.length,doneN=list.filter(c=>complete(c.entry)).length,pct=total?Math.round(doneN/total*100):0;
 const names=typeof collaboratorList==='function'?collaboratorList().map(c=>String(c.name).trim()):[];
 if(d.responsible&&!names.includes(d.responsible))names.push(d.responsible);
 const current=wk===thisWeek();
 return `<div class="ow-cr-top">
  <div class="ow-cr-who ${d.responsible?'':'missing'}">
   <span class="ow-cr-kicker">Responsável pela rotina</span>
   <select data-act="responsible" aria-label="Responsável pela rotina"><option value="">${d.responsible?'Sem responsável':'! Escolha o responsável'}</option>${names.map(n=>`<option value="${h(n)}" ${n===d.responsible?'selected':''}>${h(n)}</option>`).join('')}</select>
  </div>
  <div class="ow-cr-weeknav">
   <button type="button" class="ow-cr-round" data-act="prev-week" aria-label="Semana anterior">‹</button>
   <div><span class="ow-cr-kicker">${current?'Esta semana':'Semana'}</span><strong>${dm(wk)} a ${dm(dayISO(wk,4))}</strong></div>
   <button type="button" class="ow-cr-round" data-act="next-week" aria-label="Próxima semana">›</button>
   ${current?'':'<button type="button" class="ow-cr-text" data-act="this-week">Hoje</button>'}
  </div>
  <div class="ow-cr-score">
   <div class="ow-cr-ring" style="--p:${pct}"><span>${pct}%</span></div>
   <div><strong>${doneN} de ${total}</strong><span>checklists completos</span></div>
  </div>
  <button type="button" class="ow-cr-manage" data-act="manage">Clientes da rotina</button>
 </div>`;
}
function strip(wk,list){
 return `<div class="ow-cr-strip" role="tablist">${DAYS.map((d,i)=>{
  const items=list.filter(c=>c.idx===i),doneN=items.filter(c=>complete(c.entry)).length,iso=dayISO(wk,i);
  const st=!items.length?'empty':doneN===items.length?'done':iso<today()?'late':iso===today()?'today':'next';
  return `<button type="button" role="tab" aria-selected="${selDay===d.k}" class="ow-cr-daybtn st-${st} ${selDay===d.k?'active':''}" data-act="day" data-day="${d.k}">
   <span class="ow-cr-daybtn-top"><b>${d.short}</b><small>${dm(iso)}</small>${st==='late'?'<i class="ow-cr-dot blink">!</i>':st==='today'?'<i class="ow-cr-dot">!</i>':st==='done'?'<i class="ow-cr-dot ok">✓</i>':''}</span>
   <span class="ow-cr-daybtn-count">${doneN}/${items.length}</span>
   <span class="ow-cr-daybtn-bar"><i style="width:${items.length?Math.round(doneN/items.length*100):0}%"></i></span>
  </button>`}).join('')}</div>`;
}
function tile(c,wk){
 const st=status(c,wk),ck=checksOf(c.entry),n=checkCount(c.entry),month=monthOf(dayISO(wk,c.idx)),ns=notes(month,c.key),last=ns[0];
 const badgeTxt=st==='done'?'✓ Completo':st==='late'?'! Atrasado':st==='today'?'Pendente hoje':'Agendado';
 return `<article class="ow-cr-tile st-${st} p-${c.priority}">
  <header>
   <div class="ow-cr-tile-name"><strong>${h(c.name)}</strong><span>${h(PRIORITIES[c.priority].label)}${c.day!==c.orig&&!c.extra?' · remanejado':''}${c.extra?' · extra':''}</span></div>
   <span class="ow-cr-state">${badgeTxt}</span>
  </header>
  <div class="ow-cr-checks">${CHECKS.map(x=>`<button type="button" class="ow-cr-chk ${ck[x.k]?'on':''}" data-act="check" data-id="${h(c.id)}" data-k="${x.k}" aria-pressed="${ck[x.k]}"><i></i>${x.label}</button>`).join('')}</div>
  <div class="ow-cr-tile-bar"><i style="width:${Math.round(n/CHECKS.length*100)}%"></i></div>
  <button type="button" class="ow-cr-tile-notes" data-act="open" data-id="${h(c.id)}">
   ${last?`<span class="ow-cr-note-preview">“${h(last.text.length>70?last.text.slice(0,70)+'…':last.text)}”</span>`:'<span class="ow-cr-note-empty">+ Anotar algo deste cliente</span>'}
   <small>${ns.length?`${ns.length} nota${ns.length===1?'':'s'} em ${monthLabel(month)}`:'Notas do mês'} ›</small>
  </button>
 </article>`;
}
function dayView(wk,list){
 const i=DAYS.findIndex(d=>d.k===selDay),d=DAYS[i],items=list.filter(c=>c.idx===i);
 const order={late:0,today:1,next:2,done:3};
 items.sort((a,b)=>order[status(a,wk)]-order[status(b,wk)]||PRIORITY_ORDER.indexOf(a.priority)-PRIORITY_ORDER.indexOf(b.priority)||a.name.localeCompare(b.name,'pt-BR',{sensitivity:'base'}));
 const inDay=new Set(items.map(c=>c.key)),others=activeClients().filter(c=>!inDay.has(c.key));
 return `<div class="ow-cr-dayhead">
   <div><h3>${d.label}, ${dm(dayISO(wk,i))}</h3><p>${h(d.type)}${i===0?' · fale com todos os clientes':''}</p></div>
   ${others.length?`<select class="ow-cr-extra" data-act="add-extra" data-day="${d.k}" aria-label="Adicionar contato extra"><option value="">+ Incluir cliente neste dia</option>${others.map(c=>`<option value="${h(c.key)}">${h(c.name)}</option>`).join('')}</select>`:''}
  </div>
  ${items.length?`<div class="ow-cr-grid">${items.map(c=>tile(c,wk)).join('')}</div>`:'<div class="ow-cr-empty">Nenhum contato neste dia.</div>'}`;
}
function drawer(wk,list){
 const c=list.find(x=>x.id===openId);if(!c)return '';
 const ck=checksOf(c.entry),month=monthOf(dayISO(wk,c.idx)),ns=notes(month,c.key);
 return `<div class="ow-cr-overlay" data-act="close"></div>
 <aside class="ow-cr-drawer" role="dialog" aria-label="${h(c.name)}">
  <header><div><span class="ow-cr-kicker">${h(DAYS[c.idx].label)}, ${dm(dayISO(wk,c.idx))} · ${h(c.type)}</span><h3>${h(c.name)}</h3></div><button type="button" class="ow-cr-round" data-act="close" aria-label="Fechar">×</button></header>
  <section><h4>Checklist do contato</h4><div class="ow-cr-checks big">${CHECKS.map(x=>`<button type="button" class="ow-cr-chk ${ck[x.k]?'on':''}" data-act="check" data-id="${h(c.id)}" data-k="${x.k}" aria-pressed="${ck[x.k]}"><i></i>${x.label}</button>`).join('')}</div></section>
  <section><h4>Notas de ${monthLabel(month)}</h4>
   <div class="ow-cr-noteform"><textarea id="owCrNoteText" rows="3" placeholder="Ex.: pediu as fotos do produto novo até quinta"></textarea><button type="button" class="ow-cr-primary" data-act="add-note" data-key="${h(c.key)}" data-month="${month}">Salvar nota</button></div>
   <div class="ow-cr-notelist">${ns.length?ns.map(n=>`<div class="ow-cr-note"><p>${h(n.text)}</p><small>${h(when(n.at))}${n.by?' · '+h(n.by):''}</small><button type="button" class="ow-cr-del" data-act="del-note" data-key="${h(c.key)}" data-month="${month}" data-note="${h(n.id)}" aria-label="Apagar nota">×</button></div>`).join(''):'<p class="ow-cr-muted">Nenhuma nota neste mês. O que for anotado aqui aparece em todos os dias deste cliente até o fim do mês.</p>'}</div>
  </section>
  <section class="ow-cr-drawer-foot">
   <label>Remanejar este contato para <select data-act="move" data-id="${h(c.id)}">${DAYS.map((d,i)=>`<option value="${d.k}" ${d.k===c.day?'selected':''}>${d.label} ${dm(dayISO(wk,i))}</option>`).join('')}</select></label>
   ${c.extra?`<button type="button" class="ow-cr-text danger" data-act="remove-extra" data-id="${h(c.id)}">Tirar este contato extra</button>`:''}
  </section>
 </aside>`;
}
function manager(){
 if(!managing)return '';
 const rows=allClients().map(c=>({...c,conf:cfg(c.key)})).sort((a,b)=>(b.conf.active-a.conf.active)||PRIORITY_ORDER.indexOf(a.conf.priority)-PRIORITY_ORDER.indexOf(b.conf.priority)||a.name.localeCompare(b.name,'pt-BR',{sensitivity:'base'}));
 return `<div class="ow-cr-overlay" data-act="close"></div>
 <div class="ow-cr-modal" role="dialog" aria-label="Clientes da rotina">
  <header><div><h3>Clientes da rotina</h3><p>Um clique tira ou coloca o cliente. Segunda é com todos; os outros dias seguem a prioridade.</p></div><button type="button" class="ow-cr-round" data-act="close" aria-label="Fechar">×</button></header>
  <div class="ow-cr-mlist">${rows.map(c=>`<div class="ow-cr-mrow ${c.conf.active?'':'off'}">
   <button type="button" class="ow-cr-switch ${c.conf.active?'on':''}" data-act="toggle-client" data-key="${h(c.key)}" aria-pressed="${c.conf.active}" title="${c.conf.active?'Tirar da rotina':'Colocar na rotina'}"><i></i></button>
   <strong>${h(c.name)}</strong>
   ${c.conf.active?`<div class="ow-cr-seg">${PRIORITY_ORDER.map(p=>`<button type="button" class="p-${p} ${c.conf.priority===p?'on':''}" data-act="priority" data-key="${h(c.key)}" data-p="${p}">${PRIORITIES[p].label}</button>`).join('')}</div>
   <div class="ow-cr-days"><span class="on fixed">Seg</span>${DAYS.slice(1).map(d=>`<button type="button" class="${c.conf.days.includes(d.k)?'on':''}" data-act="toggle-day" data-key="${h(c.key)}" data-day="${d.k}">${d.short}</button>`).join('')}</div>`:'<span class="ow-cr-muted">Fora da rotina</span>'}
  </div>`).join('')||'<p class="ow-cr-muted">Nenhum cliente cadastrado.</p>'}</div>
 </div>`;
}
function render(){
 const el=$('contactRoutineContent');if(!el)return;
 if(!allowed()){el.innerHTML='';document.body.classList.remove('ow-cr-locked');return}
 // Guarda o rascunho da nota (e o foco) quando a tela é redesenhada por outra atualização.
 const box=$('owCrNoteText'),draft=box?box.value:'',focused=box&&document.activeElement===box,caret=focused?box.selectionStart:0,draftFor=openId;
 if(!weekStart)weekStart=thisWeek();
 if(!selDay)selDay=defaultDay(weekStart);
 const wk=weekStart,list=contacts(wk),wd=new Date(today()+'T12:00:00').getDay(),current=wk===thisWeek();
 const banner=current&&wd===4?'<div class="ow-cr-banner"><strong>Quinta é dia de remanejar.</strong><span>Confira a próxima semana e mova o que precisar.</span><button type="button" class="ow-cr-text" data-act="plan-next">Abrir próxima semana ›</button></div>':'';
 el.innerHTML=`<div class="ow-cr">${top(wk,list)}${banner}${strip(wk,list)}${activeClients().length?dayView(wk,list):'<div class="ow-cr-empty">Nenhum cliente na rotina. Use “Clientes da rotina” para incluir.</div>'}${drawer(wk,list)}${manager()}</div>`;
 const nb=$('owCrNoteText');if(nb&&draft&&draftFor===openId){nb.value=draft;if(focused){nb.focus({preventScroll:true});try{nb.setSelectionRange(caret,caret)}catch{}}}
 document.body.classList.toggle('ow-cr-locked',!el.classList.contains('hidden')&&(!!(openId&&list.some(x=>x.id===openId))||managing));
}

function badge(){
 const btn=$('contactRoutineTab'),b=$('contactRoutineBadge');if(!btn||!b)return;
 const info=allowed()?alertInfo():{level:'',late:0,todayOpen:0};
 btn.classList.toggle('ow-cr-alert',info.level==='red'||info.level==='blink');
 btn.classList.toggle('ow-cr-blink',info.level==='blink');
 btn.classList.toggle('ow-cr-ok',info.level==='ok');
 b.textContent=info.level==='ok'?'✓':'!';
 b.classList.toggle('hidden',!info.level);
 const open=info.late+info.todayOpen;
 btn.title=info.level==='blink'?`Contatos atrasados: ${info.late} checklist${info.late===1?'':'s'} de dias anteriores incompleto${info.late===1?'':'s'}`:info.level==='red'?`Contatos de hoje: ${open} checklist${open===1?'':'s'} pendente${open===1?'':'s'}`:info.level==='ok'?'Contatos de hoje completos':'Contatos com clientes';
 if(document.getElementById('contactRoutineContent')?.classList.contains('hidden')){document.body.classList.remove('ow-cr-locked');openId=null;managing=false}
}

/* ---------------- ações ---------------- */
function onClick(ev){
 const t=ev.target.closest('[data-act]');if(!t||!allowed())return;
 const act=t.dataset.act,wk=weekStart;
 if(['responsible','move','add-extra'].includes(act))return;
 if(act==='close'){openId=null;managing=false;render();return}
 if(act==='day'){selDay=t.dataset.day;render();return}
 if(act==='prev-week'||act==='next-week'){weekStart=calendarAddDays(wk,act==='prev-week'?-7:7);selDay=defaultDay(weekStart);openId=null;render();return}
 if(act==='this-week'){weekStart=thisWeek();selDay=defaultDay(weekStart);render();return}
 if(act==='plan-next'){weekStart=calendarAddDays(thisWeek(),7);selDay='seg';render();return}
 if(act==='open'){openId=t.dataset.id;render();return}
 if(act==='manage'){managing=true;render();return}
 if(act==='check'){
  const e=entry(wk,t.dataset.id),k=t.dataset.k,c=checksOf(e);
  e.checks={...c,[k]:!c[k]};delete e.done;
  if(complete(e)){e.completedAt=new Date().toISOString();e.completedBy=who()}else{delete e.completedAt;delete e.completedBy}
  commit();return;
 }
 if(act==='add-note'){
  const box=$('owCrNoteText'),text=String(box?.value||'').trim().slice(0,2000);if(!text){box?.focus();return}
  const all=data().notes,m=all[t.dataset.month]=all[t.dataset.month]||{};
  m[t.dataset.key]=[{id:newId(),text,at:new Date().toISOString(),by:who()},...(Array.isArray(m[t.dataset.key])?m[t.dataset.key]:[])];
  box.value='';box.blur();commit('Nota salva.');return;
 }
 if(act==='del-note'){
  const m=data().notes[t.dataset.month];if(!m||!Array.isArray(m[t.dataset.key]))return;
  m[t.dataset.key]=m[t.dataset.key].filter(n=>n.id!==t.dataset.note);
  if(!m[t.dataset.key].length)delete m[t.dataset.key];
  commit('Nota apagada.');return;
 }
 if(act==='remove-extra'){delete weekData(wk).entries[t.dataset.id];openId=null;commit('Contato extra retirado.');return}
 if(act==='toggle-client'){
  const key=t.dataset.key,conf=cfg(key);data().clients[key]={...(data().clients[key]||{}),active:!conf.active};
  commit(conf.active?'Cliente fora da rotina.':'Cliente na rotina.');return;
 }
 if(act==='priority'){const key=t.dataset.key,c={...(data().clients[key]||{}),priority:t.dataset.p};delete c.days;data().clients[key]=c;commit();return}
 if(act==='toggle-day'){
  const key=t.dataset.key,conf=cfg(key),days=new Set(conf.days);
  days.has(t.dataset.day)?days.delete(t.dataset.day):days.add(t.dataset.day);
  data().clients[key]={...(data().clients[key]||{}),priority:conf.priority,days:DAYS.map(d=>d.k).filter(k=>days.has(k))};
  commit();return;
 }
}
function onChange(ev){
 const t=ev.target.closest('[data-act]');if(!t||!allowed())return;
 const act=t.dataset.act,wk=weekStart;
 if(act==='responsible'){data().responsible=t.value;commit(t.value?'Responsável definido.':'');return}
 if(act==='move'){const e=entry(wk,t.dataset.id),orig=t.dataset.id.split('|')[1];if(t.value===orig&&!e.extra)delete e.day;else e.day=t.value;selDay=t.value;openId=null;commit('Contato remanejado.');return}
 if(act==='add-extra'){
  const key=t.value;if(!key)return;
  weekData(wk,true).entries[key+'|x_'+newId()]={extra:true,day:t.dataset.day};
  commit('Cliente incluído neste dia.');return;
 }
}

function init(){
 const el=$('contactRoutineContent');if(!el)return;
 el.addEventListener('click',onClick);
 el.addEventListener('change',onChange);
 // Esc fecha o painel/janela sem sair da área (o Esc global do sistema volta para o início).
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&(openId||managing)&&!el.classList.contains('hidden')){e.preventDefault();e.stopImmediatePropagation();openId=null;managing=false;render()}},true);
 setInterval(()=>{badge();if(!el.classList.contains('hidden'))render()},5*60*1000);
 badge();
}
window.owContactRoutine={render,badge,_test:{contacts,status,cfg,alertInfo,data,complete,notes,activeClients}};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
