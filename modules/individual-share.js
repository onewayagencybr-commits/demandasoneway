/* One Way — Compartilhar individualmente compromissos, checklists e demandas. */
(function () {
  'use strict';
  if (window.OWIndividualShare) return;
  var form = document.getElementById('wkEventForm');
  var eventModal = document.getElementById('weekEventModal');
  var clients = document.getElementById('clients');
  if (!form || !eventModal || !clients) return;
  var pendingCardScan = false;

  function val(id) {
    var input = document.getElementById(id);
    return input ? String(input.value || '').trim() : '';
  }
  function line(value) { return String(value == null ? '' : value).trim(); }
  function labelDate(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(line(iso))) return 'Não definida';
    var p = iso.split('-').map(Number), date = new Date(p[0],p[1]-1,p[2]);
    return date.getFullYear() === p[0] && date.getMonth() === p[1]-1 && date.getDate() === p[2] ?
      new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric'}).format(date) : line(iso);
  }
  function clientName(id) {
    if (!id || !state || !Array.isArray(state.clients)) return '';
    var selected = state.clients.find(function(c) {return c.id === id;});
    return selected ? line(selected.name) : '';
  }
  function currentAppointment() {
    var id = val('wkEventId');
    var stored = id && state && Array.isArray(state.calendarEvents) ?
      state.calendarEvents.find(function(e) { return e.id === id; }) : null;
    var equipment = document.querySelectorAll('#owEquipmentChecklist input[data-ow-equip]:checked');
    return {
      id:id,
      type:val('wkEventType') || 'Compromisso',
      title:val('wkEventTitle') || (stored && stored.title) || 'Sem título',
      client:clientName(val('wkEventClient')) || 'Equipe One Way',
      date:val('wkEventDate') || (stored && stored.date) || '',
      time:val('wkEventTime') || '',
      description:val('wkEventDescription') || '',
      equipmentIds:equipment.length ? Array.from(equipment).map(function(e) {return e.value;}) :
        ((document.getElementById('owEquipmentChecklist') && !document.querySelector('#owEquipmentChecklist input[data-ow-equip]')) ? (stored && stored.equipmentChecklist || []) : [])
    };
  }
  function equipmentGroups() {
    var source=window.OWEquipmentChecklist && window.OWEquipmentChecklist.groups;
    return Array.isArray(source) ? source : [];
  }
  function equipmentLines(equipmentIds) {
    var selected = new Set(Array.isArray(equipmentIds)?equipmentIds:[]);
    var out=[],matched = 0;
    equipmentGroups().forEach(function(group) {
      var entries = group.items.filter(function(item) {return selected.has(item[0]);});
      if (!entries.length) return;
      matched += entries.length;
      out.push('*' + group.title + '*');
      entries.forEach(function(item) {out.push('☐ ' + item[1]);});
      out.push('');
    });
    return {total:matched, lines:out};
  }
  function formatAppointment(appointment, onlyEquipment) {
    var gear=equipmentLines(appointment.equipmentIds);
    var lines=[
      onlyEquipment ? '📋 *CHECKLIST DE EQUIPAMENTOS | ONE WAY*' : '📆 *COMPROMISSO | ONE WAY*',
      '',
      '*Assunto:* ' + line(appointment.title),
      '*Cliente:* ' + line(appointment.client),
      '*Tipo:* ' + line(appointment.type),
      '*Data:* ' + labelDate(appointment.date) + (appointment.time ? ' às ' + appointment.time : '')
    ];
    if (!onlyEquipment && appointment.description) lines.push('*Observações:* ' + line(appointment.description));
    lines.push('','*Equipamentos para levar (' + gear.total + '):*');
    if (gear.total) lines.push.apply(lines,gear.lines);
    else lines.push('Nenhum equipamento selecionado.');
    if (gear.total) lines.push('Marque cada item ao conferir antes de sair.');
    return lines.join('\n').trim();
  }
  function formatDemand(d) {
    if (!d || !canAccessDemand(d)) return '';
    var client=clientName(d.clientId) || 'Cliente não encontrado';
    var lines=[
      '📌 *DEMANDA | ONE WAY*',
      '',
      '*Cliente:* ' + client,
      '*Área:* ' + (AREAS[d.area] || d.area || 'Não definida'),
      '*Título:* ' + line(d.title || 'Demanda sem título'),
      '*Responsável:* ' + (typeof demandAssignee === 'function' && demandAssignee(d) || 'Não definido'),
      '*Data prevista:* ' + labelDate(d.postDate),
      '*Status:* ' + (typeof statusLabel === 'function' ? statusLabel(d) : line(d.status)),
    ];
    if (line(d.description)) lines.push('','*Descrição:*',line(d.description));
    var refs = [].concat(d.links || [],d.productionLinks || []).filter(function(url) {
      return typeof url === 'string' && /^https?:\/\/[^\s]+$/i.test(url.trim());
    });
    if (refs.length) lines.push('','*Referências e arquivos:*',...Array.from(new Set(refs)));
    var finalLink=line(d.finalLink);
    if (/^https?:\/\/[^\s]+$/i.test(finalLink)) lines.push('','*Material finalizado:* ' + finalLink);
    return lines.join('\n').trim();
  }
  async function clipboardCopy(text) {
    if (!text) return false;
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      try {await navigator.clipboard.writeText(text);return true;}catch(e){}
    }
    // Fallback para navegadores móveis que não concedem Clipboard API.
    var area=document.createElement('textarea');
    area.value=text;
    area.setAttribute('readonly','');
    area.style.cssText='position:fixed;left:-9999px;top:0;opacity:0';
    document.body.appendChild(area);
    area.focus();area.select();area.setSelectionRange(0,text.length);
    var ok=false;
    try {ok=document.execCommand('copy');}catch(e){}
    area.remove();
    if (!ok && typeof window.prompt === 'function') window.prompt('Copie o texto para enviar no WhatsApp:',text);
    return ok;
  }
  async function perform(text, mode) {
    if (!text) return;
    if (mode==='share' && navigator.share) {
      try {await navigator.share({text:text});return;}
      catch(e) {if (e && e.name === 'AbortError') return;}
    }
    var ok = await clipboardCopy(text);
    if (typeof toast === 'function') toast(ok ?
      'Texto copiado! Abra o grupo do WhatsApp e cole a mensagem.' :
      'Selecione e copie o texto para compartilhar.');
  }
  function actionButton(title,action,className) {
    var button=document.createElement('button');
    button.type='button';
    button.className=className || 'ghost small ow-share-btn';
    button.dataset.owShare=action;
    button.textContent=title;
    return button;
  }
  // Compartilhamento do compromisso inteiro no próprio modal.
  var footer=form.querySelector('.modal-actions');
  if (footer) {
    var copy=actionButton('Copiar compromisso','appointment');
    footer.insertBefore(copy,footer.firstChild);
  }
  // Compartilhamento do checklist exatamente com o que está marcado.
  function addGearTools() {
    var panel=document.getElementById('owEquipmentChecklist');
    if (!panel || panel.querySelector('[data-ow-share="equipment"]')) return;
    var tools=panel.querySelector('.ow-equip-tools');
    if (!tools) return;
    tools.appendChild(actionButton('Copiar checklist','equipment','ow-share-btn ow-share-equipment'));
    if (navigator.share) tools.appendChild(actionButton('Compartilhar','share-equipment','ow-share-btn ow-share-equipment'));
    var details=panel.querySelector('details');
    if (details) details.open=false;
  }
  addGearTools();
  // Equipamento é carregado por extensão assíncrona, sem ordem garantida.
  new MutationObserver(function() {addGearTools();}).observe(form,{childList:true,subtree:false});
  new MutationObserver(function() {
    if (eventModal.classList.contains('hidden')) return;
    var details=document.querySelector('#owEquipmentChecklist details');
    if (details) details.open=false;
  }).observe(eventModal,{attributes:true,attributeFilter:['class']});
  var typeField=document.getElementById('wkEventType');
  if (typeField) typeField.addEventListener('change',function() {
    var details=document.querySelector('#owEquipmentChecklist details');
    if(details)details.open=false;
  });
  // Botão individual em cada demanda expandida (inclusive usuários de produção).
  function installDemandButtons() {
    if (pendingCardScan) return;
    pendingCardScan=true;
    try {
      clients.querySelectorAll('.demand[data-demand-id]').forEach(function(card) {
        if (card.querySelector('[data-ow-share="demand"]')) return;
        var target=card.querySelector('.detail-actions') || card.querySelector('.detail-panel');
        if (!target) return;
        target.insertBefore(actionButton('Copiar demanda','demand'),target.firstChild);
      });
    } finally {pendingCardScan=false;}
  }
  new MutationObserver(installDemandButtons).observe(clients,{childList:true,subtree:true});
  installDemandButtons();
  document.addEventListener('click',function(event) {
    var button=event.target.closest('[data-ow-share]');
    if (!button) return;
    event.preventDefault();event.stopPropagation();
    var action=button.dataset.owShare;
    if (action==='demand') {
      var card=button.closest('.demand[data-demand-id]');
      var d=card && state && Array.isArray(state.demands) ?
        state.demands.find(function(x) {return x.id===card.dataset.demandId;}) : null;
      if (d && canAccessDemand(d)) perform(formatDemand(d),'copy');
      return;
    }
    if (!isAdmin()) return;
    var appointment=currentAppointment();
    if (action==='appointment') perform(formatAppointment(appointment,false),'copy');
    if (action==='equipment') perform(formatAppointment(appointment,true),'copy');
    if (action==='share-equipment') perform(formatAppointment(appointment,true),'share');
  },true);

  var style=document.createElement('style');
  style.id='ow-share-and-equipment-polish';
  style.textContent=[
    '.ow-share-btn{font:500 11px Montserrat,Arial,sans-serif!important;cursor:pointer;white-space:nowrap}',
    '.ow-share-equipment{padding:9px 12px!important;background:#eaf1fb!important;color:#1c4075!important;border:1px solid #cddbef!important;border-radius:8px!important}',
    '.ow-share-equipment:hover{background:#dce9fb!important}',
    '.ow-equip-panel{background:#f7f9fd!important;color:#203758!important;border:1px solid #d7e2ef!important;border-radius:13px!important;box-shadow:none!important}',
    '.ow-equip-panel>details>summary{color:#203758!important;padding:14px 16px!important;font-weight:600!important}',
    '.ow-equip-summary-count{background:#e9f0fc!important;color:#355d95!important}',
    '.ow-equip-panel>details>summary:after{color:#5b7093!important}',
    '.ow-equip-body{padding:0 14px 14px!important}',
    '.ow-equip-help{color:#5d6f88!important;margin-bottom:12px!important}',
    '.ow-equip-tools{margin-bottom:12px!important}',
    '.ow-equip-tools button:not(.ow-share-equipment){color:#35517d!important;background:#eef3fa!important;border-color:#dae5f1!important}',
    '.ow-equip-groups{gap:9px!important}',
    '.ow-equip-group{background:#fff!important;border:1px solid #e4eaf3!important;padding:11px!important;border-radius:10px!important}',
    '.ow-equip-group h4{color:#24416c!important;font-size:11px!important;margin-bottom:7px!important}',
    '.ow-equip-options{gap:4px!important}',
    '.ow-equip-option{color:#3b4f6b!important;border-color:transparent!important;padding:7px 8px!important;background:#f7f9fc!important;font-size:11px!important}',
    '.ow-equip-option:has(input:checked){background:#e6effd!important;border-color:#c9ddfb!important;color:#183c78!important}',
    '.ow-equip-option input{accent-color:#367be6!important}',
    '.ow-equip-calendar-count{background:#dfeaff!important;color:#244a88!important}',
    '.ow-equip-panel>details:not([open]) .ow-equip-body{display:none}',
    '.ow-share-demand-actions{display:flex;justify-content:flex-end;margin:10px 0}',
    '#wkEventForm .modal-actions .ow-share-btn{margin-right:8px}',
    '@media(max-width:700px){.ow-equip-panel>details>summary{padding:13px!important;font-size:12px!important}.ow-equip-body{padding:0 12px 12px!important}.ow-equip-groups{grid-template-columns:1fr!important}.ow-equip-option{padding:9px 8px!important;font-size:12px!important}.ow-equip-tools{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))}.ow-equip-tools button{white-space:normal!important;min-width:0}.ow-equip-tools .ow-share-equipment{grid-column:span 1}#wkEventForm .modal-actions{gap:8px!important;flex-wrap:wrap!important}#wkEventForm .modal-actions .ow-share-btn{flex:1 0 100%;margin-right:0!important}}'
  ].join('\n');
  document.head.appendChild(style);
  window.OWIndividualShare={formatAppointment:formatAppointment,formatDemand:formatDemand,equipmentLines:equipmentLines,currentAppointment:currentAppointment,clipboardCopy:clipboardCopy};
})();
