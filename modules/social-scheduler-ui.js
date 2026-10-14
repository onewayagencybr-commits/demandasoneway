/* One Way | Social Scheduler. Independent module; private uploads and admin API only. */
(() => {
 'use strict';
 const $=id=>document.getElementById(id);
 const safe=s=>String(s??'').replace(/[&<>"']/g,v=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[v]));
 const runtime={accounts:[],loading:false,ready:false,publishingEnabled:false,oauthNotice:null};
 function adminReady(){
   return typeof isAdmin==='function'&&isAdmin()&&typeof adminAuthReady==='function'&&adminAuthReady();
 }
 function clientKey(name){
   if(typeof cmKey==='function')return cmKey(name);
   return String(name||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
     .toLocaleLowerCase('pt-BR').replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
 }
 function clients(){
   if(typeof state==='undefined')return [];
   const records=Array.isArray(state?.clients)?state.clients:[];
   const directory=Array.isArray(state?.clientDirectory)?state.clientDirectory:[];
   const archive=new Set(Array.isArray(state?.archivedClientKeys)?state.archivedClientKeys:[]);
   // A company appears once even when it has Arte, Vídeo and Tráfego records.
   const registry=[...directory,...records.filter(c=>c?.name&&!c.mergedInto).map(c=>c.name)];
   const unique=new Map();
   const names=typeof cmAllNames==='function'?cmAllNames():registry;
   const allowed=new Set(registry.map(clientKey));
   for(const name of names){
     const key=clientKey(name);
     if(key&&allowed.has(key)&&!archive.has(key)&&!unique.has(key))
       unique.set(key,{id:'client:'+key,name:String(name).trim()});
   }
   return [...unique.values()];
 }
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
   for(const c of clients().sort((a,b)=>String(a.name).localeCompare(String(b.name),'pt-BR'))){
     select.add(new Option(String(c.name),String(c.id)));
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
     const health=await api('/api/social?action=status');
     runtime.ready=Boolean(health.ready);
     runtime.publishingEnabled=health.publishingEnabled===true;
     const banner=$('owsAutomationNotice');
     if(banner){banner.hidden=runtime.publishingEnabled;banner.textContent=runtime.publishingEnabled?'':'PUBLICAÇÃO AUTOMÁTICA DESATIVADA — os agendamentos são salvos, mas não serão publicados até ativarmos o serviço. Horários vencidos precisarão de revisão antes da ativação.';}
     const chip=$('owsAutomationBadge');
     if(chip)chip.textContent=runtime.publishingEnabled?'Automação habilitada':'Publicação pausada';
     $('owsSave').disabled=!runtime.ready;
     $('owsConnect').disabled=!runtime.ready;
     if(!runtime.ready){
       runtime.accounts=[];
       const missing=[];
       if(!health.secretsReady)missing.push('credenciais oficiais da Meta e chave administrativa');
       if(!health.schemaReady)missing.push('tabelas do Supabase');
       if(!health.storageReady)missing.push('bucket privado de mídia');
       notify('Configuração pendente: '+missing.join('; ')+'. Nenhuma publicação será enviada.',true);
       $('owsList').textContent='Lista indisponível até concluir a instalação segura.';
       refreshClientNames();
       return;
     }
     const [connected,schedules]=await Promise.all([
       api('/api/social?action=connect'),
       api('/api/social?action=schedule')
     ]);
     runtime.accounts=connected.accounts||[];
     refreshClientNames();
     const list=$('owsList');
     const items=schedules.posts||[];
     const pausedLabel=p=>p.status==='scheduled'&&!runtime.publishingEnabled?'Salvo · publicação pausada':statuses[p.status]||p.status;
     list.innerHTML=items.length?items.map(p=>{
       const name=clients().find(c=>String(c.id)===p.client_ref)?.name||'Cliente';
       const cancelable=['scheduled','draft','approved','failed'].includes(p.status);
       const publishable=p.status==='scheduled'&&p.publish_attempts===0&&Boolean(p.approved_at);
       const link=p.published_permalink?'<a target="_blank" rel="noopener noreferrer" href="'+safe(p.published_permalink)+'">Ver post</a>':'';
       const publishButton=publishable?'<button class="ows-publish-now" type="button" data-publish-now="'+safe(p.id)+'" data-name="'+safe(name)+'">Publicar agora</button>':'';
       return '<div class="ows-item"><div><b>'+safe(name)+'</b><span>'+safe(localTime(p.scheduled_at))+'</span></div><div><span class="ows-pill">'+safe(pausedLabel(p))+'</span> '+link+publishButton+(cancelable?'<button class="ows-cancel" type="button" data-cancel="'+safe(p.id)+'">Cancelar</button>':'')+'</div></div>';
     }).join(''):'<div class="ows-empty">Nenhuma publicação programada ainda.</div>';
     if(runtime.oauthNotice)notify(runtime.oauthNotice.message,runtime.oauthNotice.error);
   }catch(e){runtime.ready=false;$('owsSave').disabled=true;$('owsConnect').disabled=true;notify(e.message,true);}
 }
 async function connect(){
   const ref=$('owsClient').value;
   if(!runtime.ready)return notify('A conexão da Meta ainda não foi configurada.',true);
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
   if(!runtime.ready)return notify('A conexão da Meta e o banco precisam estar configurados antes de agendar.',true);
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
     notify(runtime.publishingEnabled?'Agendamento salvo. Confirme a execução no histórico.':'Agendamento SALVO, MAS NÃO SERÁ PUBLICADO: a automação está desativada.',!runtime.publishingEnabled);
     $('owsCaption').value='';$('owsFile').value='';$('owsApproved').checked=false;
     await refresh();
   }catch(e){notify(e.message,true);}
   finally{runtime.loading=false;$('owsSave').disabled=!runtime.ready;}
 }
 async function publishNow(id,clientName){
   if(runtime.loading)return;
   if(!window.confirm('Publicar AGORA no Instagram de '+clientName+'?\\n\\nEsta ação envia o post imediatamente, mesmo se o agendamento estiver para outra hora. Não será possível desfazer o envio pelo One Way. Confirme a conta antes de continuar.'))return;
   runtime.loading=true;
   const buttons=Array.from(document.querySelectorAll('#owsList [data-publish-now]'));
   buttons.forEach(button=>{button.disabled=true;});
   try{
     notify('Enviando ao Instagram. Aguarde a confirmação; não atualize a página.');
     const result=await api('/api/social?action=publishnow',{
       method:'POST',body:JSON.stringify({id})
     });
     if(result.ok&&result.post?.status==='published'){
       notify('Publicado no Instagram! Confirme a publicação na listagem.');
     }else{
       notify('O envio foi iniciado, mas precisa de revisão. Não tente novamente para evitar posts duplicados.',true);
     }
     await refresh();
   }catch(e){
     notify(e.message||'Não foi possível publicar. Atualize a lista e verifique o status.',true);
     try{await refresh();}catch{}
   }finally{
     runtime.loading=false;
     buttons.forEach(button=>{if(button.isConnected)button.disabled=false;});
   }
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
   section.innerHTML=`<div class="ows-heading"><div><span class="ows-kicker">ONE WAY · SOCIAL MEDIA</span><h3>Agendador de Posts</h3><p>Postagens futuras com autorização da Meta para cada cliente e aprovação manual pelo WhatsApp.</p></div><span class="ows-chip" id="owsAutomationBadge">Verificando automação</span></div>
   <div id="owsAutomationNotice" class="ows-automation-notice" role="status" hidden></div>
   <div class="ows-form">
     <label>Cliente<select id="owsClient"><option>Selecione um cliente</option></select></label>
     <label>Data<input type="date" id="owsDate"></label>
     <label>Horário · Cuiabá<input type="time" id="owsTime" value="18:00"></label>
     <div class="ows-account ows-wide"><span id="owsAccount">Nenhum Instagram conectado</span><button type="button" class="ows-secondary" id="owsConnect" disabled>Conectar Instagram deste cliente</button></div>
     <label class="ows-wide">Legenda<textarea rows="4" id="owsCaption" placeholder="Legenda da publicação"></textarea></label>
     <label class="ows-wide">Arte (JPEG ou PNG) / Vídeo (MP4)<input type="file" id="owsFile" accept="image/jpeg,image/png,video/mp4"></label>
     <label class="ows-check ows-wide"><input type="checkbox" id="owsApproved"> Cliente aprovou esta arte e legenda pelo WhatsApp</label>
   </div>
   <div class="ows-footer"><span id="owsStatus" role="status">Aguardando a conexão segura com o banco e a Meta.</span><button id="owsSave" type="button" disabled>Agendar publicação</button></div>
   <div class="ows-saved"><div class="ows-saved-title"><h4>Publicações programadas</h4><button type="button" class="ows-secondary" id="owsRefresh">Atualizar</button></div><div id="owsList"><div class="ows-empty">Carregando agendamentos...</div></div></div>
   <div class="ows-privacy-links"><a href="/politica-de-privacidade.html" target="_blank" rel="noopener noreferrer">Política de Privacidade</a><a href="/exclusao-de-dados.html" target="_blank" rel="noopener noreferrer">Desconexão e exclusão de dados</a></div>`;
   host.append(section);
   $('owsClient').addEventListener('change',accountForSelection);
   $('owsConnect').addEventListener('click',connect);
   $('owsSave').addEventListener('click',schedule);
   $('owsRefresh').addEventListener('click',refresh);
   $('owsList').addEventListener('click',e=>{
     const pub=e.target.closest('[data-publish-now]');
     if(pub){publishNow(pub.dataset.publishNow,pub.dataset.name||'este cliente');return;}
     const id=e.target.closest('[data-cancel]')?.dataset.cancel;
     if(id)cancel(id);
   });
   const observer=new MutationObserver(()=>{
     if(!document.getElementById('socialMediaContent').classList.contains('hidden')&&adminReady()){refreshClientNames();refresh();}
   });
   observer.observe(document.getElementById('socialMediaContent'),{attributes:true,attributeFilter:['class']});
   const url=new URL(window.location.href);
   const response=url.searchParams.get('instagram_connection');
   if(response){
     const descriptions={
       ok:'Instagram autorizado. Confirme a conta correta na listagem.',
       denied:'O responsável recusou a autorização do Instagram.',
       expired:'O prazo de autorização expirou. Clique em Conectar Instagram novamente.',
       callback_missing:'A Meta retornou sem código de autorização. Verifique o endereço de retorno OAuth configurado.',
       error:'O Instagram não concluiu o login. Tente novamente.',
       code_exchange_failed:'A Meta recusou a troca do código de autorização. Verifique as credenciais e a URL OAuth.',
       long_token_failed:'A Meta recusou a extensão do acesso. A conta pode precisar de nova autorização.',
       profile_failed:'A Meta autorizou o acesso, mas não foi possível consultar a conta profissional.',
       save_failed:'A Meta autorizou o Instagram, mas o vínculo não pôde ser salvo no banco.',
       state_failed:'Não foi possível confirmar o código de segurança do login. Reinicie a conexão.'
     };
     runtime.oauthNotice={message:descriptions[response]||'O Instagram não concluiu a autorização.',error:response!=='ok'};
     url.searchParams.delete('instagram_connection');
     window.history.replaceState({},'',url.toString());
     notify(runtime.oauthNotice.message,runtime.oauthNotice.error);
   }
   refreshClientNames();
   if(adminReady())refresh();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();