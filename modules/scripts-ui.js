/* One Way: editor de roteiros e PDF. Rascunhos locais, sem armazenar PDFs. */
(()=>{
'use strict';
const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=()=>crypto.randomUUID(),scene=()=>({text:'',visual:'',seconds:''}),video=()=>({title:'',duration:'',mode:'scenes',text:'',scenes:[scene()]}),blank=()=>({id:uid(),client:'',title:'',pdfFontScale:100,videos:[video()]});
let doc=blank(),dirty=false,busy=false;
const fontScale=value=>{const n=Number(value);return value==null||value===''||!Number.isFinite(n)?100:Math.min(115,Math.max(70,Math.round(n/5)*5));};
let liveTimer=null,liveRevision=0,cachedPages=[],cachedKey='';
const pdfKey=data=>JSON.stringify({client:data.client,pdfFontScale:fontScale(data.pdfFontScale),videos:data.videos});
const pdfIssue=data=>!data.client.trim()?'Informe o cliente para visualizar.':data.videos.some(v=>!v.title.trim())?'Informe o título de cada vídeo para visualizar.':data.videos.some(v=>v.mode==='full'?!v.text.trim():!v.scenes.some(sc=>sc.text.trim()||sc.visual.trim()))?'Preencha o texto do roteiro para visualizar.':'';

const key=()=>`oneway-scripts-v1:${typeof currentUser==='string'?currentUser:'admin'}`;
const allowed=()=>typeof isAdmin==='function'&&isAdmin();
function status(t){if($('rsStatus'))$('rsStatus').textContent=t;}

let cloudDocs=[],cloudLoaded=false,cloudLoading=false,cloudOwner='';
const cloudReady=()=>allowed()&&typeof supabaseClient!=='undefined'&&!!supabaseClient&&typeof adminAuthReady==='function'&&adminAuthReady();
const saved=()=>cloudDocs;
function legacyDocs(){try{const v=JSON.parse(localStorage.getItem(key())||'[]');return Array.isArray(v)?v.filter(x=>x&&Array.isArray(x.videos)):[];}catch{return []}}
function checkCloudOwner(){const owner=typeof supabaseAdminEmail!=='undefined'?String(supabaseAdminEmail||''):'';if(owner!==cloudOwner){cloudOwner=owner;cloudDocs=[];cloudLoaded=false;cloudLoading=false;}}
function updateCloudList(){
 const select=$('rsDrafts');if(!select)return;
 const chosen=select.value;select.innerHTML='<option value="">Selecione um roteiro salvo</option>';
 for(const item of cloudDocs)select.add(new Option(`${item.client} · ${item.videos?.[0]?.title||item.title||'Sem título'} · ${item.videos?.length||0} vídeo(s)`,item.id));
 if(cloudDocs.some(d=>d.id===chosen))select.value=chosen;
 if($('rsMigrate'))$('rsMigrate').hidden=legacyDocs().length===0;
 if($('rsCloudCount'))$('rsCloudCount').textContent=cloudLoaded?`${cloudDocs.length} roteiro(s) na nuvem`:'Carregando roteiros da nuvem…';
}
async function refreshCloud(){
 checkCloudOwner();
 if(!cloudReady())throw Error('Faça login como administrador autenticado no Supabase.');
 if(cloudLoading)return;
 cloudLoading=true;
 try{
  const {data,error}=await supabaseClient.from('video_scripts').select('id,client,document,updated_at').order('updated_at',{ascending:false}).limit(500);
  if(error)throw error;
  cloudDocs=(data||[]).map(r=>({...r.document,id:r.id,client:r.client,updatedAt:r.updated_at}));
  cloudLoaded=true;updateCloudList();
 }finally{cloudLoading=false;}
}
async function saveDocument(){
 if(!doc.client.trim())throw Error('Escolha o cliente para salvar o roteiro.');
 if(!cloudReady())throw Error('Entre como administrador para salvar na nuvem.');
 const stamp=new Date().toISOString(),item={...structuredClone(doc),updatedAt:stamp};
 const {error}=await supabaseClient.from('video_scripts').upsert({id:doc.id,client:doc.client.trim(),document:item,updated_at:stamp},{onConflict:'id'});
 if(error)throw Error('Erro ao salvar no Supabase: '+error.message);
 cloudDocs=[item,...cloudDocs.filter(x=>x.id!==item.id)];cloudLoaded=true;dirty=false;
 return item;
}
async function migrateLegacy(){
 if(!cloudReady())throw Error('É necessário autenticar como administrador.');
 if(!cloudLoaded)await refreshCloud();
 const old=legacyDocs(),existing=new Set(cloudDocs.map(x=>x.id)),remaining=[];let count=0;
 for(const source of old){
  if(existing.has(source.id)){remaining.push(source);continue;}
  try{
   const docToMigrate=validate(source);docToMigrate.id=source.id;
   if(!/^[a-f0-9-]{36}$/i.test(docToMigrate.id)||!docToMigrate.client.trim()){remaining.push(source);continue;}
   const stamp=source.updatedAt||new Date().toISOString(),item={...docToMigrate,updatedAt:stamp};
   const {error}=await supabaseClient.from('video_scripts').upsert({id:item.id,client:item.client.trim(),document:item,updated_at:stamp},{onConflict:'id'});
   if(error)throw error;existing.add(item.id);count++;
  }catch(error){console.warn('Roteiro mantido no navegador após falha de migração',error);remaining.push(source);}
 }
 if(remaining.length)localStorage.setItem(key(),JSON.stringify(remaining));else localStorage.removeItem(key());
 await refreshCloud();updateCloudList();
 status(`${count} roteiro(s) migrado(s) para a nuvem.${remaining.length?' '+remaining.length+' registro(s) locais preservados.':''}`);
}

function seconds(v){if(v.duration!=='')return Math.max(0,Number(v.duration)||0);const parts=v.mode==='full'?[{text:v.text}]:v.scenes;return parts.reduce((n,s)=>n+(s.seconds!==''&&s.seconds!=null?Number(s.seconds)||0:Math.ceil((s.text.trim().match(/\S+/g)||[]).length*60/138)),0);}
function duration(v){const n=seconds(v);return n?`${Math.floor(n/60)?Math.floor(n/60)+'min ':''}${n%60}s`:'A definir';}
function field(label,name,value,type='text',extra=''){return `<label>${label}<input data-field="${name}" type="${type}" ${type==='text'?'maxlength="180"':''} value="${esc(value)}" ${extra}></label>`;}
function buttons(kind,i,last){return `<button data-act="${kind}-up" ${i===0?'disabled':''} aria-label="Mover ${kind==='v'?'vídeo':'cena'} para cima">↑</button><button data-act="${kind}-down" ${last?'disabled':''} aria-label="Mover ${kind==='v'?'vídeo':'cena'} para baixo">↓</button><button data-act="${kind}-copy">Duplicar</button><button class="rs-danger" data-act="${kind}-delete">Excluir</button>`;}
function render(){if(!allowed())return;const root=$('scriptsContent');if(!root)return;
root.innerHTML=`<div class="rs-panel"><div class="rs-bar rs-head"><div><span class="rs-pill">PRODUÇÃO AUDIOVISUAL</span><h2>Roteiros para gravar.</h2></div><div class="rs-bar"><button data-act="new">Novo roteiro</button><button data-act="save">Salvar roteiro</button><button data-act="preview">Visualizar PDF</button><button class="rs-primary" data-act="pdf">Baixar PDF</button></div></div><div class="rs-meta rs-client-line"><div class="rs-client-picker">${field('Cliente','client',doc.client,'text','id="rsClientInput" autocomplete="off" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="rsClientOptions" placeholder="Busque ou digite o cliente"')}<div id="rsClientOptions" class="rs-client-options" role="listbox" aria-label="Clientes" hidden></div></div></div><p class="rs-muted">Escreva ou cole seu roteiro. Use texto completo ou organize cena por cena. A duração automática considera aproximadamente 138 palavras por minuto; você pode definir o tempo manualmente.</p><div class="rs-drafts"><label>Roteiros salvos na nuvem<select id="rsDrafts"><option value="">Carregando roteiros…</option></select></label><p class="rs-muted" id="rsCloudCount">Roteiros compartilhados entre os administradores.</p><div class="rs-bar" style="margin-top:10px"><button data-act="load">Abrir roteiro</button><button data-act="delete-draft">Excluir roteiro</button><button data-act="refresh-cloud">Atualizar lista</button><button id="rsMigrate" data-act="migrate" hidden>Migrar roteiros antigos deste navegador</button></div><p id="rsStatus" role="status" aria-live="polite">${dirty?'Alterações ainda não salvas.':'Pronto para criar o PDF. Salve na nuvem para continuar em outro computador.'}</p></div></div><section class="rs-print-panel" aria-label="Ajustes e visualização do PDF"><div class="rs-print-header"><div><span class="rs-pill">PRÉVIA DE IMPRESSÃO</span><h3>Tamanho do texto no PDF</h3><p>Reduza para aproveitar melhor a página A4. Veja o resultado e a quantidade de páginas antes de baixar.</p></div><div class="rs-print-count" id="rsPageCount" aria-live="polite">Preparando prévia…</div></div><div class="rs-print-settings"><label class="rs-font-slider-label" for="rsFontScale">Texto do roteiro <output id="rsFontScaleValue" for="rsFontScale">100%</output><input id="rsFontScale" data-preview-scale="1" type="range" min="70" max="115" step="5" value="100" aria-label="Tamanho do texto no PDF"><span class="rs-scale-ends"><span>Menor · 70%</span><span>Original · 100%</span><span>Maior · 115%</span></span></label><button type="button" data-act="reset-font">Restaurar 100%</button></div><div class="rs-live-preview" id="rsLivePreviewPages" aria-label="Prévia das páginas do PDF"><span class="rs-live-placeholder">Preencha o roteiro para visualizar as páginas aqui.</span></div></section><div class="rs-video-library"><div><span class="rs-pill">ROTEIRO DE GRAVAÇÃO</span><h3>Vídeos deste roteiro <span class="rs-video-count">(${doc.videos.length})</span></h3><p>Adicione os vídeos e salve tudo no mesmo roteiro do cliente. Não é necessário criar um documento por vídeo.</p></div><button class="rs-primary" data-act="add-video">+ Adicionar vídeo</button></div><div id="rsVideos">${doc.videos.map((v,i)=>`<article class="rs-video" data-video="${i}"><div class="rs-bar rs-head"><h3>Vídeo ${String(i+1).padStart(2,'0')}</h3><div class="rs-bar rs-video-controls"><button data-act="save-video" aria-label="Salvar vídeo ${i+1} neste roteiro">Salvar vídeo ${String(i+1).padStart(2,'0')}</button>${buttons('v',i,i===doc.videos.length-1)}</div></div><div class="rs-meta">${field('Título do vídeo','title',v.title)}${field('Duração prevista (segundos) · opcional','duration',v.duration,'number','min="0" step="1" placeholder="Estimar pelo roteiro"')}</div><div class="rs-meta"><label>Formato do roteiro<select data-field="mode"><option value="scenes" ${v.mode==='scenes'?'selected':''}>Cena por cena</option><option value="full" ${v.mode==='full'?'selected':''}>Texto completo</option></select></label><div class="rs-muted" style="align-self:end" data-duration="${i}">Duração estimada: ${duration(v)}</div></div>${v.mode==='full'?`<label>Roteiro completo<textarea data-field="text" rows="10" placeholder="Cole ou escreva aqui o texto completo do vídeo…">${esc(v.text)}</textarea></label>`:v.scenes.map((s,j)=>`<section class="rs-scene" data-scene="${j}"><div class="rs-bar rs-head"><strong>Cena ${j+1}</strong><div class="rs-bar">${buttons('s',j,j===v.scenes.length-1)}</div></div><div class="rs-meta"><label>Texto / fala<textarea data-field="text" placeholder="O que será falado nesta cena…">${esc(s.text)}</textarea></label><label>Imagem / ação / orientação de gravação<textarea data-field="visual" placeholder="Enquadramento, ação, imagens de apoio…">${esc(s.visual)}</textarea></label></div>${field('Duração da cena (segundos) · opcional','seconds',s.seconds,'number','min="0" step="1"')}</section>`).join('')+'<button style="margin-top:18px" data-act="add-scene">+ Adicionar cena</button>'}</article>`).join('')}</div><div class="rs-videos-footer"><button class="rs-primary" data-act="add-video">+ Adicionar próximo vídeo</button><button data-act="save">Salvar roteiro completo</button></div>`;
checkCloudOwner();updateCloudList();if(!cloudLoaded&&!cloudLoading)void refreshCloud().catch(e=>status('Nuvem indisponível: '+e.message));
root.oninput=e=>{if(e.target.dataset.previewScale){setFontScale(e.target.value);return;}const f=e.target.dataset.field;if(!f)return;const vi=e.target.closest('[data-video]'),si=e.target.closest('[data-scene]');let target=vi?doc.videos[Number(vi.dataset.video)]:doc;if(si)target=target.scenes[Number(si.dataset.scene)];target[f]=e.target.value;dirty=true;status('Alterações ainda não salvas.');if(vi){root.querySelector(`[data-duration="${vi.dataset.video}"]`).textContent='Duração estimada: '+duration(doc.videos[Number(vi.dataset.video)]);}if(f==='mode')render();else scheduleLivePreview(650);};
root.onclick=async e=>{const b=e.target.closest('[data-act]');if(!b||busy)return;try{await action(b.dataset.act,b);}catch(error){status(error.message||'Não foi possível concluir.');}};
bindClientPicker();syncFontControls();scheduleLivePreview(350);
}

/* A mesma composição alimenta prévia pequena, modal e PDF final. */
function syncFontControls(){
 const n=fontScale(doc.pdfFontScale);
 for(const id of ['rsFontScale','rsModalFontScale']){const el=$(id);if(el)el.value=String(n);}
 for(const id of ['rsFontScaleValue','rsModalFontScaleValue']){const el=$(id);if(el)el.textContent=n+'%';}
}
function setFontScale(value){
 const n=fontScale(value);if(n===fontScale(doc.pdfFontScale))return;
 doc.pdfFontScale=n;dirty=true;syncFontControls();
 status('Texto: '+n+'%. Salve o roteiro para guardar o ajuste na nuvem.');
 scheduleLivePreview(170);
}
function showPageImages(parent,pages){
 if(!parent)return;
 parent.replaceChildren();
 pages.forEach((src,index)=>{
  const img=new Image();img.src=src;
  img.alt='Página '+(index+1)+' de '+pages.length+' do roteiro';
  img.loading='lazy';img.decoding='async';parent.appendChild(img);
 });
}
function updatePreviewUI(pages){
 const message=pages.length+' página'+(pages.length===1?'':'s')+' · texto '+fontScale(doc.pdfFontScale)+'%';
 if($('rsPageCount'))$('rsPageCount').textContent=message;
 if($('rsModalCount'))$('rsModalCount').textContent=message;
 showPageImages($('rsLivePreviewPages'),pages);
 showPageImages($('rsModalPages'),pages);
 const downloadButton=$('rsModalDownload');if(downloadButton)downloadButton.disabled=false;
}
function scheduleLivePreview(delay=350){
 clearTimeout(liveTimer);
 const revision=++liveRevision,holder=$('rsLivePreviewPages'),info=$('rsPageCount');
 if(!holder)return;
 const issue=pdfIssue(doc);
 if(issue){
  if(info)info.textContent='Prévia indisponível';
  holder.textContent=issue;
  if($('rsModalCount'))$('rsModalCount').textContent=issue;
  if($('rsModalDownload'))$('rsModalDownload').disabled=true;
  return;
 }
 if(info)info.textContent='Atualizando prévia…';
 if($('rsModalCount'))$('rsModalCount').textContent='Atualizando prévia…';
 if($('rsModalDownload'))$('rsModalDownload').disabled=true;
 const snapshot=structuredClone(doc),key=pdfKey(snapshot);
 liveTimer=setTimeout(async()=>{
  if(revision!==liveRevision)return;
  try{
   const pages=key===cachedKey?cachedPages:await pagesFor(snapshot);
   if(revision!==liveRevision||pdfKey(doc)!==key||!$('rsLivePreviewPages'))return;
   cachedKey=key;cachedPages=pages;updatePreviewUI(pages);
  }catch(error){
   if(revision!==liveRevision)return;
   if(info)info.textContent='Erro na prévia';
   holder.textContent='Não foi possível gerar a prévia: '+(error.message||error);
  }
 },delay);
}
function openPDFPreview(trigger,pages){
 const earlier=$('rsPreview');if(earlier)earlier.remove();
 const overlay=document.createElement('div');
 overlay.id='rsPreview';overlay.setAttribute('role','dialog');
 overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-label','Prévia do PDF e ajuste do texto');
 overlay.innerHTML='<header class="rs-modal-header"><div class="rs-modal-heading"><strong>Prévia do PDF</strong><span id="rsModalCount"></span></div><div class="rs-modal-tools"><label>Texto <input id="rsModalFontScale" data-preview-scale="1" type="range" min="70" max="115" step="5" aria-label="Tamanho do texto no PDF"><output id="rsModalFontScaleValue">100%</output></label><button id="rsModalDownload" type="button">Baixar PDF</button><button id="rsModalClose" type="button">Fechar prévia</button></div></header><div id="rsModalPages" class="rs-modal-pages"></div>';
 const close=()=>{overlay.remove();document.removeEventListener('keydown',onKey);if(trigger.isConnected)trigger.focus();};
 const onKey=e=>{if(e.key==='Escape')close();};
 overlay.querySelector('#rsModalClose').onclick=close;
 overlay.querySelector('#rsModalDownload').onclick=()=>{
  if(pdfKey(doc)!==cachedKey||!cachedPages.length)return;
  download(scriptPDFBlob(cachedPages),filename()+'.pdf');
  status('PDF baixado: '+cachedPages.length+' página(s), texto '+fontScale(doc.pdfFontScale)+'%.');
 };
 overlay.oninput=e=>{if(e.target.dataset.previewScale)setFontScale(e.target.value);};
 document.body.appendChild(overlay);
 document.addEventListener('keydown',onKey);
 syncFontControls();updatePreviewUI(pages);
 overlay.querySelector('#rsModalClose').focus();
}

function bindClientPicker(){
 const input=$('rsClientInput'),list=$('rsClientOptions'),picker=input.closest('.rs-client-picker');
 const normalize=n=>String(n||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').replace(/[^a-z0-9]+/g,' ').trim();
 const names=typeof cmAllNames==='function'?cmAllNames():(typeof state!=='undefined'?state.clients||[]:[]).filter(c=>!c.deletedAt&&!c.mergedInto).map(c=>c.name);
 const unique=new Map();for(const raw of names){const name=String(raw||'').trim(),key=normalize(name);if(key&&!unique.has(key)&&!(typeof cmIsArchived==='function'&&cmIsArchived(name)))unique.set(key,name);}
 const options=[...unique.values()].sort((a,b)=>a.localeCompare(b,'pt-BR',{sensitivity:'base'}));let matches=[],active=-1;
 function close(){list.hidden=true;input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');active=-1;}
 function select(index){if(!matches[index])return;input.value=matches[index];input.dispatchEvent(new Event('input',{bubbles:true}));close();input.focus();close();}
 function show(){matches=options.filter(n=>normalize(n).includes(normalize(input.value)));active=-1;list.innerHTML=matches.length?matches.map((n,i)=>`<button type="button" role="option" aria-selected="false" id="rsClientOption${i}" data-client-index="${i}">${esc(n)}</button>`).join(''):'<div class="rs-client-empty">Nenhum cliente encontrado. Você pode usar o nome digitado.</div>';list.hidden=false;input.setAttribute('aria-expanded','true');input.removeAttribute('aria-activedescendant');}
 input.addEventListener('focus',show);input.addEventListener('click',()=>{if(list.hidden)show();});input.addEventListener('input',show);
 list.addEventListener('mousedown',e=>e.preventDefault());list.addEventListener('click',e=>{const b=e.target.closest('[data-client-index]');if(b)select(Number(b.dataset.clientIndex));});
 picker.addEventListener('focusout',e=>{if(!picker.contains(e.relatedTarget))close();});
 input.addEventListener('keydown',e=>{if(e.key==='Escape'||e.key==='Tab'){close();return;}if(e.key==='Enter'&&!list.hidden&&active>=0){e.preventDefault();select(active);return;}if(e.key!=='ArrowDown'&&e.key!=='ArrowUp')return;e.preventDefault();if(list.hidden)show();if(!matches.length)return;active=(active+(e.key==='ArrowDown'?1:active<0?0:-1)+matches.length)%matches.length;for(const b of list.querySelectorAll('[role=option]'))b.setAttribute('aria-selected',String(Number(b.dataset.clientIndex)===active));const item=$('rsClientOption'+active);input.setAttribute('aria-activedescendant',item.id);item.scrollIntoView({block:'nearest'});});
}
function validate(d){if(d?.client?.length>180||d?.title?.length>180||d?.videos?.some(v=>v.title?.length>180))throw Error('Títulos e cliente devem ter até 180 caracteres.');if(!d||typeof d.client!=='string'||typeof d.title!=='string'||!Array.isArray(d.videos)||!d.videos.length)throw Error('Formato de roteiro inválido.');const string=x=>typeof x==='string'?x:'';return {id:uid(),client:d.client,title:d.title,pdfFontScale:fontScale(d.pdfFontScale),videos:d.videos.map(v=>{if(!v||!['scenes','full'].includes(v.mode)||!Array.isArray(v.scenes))throw Error('Vídeo inválido.');return {title:string(v.title),duration:String(v.duration??''),mode:v.mode,text:string(v.text),scenes:(v.scenes.length?v.scenes:[scene()]).map(s=>({text:string(s.text),visual:string(s.visual),seconds:String(s.seconds??'')}))};})};}
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
const filename=()=>`One Way - Roteiros - ${doc.client||'Cliente'} - ${doc.videos[0]?.title||doc.title||'Roteiros'}`.replace(/[<>:"/\\|?*\u0000-\u001f]/g,'-').slice(0,180);
async function action(act,b){if(!allowed())return;
 if(act==='reset-font'){setFontScale(100);return;}
if(act==='save'||act==='save-video'){
  const vi=Number(b.closest('[data-video]')?.dataset.video);
  await saveDocument();
  render();
  status(act==='save-video'&&Number.isInteger(vi) ? `Vídeo ${String(vi+1).padStart(2,'0')} salvo dentro do roteiro de ${doc.client}. Todos os ${doc.videos.length} vídeos estão vinculados na nuvem.` : `Roteiro de ${doc.client} salvo na nuvem com ${doc.videos.length} vídeo(s).`);
  return;
}
if(act==='load'){const id=$('rsDrafts').value,d=saved().find(x=>x.id===id);if(!d)throw Error('Selecione um roteiro salvo na nuvem.');if(dirty&&!confirm('Descartar as alterações não salvas?'))return;doc=validate(d);doc.id=d.id;dirty=false;render();return;}
if(act==='delete-draft'){
 const id=$('rsDrafts').value;if(!id)throw Error('Selecione um roteiro salvo.');
 if(!cloudReady())throw Error('Entre como administrador para excluir da nuvem.');
 if(confirm('Excluir este roteiro da nuvem para todos os administradores?')){
  const {error}=await supabaseClient.from('video_scripts').delete().eq('id',id);
  if(error)throw Error('Falha ao excluir: '+error.message);
  cloudDocs=cloudDocs.filter(x=>x.id!==id);render();status('Roteiro excluído da nuvem.');
 }return;
}
if(act==='refresh-cloud'){await refreshCloud();status('Lista atualizada na nuvem.');return;}
if(act==='migrate'){await migrateLegacy();return;}
if(act==='new'){if(dirty&&!confirm('Descartar as alterações não salvas?'))return;doc=blank();dirty=false;render();return;}
if(act==='pdf'||act==='preview'){
 const issue=pdfIssue(doc);if(issue)throw Error(issue);
 busy=true;b.disabled=true;status('Preparando todas as páginas…');
 try{
  const snapshot=structuredClone(doc),key=pdfKey(snapshot);
  const pages=key===cachedKey?cachedPages:await pagesFor(snapshot);
  cachedKey=key;cachedPages=pages;
  if(act==='pdf'){
   download(scriptPDFBlob(pages),filename()+'.pdf');
   status('PDF pronto: '+pages.length+' página(s), texto '+fontScale(doc.pdfFontScale)+'%.');
  }else{
   openPDFPreview(b,pages);
   status('Prévia pronta. Ajuste o texto e acompanhe as páginas em tempo real.');
  }
 }finally{busy=false;b.disabled=false;}
 return;
}
const vi=Number(b.closest('[data-video]')?.dataset.video),si=Number(b.closest('[data-scene]')?.dataset.scene);
if(act==='add-video'){doc.videos.push(video());dirty=true;render();if(doc.client.trim()){try{await saveDocument();updateCloudList();status(`Novo vídeo salvo na nuvem no roteiro de ${doc.client}. Preencha o conteúdo e clique Salvar roteiro.`);}catch(error){status('Novo vídeo adicionado, mas ainda NÃO salvo na nuvem: '+error.message+'. Tente Salvar roteiro.');}}else status('Novo vídeo adicionado. Escolha o cliente e clique Salvar roteiro para guardar na nuvem.');const added=$('scriptsContent')?.querySelector(`[data-video="${doc.videos.length-1}"]`);if(added&&typeof added.scrollIntoView==='function')added.scrollIntoView({behavior:'smooth',block:'start'});return;}else if(act==='add-scene')doc.videos[vi].scenes.push(scene());else {const [kind,op]=act.split('-'),list=kind==='v'?doc.videos:doc.videos[vi].scenes,i=kind==='v'?vi:si;if(op==='delete'){if(!confirm(`Excluir ${kind==='v'?'este vídeo e todas as cenas':'esta cena'}?`))return;list.splice(i,1);if(!list.length)list.push(kind==='v'?video():scene());}else if(op==='copy')list.splice(i+1,0,structuredClone(list[i]));else {const to=i+(op==='up'?-1:1);if(to<0||to>=list.length)return;[list[i],list[to]]=[list[to],list[i]];}}
dirty=true;render();}

/* Implementação isolada: o antigo editor chamava funcoes privadas de outro <script>
   (feedTextBrand e feedPDFBlob), provocando ReferenceError em visualizar/baixar. */

async function scriptTextBrand(ctx,headerHeight){
  // Marca original recortada e centralizada verticalmente no cabeçalho.
  // Não usar o PNG vertical inteiro: ele tem grande área vazia.
  const box={x:110,y:Math.round((headerHeight-110)/2),w:292,h:110};
  try{
    if(typeof LOGO_DATA_URI==='string'&&LOGO_DATA_URI.startsWith('data:image/')){
      const img=new Image();
      await new Promise((resolve,reject)=>{
        img.onload=resolve;img.onerror=reject;img.src=LOGO_DATA_URI;
      });
      // Mantém o recorte e a proporção da marca, com tinta azul-escura sobre papel branco.
      const mark=document.createElement('canvas');
      mark.width=box.w;mark.height=box.h;
      const markCtx=mark.getContext('2d');
      if(markCtx){
        markCtx.drawImage(img,34,326,516,197,0,0,box.w,box.h);
        markCtx.globalCompositeOperation='source-in';
        markCtx.fillStyle='#102a55';
        markCtx.fillRect(0,0,box.w,box.h);
        markCtx.globalCompositeOperation='source-over';
        ctx.drawImage(mark,box.x,box.y);
        return box;
      }
    }
  }catch(error){console.warn('Marca original indisponível no PDF:',error);}
  ctx.fillStyle='#102a55';
  ctx.font='italic 800 62px OWScriptPDF,Montserrat,Arial,sans-serif';
  ctx.fillText('One Way',box.x+2,box.y+68);
  ctx.fillStyle='#294f84';
  ctx.font='600 18px OWScriptPDF,Montserrat,Arial,sans-serif';
  ctx.fillText('A G E N C Y',box.x+11,box.y+98);
  return box;
}
function scriptPDFBlob(pages){
  if(!Array.isArray(pages)||!pages.length)throw Error('Nenhuma página do roteiro foi gerada.');
  const te=new TextEncoder(),chunks=[],offset=[0];let size=0;
  const add=value=>{const bytes=typeof value==='string'?te.encode(value):value;chunks.push(bytes);size+=bytes.length;};
  const object=(id,value)=>{offset[id]=size;add(`${id} 0 obj\n${value}\nendobj\n`);};
  const count=pages.length;
  add('%PDF-1.4\n%ONEWAY\n');
  object(1,'<< /Type /Catalog /Pages 2 0 R >>');
  object(2,`<< /Type /Pages /Count ${count} /Kids [${pages.map((_,i)=>3+3*i+' 0 R').join(' ')}] >>`);
  for(let i=0;i<count;i++){
    const pageId=3+i*3,imageId=pageId+1,streamId=pageId+2;
    object(pageId,`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /P${i} ${imageId} 0 R >> >> /Contents ${streamId} 0 R >>`);
    const data=pages[i];if(typeof data!=='string'||!data.startsWith('data:image/jpeg;base64,'))throw Error('Uma página está em formato inválido.');
    const ascii=atob(data.split(',')[1]),bytes=new Uint8Array(ascii.length);
    for(let j=0;j<ascii.length;j++)bytes[j]=ascii.charCodeAt(j);
    offset[imageId]=size;
    add(`${imageId} 0 obj\n<< /Type /XObject /Subtype /Image /Width 1440 /Height 2036 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bytes.length} >>\nstream\n`);
    add(bytes);add('\nendstream\nendobj\n');
    const code=`q 595.28 0 0 841.89 0 0 cm /P${i} Do Q\n`;
    object(streamId,`<< /Length ${te.encode(code).length} >>\nstream\n${code}endstream`);
  }
  const xref=size;add(`xref\n0 ${3*count+3}\n0000000000 65535 f \n`);
  for(let i=1;i<3*count+3;i++)add(`${String(offset[i]).padStart(10,'0')} 00000 n \n`);
  add(`trailer\n<< /Size ${3*count+3} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return new Blob(chunks,{type:'application/pdf'});
}
// Every line is retained, including blank paragraphs and unbroken long words.
function wrap(ctx,text,width){const result=[];for(const p of String(text).replace(/\r\n?/g,'\n').split('\n')){if(!p){result.push('');continue;}let line='';for(const word of p.split(/\s+/)){const next=line?line+' '+word:word;if(ctx.measureText(next).width<=width){line=next;continue;}if(line){result.push(line);line='';}for(const c of word){if(line&&ctx.measureText(line+c).width>width){result.push(line);line='';}line+=c;}}result.push(line);}return result;}

let scriptPDFFontReady=null;
async function loadScriptPDFFont(){
 if(!scriptPDFFontReady)scriptPDFFontReady=(async()=>{
  try{
   const font=new FontFace('OWScriptPDF','url(/fonts/Montserrat.ttf)',{weight:'100 900'});
   await font.load();document.fonts.add(font);
  }catch(error){console.warn('Fonte Montserrat indisponível, usando reserva.',error);}
 })();
 return scriptPDFFontReady;
}
async function pagesFor(data){
 await loadScriptPDFFont();
  const pages=[], W=1440,H=2036, bottom=1836, bodyScale=fontScale(data.pdfFontScale)/100;
  let canvas=null,ctx=null,y=0,videoIndex=-1,part=0,activeScene=0;
  const fontAt=(size=30,weight=500)=>{ctx.font=weight+' '+size+'px OWScriptPDF,Montserrat,Arial,sans-serif';};
  const footer=()=>{
    if(!canvas)return;
    ctx.fillStyle='#294f84';fontAt(19,500);
    ctx.fillText('ONE WAY  /  ROTEIROS DE PRODUÇÃO',110,1965);
    ctx.textAlign='right';ctx.fillText(String(pages.length+1).padStart(2,'0'),1330,1965);
    ctx.textAlign='left';
    pages.push(canvas.toDataURL('image/jpeg',.94));
  };
  const page=async()=>{
    footer();
    canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;
    ctx=canvas.getContext('2d');
    if(!ctx)throw Error('Não foi possível preparar a página do roteiro.');
    // Versão de impressão: toda a área de papel é branca, sem degradê de cobertura total.
    ctx.fillStyle='#ffffff';ctx.fillRect(0,0,W,H);
    // Logo à esquerda, alinhada ao centro vertical; identificação do cliente à direita.
    // A largura do texto respeita a coluna até a margem direita do A4.
    const textX=470,textWidth=W-textX-106;
    fontAt(38,650);
    const names=wrap(ctx,data.client,textWidth);
    const headerH=254+Math.max(0,names.length-1)*50;
    // Preserva o mesmo cabeçalho, margens, marca e tipografia; muda só a paleta.
    ctx.fillStyle='#ffffff';ctx.fillRect(0,0,W,headerH);
    await scriptTextBrand(ctx,headerH);
    ctx.fillStyle='rgba(16,42,85,.25)';
    ctx.fillRect(437,62,2,headerH-124);
    const groupTop=Math.round((headerH-(46+50*names.length))/2);
    ctx.fillStyle='#294f84';fontAt(19,650);
    ctx.fillText('ROTEIROS  /  PRODUÇÃO AUDIOVISUAL',textX,groupTop+20);
    ctx.fillStyle='#102a55';fontAt(38,700);
    names.forEach((line,i)=>ctx.fillText(line,textX,groupTop+76+i*50));
    const cardTop=headerH+36;
    ctx.fillStyle='#ffffff';
    ctx.beginPath();ctx.roundRect(76,cardTop,1288,1860-cardTop,30);ctx.fill();
    ctx.strokeStyle='#a5b6cf';ctx.lineWidth=2;ctx.stroke();
    y=cardTop+73;
    ctx.fillStyle='#294f84';fontAt(24,700);
    ctx.fillText('VÍDEO '+String(videoIndex+1).padStart(2,'0')+(part>1?'  /  CONTINUAÇÃO '+part:'')+'  ·  '+duration(data.videos[videoIndex]),114,y);
    y+=79;
    const video=data.videos[videoIndex];
    fontAt(49,700);
    const titleLines=wrap(ctx,video.title,1160);
    for(const title of titleLines){
      ctx.fillStyle='#102a55';ctx.fillText(title,114,y);y+=65;
    }
    y+=15;
    if(part>1&&activeScene){
      ctx.fillStyle='#2a568b';fontAt(21,650);
      ctx.fillText('CENA '+String(activeScene).padStart(2,'0')+'  /  CONTINUAÇÃO',114,y);
      y+=42;
    }
  };
  const ensure=async(height=80)=>{
    if(y+height<=bottom)return;
    part++;
    await page();
  };
  const writeLines=async(text,size=31,weight=500,color='#17375f',lineHeight=1.62)=>{
    const actualSize=Math.round(size*bodyScale*10)/10;
    fontAt(actualSize,weight);
    const all=wrap(ctx,text,1160);
    for(const line of all){
      await ensure(actualSize*lineHeight+9);
      fontAt(actualSize,weight);ctx.fillStyle=color;
      if(line)ctx.fillText(line,114,y);
      y+=actualSize*lineHeight;
    }
  };
  const writeLabel=async(label)=>{
    await ensure(75);
    ctx.fillStyle='#23528c';fontAt(19,700);ctx.fillText(label,114,y);
    y+=39;
  };
  for(let i=0;i<data.videos.length;i++){
    videoIndex=i;part=1;activeScene=0;await page();
    const v=data.videos[i];
    if(v.mode==='full'){
      y+=12;await writeLabel('ROTEIRO COMPLETO');y+=11;
      await writeLines(v.text,31,500,'#17375f',1.66);
    }else{
      for(let j=0;j<v.scenes.length;j++){
        const sc=v.scenes[j];activeScene=0;
        await ensure(248);
        y+=25;
        ctx.fillStyle='rgba(26,65,112,.22)';ctx.fillRect(114,y,1160,2);
        y+=51;
        activeScene=j+1;
        ctx.fillStyle='#173f78';fontAt(26,700);
        ctx.fillText('CENA '+String(j+1).padStart(2,'0')+(sc.seconds!==''?'  ·  '+sc.seconds+'s':''),114,y);
        y+=47;
        if(sc.text){
          await writeLabel('TEXTO / FALA');
          await writeLines(sc.text,31,500,'#17375f',1.65);
          y+=23;
        }
        if(sc.visual){
          await writeLabel('IMAGEM / AÇÃO / DIREÇÃO');
          await writeLines(sc.visual,29,500,'#2d5787',1.62);
          y+=24;
        }
        if(!sc.text&&!sc.visual){
          await writeLines('Cena a desenvolver.',29,500,'#5b7392');
        }
        y+=28;
      }
    }
  }
  footer();return pages;
}
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
window.owScripts={render,pagesFor,wrap,validate,seconds,refreshCloud,fontScale,pdfIssue};
})();
