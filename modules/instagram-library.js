/* One Way — biblioteca de relatórios Instagram, privada e compartilhada via Supabase Storage. */
(()=>{
  'use strict';
  const BUCKET='oneway-instagram-reports',DIR='instagram',RETENTION_MS=30*86400000;
  const $=id=>document.getElementById(id);
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const pretty=d=>new Date(d).toLocaleDateString('pt-BR');
  const clean=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9_-]/gi,'_').replace(/_+/g,'_').slice(0,70);
  const account=()=>{if(!window.supabaseClient && typeof supabaseClient==='undefined')throw Error('Supabase indisponível.');if(typeof adminAuthReady==='function'&&!adminAuthReady())throw Error('Entre no sistema como administrador.');return supabaseClient;};
  let data=[],initialized=false,loading=false;
  function unpack(item){
    const name=String(item.name||'');
    const parts=name.replace(/\.pdf$/i,'').split('__');
    if(parts.length<6||!name.toLowerCase().endsWith('.pdf'))return null;
    const [created,username,from,to,client,...tail]=parts;
    if(!/^\d{8}T\d{6}Z$/.test(created)||!/^[a-z0-9._]{1,30}$/i.test(username)||!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to))return null;
    const at=Date.parse(item.created_at||created.slice(0,4)+'-'+created.slice(4,6)+'-'+created.slice(6,8)+'T'+created.slice(9,11)+':'+created.slice(11,13)+':'+created.slice(13,15)+'Z');
    const expires=at+RETENTION_MS;
    const costRaw=tail.find(x=>/^usd-(?:[0-9]+p[0-9]+|unknown)$/.test(x))||'';
    const costUsd=/^usd-[0-9]+p[0-9]+$/.test(costRaw)?Number(costRaw.slice(4).replace('p','.')):null;
    return {name,path:DIR+'/'+name,client:client.replace(/_/g,' '),username,from,to,createdAt:at,expiresAt:expires,costUsd,bytes:item.metadata?.size||0};
  }
  function panel(){
    if($('igSavedPanel'))return;
    const el=document.createElement('section');el.id='igSavedPanel';el.className='ig-panel';
    el.innerHTML='<div class="ig-results-head ig-library-heading"><div><span class="ig-eyebrow">ONE WAY · ACERVO DA AGÊNCIA</span><h3>Relatórios salvos <span id="igSavedCount"></span></h3><p class="ig-muted">Acesse sem refazer a coleta. Arquivos compartilhados entre administradores, com prazo de 30 dias.</p></div><button type="button" class="ig-secondary" id="igSavedRefresh">Atualizar lista</button></div><div id="igSavedMessage" class="ig-muted">Buscando relatórios…</div><div id="igSavedRows" class="ig-saved-rows"></div>';
    $('instagramReportsContent')?.querySelector('.ig-shell')?.appendChild(el);
    $('igSavedRefresh')?.addEventListener('click',refresh);
    $('igSavedRows')?.addEventListener('click',async event=>{
      const btn=event.target.closest('button[data-report-action]');if(!btn)return;
      const rec=data.find(r=>r.path===btn.dataset.path);if(!rec)return;
      btn.disabled=true;
      try{
        if(btn.dataset.reportAction==='delete'){
          if(!confirm('Excluir definitivamente o relatório de @'+rec.username+'? Essa ação vale para toda a equipe.'))return;
          const {error}=await account().storage.from(BUCKET).remove([rec.path]);if(error)throw error;
          await refresh();return;
        }
        const {data:file,error}=await account().storage.from(BUCKET).download(rec.path);
        if(error)throw error;
        const url=URL.createObjectURL(file);
        if(btn.dataset.reportAction==='view'){
          const w=window.open(url,'_blank');if(!w){const a=document.createElement('a');a.href=url;a.download=rec.name;a.click();}
        } else {
          const a=document.createElement('a');a.href=url;a.download='One_Way_Instagram_'+rec.username+'_'+rec.from+'_a_'+rec.to+'.pdf';document.body.appendChild(a);a.click();a.remove();
        }
        setTimeout(()=>URL.revokeObjectURL(url),90000);
      }catch(e){$('igSavedMessage').textContent='Não foi possível abrir o arquivo: '+(e?.message||'tente novamente');}finally{btn.disabled=false}
    });
  }
  function draw(){
    if(!$('igSavedRows'))return;
    $('igSavedCount').textContent='('+data.length+')';
    if(!data.length){$('igSavedRows').innerHTML='<p class="ig-muted">Nenhum relatório salvo ainda. Ao gerar o próximo PDF, ele aparecerá aqui.</p>';return;}
    $('igSavedRows').innerHTML=data.map(r=>'<article class="ig-saved-item"><div class="ig-saved-description"><strong>'+esc(r.client)+' <span class="ig-saved-handle">@'+esc(r.username)+'</span></strong><span>'+esc(pretty(r.from))+' a '+esc(pretty(r.to))+' · salvo em '+esc(pretty(r.createdAt))+' · expira em '+esc(pretty(r.expiresAt))+(r.costUsd!=null?' · Apify: US$ '+r.costUsd.toFixed(4).replace('.',','):'')+'</span></div><div class="ig-saved-actions"><button type="button" class="ig-secondary" data-report-action="view" data-path="'+esc(r.path)+'">Abrir ↗</button><button type="button" class="ig-secondary" data-report-action="download" data-path="'+esc(r.path)+'">Baixar PDF</button><button type="button" class="ig-secondary ig-delete" data-report-action="delete" data-path="'+esc(r.path)+'">Excluir</button></div></article>').join('');
  }
  async function refresh(){
    if(loading)return;
    panel();loading=true;$('igSavedRefresh').disabled=true;
    $('igSavedMessage').textContent='Atualizando biblioteca de relatórios…';
    try{
      account();
      const found=[];
      for(let offset=0;offset<500;offset+=100){
        const {data:list,error}=await supabaseClient.storage.from(BUCKET).list(DIR,{limit:100,offset,sortBy:{column:'created_at',order:'desc'}});
        if(error)throw error;
        found.push(...(list||[]));if((list||[]).length<100)break;
      }
      data=found.map(unpack).filter(Boolean).filter(r=>r.expiresAt>Date.now()).sort((a,b)=>b.createdAt-a.createdAt);
      $('igSavedMessage').textContent='Biblioteca sincronizada. Os arquivos anteriores ao prazo de 30 dias deixam de aparecer aqui.';
      draw();
    }catch(e){$('igSavedMessage').textContent='Biblioteca indisponível: '+(e?.message||'confira a configuração do Supabase Storage.');}
    finally{loading=false;$('igSavedRefresh').disabled=false;}
  }
  async function save(report,blob){
    account();
    if(!blob||!blob.size)throw Error('O arquivo PDF está vazio.');
    const stamp=new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d+Z$/,'Z');
    const random=(crypto.randomUUID?.()||Math.random().toString(36).slice(2)).replace(/-/g,'').slice(0,10);
    const username=String(report.username||'').replace(/[^a-z0-9._]/gi,'');
    const client=clean(report.clientName||username);
    const name=[stamp,username,report.from,report.to,client,random].join('__')+'.pdf';
    const path=DIR+'/'+name;
    const {error}=await supabaseClient.storage.from(BUCKET).upload(path,blob,{contentType:'application/pdf',cacheControl:'3600',upsert:false});
    if(error)throw error;
    await refresh();
    return path;
  }
  function findSaved(username,from,to){
    return data.find(r=>r.username===String(username||'').replace(/^@/,'').toLowerCase()&&r.from===from&&r.to===to);
  }
  function init(){if(!initialized){initialized=true;panel();refresh()}else panel();}
  window.igReportLibrary={init,refresh,save,findSaved};
})();