/* Checklist de equipamentos por compromisso — dados salvos no próprio calendarEvents. */
(function () {
  'use strict';
  if (window.OWEquipmentChecklist) return;

  var form = document.getElementById('wkEventForm');
  var modal = document.getElementById('weekEventModal');
  var description = document.getElementById('wkEventDescription');
  if (!form || !modal || !description || typeof saveCalendarAdminState !== 'function') return;

  // IDs estáveis: duas unidades do mesmo modelo são itens independentes.
  var groups = [
    {title:'Câmeras', items:[
      ['sony-a6700','Sony A6700'],
      ['blackmagic-pocket-6k-g2','Blackmagic Pocket 6K G2'],
      ['gopro','GoPro']
    ]},
    {title:'Lentes e adaptadores', items:[
      ['sigma-18-35','Sigma 18–35mm'],
      ['sigma-17-50','Sigma 17–50mm'],
      ['red-24-70','RED 24–70mm'],
      ['lente-50','Lente 50mm'],
      ['lente-70-300','Lente 70–300mm'],
      ['adaptador-lente','Adaptador de lente']
    ]},
    {title:'Iluminação e modificadores', items:[
      ['godox-1','Godox 1'],
      ['godox-2','Godox 2'],
      ['godox-3','Godox 3'],
      ['godox-4','Godox 4'],
      ['godox-nova-1','Iluminação Godox nova 1'],
      ['godox-nova-2','Iluminação Godox nova 2'],
      ['youngnuo','Youngnuo'],
      ['balao-chines','Balão chinês para Godox'],
      ['softbox-godox','Softbox para Godox'],
      ['softbox-fino','Softbox fino vertical'],
      ['rebatedor','Rebatedor']
    ]},
    {title:'Drones e estabilizadores', items:[
      ['dji-mini-4','Drone DJI Mini 4'],
      ['fpv-completo','Drone FPV completo'],
      ['ronin-rs3','Ronin RS3'],
      ['dji-osmo-mobile','DJI Osmo Mobile']
    ]},
    {title:'Áudio', items:[
      ['lark-m2','Lapela Lark M2'],
      ['lapela-dji','Lapela DJI'],
      ['fone','Fone de ouvido']
    ]},
    {title:'Tripés, movimento e acessórios', items:[
      ['slider','Slider'],
      ['cabeca-slider','Cabeça do slider'],
      ['tripes-laranjas','Tripés laranjas'],
      ['tripe-azul','Tripé azul'],
      ['tripe-benro','Tripé Benro'],
      ['tripes-pratas','Tripés pratas para iluminação'],
      ['baterias','Baterias'],
      ['gopro-acessorios','Acessórios de GoPro']
    ]}
  ];
  var known = new Set(groups.flatMap(function(g) {
    return g.items.map(function(item) { return item[0]; });
  }));
  function selectedIds(values) {
    if (!Array.isArray(values)) return [];
    return Array.from(new Set(values.filter(function(id) {
      return typeof id === 'string' && known.has(id);
    })));
  }
  function optionHTML(item) {
    return '<label class="ow-equip-option"><input type="checkbox" data-ow-equip="' +
      item[0] + '" value="' + item[0] + '"><span>' + item[1] + '</span><small class="ow-equip-checked-time"></small></label>';
  }
  function sectionHTML(group) {
    return '<section class="ow-equip-group"><h4>' + group.title + '</h4><div class="ow-equip-options">' +
      group.items.map(optionHTML).join('') + '</div></section>';
  }

  var style = document.createElement('style');
  style.id = 'ow-equipment-checklist-styles';
  style.textContent = [
    '.ow-equip-panel{margin:18px 0 20px;padding:0;border:1px solid rgba(155,194,250,.23);border-radius:15px;background:linear-gradient(140deg,rgba(26,58,112,.58),rgba(12,30,69,.5));color:#f2f6ff;font-family:Montserrat,Arial,sans-serif;overflow:hidden}',
    '.ow-equip-panel>details>summary{cursor:pointer;padding:17px 18px;display:flex;align-items:center;gap:10px;list-style:none;font-size:13px;font-weight:600}',
    '.ow-equip-panel>details>summary::-webkit-details-marker{display:none}',
    '.ow-equip-panel>details>summary:after{content:"⌄";margin-left:auto;color:#abc5eb;font-size:17px;transition:transform .2s}',
    '.ow-equip-panel>details[open]>summary:after{transform:rotate(180deg)}',
    '.ow-equip-summary-count{font-size:10px;font-weight:500;padding:5px 9px;border-radius:50px;background:rgba(85,149,239,.19);color:#cce0ff;white-space:nowrap}',
    '.ow-equip-body{padding:0 18px 19px}',
    '.ow-equip-help{margin:0 0 14px;font-size:11px;line-height:1.6;color:#bdcfe9}',
    '.ow-equip-tools{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 15px}',
    '.ow-equip-tools button{font:500 11px Montserrat,Arial,sans-serif;color:#e6f1ff;background:rgba(111,160,237,.13);border:1px solid rgba(165,199,246,.26);border-radius:8px;padding:8px 11px;cursor:pointer}',
    '.ow-equip-tools button:hover{background:rgba(111,160,237,.25)}',
    '.ow-equip-groups{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:13px}',
    '.ow-equip-group{min-width:0;background:rgba(255,255,255,.045);border:1px solid rgba(174,203,242,.13);border-radius:11px;padding:12px}',
    '.ow-equip-group h4{font-size:11px;line-height:1.5;font-weight:600;color:#f5f8ff;margin:0 0 9px}',
    '.ow-equip-options{display:grid;gap:6px}',
    '.ow-equip-option{display:flex;align-items:center;gap:9px;padding:7px 9px;border:1px solid rgba(174,203,242,.11);border-radius:7px;cursor:pointer;font:400 11px/1.4 Montserrat,Arial,sans-serif;color:#d6e4f8;min-width:0;transition:background .15s,border-color .15s}',
    '.ow-equip-option:has(input:checked){background:rgba(68,135,232,.17);border-color:rgba(148,195,255,.42);color:#fff}',
    '.ow-equip-checked-time{display:none;font-size:9px;color:#a5eacb;line-height:1.3;font-weight:500}.ow-equip-option:has(input:checked) .ow-equip-checked-time:not(:empty){display:block}',
    '.ow-equip-option input{width:16px;height:16px;flex:none;accent-color:#5a9dff;cursor:pointer}',
    '.ow-equip-option span{overflow-wrap:anywhere}',
    '.ow-equip-calendar-count{display:inline-block;margin-top:7px;padding:4px 8px;border-radius:7px;background:rgba(75,135,231,.14);color:#cce1ff;font:500 10px Montserrat,Arial,sans-serif}',
    '@media(max-width:700px){.ow-equip-panel>details>summary{padding:16px 13px;font-size:12px}.ow-equip-body{padding:0 12px 14px}.ow-equip-groups{grid-template-columns:1fr}.ow-equip-group{padding:12px}.ow-equip-option{padding:11px 9px;font-size:12px}.ow-equip-tools button{padding:11px 12px}}'
  ].join('\n');
  document.head.appendChild(style);

  var panel = document.createElement('section');
  panel.id = 'owEquipmentChecklist';
  panel.className = 'ow-equip-panel';
  panel.innerHTML =
    '<details id="owEquipDetails"><summary>Equipamentos da gravação <span id="owEquipCount" class="ow-equip-summary-count">0 selecionados</span></summary>' +
    '<div class="ow-equip-body"><p class="ow-equip-help">Marque o que a equipe precisa levar neste compromisso. A seleção fica salva junto à agenda e pode ser editada depois.</p>' +
    '<div class="ow-equip-tools"><button type="button" data-ow-equip-action="all">Selecionar todos</button>' +
    '<button type="button" data-ow-equip-action="clear">Limpar seleção</button></div>' +
    '<div class="ow-equip-groups">' + groups.map(sectionHTML).join('') + '</div></div></details>';
  description.closest('.field').insertAdjacentElement('afterend', panel);
  var inputs = Array.from(panel.querySelectorAll('input[data-ow-equip]'));
  var details = document.getElementById('owEquipDetails');
  var count = document.getElementById('owEquipCount');

  function currentSelection() {
    return inputs.filter(function(input) { return input.checked; })
      .map(function(input) { return input.value; });
  }
  function updateCount() {
    var n = currentSelection().length;
    count.textContent = n + (n === 1 ? ' selecionado' : ' selecionados');
  }
  function hydrate() {
    var id = document.getElementById('wkEventId').value;
    var event = id && state && Array.isArray(state.calendarEvents) ?
      state.calendarEvents.find(function(item) { return item.id === id; }) : null;
    var selected = new Set(selectedIds(event && event.equipmentChecklist));
    inputs.forEach(function(input) { input.checked = selected.has(input.value);var hint=input.closest('.ow-equip-option').querySelector('.ow-equip-checked-time');var at=event&&event.equipmentChecklistCheckedAt&&event.equipmentChecklistCheckedAt[input.value];var dt=at?new Date(at):null;hint.textContent=dt&&Number.isFinite(dt.getTime())?'✓ '+new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Cuiaba',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).format(dt):''; });
    details.open = false; // Fecha por padrão; o usuário abre quando quiser revisar.
    updateCount();
  }

  inputs.forEach(function(input) { input.addEventListener('change', updateCount); });
  panel.querySelectorAll('[data-ow-equip-action]').forEach(function(button) {
    button.addEventListener('click', function() {
      var checked = button.dataset.owEquipAction === 'all';
      inputs.forEach(function(input) { input.checked = checked; });
      updateCount();
    });
  });
  document.getElementById('wkEventType').addEventListener('change', function(event) {
    details.open = false; // Não expande automaticamente ao trocar o tipo.
  });
  new MutationObserver(function() {
    if (!modal.classList.contains('hidden')) hydrate();
  }).observe(modal, {attributes:true,attributeFilter:['class']});

  // O formulário original cria/edita o compromisso. Acoplamos os itens antes
  // da sincronização remota já existente para preservar rollback e permissões.
  var pendingSave = null;
  form.addEventListener('submit', function() {
    pendingSave = {
      id:document.getElementById('wkEventId').value,
      items:currentSelection()
    };
    queueMicrotask(function() { pendingSave = null; });
  }, true);
  var originalSave = saveCalendarAdminState;
  saveCalendarAdminState = async function() {
    if (pendingSave) {
      var pending = pendingSave;
      pendingSave = null;
      if (typeof isAdmin === 'function' && isAdmin() && state && Array.isArray(state.calendarEvents)) {
        var target = pending.id ?
          state.calendarEvents.find(function(event) { return event.id === pending.id; }) :
          state.calendarEvents[state.calendarEvents.length - 1];
        if(target){
          var previous=selectedIds(target.equipmentChecklist),next=selectedIds(pending.items);
          var stamps=Object.assign({},target.equipmentChecklistCheckedAt||{});
          next.forEach(function(id){if(!previous.includes(id))stamps[id]=new Date().toISOString();});
          Object.keys(stamps).forEach(function(id){if(!next.includes(id))delete stamps[id];});
          target.equipmentChecklist=next;
          target.equipmentChecklistCheckedAt=stamps;
        }
      }
    }
    return originalSave.apply(this, arguments);
  };

  // Identificação compacta no cartão da Agenda, sem alterar seu layout.
  var week = document.getElementById('wkDays');
  function updateCards() {
    if (!week || !state || !Array.isArray(state.calendarEvents)) return;
    week.querySelectorAll('[data-wk-event]').forEach(function(card) {
      var event = state.calendarEvents.find(function(row) { return row.id === card.dataset.wkEvent; });
      var total = selectedIds(event && event.equipmentChecklist).length;
      var badge = card.querySelector('.ow-equip-calendar-count');
      if (!total) { if (badge) badge.remove(); return; }
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'ow-equip-calendar-count';
        card.appendChild(badge);
      }
      badge.textContent = total + (total === 1 ? ' equipamento selecionado' : ' equipamentos selecionados');
    });
  }
  if (week) {
    new MutationObserver(updateCards).observe(week, {childList:true});
    updateCards();
  }

  window.OWEquipmentChecklist = {
    groups:groups,
    selectedIds:selectedIds,
    selected:currentSelection,
    hydrate:hydrate,
    updateCards:updateCards
  };
})();
