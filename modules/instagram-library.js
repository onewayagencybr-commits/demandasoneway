/* One Way — biblioteca: arquivos JSON leves + PDFs históricos (somente leitura).
 * Novos relatórios nunca persistem PDF; eles são montados sob demanda.
 */
(()=>{
 'use strict';
 const OLD_BUCKET='oneway-instagram-reports',RETENTION_MS=30*86400000;
 const $=id=>document.getElementById(id);
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const pretty=d=>{const n=new Date(d);return Number.isFinite(n.getTime())?n.toLocaleDateString('pt-BR'):'—'};
 const money=n=>typeof n==='number'&&Number.isFinite(n)?'US$ '+n.toFixed(4).replace('.',','):'';
 let data=[],inited=false,loading=false;
 async function bearer(){
  if(typeof supabaseClient==='undefined'||!supabaseClient)throw Error('Entre com o login administrativo.');
  const {data,error}=await supabaseClient.auth.getSession();
  if(error||!data?.session?.access_token)throw Error('Sessão de administrador expirada. Entre novamente.');
  return data.session.access_token;
 }
 async function api(path,opts={}){
  const access=await bearer();
  const response=await fetch(path,{...opts,cache:'no-store',headers:{Authorization:'Bearer '+access,'Content-Type':'application/json',...(opts.headers||{})}});
  const body=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(body.error||'Não foi possível acessar os dados.');
  return body;
 }
 function oldRow(item){
  const name=String(item?.name||''),parts=name.replace(/\.pdf$/i,'').split('__');
  if(parts.length<6||!name.endsWith('.pdf'))return null;
  const [created,username,from,to,client,...rest]=parts;
  if(!/^[a-z0-9._-]{1,35}$/i.test(username)||!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to))return null;
  const at=Date.parse(item.created_at||'');if(!Number.isFinite(at))return null;
  const costStr=rest.find(x=>/^usd-\d+p\d+$/.test(x));
  const costUsd=costStr?Number(costStr.slice(4).replace('p','.')):null;
  return {kind:'old',ref:'p:'+name,name,clientName:client.replace(/_/g,' '),username,from,to,costUsd,createdAt:new Date(at).toISOString(),expiresAt:new Date(at+RETENTION_MS).toISOString(),bytes:Number(item.metadata?.size||0)};
 }
 function panel(){
  if($('igSavedPanel'))return;
  const el=document.createElement('section');el.id='igSavedPanel';el.className='ig-panel';
  el.innerHTML='<div class="ig-results-head ig-library-heading"><div><span class="ig-eyebrow">ONE WAY · ACERVO DA AGÊNCIA</span><h3>Relatórios salvos <span id="igSavedCount"></span></h3><p class="ig-muted">Guardamos só os dados da análise por 30 dias. Monte e baixe o PDF quando quiser, sem refazer a coleta do Apify.</p></div><div class="ig-saved-actions"><button type="button" class="ig-secondary" id="igStorageCheck">Testar salvamento JSON</button><button type="button" class="ig-secondary" id="igSavedRefresh">Atualizar lista</button></div></div><div id="igSavedMessage" class="ig-muted">Buscando relatórios…</div><div id="igSavedRows" class="ig-saved-rows"></div>';
  $('instagramReportsContent')?.querySelector('.ig-shell')?.appendChild(el);
  $('igSavedRefresh').onclick=refresh;
  $('igSavedRows').addEventListener('click',async event=>{
   const button=event.target.closest('button[data-action]');if(!button)return;
   const row=data.find(x=>x.ref===button.dataset.ref);if(!row)return;
   const action=button.dataset.action;
   if(action==='delete'&&!confirm('Excluir definitivamente os dados salvos de @'+row.username+'? A equipe perderá acesso a este relatório.'))return;
   button.disabled=true;const note=$('igSavedMessage');
   let popup=null;
   if(action==='view'){popup=window.open('','_blank');if(popup){popup.document.title='Carregando relatório One Way…';popup.document.body.textContent='Preparando seu PDF One Way…';}}
   try{
    if(action==='delete'){
     if(row.kind==='json')await api('/api/instagram-saved',{method:'DELETE',body:JSON.stringify({name:row.name})});
     else{const {error}=await supabaseClient.storage.from(OLD_BUCKET).remove(['instagram/'+row.name]);if(error)throw error;}
     await refresh();
     if(note)note.textContent='Relatório excluído conforme solicitado.';return;
    }
    let pdf=null;
    if(row.kind==='json'){
     const {report}=await api('/api/instagram-saved?mode=read&name='+encodeURIComponent(row.name));
     if(action==='select'){
      window.igShowSavedData?.(report);
      document.getElementById('igMetrics')?.scrollIntoView({behavior:'smooth',block:'start'});
      if(note)note.textContent='Métricas restauradas, sem consultar o Apify.';
      return;
     }
     if(!window.igPdfFromData)throw Error('Gerador de PDF indisponível. Atualize a página.');
     pdf=await window.igPdfFromData(report);
    }else{
     const result=await supabaseClient.storage.from(OLD_BUCKET).download('instagram/'+row.name);
     if(result.error)throw result.error;
     pdf=result.data;
    }
    if(!pdf||!pdf.size)throw Error('PDF indisponível.');
    const objectURL=URL.createObjectURL(pdf);
    if(action==='view'){
     if(popup){popup.location.replace(objectURL);}
     else{const a=document.createElement('a');a.href=objectURL;a.download=row.name.replace(/\.json$/i,'.pdf');document.body.appendChild(a);a.click();a.remove();}
    }else{
     const a=document.createElement('a');a.href=objectURL;a.download='One_Way_Instagram_'+row.username+'_'+row.from+'_a_'+row.to+'.pdf';
     document.body.appendChild(a);a.click();a.remove();
    }
    setTimeout(()=>URL.revokeObjectURL(objectURL),300000);
    if(note)note.textContent=row.kind==='json'?'PDF montado a partir dos dados; o arquivo não foi salvo no Supabase.':'PDF histórico aberto.';
   }catch(e){
    if(popup&&!popup.closed)popup.close();
    if(note)note.textContent='Não foi possível concluir: '+String(e?.message||'tente novamente');
   }finally{button.disabled=false;}
  });
 }
 function draw(){
  $('igSavedCount').textContent='('+data.length+')';
  if(!data.length){$('igSavedRows').innerHTML='<p class="ig-muted">Nenhuma análise salva. Os próximos relatórios guardarão somente os dados, não o PDF.</p>';return;}
  $('igSavedRows').innerHTML=data.map(r=>{
   const info=r.kind==='old'?'PDF anterior':'Dados salvos · '+(r.bytes>0?Math.max(1,Math.ceil(r.bytes/1024))+' KB':'JSON');
   return '<article class="ig-saved-item"><div class="ig-saved-description"><strong>'+esc(r.clientName)+' <span class="ig-saved-handle">@'+esc(r.username)+'</span></strong><span>'+esc(pretty(r.from))+' a '+esc(pretty(r.to))+' · '+info+' · expira '+esc(pretty(r.expiresAt))+(r.costUsd!=null?' · Apify: '+money(r.costUsd):'')+'</span></div><div class="ig-saved-actions">'+(r.kind==='json'?'<button class="ig-secondary" type="button" data-action="select" data-ref="'+esc(r.ref)+'">Ver métricas</button>':'')+'<button class="ig-secondary" type="button" data-action="view" data-ref="'+esc(r.ref)+'">Abrir ↗</button><button class="ig-secondary" type="button" data-action="download" data-ref="'+esc(r.ref)+'">Baixar PDF</button><button class="ig-secondary ig-delete" type="button" data-action="delete" data-ref="'+esc(r.ref)+'">Excluir</button></div></article>';
  }).join('');
 }
 async function refresh(){
  if(loading)return;panel();loading=true;
  $('igSavedRefresh').disabled=true;$('igSavedMessage').textContent='Carregando análises salvas…';
  try{
   const server=await api('/api/instagram-saved?mode=list');
   const modern=(server.items||[]).map(x=>({...x,kind:'json',ref:'j:'+x.name}));
   let legacy=[];let legacyError='';
   try{
    const {data:items,error}=await supabaseClient.storage.from(OLD_BUCKET).list('instagram',{limit:100,sortBy:{column:'created_at',order:'desc'}});
    if(error)throw error;
    legacy=(items||[]).map(oldRow).filter(Boolean).filter(x=>Date.parse(x.expiresAt)>Date.now());
   }catch(e){legacyError=String(e.message||e);}
   data=[...modern,...legacy].sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
   draw();
   $('igSavedMessage').textContent='Biblioteca sincronizada. Novas análises são guardadas como JSON. '+(legacyError?'PDFs antigos temporariamente indisponíveis.':'PDFs anteriores disponíveis até expirarem.');
  }catch(e){
   $('igSavedMessage').textContent='Não foi possível consultar o acervo: '+(e?.message||'tente novamente');
  }finally{loading=false;$('igSavedRefresh').disabled=false;}
 }
 function findSaved(username,from,to){
  const clean=String(username||'').replace(/^@/,'').toLowerCase();
  return data.find(r=>r.username.toLowerCase()===clean&&r.from===from&&r.to===to)||null;
 }
 function init(){if(!inited){inited=true;panel();refresh()}else panel();}
 window.igReportLibrary={init,refresh,findSaved};
})();