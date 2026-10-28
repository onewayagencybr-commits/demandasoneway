/* One Way | Notas compartilhadas nas demandas (Arte, Vídeo, Tráfego e Agenda).
   Usa o armazenamento e o realtime já existentes: cada nota pertence à sua demanda. */
(function(){
  'use strict';
  let openedNotesId=null;
  let savingNote=false;
  const MAX_NOTE_LENGTH=1800;

  function listNotes(d){
    return Array.isArray(d && d.notes) ? d.notes.filter(n=>n && n.id && typeof n.text==='string') : [];
  }
  function canRead(d){
    return !!(d && typeof canAccessDemand==='function' && canAccessDemand(d));
  }
  function getDemand(id){
    return state.demands.find(d=>d.id===id);
  }
  function showDate(value){
    const date=new Date(value);
    return Number.isNaN(date.getTime())?'':date.toLocaleString('pt-BR',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
  }
  function noteCount(d){
    return listNotes(d).length;
  }
  function badge(d,context){
    const count=noteCount(d);
    if(!count)return null;
    const span=document.createElement('span');
    span.className='ow-notes-indicator '+(context==='agenda'?'ow-notes-in-agenda':'');
    span.title=count===1?'Esta demanda tem 1 observação':('Esta demanda tem '+count+' observações');
    span.setAttribute('aria-label',span.title);
    span.textContent=count===1?'1 nota':count+' notas';
    return span;
  }
  function panelHTML(d){
    const entries=listNotes(d);
    const opened=openedNotesId===d.id;
    const items=entries.length?entries.map(n=>{
      const mayDelete=isAdmin()||n.author===currentUser;
      return '<article class="ow-note-entry">'+
        '<div class="ow-note-entry-head"><span class="ow-note-author">'+esc(n.author||'Equipe')+'</span>'+
        '<span class="ow-note-time">'+esc(showDate(n.createdAt))+'</span>'+
        (mayDelete?'<button type="button" class="ow-note-delete" data-ow-delete-note="'+esc(n.id)+'" data-ow-demand-id="'+esc(d.id)+'" aria-label="Excluir esta observação">Excluir</button>':'')+
        '</div><p>'+esc(n.text)+'</p></article>';
    }).join(''):'<div class="ow-notes-empty">Ainda não há observações. Escreva a primeira para a equipe.</div>';
    return '<section class="ow-notes-panel" aria-label="Notas e observações da demanda">'+
      '<button type="button" class="ow-notes-toggle" data-ow-toggle-notes="'+esc(d.id)+'" aria-expanded="'+(opened?'true':'false')+'">'+
        '<span class="ow-notes-toggle-title"><span class="ow-notes-glyph" aria-hidden="true">✎</span> Notas e observações'+(entries.length?'<span class="ow-notes-total">'+entries.length+'</span>':'')+'</span>'+
        '<span class="ow-notes-toggle-action">'+(opened?'Fechar':'Abrir notas')+' <span aria-hidden="true">'+(opened?'⌃':'⌄')+'</span></span></button>'+
      (opened?'<div class="ow-notes-content"><div class="ow-notes-thread">'+items+'</div>'+
        '<form class="ow-notes-form" data-ow-demand-id="'+esc(d.id)+'">'+
        '<label for="ow-note-text-'+esc(d.id)+'">Nova observação</label>'+
        '<textarea id="ow-note-text-'+esc(d.id)+'" name="note" required maxlength="'+MAX_NOTE_LENGTH+'" rows="3" placeholder="Escreva um ajuste, retorno ou informação para a equipe..."></textarea>'+
        '<div class="ow-notes-form-foot"><span>Compartilhada com a equipe em tempo real</span><button type="submit" class="ow-note-submit">Adicionar nota</button></div>'+
        '</form></div>':'')+
      '</section>';
  }
  function decorateClients(){
    document.querySelectorAll('#clients .demand[data-demand-id]').forEach(el=>{
      const d=getDemand(el.dataset.demandId);
      if(!canRead(d))return;
      const rowTitle=el.querySelector('.demand-row .demand-title');
      if(rowTitle&&!rowTitle.querySelector('.ow-notes-indicator')){
        const chip=badge(d,'demand');
        if(chip)rowTitle.appendChild(chip);
      }
      const detail=el.querySelector('.detail-panel');
      if(!detail||detail.querySelector('.ow-notes-panel'))return;
      const template=document.createElement('template');
      template.innerHTML=panelHTML(d);
      const panel=template.content.firstElementChild;
      const actions=detail.querySelector('.detail-actions');
      detail.insertBefore(panel,actions||null);
    });
  }
  function decorateAgenda(){
    document.querySelectorAll('#agendaList [data-agenda-id]').forEach(row=>{
      const d=getDemand(row.dataset.agendaId);
      if(!canRead(d))return;
      const info=row.querySelector('.agenda-info');
      if(info&&!info.querySelector('.ow-notes-indicator')){
        const chip=badge(d,'agenda');
        if(chip)info.appendChild(chip);
      }
      if(!row.dataset.owNotesWired){
        row.dataset.owNotesWired='true';
        row.addEventListener('click',()=>{openedNotesId=row.dataset.agendaId},true);
      }
    });
  }
  function refreshClients(){
    if(typeof renderClients==='function')renderClients();
  }
  async function addNote(id,message){
    const d=getDemand(id);
    if(!canRead(d)||savingNote)return;
    const value=String(message||'').trim();
    if(!value){toast('Escreva a observação antes de adicionar.');return}
    if(value.length>MAX_NOTE_LENGTH){toast('Observação muito longa.');return}
    const previous=Array.isArray(d.notes)?d.notes.slice():undefined;
    const note={id:uid(),text:value,author:currentUser||'Equipe One Way',createdAt:new Date().toISOString()};
    savingNote=true;
    d.notes=[...listNotes(d),note];
    try{
      const ok=await saveState({strictRemote:true});
      if(!ok)throw new Error('Falha na sincronização');
      openedNotesId=id;
      refreshClients();
      toast('Nota compartilhada com a equipe.',null,null,'success');
    }catch(err){
      if(previous===undefined)delete d.notes;else d.notes=previous;
      writeLocalCache(state);
      toast('Não foi possível salvar a nota para a equipe. Tente novamente.');
      console.error('Notas de demanda:',err);
    }finally{savingNote=false}
  }
  async function deleteNote(id,noteId){
    const d=getDemand(id);
    if(!canRead(d)||savingNote)return;
    const entry=listNotes(d).find(n=>n.id===noteId);
    if(!entry||(!isAdmin()&&entry.author!==currentUser))return;
    if(!window.confirm('Excluir esta observação?'))return;
    const previous=Array.isArray(d.notes)?d.notes.slice():[];
    d.notes=previous.filter(n=>n.id!==noteId);
    savingNote=true;
    try{
      const ok=await saveState({strictRemote:true});
      if(!ok)throw new Error('Falha na sincronização');
      refreshClients();
      toast('Nota excluída.',null,null,'success');
    }catch(err){
      d.notes=previous;
      writeLocalCache(state);
      toast('Não foi possível excluir a nota. Tente novamente.');
      console.error('Exclusão de nota:',err);
    }finally{savingNote=false}
  }

  if(typeof renderClients==='function'){
    const originalRenderClients=renderClients;
    renderClients=function(){
      const result=originalRenderClients.apply(this,arguments);
      decorateClients();
      return result;
    };
  }
  if(typeof renderAgenda==='function'){
    const originalRenderAgenda=renderAgenda;
    renderAgenda=function(){
      const result=originalRenderAgenda.apply(this,arguments);
      decorateAgenda();
      return result;
    };
  }
  if(typeof renderAll==='function'){
    const originalRenderAll=renderAll;
    renderAll=function(){
      document.getElementById('app')?.classList.toggle('ow-team-view',isDesign()||isVideoUser());
      return originalRenderAll.apply(this,arguments);
    };
  }
  document.addEventListener('click',event=>{
    const toggle=event.target.closest('[data-ow-toggle-notes]');
    if(toggle){
      event.preventDefault();
      event.stopPropagation();
      const id=toggle.dataset.owToggleNotes;
      const d=getDemand(id);
      if(!canRead(d))return;
      openedNotesId=openedNotesId===id?null:id;
      refreshClients();
      return;
    }
    const del=event.target.closest('[data-ow-delete-note]');
    if(del){
      event.preventDefault();
      event.stopPropagation();
      deleteNote(del.dataset.owDemandId,del.dataset.owDeleteNote);
    }
  });
  document.addEventListener('submit',event=>{
    const form=event.target.closest('form.ow-notes-form');
    if(!form)return;
    event.preventDefault();
    const input=form.querySelector('textarea[name="note"]');
    addNote(form.dataset.owDemandId,input?.value||'');
  });
  if(document.getElementById('app')){
    document.getElementById('app').classList.toggle('ow-team-view',isDesign()||isVideoUser());
    decorateClients();
    decorateAgenda();
  }
})();