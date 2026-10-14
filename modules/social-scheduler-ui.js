/* One Way | Social Scheduler. Independent module; private uploads and admin API only. */
(() => {
 'use strict';
 const $=id=>document.getElementById(id);
 const safe=s=>String(s??'').replace(/[&<>"']/g,v=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[v]));
 const runtime={accounts:[],loading:false};
 function adminReady(){
   return typeof isAdmin==='function'&&isAdmin()&&typeof adminAuthReady==='function'&&adminAuthReady();
 }
 function clients(){return (typeof state!=='undefined'&&Array.isArray(state?.clients)?state.clients:[]).filter(c=>c&&c.id&&c.name&&!c.mergedInto);}
 async function api(path,options={}){
   if(!adminReady()||typeof supabaseClient==='undefined')throw Error('Faça login como administrador para acessar o agendador.');
   const {data,error}=await supabaseClient.auth.getSession();
   const token=data?.session?.access_token;
   if(error||!token)throw Error('Sua sessão expirou. Entre novamente.');
   const res=await fetch(path,{...options,cache:'no-store',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',...(options.headers||{})}});
   const payload=await res.json().catch(()=>({}));
   if(!res.ok)throw Error(payload.error||'Não foi possível completar a operação.');
   return payload;
 }
 function notify(msg,err=false){const el=$('owsStatus');if(el){el.textContent=msg;el.style.color=err?'#ffabbc':'#b9cef7';}}
 function localTime(value){if(!value)return '—';return new Date(value).toLocaleString('pt-BR',{timeZone:'America/Cuiaba',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});}
 const statuses={draft:'Rascunho',awaiting_approval:'Aguardando aprovação',approved:'Aprovado',scheduled:'Agendado',publishing:'Publicando',published:'Publicado',failed:'Falhou',canceled:'Cancelado'};
 function refreshClientNames(){
   const select=$('owsClient');if(!select)return;
   const old=select.value;select.replaceChildren(new Option('Selecione um cliente',''));
   const used=new Set();
   for(const c of clients().sort((a,b)=>String(a.name).localeCompare(String(b.name),'pt-BR'))){
     if(used.has(c.id))continue;used.add(c.id);select.add(new Option(String(c.name),String(c.id)));
   }
   if(Array.from(select.options).some(x=>x.value===old))select.value=old;
   accountForSelection();
 }
 function accountForSelection(){
   const ref=$('owsClient')?.value;
   const account=runtime.accounts.find(x=>x.client_ref===ref);
   const label=$('owsAccount');if(!label)return;
   label.textContent=account?'@'+account.username+' · '+(account.connection_status==='connected'?'Conectado':'Reconectar'):'Nenhum Instagram conectado';
 }
 async function refresh(){
   if(!adminReady())return;
   try{
     const [connected,schedules]=await Promise.all([
       api('/api/social?action=connect'),
       api('/api/social?action=schedule')
     ]);
     runtime.accounts=connected.accounts||[];
     refreshClientNames();
     const list=$('owsList');
     const items=schedules.posts||[];
     list.innerHTML=items.length?items.map(p=>{
       const name=clients().find(c=>String(c.id)===p.client_ref)?.name||'Cliente';
       const cancelable=['scheduled','draft','approved','failed'].includes(p.status);
       const link=p.published_permalink?'<a target="_blank" rel="noopener noreferrer" href="'+safe(p.published_permalink)+'">Ver post</a>':'';
       return '<div class="ows-item"><div><b>'+safe(name)+'</b><span>'+safe(localTime(p.scheduled_at))+'</span></div><div><span class="ows-pill">'+safe(statuses[p.status]||p.status)+'</span> '+link+(cancelable?'<button class="ows-cancel" type="button" data-cancel="'+safe(p.id)+'">Cancelar</button>':'')+'</div></div>';
     }).join(''):'<div class="ows-empty">Nenhuma publicação programada ainda.</div>';
   }catch(e){notify(e.message,true);}
 }
 async function connect(){
   const ref=$('owsClient').value;
   if(!ref)return notify('Selecione primeiro o cliente que vai autorizar o Instagram.',true);
   try{
     const result=await api('/api/social?action=connect',{method:'POST',body:JSON.stringify({client_ref:ref})});
     window.location.assign(result.authorization_url);
   }catch(e){notify(e.message,true);}
 }
 async function jpegFile(file){
   if(file.type!=='image/png')return file;
   const image=await createImageBitmap(file),canvas=document.createElement('canvas');
   canvas.width=image.width;canvas.height=image.height;
   const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0);image.close();
   const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.91));
   if(!blob)throw Error('Não foi possível converter a arte PNG para JPEG.');
   return new File([blob],file.name.replace(/\.png$/i,'')+'.jpg',{type:'image/jpeg'});
 }
 async function schedule(){
   if(runtime.loading)return;
   const client_ref=$('owsClient').value,caption=$('owsCaption').value.trim(),
     date=$('owsDate').value,time=$('owsTime').value,approved=$('owsApproved').checked;
   const file=$('owsFile').files[0];
   if(!client_ref||!date||!time||!caption||!file||!approved)return notify('Preencha cliente, arquivo, legenda, data e marque a aprovação pelo WhatsApp.',true);
   if(!runtime.accounts.some(x=>x.client_ref===client_ref&&x.connection_status==='connected'))
     return notify('Primeiro conecte o Instagram deste cliente.',true);
   const scheduled_at=new Date(date+'T'+time+':00-04:00').toISOString();
   if(!Number.isFinite(Date.parse(scheduled_at))||Date.parse(scheduled_at)<Date.now()+60000)return notify('Escolha uma data futura.',true);
   runtime.loading=true;$('owsSave').disabled=true;
   try{
     notify('Criando rascunho privado...');
     const media=await jpegFile(file);
     const draft=await api('/api/social?action=schedule',{method:'POST',body:JSON.stringify({client_ref})});
     notify('Preparando upload seguro...');
     const sign=await api('/api/social?action=upload',{method:'POST',body:JSON.stringify({id:draft.post.id,size:media.size,mime:media.type})});
     notify('Enviando arquivo para o armazenamento privado...');
     const {error}=await supabaseClient.storage.from('social-posts-temp').uploadToSignedUrl(sign.path,sign.token,media,{contentType:media.type});
     if(error)throw Error('Falha no envio privado: '+error.message);
     notify('Registrando aprovação e agendamento...');
     await api('/api/social?action=schedule',{method:'PATCH',body:JSON.stringify({
       action:'schedule',id:draft.post.id,caption,scheduled_at,approved:true,media_path:sign.path,media_mime_type:media.type
     })});
     notify('Agendamento salvo. A publicação automática será habilitada após os testes da Meta.');
     $('owsCaption').value='';$('owsFile').value='';$('owsApproved').checked=false;
     await refresh();
   }catch(e){notify(e.message,true);}
   finally{runtime.loading=false;$('owsSave').disabled=false;}
 }
 async function cancel(id){
   if(!window.confirm('Cancelar esta publicação? O arquivo temporário será removido posteriormente.'))return;
   try{await api('/api/social?action=schedule',{method:'PATCH',body:JSON.stringify({id,action:'cancel'})});notify('Agendamento cancelado.');await refresh();}
   catch(e){notify(e.message,true);}
 }
 function boot(){
   const host=document.querySelector('#socialMediaContent .sm-shell');
   if(!host||$('owScheduler'))return;
   const section=document.createElement('section');section.id='owScheduler';section.className='ows-panel';
   section.innerHTML=`<div class="ows-heading"><div><span class="ows-kicker">ONE WAY · SOCIAL MEDIA</span><h3>Agendador de Posts</h3><p>Postagens futuras com autorização da Meta para cada cliente e aprovação manual pelo WhatsApp.</p></div><span class="ows-chip">Integração em teste</span></div>
   <div class="ows-form">
     <label>Cliente<select id="owsClient"><option>Selecione um cliente</option></select></label>
     <label>Data<input type="date" id="owsDate"></label>
     <label>Horário · Cuiabá<input type="time" id="owsTime" value="18:00"></label>
     <div class="ows-account ows-wide"><span id="owsAccount">Nenhum Instagram conectado</span><button type="button" class="ows-secondary" id="owsConnect">Conectar Instagram deste cliente</button></div>
     <label class="ows-wide">Legenda<textarea rows="4" id="owsCaption" placeholder="Legenda da publicação"></textarea></label>
     <label class="ows-wide">Arte (JPEG ou PNG) / Vídeo (MP4)<input type="file" id="owsFile" accept="image/jpeg,image/png,video/mp4"></label>
     <label class="ows-check ows-wide"><input type="checkbox" id="owsApproved"> Cliente aprovou esta arte e legenda pelo WhatsApp</label>
   </div>
   <div class="ows-footer"><span id="owsStatus" role="status">Aguardando a conexão segura com o banco e a Meta.</span><button id="owsSave" type="button">Agendar publicação</button></div>
   <div class="ows-saved"><div class="ows-saved-title"><h4>Publicações programadas</h4><button type="button" class="ows-secondary" id="owsRefresh">Atualizar</button></div><div id="owsList"><div class="ows-empty">Carregando agendamentos...</div></div></div>`;
   host.append(section);
   $('owsClient').addEventListener('change',accountForSelection);
   $('owsConnect').addEventListener('click',connect);
   $('owsSave').addEventListener('click',schedule);
   $('owsRefresh').addEventListener('click',refresh);
   $('owsList').addEventListener('click',e=>{const id=e.target.closest('[data-cancel]')?.dataset.cancel;if(id)cancel(id);});
   const observer=new MutationObserver(()=>{
     if(!document.getElementById('socialMediaContent').classList.contains('hidden')&&adminReady()){refreshClientNames();refresh();}
   });
   observer.observe(document.getElementById('socialMediaContent'),{attributes:true,attributeFilter:['class']});
   refreshClientNames();
   if(adminReady())refresh();
   const url=new URL(window.location.href);
   const response=url.searchParams.get('instagram_connection');
   if(response){notify(response==='ok'?'Instagram autorizado! Confirme a conexão na listagem.':'O Instagram não concluiu a autorização. Verifique o aplicativo Meta.',response!=='ok');url.searchParams.delete('instagram_connection');window.history.replaceState({},'',url.toString());}
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();