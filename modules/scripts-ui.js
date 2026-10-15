/* One Way: editor de roteiros e PDF. Rascunhos locais, sem armazenar PDFs. */
(()=>{
'use strict';
const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=()=>crypto.randomUUID(),scene=()=>({text:'',visual:'',seconds:''}),video=()=>({title:'',duration:'',mode:'scenes',text:'',scenes:[scene()]}),blank=()=>({id:uid(),client:'',title:'',videos:[video()]});
let doc=blank(),dirty=false,busy=false;
const key=()=>`oneway-scripts-v1:${typeof currentUser==='string'?currentUser:'admin'}`;
const allowed=()=>typeof isAdmin==='function'&&isAdmin();
function status(t){if($('rsStatus'))$('rsStatus').textContent=t;}
function saved(){const raw=localStorage.getItem(key());return raw?JSON.parse(raw):[];}
function seconds(v){if(v.duration!=='')return Math.max(0,Number(v.duration)||0);const parts=v.mode==='full'?[{text:v.text}]:v.scenes;return parts.reduce((n,s)=>n+(s.seconds!==''&&s.seconds!=null?Number(s.seconds)||0:Math.ceil((s.text.trim().match(/\S+/g)||[]).length*60/138)),0);}
function duration(v){const n=seconds(v);return n?`${Math.floor(n/60)?Math.floor(n/60)+'min ':''}${n%60}s`:'A definir';}
function field(label,name,value,type='text',extra=''){return `<label>${label}<input data-field="${name}" type="${type}" ${type==='text'?'maxlength="180"':''} value="${esc(value)}" ${extra}></label>`;}
function buttons(kind,i,last){return `<button data-act="${kind}-up" ${i===0?'disabled':''} aria-label="Mover ${kind==='v'?'vídeo':'cena'} para cima">↑</button><button data-act="${kind}-down" ${last?'disabled':''} aria-label="Mover ${kind==='v'?'vídeo':'cena'} para baixo">↓</button><button data-act="${kind}-copy">Duplicar</button><button class="rs-danger" data-act="${kind}-delete">Excluir</button>`;}
function render(){if(!allowed())return;const root=$('scriptsContent');if(!root)return;
root.innerHTML=`<div class="rs-panel"><div class="rs-bar rs-head"><div><span class="rs-pill">PRODUÇÃO AUDIOVISUAL</span><h2>Roteiros para gravar.</h2></div><div class="rs-bar"><button data-act="new">Novo roteiro</button><button data-act="save">Salvar rascunho</button><button data-act="preview">Visualizar PDF</button><button class="rs-primary" data-act="pdf">Baixar PDF</button></div></div><div class="rs-meta rs-client-line"><div class="rs-client-picker">${field('Cliente','client',doc.client,'text','id="rsClientInput" autocomplete="off" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="rsClientOptions" placeholder="Busque ou digite o cliente"')}<div id="rsClientOptions" class="rs-client-options" role="listbox" aria-label="Clientes" hidden></div></div></div><p class="rs-muted">Escreva ou cole seu roteiro. Use texto completo ou organize cena por cena. A duração automática considera aproximadamente 138 palavras por minuto; você pode definir o tempo manualmente.</p><div class="rs-drafts"><label>Roteiros salvos neste navegador<select id="rsDrafts"><option value="">Selecione um roteiro</option></select></label><div class="rs-bar" style="margin-top:10px"><button data-act="load">Abrir roteiro</button><button data-act="delete-draft">Excluir roteiro</button></div><p id="rsStatus" role="status" aria-live="polite">${dirty?'Alterações ainda não salvas.':'Pronto para criar o PDF. Salve o roteiro para continuar depois neste navegador.'}</p></div></div><div id="rsVideos">${doc.videos.map((v,i)=>`<article class="rs-video" data-video="${i}"><div class="rs-bar rs-head"><h3>Vídeo ${String(i+1).padStart(2,'0')}</h3><div class="rs-bar">${buttons('v',i,i===doc.videos.length-1)}</div></div><div class="rs-meta">${field('Título do vídeo','title',v.title)}${field('Duração prevista (segundos) · opcional','duration',v.duration,'number','min="0" step="1" placeholder="Estimar pelo roteiro"')}</div><div class="rs-meta"><label>Formato do roteiro<select data-field="mode"><option value="scenes" ${v.mode==='scenes'?'selected':''}>Cena por cena</option><option value="full" ${v.mode==='full'?'selected':''}>Texto completo</option></select></label><div class="rs-muted" style="align-self:end" data-duration="${i}">Duração estimada: ${duration(v)}</div></div>${v.mode==='full'?`<label>Roteiro completo<textarea data-field="text" rows="10" placeholder="Cole ou escreva aqui o texto completo do vídeo…">${esc(v.text)}</textarea></label>`:v.scenes.map((s,j)=>`<section class="rs-scene" data-scene="${j}"><div class="rs-bar rs-head"><strong>Cena ${j+1}</strong><div class="rs-bar">${buttons('s',j,j===v.scenes.length-1)}</div></div><div class="rs-meta"><label>Texto / fala<textarea data-field="text" placeholder="O que será falado nesta cena…">${esc(s.text)}</textarea></label><label>Imagem / ação / orientação de gravação<textarea data-field="visual" placeholder="Enquadramento, ação, imagens de apoio…">${esc(s.visual)}</textarea></label></div>${field('Duração da cena (segundos) · opcional','seconds',s.seconds,'number','min="0" step="1"')}</section>`).join('')+'<button style="margin-top:18px" data-act="add-scene">+ Adicionar cena</button>'}</article>`).join('')}</div><button class="rs-primary" data-act="add-video">+ Adicionar vídeo</button>`;
try{for(const d of saved())$('rsDrafts').add(new Option(`${d.client} · ${(d.videos?.[0]?.title||d.title||'Roteiro sem título')} · ${new Date(d.updatedAt).toLocaleDateString('pt-BR')}`,d.id));}catch{status('Não foi possível ler os rascunhos locais. Exporte seus dados para preservar o documento.');}
root.oninput=e=>{const f=e.target.dataset.field;if(!f)return;const vi=e.target.closest('[data-video]'),si=e.target.closest('[data-scene]');let target=vi?doc.videos[Number(vi.dataset.video)]:doc;if(si)target=target.scenes[Number(si.dataset.scene)];target[f]=e.target.value;dirty=true;status('Alterações ainda não salvas.');if(vi){root.querySelector(`[data-duration="${vi.dataset.video}"]`).textContent='Duração estimada: '+duration(doc.videos[Number(vi.dataset.video)]);}if(f==='mode')render();};
root.onclick=async e=>{const b=e.target.closest('[data-act]');if(!b||busy)return;try{await action(b.dataset.act,b);}catch(error){status(error.message||'Não foi possível concluir.');}};
bindClientPicker();
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
function validate(d){if(d?.client?.length>180||d?.title?.length>180||d?.videos?.some(v=>v.title?.length>180))throw Error('Títulos e cliente devem ter até 180 caracteres.');if(!d||typeof d.client!=='string'||typeof d.title!=='string'||!Array.isArray(d.videos)||!d.videos.length)throw Error('Formato de roteiro inválido.');const string=x=>typeof x==='string'?x:'';return {id:uid(),client:d.client,title:d.title,videos:d.videos.map(v=>{if(!v||!['scenes','full'].includes(v.mode)||!Array.isArray(v.scenes))throw Error('Vídeo inválido.');return {title:string(v.title),duration:String(v.duration??''),mode:v.mode,text:string(v.text),scenes:(v.scenes.length?v.scenes:[scene()]).map(s=>({text:string(s.text),visual:string(s.visual),seconds:String(s.seconds??'')}))};})};}
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
const filename=()=>`One Way - Roteiros - ${doc.client||'Cliente'} - ${doc.videos[0]?.title||doc.title||'Roteiros'}`.replace(/[<>:"/\\|?*\u0000-\u001f]/g,'-').slice(0,180);
async function action(act,b){if(!allowed())return;
if(act==='save'){if(!doc.client.trim())throw Error('Informe o cliente para salvar.');const list=saved(),item={...structuredClone(doc),updatedAt:new Date().toISOString()},i=list.findIndex(x=>x.id===doc.id);if(i<0)list.unshift(item);else list[i]=item;localStorage.setItem(key(),JSON.stringify(list));dirty=false;render();status('Rascunho salvo neste navegador.');return;}
if(act==='load'){const id=$('rsDrafts').value,d=saved().find(x=>x.id===id);if(!d)throw Error('Selecione um rascunho.');if(dirty&&!confirm('Descartar as alterações não salvas?'))return;doc=validate(d);doc.id=d.id;dirty=false;render();return;}
if(act==='delete-draft'){const id=$('rsDrafts').value;if(!id)throw Error('Selecione um rascunho.');if(confirm('Excluir este rascunho salvo?')){localStorage.setItem(key(),JSON.stringify(saved().filter(x=>x.id!==id)));render();}return;}
if(act==='new'){if(dirty&&!confirm('Descartar as alterações não salvas?'))return;doc=blank();dirty=false;render();return;}
if(act==='pdf'||act==='preview'){if(!doc.client.trim())throw Error('Informe o cliente antes de gerar o PDF.');if(doc.videos.some(v=>!v.title.trim()))throw Error('Dê um título a cada vídeo.');if(doc.videos.some(v=>v.mode==='full'?!v.text.trim():!v.scenes.some(s=>s.text.trim()||s.visual.trim())))throw Error('Preencha o roteiro de cada vídeo.');busy=true;b.disabled=true;status('Preparando todas as páginas…');try{const pages=await pagesFor(structuredClone(doc));if(act==='pdf'){download(scriptPDFBlob(pages),filename()+'.pdf');status(`PDF pronto: ${pages.length} página(s), com todos os vídeos e cenas.`);}else{const overlay=document.createElement('div');overlay.id='rsPreview';overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-label','Prévia do PDF');overlay.innerHTML=`<header><strong>Prévia · ${pages.length} página(s)</strong><button>Fechar prévia</button></header>`;const close=()=>{overlay.remove();document.removeEventListener('keydown',keyClose);b.focus();},keyClose=e=>{if(e.key==='Escape')close();};document.addEventListener('keydown',keyClose);overlay.querySelector('button').onclick=close;for(const src of pages){const img=new Image();img.src=src;img.alt='Página do roteiro';overlay.append(img);}document.body.append(overlay);overlay.querySelector('button').focus();status('Prévia pronta.');}}finally{busy=false;b.disabled=false;}return;}
const vi=Number(b.closest('[data-video]')?.dataset.video),si=Number(b.closest('[data-scene]')?.dataset.scene);
if(act==='add-video')doc.videos.push(video());else if(act==='add-scene')doc.videos[vi].scenes.push(scene());else {const [kind,op]=act.split('-'),list=kind==='v'?doc.videos:doc.videos[vi].scenes,i=kind==='v'?vi:si;if(op==='delete'){if(!confirm(`Excluir ${kind==='v'?'este vídeo e todas as cenas':'esta cena'}?`))return;list.splice(i,1);if(!list.length)list.push(kind==='v'?video():scene());}else if(op==='copy')list.splice(i+1,0,structuredClone(list[i]));else {const to=i+(op==='up'?-1:1);if(to<0||to>=list.length)return;[list[i],list[to]]=[list[to],list[i]];}}
dirty=true;render();}

/* Implementação isolada: o antigo editor chamava funcoes privadas de outro <script>
   (feedTextBrand e feedPDFBlob), provocando ReferenceError em visualizar/baixar. */
async function scriptTextBrand(ctx){
  try{
    const logo=new Image();
    logo.src='/oneway-logo.png';
    await new Promise((resolve,reject)=>{logo.onload=resolve;logo.onerror=reject;});
    const scale=Math.min(260/logo.naturalWidth,102/logo.naturalHeight);
    if(Number.isFinite(scale)&&scale>0){ctx.drawImage(logo,100,55,logo.naturalWidth*scale,logo.naturalHeight*scale);return;}
  }catch(error){console.warn('Logo do PDF indisponível; usando marca em texto.',error);}
  ctx.fillStyle='#edf4ff';ctx.font='600 44px OWScriptPDF,Montserrat,sans-serif';
  ctx.fillText('ONE WAY',100,115);
  ctx.font='500 16px OWScriptPDF,Montserrat,sans-serif';
  ctx.fillStyle='#b7cef5';ctx.fillText('A G E N C Y',105,145);
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
async function pagesFor(data){const font=new FontFace('OWScriptPDF','url(/fonts/Montserrat.ttf)',{weight:'100 900'});try{await font.load();document.fonts.add(font);}catch(error){console.warn('Fonte do PDF indisponível; usando fonte reserva.',error);}const pages=[],W=1440,H=2036;let canvas,ctx,y,videoIndex=-1,part=0,activeScene=0;const fontAt=(size=30,weight=400)=>{ctx.font=`${weight} ${size}px OWScriptPDF`;};
const finish=()=>{if(!canvas)return;ctx.fillStyle='#617a9b';fontAt(20);ctx.fillText('ONE WAY / PLANEJAMENTO AUDIOVISUAL',100,1968);ctx.textAlign='right';ctx.fillText(String(pages.length+1).padStart(2,'0'),1340,1968);ctx.textAlign='left';pages.push(canvas.toDataURL('image/jpeg',.95));};
async function page(){finish();canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;ctx=canvas.getContext('2d');ctx.fillStyle='#f7f9fd';ctx.fillRect(0,0,W,H);const g=ctx.createLinearGradient(0,0,W,320);g.addColorStop(0,'#061229');g.addColorStop(1,'#265be3');fontAt(34,500);const name=wrap(ctx,data.client+(data.title?' · '+data.title:''),1240),headerH=Math.max(310,280+(name.length-1)*44);ctx.fillStyle=g;ctx.fillRect(0,0,W,headerH);await scriptTextBrand(ctx);ctx.fillStyle='#adc9ff';fontAt(20,600);ctx.fillText('ROTEIROS / PRODUÇÃO AUDIOVISUAL',100,206);fontAt(34,500);ctx.fillStyle='white';name.forEach((l,i)=>ctx.fillText(l,100,253+i*44));y=headerH+50;ctx.fillStyle=videoIndex%2===0?'#e8f1ff':'#ffffff';ctx.fillRect(76,y-20,1288,1900-y+20);ctx.strokeStyle='#cfddf0';ctx.strokeRect(76,y-20,1288,1900-y+20);ctx.fillStyle='#365b94';fontAt(23,600);ctx.fillText(`VÍDEO ${String(videoIndex+1).padStart(2,'0')}${part>1?' / CONTINUAÇÃO '+part:''} · ${duration(data.videos[videoIndex])}`,112,y+28);y+=91;const v=data.videos[videoIndex];fontAt(44,600);for(const l of wrap(ctx,v.title,1190)){ctx.fillStyle='#15335c';ctx.fillText(l,112,y);y+=58;}y+=27;if(part>1&&activeScene){fontAt(21,600);ctx.fillStyle='#577aa9';ctx.fillText(`CENA ${String(activeScene).padStart(2,'0')} / CONTINUAÇÃO`,112,y);y+=44;}}
async function lines(text,size=29,weight=400,color='#294465'){fontAt(size,weight);const ls=wrap(ctx,text,1180);for(const l of ls){if(y+size*1.5>1850){part++;await page();fontAt(size,weight);}ctx.fillStyle=color;ctx.fillText(l,112,y);y+=size*1.55;}}
for(let i=0;i<data.videos.length;i++){videoIndex=i;part=1;activeScene=0;await page();const v=data.videos[i];if(v.mode==='full'){await lines('ROTEIRO COMPLETO',21,600,'#577aa9');y+=15;await lines(v.text);}else for(let j=0;j<v.scenes.length;j++){const s=v.scenes[j];activeScene=0;if(y+160>1830){part++;await page();}ctx.fillStyle='#c7d9f2';ctx.fillRect(112,y,1180,2);y+=50;activeScene=j+1;await lines(`CENA ${String(j+1).padStart(2,'0')}${s.seconds!==''?' · '+s.seconds+'s':''}`,24,600,'#315a98');y+=8;if(s.text){await lines('TEXTO / FALA',18,600,'#6880a0');await lines(s.text);y+=16;}if(s.visual){await lines('IMAGEM / AÇÃO',18,600,'#6880a0');await lines(s.visual,26,400,'#59718f');y+=16;}if(!s.text&&!s.visual)await lines('Cena a desenvolver.',26,400,'#6880a0');y+=27;}}
finish();return pages;}
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
window.owScripts={render,pagesFor,wrap,validate,seconds};
})();
