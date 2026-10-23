(function panoramaMensalModule() {
  'use strict';
  if (window.OneWayPanorama) return;

  const view = { clientId: null, agendaMode: 'list', agendaMonth: currentMonthKey(), area: 'all', client: 'all', status: 'all' };
  let draggedDemandId = null;
  const areaName = { arte: 'Arte', video: 'Vídeo', trafego: 'Tráfego' };
  const validDate = x => /^\d{4}-\d{2}-\d{2}$/.test(String(x || '')) && !Number.isNaN(new Date(x + 'T12:00:00').getTime());
  const nameKey = x => cmSelectionKey(x);
  const clientName = id => state.clients.find(c => c.id === id)?.name || 'Cliente';
  const currentDay = () => typeof demandCreationCalendarDate === 'function' ? demandCreationCalendarDate() : calendarLocalISO(new Date());
  const safeLabel = x => esc(String(x ?? ''));
  const displayArea = area => areaName[area] || AREAS[area] || area;
  const active = d => agendaView === 'finished' ? agendaDemandIsFinalized(d) : !agendaDemandIsFinalized(d);

  function matchAgendaDemand(d) {
    if (!canAccessArea(d.area)) return false;
    if (view.area !== 'all' && d.area !== view.area) return false;
    if (view.client !== 'all' && nameKey(clientName(d.clientId)) !== view.client) return false;
    if (view.status === 'approval' && !(d.status === 'purple' && ['arte', 'video'].includes(d.area))) return false;
    if (view.status === 'posting' && !(d.status === 'orange' && ['arte', 'video'].includes(d.area))) return false;
    if (view.status === 'production' && !['red', 'yellow'].includes(d.status)) return false;
    return true;
  }

  window.OneWayPanorama = { matchAgendaDemand };

  function relevantClientDemands(c) {
    const desired = clientDemandFilters.length ? clientDemandFilters : ['arte', 'video', 'trafego'];
    return demandsForClientAreas(c, desired).filter(d => canAccessArea(d.area));
  }

  function monthCalendar(monthKey, demands, context) {
    const [y, m] = monthKey.split('-').map(Number);
    if (!y || m < 1 || m > 12) return '';
    const first = new Date(y, m - 1, 1, 12);
    const offset = (first.getDay() + 6) % 7;
    const last = new Date(y, m, 0).getDate();
    const cells = Math.ceil((offset + last) / 7) * 7;
    const isoToday = currentDay();
    const byDate = new Map();
    for (const d of demands) {
      if (!validDate(d.postDate)) continue;
      if (!byDate.has(d.postDate)) byDate.set(d.postDate, []);
      byDate.get(d.postDate).push(d);
    }
    const header = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB', 'DOM']
      .map(day => `<div class="ow-pan-weekday">${day}</div>`).join('');
    let grid = '';
    for (let n = 0; n < cells; n++) {
      const date = new Date(y, m - 1, n - offset + 1, 12);
      const iso = calendarLocalISO(date);
      const outside = iso.slice(0, 7) !== monthKey;
      const items = (byDate.get(iso) || []).sort((a, b) => ['arte', 'video', 'trafego'].indexOf(a.area) - ['arte', 'video', 'trafego'].indexOf(b.area));
      const tasks = items.map(d => {
        const tint = d.area === 'arte' ? 'art' : d.area === 'video' ? 'video' : 'traffic';
        const needsApproval = d.status === 'purple' && ['arte', 'video'].includes(d.area);
        const tooltip = `${d.title}\n${clientName(d.clientId)} · ${displayArea(d.area)}\n${statusLabel(d)}\n${fmtPostDate(d.postDate)}`;
        return `<button type="button" class="ow-pan-task ow-pan-${tint} ${needsApproval ? 'ow-pan-approval' : ''}" data-ow-task="${safeLabel(d.id)}" draggable="${isAdmin() ? 'true' : 'false'}" title="${safeLabel(tooltip)}" aria-label="${safeLabel(tooltip)}"><span class="ow-pan-task-dot"></span><span class="ow-pan-task-label">${safeLabel(d.title)}</span></button>`;
      }).join('');
      grid += `<div class="ow-pan-day ${outside ? 'ow-pan-outside' : ''} ${iso === isoToday ? 'ow-pan-today' : ''}" data-ow-date="${iso}"><div class="ow-pan-day-head"><span>${date.getDate()}</span>${items.length ? `<small>${items.length}</small>` : ''}</div><div class="ow-pan-day-tasks">${tasks}</div></div>`;
    }
    const monthCount = demands.filter(d => validDate(d.postDate) && d.postDate.slice(0, 7) === monthKey).length;
    return `<div class="ow-pan-shell" data-ow-calendar="${context}" data-ow-month="${monthKey}">
      <div class="ow-pan-heading"><div><span class="ow-pan-kicker">ONE WAY · ORGANIZAÇÃO DE POSTAGENS</span><h3>Panorama mensal</h3><p>${monthCount} demanda${monthCount === 1 ? '' : 's'} neste mês. ${isAdmin() ? 'Arraste uma demanda para reagendar; no celular, toque nela.' : 'Toque em uma demanda para ver seus detalhes.'}</p></div>
        <div class="ow-pan-month-controls"><button type="button" data-ow-shift="-1" aria-label="Mês anterior">‹</button><strong>${safeLabel(fmtMonth(monthKey))}</strong><button type="button" data-ow-shift="1" aria-label="Próximo mês">›</button></div></div>
      <div class="ow-pan-legend"><span><i class="ow-legend-art"></i> Artes</span><span><i class="ow-legend-video"></i> Vídeos</span><span><i class="ow-legend-traffic"></i> Tráfego</span><span><i class="ow-legend-approval"></i> Aguardando aprovação</span></div>
      <div class="ow-pan-scroll"><div class="ow-pan-grid">${header}${grid}</div></div>
      <div class="ow-pan-editor hidden" role="group" aria-label="Reagendar demanda">
        <div class="ow-pan-editor-copy"><strong class="ow-pan-editor-title"></strong><span class="ow-pan-editor-client"></span></div>
        <label>Nova data <input type="date" class="ow-pan-date-input"></label>
        <div class="ow-pan-editor-actions">${isAdmin() ? '<button type="button" class="ow-pan-save primary">Salvar data</button>' : ''}<button type="button" class="ow-pan-open ghost">Abrir demanda</button><button type="button" class="ow-pan-cancel ghost">Fechar</button></div>
      </div></div>`;
  }

  async function changeDemandDate(id, date) {
    if (!isAdmin() || !validDate(date)) return;
    const d = state.demands.find(x => x.id === id);
    if (!d) return;
    if (d.postDate === date) return;
    const oldDate = d.postDate, oldMonth = d.month;
    d.postDate = date;
    d.month = date.slice(0, 7);
    const saved = await saveState({ strictRemote: true });
    if (!saved) {
      d.postDate = oldDate;
      d.month = oldMonth;
      writeLocalCache(state);
      toast('Não foi possível sincronizar a nova data. A demanda voltou ao dia anterior.');
      renderAll();
      return;
    }
    renderAll();
    toast(`Demanda reagendada para ${fmtPostDate(date)}. Alteração sincronizada.`, null, null, 'success');
  }

  function navigateDemand(id) {
    const d = state.demands.find(x => x.id === id);
    if (!d || !canAccessArea(d.area)) return;
    currentArea = d.area;
    currentMonth = d.month;
    openClientId = d.clientId;
    openDemandId = d.id;
    view.clientId = null;
    renderAll();
    setTimeout(() => document.getElementById('clients')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  }

  function bindCalendarEvents(scope) {
    scope.querySelectorAll('.ow-pan-shell').forEach(shell => {
      const context = shell.dataset.owCalendar;
      const month = shell.dataset.owMonth;
      shell.querySelectorAll('[data-ow-shift]').forEach(button => {
        button.onclick = () => {
          const next = addMonths(month, Number(button.dataset.owShift));
          if (context === 'client') {
            currentMonth = next;
            openDemandId = null;
            renderAll();
          } else {
            view.agendaMonth = next;
            renderAgenda();
          }
        };
      });
      const editor = shell.querySelector('.ow-pan-editor');
      const title = editor.querySelector('.ow-pan-editor-title');
      const subtitle = editor.querySelector('.ow-pan-editor-client');
      const input = editor.querySelector('.ow-pan-date-input');
      let selectedId = null;
      const showEditor = id => {
        const d = state.demands.find(x => x.id === id);
        if (!d) return;
        selectedId = id;
        title.textContent = d.title;
        subtitle.textContent = `${clientName(d.clientId)} · ${displayArea(d.area)} · ${statusLabel(d)}`;
        input.value = validDate(d.postDate) ? d.postDate : currentDay();
        input.disabled = !isAdmin();
        const field = input.closest('label');
        if (field) field.classList.toggle('hidden', !isAdmin());
        editor.classList.remove('hidden');
        if (window.matchMedia('(max-width: 760px)').matches) editor.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      };
      shell.querySelectorAll('.ow-pan-task').forEach(task => {
        task.onclick = event => { event.stopPropagation(); showEditor(task.dataset.owTask); };
        if (isAdmin()) {
          task.addEventListener('dragstart', event => {
            draggedDemandId = task.dataset.owTask;
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', draggedDemandId);
            task.classList.add('ow-pan-dragging');
          });
          task.addEventListener('dragend', () => {
            draggedDemandId = null;
            shell.querySelectorAll('.ow-pan-drop-target').forEach(x => x.classList.remove('ow-pan-drop-target'));
            task.classList.remove('ow-pan-dragging');
          });
        }
      });
      if (isAdmin()) shell.querySelectorAll('.ow-pan-day').forEach(day => {
        day.addEventListener('dragover', event => {
          if (!draggedDemandId) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = 'move';
          day.classList.add('ow-pan-drop-target');
        });
        day.addEventListener('dragleave', event => {
          if (!day.contains(event.relatedTarget)) day.classList.remove('ow-pan-drop-target');
        });
        day.addEventListener('drop', event => {
          event.preventDefault();
          day.classList.remove('ow-pan-drop-target');
          const id = draggedDemandId || event.dataTransfer.getData('text/plain');
          draggedDemandId = null;
          if (state.demands.some(d => d.id === id)) changeDemandDate(id, day.dataset.owDate);
        });
      });
      editor.querySelector('.ow-pan-cancel').onclick = () => editor.classList.add('hidden');
      editor.querySelector('.ow-pan-open').onclick = () => selectedId && navigateDemand(selectedId);
      const saveButton = editor.querySelector('.ow-pan-save');
      if (saveButton) saveButton.onclick = async () => {
        if (!selectedId || !validDate(input.value)) {
          toast('Selecione uma data válida.'); return;
        }
        saveButton.disabled = true;
        try { await changeDemandDate(selectedId, input.value); }
        finally { saveButton.disabled = false; }
      };
    });
  }

  const previousRenderClient = renderClient;
  renderClient = function (client, index) {
    const showingCalendar = view.clientId === client.id;
    if (isAdmin() && showingCalendar) {
      const filterKey = `${currentArea}|${currentMonth}|${client.id}`;
      if (clientDemandFilterKey !== filterKey) {
        clientDemandFilterKey = filterKey;
        clientDemandFilters = ['arte', 'video', 'trafego'].filter(canAccessArea);
      }
    }
    let html = previousRenderClient(client, index);
    if (!isAdmin() || openClientId !== client.id) return html;
    const marker = '</div></div><div class="demand-list">';
    if (!html.includes(marker)) return html;
    const tab = `<button type="button" class="client-area-filter-btn ow-client-panorama-tab ${showingCalendar ? 'selected' : ''}" data-ow-client-panorama="${safeLabel(client.id)}" aria-pressed="${showingCalendar}">Panorama mensal</button>`;
    const calendar = showingCalendar ? monthCalendar(currentMonth, relevantClientDemands(client), 'client') : '';
    html = html.replace(marker, `${tab}</div></div>${calendar}<div class="demand-list">`);
    if (showingCalendar) html = html.replace('class="client open', 'class="client open ow-client-panorama-visible');
    return html;
  };

  const previousBindClientEvents = bindClientEvents;
  bindClientEvents = function (root) {
    previousBindClientEvents(root);
    root.querySelectorAll('[data-ow-client-panorama]').forEach(button => {
      button.onclick = event => {
        event.stopPropagation();
        if (!isAdmin()) return;
        const id = button.dataset.owClientPanorama;
        if (view.clientId === id) view.clientId = null;
        else {
          view.clientId = id;
          clientDemandFilters = ['arte', 'video', 'trafego'].filter(canAccessArea);
        }
        openDemandId = null;
        renderClients();
      };
    });
    bindCalendarEvents(root);
  };

  function addAgendaToolbar() {
    const wrap = document.querySelector('#agendaContent .agenda-wrap');
    if (!wrap) return;
    let bar = document.getElementById('ow-pan-agenda-toolbar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'ow-pan-agenda-toolbar';
      bar.className = 'ow-pan-agenda-toolbar';
      document.getElementById('agendaViewTabs')?.after(bar);
    }
    const areas = allowedAreaKeys();
    const names = cmSelectableNames();
    const keys = new Map();
    for (const name of names) if (!keys.has(nameKey(name))) keys.set(nameKey(name), name);
    const options = Array.from(keys, ([key, name]) => `<option value="${safeLabel(key)}" ${view.client === key ? 'selected' : ''}>${safeLabel(name)}</option>`).join('');
    const areaOptions = areas.map(a => `<option value="${a}" ${view.area === a ? 'selected' : ''}>${safeLabel(displayArea(a))}</option>`).join('');
    bar.innerHTML = `<div class="ow-pan-agenda-filters">
      <label>Área<select id="ow-pan-area-filter"><option value="all">Todas as áreas</option>${areaOptions}</select></label>
      <label>Cliente<select id="ow-pan-client-filter"><option value="all">Todos os clientes</option>${options}</select></label>
      <label>Situação<select id="ow-pan-status-filter"><option value="all">Todas</option><option value="approval">Aguardando aprovação</option><option value="posting">Aguardando postagem</option><option value="production">Em produção / Não feito</option></select></label></div>
      <div class="ow-pan-mode-picker"><button class="${view.agendaMode === 'list' ? 'selected' : ''}" type="button" data-ow-mode="list">Lista</button><button class="${view.agendaMode === 'calendar' ? 'selected' : ''}" type="button" data-ow-mode="calendar">Panorama mensal</button></div>`;
    bar.querySelector('#ow-pan-area-filter').value = areas.includes(view.area) ? view.area : 'all';
    if (!keys.has(view.client)) view.client = 'all';
    bar.querySelector('#ow-pan-client-filter').value = view.client;
    bar.querySelector('#ow-pan-status-filter').value = view.status;
    bar.querySelector('#ow-pan-area-filter').onchange = e => { view.area = e.target.value; renderAgenda(); };
    bar.querySelector('#ow-pan-client-filter').onchange = e => { view.client = e.target.value; renderAgenda(); };
    bar.querySelector('#ow-pan-status-filter').onchange = e => { view.status = e.target.value; renderAgenda(); };
    bar.querySelectorAll('[data-ow-mode]').forEach(button => button.onclick = () => {
      view.agendaMode = button.dataset.owMode;
      renderAgenda();
    });
    let cal = document.getElementById('ow-pan-agenda-calendar');
    if (!cal) {
      cal = document.createElement('div');
      cal.id = 'ow-pan-agenda-calendar';
      cal.className = 'ow-pan-agenda-calendar';
      bar.after(cal);
    }
    const list = document.getElementById('agendaList');
    list?.classList.toggle('hidden', view.agendaMode === 'calendar');
    cal.classList.toggle('hidden', view.agendaMode !== 'calendar');
    if (view.agendaMode === 'calendar') {
      const demands = state.demands.filter(matchAgendaDemand).filter(active)
        .filter(d => validDate(d.postDate) && d.postDate.slice(0, 7) === view.agendaMonth)
        .filter(d => {
          const q = document.getElementById('searchInput')?.value.trim().toLocaleLowerCase('pt-BR') || '';
          return !q || `${d.title || ''} ${d.description || ''} ${clientName(d.clientId)}`.toLocaleLowerCase('pt-BR').includes(q);
        });
      cal.innerHTML = monthCalendar(view.agendaMonth, demands, 'agenda');
      bindCalendarEvents(cal);
    }
    document.querySelectorAll('#agendaList [data-agenda-id]').forEach(node => {
      const d = state.demands.find(x => x.id === node.dataset.agendaId);
      node.classList.toggle('ow-awaiting-approval', !!d && d.status === 'purple' && ['arte', 'video'].includes(d.area));
    });
  }

  const previousRenderAgenda = renderAgenda;
  renderAgenda = function (...args) {
    previousRenderAgenda(...args);
    addAgendaToolbar();
  };

  // A primeira renderização pode começar antes de os scripts deferidos carregarem.
  // A atualização é pequena e só acontece se a sessão já estiver dentro do sistema.
  if (currentUser && currentArea === 'agenda') renderAgenda();
  else if (currentUser && openClientId && Object.prototype.hasOwnProperty.call(AREAS, currentArea)) renderClients();
})();
