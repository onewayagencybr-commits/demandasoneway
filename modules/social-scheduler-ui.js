/* One Way | Agendador de Posts - UI experimental, sem publicacao ativa */
(() => {
  'use strict';
  const boot=()=>{
    const host=document.querySelector('#socialMediaContent .sm-shell');
    if(!host||document.getElementById('owScheduler'))return;
    const section=document.createElement('section');
    section.id='owScheduler';section.className='ows-panel';
    section.innerHTML=`<div class="ows-heading"><div><span class="ows-kicker">ONE WAY · SOCIAL MEDIA</span><h3>Agendador de Posts</h3><p>Prepare publicações com aprovação manual pelo WhatsApp. A conexão de publicação automática ainda está em configuração.</p></div><span class="ows-chip">Em preparação</span></div>
      <div class="ows-form">
      <label>Cliente existente<select id="owsClient"><option value="">Selecione um cliente</option></select></label>
      <label>Data<input id="owsDate" type="date"></label>
      <label>Horário (Cuiabá)<input id="owsTime" type="time" value="18:00"></label>
      <label class="ows-wide">Legenda<textarea id="owsCaption" rows="4" placeholder="Legenda da publicação"></textarea></label>
      <label class="ows-wide">Arte ou vídeo (armazenamento privado)<input id="owsFile" type="file" accept="image/jpeg,image/png,video/mp4"></label>
      <label class="ows-check"><input id="owsApproved" type="checkbox"> Cliente aprovou este material pelo WhatsApp</label>
      </div>
      <div class="ows-footer"><span id="owsStatus" role="status">Modo de preparação: nenhum arquivo será enviado até concluirmos a integração segura.</span><button id="owsSave" type="button" disabled title="Habilitado após configurar a API autenticada">Agendar publicação</button></div>`;
    host.appendChild(section);
    const sel=section.querySelector('#owsClient');
    const known=()=> (typeof state!=='undefined'&&Array.isArray(state?.clients)?state.clients:[]);
    const refresh=()=>{
      if(typeof isAdmin==='function' && !isAdmin())return;
      const v=sel.value,cs=known();const items=cs.filter(c=>c&&c.id&&c.name);
      sel.replaceChildren(new Option('Selecione um cliente',''));
      const seen=new Set();
      for(const c of items){if(seen.has(c.id))continue;seen.add(c.id);sel.add(new Option(String(c.name),String(c.id)));}
      if([...sel.options].some(o=>o.value===v))sel.value=v;
    };
    refresh();
    section.querySelector('#owsDate').min=new Date().toLocaleDateString('en-CA',{timeZone:'America/Cuiaba'});
    const observer=new MutationObserver(()=>{if(!host.closest('.hidden'))refresh();});
    observer.observe(document.getElementById('socialMediaContent'),{attributes:true,attributeFilter:['class']});
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();