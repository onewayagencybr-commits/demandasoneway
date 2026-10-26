/* One Way · Panorama mensal (extensão aditiva, sem alterar demais módulos) */
(function () {
  'use strict';
  if (typeof renderClient !== 'function' || typeof renderAgenda !== 'function' ||
      typeof bindClientEvents !== 'function' || typeof saveState !== 'function') return;

  var originalRenderClient = renderClient;
  var originalBindClientEvents = bindClientEvents;
  var originalRenderAgenda = renderAgenda;
  var originalAgendaAreaFilter = agendaAreaFilter;
  var activeClientId = null;
  var clientCalendarMode = false;
  var clientCalendarMonth = '';
  var agendaCalendarMode = false;
  var agendaCalendarMonth = currentMonthKey();
  var agendaCalendarArea = 'all';
  var selectedCalendarDemand = '';
  var calendarSaving = false;

  function safeMonth(value) {
    return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(value || '')) ? value : currentMonthKey();
  }
  function changeMonth(value, delta) {
    var parts = safeMonth(value).split('-').map(Number);
    var date = new Date(parts[0], parts[1] - 1 + delta, 1);
    return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0');
  }
  function validISO(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
    var date = new Date(value + 'T12:00:00');
    return Number.isFinite(date.getTime()) && calendarLocalISO(date) === value;
  }
  function clientForDemand(d) {
    return state.clients.find(function (client) { return client.id === d.clientId; });
  }
  function displayClient(d) {
    var c = clientForDemand(d);
    return c ? c.name : 'Cliente';
  }
  function areaAccessible(d) {
    return !!d && allowedAreaKeys().includes(d.area);
  }
  function clientMonthlyDemands(client, month, areas) {
    var name = cmKey(client.name);
    var ids = new Set(state.clients.filter(function (linked) {
      return !linked.mergedInto && cmKey(linked.name) === name && areas.includes(linked.area);
    }).map(function (linked) { return linked.id; }));
    return state.demands.filter(function (d) {
      return ids.has(d.clientId) && areas.includes(d.area) &&
        validISO(d.postDate) && d.postDate.slice(0, 7) === month;
    }).sort(sortClientDemandsByPostDate);
  }
  function agendaMonthlyDemands(month) {
    return state.demands.filter(function (d) {
      return matchesAgendaAssignee(d) && (agendaCalendarArea === 'all' || d.area === agendaCalendarArea) &&
        validISO(d.postDate) && d.postDate.slice(0, 7) === month;
    }).sort(sortClientDemandsByPostDate);
  }
  function areaLabel(area) {
    return area === 'socialMedia' ? 'Social Media' : (AREAS[area] || area);
  }
  function buildCalendar(items, month, scope) {
    month = safeMonth(month);
    var parts = month.split('-').map(Number), first = new Date(parts[0], parts[1] - 1, 1);
    var lastDay = new Date(parts[0], parts[1], 0).getDate();
    var previousDays = (first.getDay() + 6) % 7;
    var totalCells = Math.ceil((previousDays + lastDay) / 7) * 7;
    var grouped = Object.create(null);
    items.forEach(function (d) {
      (grouped[d.postDate] || (grouped[d.postDate] = [])).push(d);
    });
    var head = '<div class="ow-month-head"><div><span class="ow-month-eyebrow">ONE WAY · ORGANIZAÇÃO VISUAL</span>' +
      '<h3>Panorama mensal</h3><p>Arraste as demandas entre os dias. No celular, toque na demanda e depois no destino.</p></div>' +
      '<div class="ow-month-nav"><button type="button" data-ow-month="-1" aria-label="Mês anterior">‹</button>' +
      '<strong>' + esc(fmtMonth(month)) + '</strong>' +
      '<button type="button" data-ow-month="1" aria-label="Próximo mês">›</button></div></div>';
    var legend = '<div class="ow-month-legend"><span class="ow-legend-arte">Arte</span>' +
      '<span class="ow-legend-video">Vídeo</span><span class="ow-legend-trafego">Tráfego</span>' +
      '<span class="ow-legend-count">' + items.length + ' demanda' + (items.length === 1 ? '' : 's') + ' no mês</span></div>';
    var weekday = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']
      .map(function (label) { return '<span class="ow-weekday">' + label + '</span>'; }).join('');
    var cells = '';
    for (var i = 0; i < totalCells; i++) {
      var date = new Date(parts[0], parts[1] - 1, 1 - previousDays + i);
      var iso = calendarLocalISO(date);
      var inMonth = iso.slice(0, 7) === month;
      var dayItems = grouped[iso] || [];
      var dayClasses = 'ow-day' + (inMonth ? '' : ' ow-day-outside') +
        (iso === calendarLocalISO(new Date()) ? ' ow-day-today' : '') +
        (dayItems.length > 1 ? ' ow-day-busy' : '');
      cells += '<div class="' + dayClasses + '" data-ow-date="' + esc(iso) + '" role="group" aria-label="' + esc(fmtPostDate(iso)) + '">' +
        '<div class="ow-day-top"><span>' + date.getDate() + '</span>' +
        (dayItems.length ? '<small>' + dayItems.length + ' demanda' + (dayItems.length === 1 ? '' : 's') + '</small>' : '') +
        '</div><div class="ow-day-items">';
      dayItems.forEach(function (d) {
        var title = (scope === 'agenda' ? displayClient(d) + ' · ' : '') + String(d.title || 'Sem título');
        var description = displayClient(d) + ' | ' + areaLabel(d.area) + ' | ' +
          String(d.title || '') + ' | ' + statusLabel(d) + ' | ' + fmtPostDate(d.postDate);
        cells += '<div class="ow-cal-demand ow-cal-' + esc(d.area) + (d.id === selectedCalendarDemand ? ' ow-cal-selected' : '') +
          (d.status === 'purple' && d.area !== 'trafego' ? ' ow-cal-approval' : '') +
          (d.status === 'salmon' && d.area !== 'trafego' ? ' ow-cal-oneway' : '') +
          '" data-ow-demand="' + esc(d.id) + '" draggable="' + (isAdmin() && !calendarSaving ? 'true' : 'false') +
          '" title="' + esc(description) + '" tabindex="0" role="button" aria-label="' + esc(description) + '">' +
          '<span class="ow-cal-text">' + esc(title) + '</span>' +
          '<button type="button" class="ow-cal-open" data-ow-open="' + esc(d.id) + '" title="Abrir demanda" aria-label="Abrir demanda">↗</button></div>';
      });
      cells += '</div></div>';
    }
    return '<div class="ow-month-shell" data-ow-scope="' + scope + '">' + head + legend +
      '<div class="ow-calendar-scroll"><div class="ow-calendar-grid">' + weekday + cells +
      '</div></div><div class="ow-month-foot" aria-live="polite">' +
      (selectedCalendarDemand ? 'Demanda selecionada. Escolha um dia para reagendar ou outra demanda para cancelar.' :
        'Passe o mouse para ver os detalhes. A alteração de data é salva para toda a equipe.') +
      '</div></div>';
  }

  async function rescheduleDemand(id, newDate) {
    if (!isAdmin() || calendarSaving || !validISO(newDate)) return;
    var item = state.demands.find(function (d) { return d.id === id; });
    if (!item || !areaAccessible(item)) return;
    selectedCalendarDemand = '';
    if (item.postDate === newDate) {
      if (currentArea === 'agenda') renderAgenda(); else renderClients();
      return;
    }
    var originalDate = item.postDate, originalMonth = item.month;
    calendarSaving = true;
    item.postDate = newDate;
    item.month = newDate.slice(0, 7);
    try {
      var synced = await saveState({ strictRemote: true });
      if (!synced) throw new Error('Falha ao salvar na nuvem');
      toast('Demanda reagendada para ' + fmtPostDate(newDate) + '.', null, null, 'success');
    } catch (error) {
      item.postDate = originalDate;
      item.month = originalMonth;
      if (typeof writeLocalCache === 'function') writeLocalCache(state);
      toast('Não foi possível salvar a nova data. A demanda voltou ao dia original.');
      console.error('Reagendamento não sincronizado', error);
    } finally {
      calendarSaving = false;
      renderAll();
    }
  }

  function openCalendarDemand(id) {
    var item = state.demands.find(function (d) { return d.id === id; });
    if (!item || !areaAccessible(item)) return;
    selectedCalendarDemand = '';
    clientCalendarMode = false;
    currentArea = item.area;
    currentMonth = item.month;
    openClientId = item.clientId;
    openDemandId = item.id;
    renderAll();
    var clientRoot = document.getElementById('clients');
    if (clientRoot) clientRoot.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderClientCalendar(client) {
    var areas = selectedClientDemandAreas(client);
    var month = safeMonth(clientCalendarMonth || currentMonth);
    return buildCalendar(clientMonthlyDemands(client, month, areas), month, 'client');
  }

  function bindCalendar(container, scope) {
    if (!container) return;
    var hoveredDay = null;
    container.querySelectorAll('[data-ow-month]').forEach(function (button) {
      button.addEventListener('click', function () {
        selectedCalendarDemand = '';
        if (scope === 'client') {
          clientCalendarMonth = changeMonth(clientCalendarMonth || currentMonth, Number(button.dataset.owMonth));
          renderClients();
        } else {
          agendaCalendarMonth = changeMonth(agendaCalendarMonth, Number(button.dataset.owMonth));
          renderAgenda();
        }
      });
    });
    container.addEventListener('dragstart', function (event) {
      var card = event.target.closest('.ow-cal-demand');
      if (!card || !isAdmin() || calendarSaving) return event.preventDefault();
      selectedCalendarDemand = card.dataset.owDemand;
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/x-oneway-demand', card.dataset.owDemand);
        event.dataTransfer.setData('text/plain', card.dataset.owDemand);
      }
      card.classList.add('ow-cal-dragging');
    });
    container.addEventListener('dragover', function (event) {
      var day = event.target.closest('.ow-day[data-ow-date]');
      if (!day || !isAdmin() || calendarSaving) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
      if (hoveredDay && hoveredDay !== day) hoveredDay.classList.remove('ow-day-target');
      hoveredDay = day;
      day.classList.add('ow-day-target');
    });
    container.addEventListener('dragleave', function (event) {
      var day = event.target.closest('.ow-day[data-ow-date]');
      if (day && !day.contains(event.relatedTarget)) day.classList.remove('ow-day-target');
    });
    container.addEventListener('dragend', function () {
      container.querySelectorAll('.ow-day-target,.ow-cal-dragging').forEach(function (node) {
        node.classList.remove('ow-day-target', 'ow-cal-dragging');
      });
      hoveredDay = null;
      selectedCalendarDemand = '';
    });
    container.addEventListener('drop', function (event) {
      var day = event.target.closest('.ow-day[data-ow-date]');
      if (!day || !isAdmin()) return;
      event.preventDefault();
      var id = event.dataTransfer && (event.dataTransfer.getData('text/x-oneway-demand') ||
        event.dataTransfer.getData('text/plain'));
      if (id && state.demands.some(function (d) { return d.id === id; })) {
        rescheduleDemand(id, day.dataset.owDate);
      }
    });
    container.addEventListener('click', function (event) {
      var openButton = event.target.closest('[data-ow-open]');
      if (openButton) {
        event.preventDefault();
        event.stopPropagation();
        openCalendarDemand(openButton.dataset.owOpen);
        return;
      }
      var demand = event.target.closest('.ow-cal-demand');
      if (demand) {
        if (!isAdmin()) return openCalendarDemand(demand.dataset.owDemand);
        var id = demand.dataset.owDemand;
        selectedCalendarDemand = selectedCalendarDemand === id ? '' : id;
        container.querySelectorAll('.ow-cal-demand').forEach(function (node) {
          node.classList.toggle('ow-cal-selected', node.dataset.owDemand === selectedCalendarDemand);
        });
        var foot = container.querySelector('.ow-month-foot');
        if (foot) foot.textContent = selectedCalendarDemand ?
          'Demanda selecionada. Toque ou clique no dia de destino para alterar a data.' :
          'Seleção cancelada. Arraste uma demanda para reagendar.';
        return;
      }
      var day = event.target.closest('.ow-day[data-ow-date]');
      if (day && isAdmin() && selectedCalendarDemand) {
        rescheduleDemand(selectedCalendarDemand, day.dataset.owDate);
      }
    });
    container.addEventListener('keydown', function (event) {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      var card = event.target.closest('.ow-cal-demand');
      if (!card) return;
      event.preventDefault();
      selectedCalendarDemand = card.dataset.owDemand;
      var foot = container.querySelector('.ow-month-foot');
      if (foot) foot.textContent = 'Demanda selecionada. Clique no dia de destino.';
      container.querySelectorAll('.ow-cal-demand').forEach(function (node) {
        node.classList.toggle('ow-cal-selected', node.dataset.owDemand === selectedCalendarDemand);
      });
    });
  }

  renderClient = function (client) {
    if (!isAdmin() || openClientId !== client.id) return originalRenderClient(client);
    if (activeClientId !== client.id) {
      activeClientId = client.id;
      clientCalendarMode = false;
      clientCalendarMonth = currentMonth;
      selectedCalendarDemand = '';
    }
    var html = originalRenderClient(client);
    var label = clientCalendarMode ? 'Visualizar lista' : 'Panorama mensal';
    var button = '<button type="button" class="ow-mode-toggle ' + (clientCalendarMode ? 'is-active' : '') +
      '" data-ow-client-mode="1" aria-pressed="' + clientCalendarMode + '">' + label + '</button>';
    html = html.replace('<button class="ghost small add-demand-client"', button + '<button class="ghost small add-demand-client"');
    var calendar = '<div class="ow-client-calendar ' + (clientCalendarMode ? '' : 'hidden') + '">' +
      (clientCalendarMode ? renderClientCalendar(client) : '') + '</div>';
    html = html.replace('<div class="demand-list">', calendar +
      '<div class="demand-list ' + (clientCalendarMode ? 'hidden' : '') + '">');
    return html;
  };

  bindClientEvents = function (root) {
    originalBindClientEvents(root);
    root.querySelectorAll('[data-ow-client-mode]').forEach(function (button) {
      button.addEventListener('click', function (event) {
        event.stopPropagation();
        clientCalendarMode = !clientCalendarMode;
        selectedCalendarDemand = '';
        renderClients();
      });
    });
    root.querySelectorAll('.ow-client-calendar .ow-month-shell').forEach(function (container) {
      bindCalendar(container, 'client');
    });
  };

  agendaAreaFilter = function () {
    if (isAdmin() && currentArea === 'agenda' && agendaCalendarArea !== 'all')
      return agendaCalendarArea;
    return originalAgendaAreaFilter();
  };

  renderAgenda = function () {
    originalRenderAgenda();
    var wrap = document.querySelector('#agendaContent .agenda-wrap');
    var list = document.getElementById('agendaList');
    var tabs = document.getElementById('agendaViewTabs');
    if (!wrap || !list || !tabs) return;
    var oldControls = document.getElementById('owAgendaControls');
    if (oldControls) oldControls.remove();
    var oldCalendar = document.getElementById('owAgendaCalendar');
    if (oldCalendar) oldCalendar.remove();

    document.querySelectorAll('#agendaList .agenda-item').forEach(function (button) {
      var item = state.demands.find(function (d) { return d.id === button.dataset.agendaId; });
      button.classList.toggle('ow-awaiting-approval', !!item &&
        (item.area === 'arte' || item.area === 'video') && item.status === 'purple');
      button.classList.toggle('ow-awaiting-oneway', !!item &&
        (item.area === 'arte' || item.area === 'video') && item.status === 'salmon');
      if (item && /^(07|08):00$/.test(String(item.postTime || ''))) {
        var info = button.querySelector('.agenda-info');
        if (info) { var hour = document.createElement('span'); hour.className = 'ow-post-time';
          hour.textContent = 'Horário de postagem: ' + item.postTime; info.appendChild(hour); }
      }
    });

    var controls = document.createElement('div');
    controls.id = 'owAgendaControls';
    controls.className = 'ow-agenda-controls';
    var areaButtons = '';
    if (allowedAreaKeys().length > 1) {
      areaButtons = '<div class="ow-agenda-areas"><span>Filtrar</span>' +
        [{ key: 'all', name: 'Tudo' }].concat(allowedAreaKeys().concat(isAdmin() ? ['socialMedia'] : []).map(function (area) {
          return { key: area, name: areaLabel(area) };
        })).map(function (area) {
          return '<button type="button" data-ow-area="' + area.key +
            '" class="' + (agendaCalendarArea === area.key ? 'is-active' : '') + '">' +
            esc(area.name) + '</button>';
        }).join('') + '</div>';
    }
    controls.innerHTML = '<div class="ow-agenda-mode"><button type="button" data-ow-agenda-mode="list"' +
      (!agendaCalendarMode ? ' class="is-active"' : '') + '>Lista</button>' +
      '<button type="button" data-ow-agenda-mode="calendar"' +
      (agendaCalendarMode ? ' class="is-active"' : '') + '>Panorama mensal</button></div>' + areaButtons;
    var toolbarLine = wrap.querySelector('.ow-agenda-toolbar-line');
    if (!toolbarLine) {
      toolbarLine = document.createElement('div');
      toolbarLine.className = 'ow-agenda-toolbar-line';
      wrap.insertBefore(toolbarLine, tabs);
    }
    toolbarLine.appendChild(tabs);
    toolbarLine.appendChild(controls);
    var assigneeToolbar = document.getElementById('owAgendaAssigneeToolbar');
    if (assigneeToolbar) toolbarLine.appendChild(assigneeToolbar);
    controls.querySelectorAll('[data-ow-area]').forEach(function (button) {
      button.addEventListener('click', function () {
        agendaCalendarArea = button.dataset.owArea;
        selectedCalendarDemand = '';
        renderAll();
      });
    });
    controls.querySelectorAll('[data-ow-agenda-mode]').forEach(function (button) {
      button.addEventListener('click', function () {
        agendaCalendarMode = button.dataset.owAgendaMode === 'calendar';
        selectedCalendarDemand = '';
        renderAgenda();
      });
    });

    list.classList.toggle('hidden', agendaCalendarMode);
    tabs.classList.toggle('ow-agenda-tabs-hidden', agendaCalendarMode);
    if (agendaCalendarMode) {
      var calendar = document.createElement('div');
      calendar.id = 'owAgendaCalendar';
      calendar.innerHTML = buildCalendar(agendaMonthlyDemands(safeMonth(agendaCalendarMonth)),
        agendaCalendarMonth, 'agenda');
      list.insertAdjacentElement('afterend', calendar);
      bindCalendar(calendar.querySelector('.ow-month-shell'), 'agenda');
    }
  };

  if (typeof currentUser !== 'undefined' && currentUser && currentArea) renderAll();
})();


/* One Way · atribuição de artes comemorativas */
(function () {
  'use strict';
  if (typeof renderCommemorativeDates !== 'function' ||
      typeof STATUS_DEFAULT !== 'object' || typeof cmSelectableRecords !== 'function') return;

  // Status do cliente permanece roxo; o salmão identifica a conferência interna.
  STATUS_DEFAULT.purple = 'Aguardando aprovação cliente';
  delete STATUS_DEFAULT.orange;
  delete STATUS_DEFAULT.green;
  STATUS_DEFAULT.salmon = 'Aguardando aprovação OneWay';
  STATUS_DEFAULT.orange = 'Aguardando postagem';
  STATUS_DEFAULT.green = 'Finalizado';

  var originalDatesRender = renderCommemorativeDates;
  var originalUpdateStatus = updateStatus;
  var originalBindClientEvents = bindClientEvents;
  var originalRenderDemand = renderDemand;

  function holidayClientRecords() {
    return cmSelectableRecords('arte');
  }

  function sameHolidayDemand(d, clientId, date, title) {
    var client = state.clients.find(function (x) { return x.id === d.clientId; });
    var selected = state.clients.find(function (x) { return x.id === clientId; });
    return d.area === 'arte' && d.postDate === date && !!client && !!selected &&
      cmSelectionKey(client.name) === cmSelectionKey(selected.name) &&
      (d.commemorativeKey === date + '|' + title ||
       d.title === 'Arte · ' + title || d.title === title);
  }

  async function assignHolidayArt(event, item, form, card) {
    event.preventDefault();
    if (!isAdmin() || !item || !/^\d{4}-\d{2}-\d{2}$/.test(String(item.date || ''))) return;
    var clientId = form.querySelector('[name="holidayClient"]').value;
    var assignee = form.querySelector('[name="holidayAssignee"]').value;
    var time = form.querySelector('[name="holidayTime"]').value;
    var selected = state.clients.find(function (client) {
      return client.id === clientId && !client.mergedInto && !client.deletedAt && !cmIsArchived(client.name);
    });
    if (!selected || !['Pedro', 'Gabriel'].includes(assignee) || !['07:00', '08:00'].includes(time)) {
      toast('Escolha um cliente, o responsável e um horário válido.');
      return;
    }
    if (state.demands.some(function (d) { return sameHolidayDemand(d, clientId, item.date, item.title); })) {
      toast('Esta arte comemorativa já está cadastrada para esse cliente nessa data.');
      return;
    }
    var submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    submit.textContent = 'Atribuindo…';
    var month = item.date.slice(0, 7);
    var clientNameKey = cmSelectionKey(selected.name);
    var artClient = state.clients.find(function (c) {
      return !c.mergedInto && !c.deletedAt && c.area === 'arte' &&
        !cmIsArchived(c.name) && cmSelectionKey(c.name) === clientNameKey;
    });
    var createdClient = null;
    if (!artClient) {
      createdClient = {
        id: uid(), name: selected.name, area: 'arte', type: 'fixed',
        startMonth: month, createdAt: new Date().toISOString()
      };
      state.clients.push(createdClient);
      artClient = createdClient;
    }
    var description = 'Arte para ' + item.title + '.';
    if (item.note) description += '\n' + item.note;
    if (item.suggestion && item.suggestion !== item.note) description += '\nPauta sugerida: ' + item.suggestion;
    var demand = {
      id: uid(), clientId: artClient.id, month: month, area: 'arte',
      title: 'Arte · ' + item.title, description: description,
      postDate: item.date, postTime: time, assignee: assignee, status: 'red',
      commemorativeKey: item.date + '|' + item.title,
      links: [], attachments: [], productionLinks: [], productionAttachments: [],
      createdAt: new Date().toISOString(), createdDate: demandCreationCalendarDate()
    };
    state.demands.push(demand);
    try {
      // O cadastro só é confirmado quando foi compartilhado com os demais usuários.
      var synced = await saveState({strictRemote: true});
      if (!synced) throw new Error('Falha ao sincronizar a nova demanda');
      renderCommemorativeDates();
      toast('Arte atribuída a ' + assignee + ' para ' + fmtPostDate(item.date) + '.', 'Abrir demanda', function () {
        currentArea = 'arte';
        currentMonth = month;
        adminAssigneeFilter = 'all';
        openClientId = artClient.id;
        openDemandId = demand.id;
        renderAll();
        var list = document.getElementById('clients');
        if (list) list.scrollIntoView({behavior: 'smooth', block: 'start'});
      }, 'success', 7000);
    } catch (error) {
      state.demands = state.demands.filter(function (d) { return d.id !== demand.id; });
      if (createdClient) state.clients = state.clients.filter(function (c) { return c.id !== createdClient.id; });
      state.updatedAt = Date.now();
      if (typeof writeLocalCache === 'function') writeLocalCache(state);
      console.error('Arte comemorativa não foi sincronizada:', error);
      toast('Não foi possível sincronizar a demanda. Nenhuma arte foi cadastrada.');
      submit.disabled = false;
      submit.textContent = 'Criar demanda de Arte';
    }
  }

  renderCommemorativeDates = function () {
    originalDatesRender();
    if (!isAdmin()) return;
    var list = document.getElementById('commemorativeDateList');
    if (!list) return;
    var items = commemorativeDatesFor(commemorativeYear, commemorativeMonth);
    if (commemorativeCategory !== 'all') items = items.filter(function (item) {
      return item.cats.includes(commemorativeCategory);
    });
    var clients = holidayClientRecords();
    list.querySelectorAll('.commemorative-date-card').forEach(function (card, index) {
      var item = items[index];
      if (!item || card.dataset.commDate !== item.date) return;
      var panelId = 'ow-comm-panel-' + commemorativeYear + '-' + commemorativeMonth + '-' + index;
      var toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'commemorative-assign-toggle';
      toggle.setAttribute('aria-controls', panelId);
      toggle.setAttribute('aria-expanded', 'false');
      toggle.innerHTML = 'Atribuir arte <span class="ow-comm-caret" aria-hidden="true">⌄</span>';
      var panel = document.createElement('div');
      panel.id = panelId;
      panel.className = 'commemorative-assign-panel hidden';
      panel.setAttribute('data-comm-assign-panel', '');
      var form = document.createElement('form');
      form.innerHTML =
        '<label>Cliente<select name="holidayClient" required>' +
        '<option value="">Selecionar cliente</option>' +
        clients.map(function (c) {
          return '<option value="' + esc(c.id) + '">' + esc(c.name) + '</option>';
        }).join('') + '</select></label>' +
        '<label>Responsável<select name="holidayAssignee" required>' +
        '<option value="Gabriel">Gabriel</option><option value="Pedro">Pedro</option></select></label>' +
        '<label>Horário<select name="holidayTime"><option value="08:00">08:00</option>' +
        '<option value="07:00">07:00</option></select></label>' +
        '<button type="submit"' + (clients.length ? '' : ' disabled') + '>Criar demanda de Arte</button>' +
        '<p class="commemorative-assign-note">A arte entra automaticamente no mês e no dia da data comemorativa e aparece na Agenda.</p>';
      if (!clients.length) form.querySelector('.commemorative-assign-note').textContent =
        'Cadastre um cliente na Gestão de Clientes antes de atribuir esta arte.';
      panel.appendChild(form);
      card.appendChild(toggle);
      card.appendChild(panel);
      toggle.addEventListener('click', function () {
        var open = panel.classList.contains('hidden');
        list.querySelectorAll('[data-comm-assign-panel]').forEach(function (node) {
          node.classList.add('hidden');
        });
        list.querySelectorAll('.commemorative-assign-toggle').forEach(function (button) {
          button.setAttribute('aria-expanded', 'false');
        });
        panel.classList.toggle('hidden', !open);
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (open) form.querySelector('select').focus();
      });
      form.addEventListener('submit', function (event) {
        assignHolidayArt(event, item, form, card);
      });
    });
  };

  // Aprovação de cliente é responsabilidade do administrativo; os editores
  // podem marcar aprovação interna (salmão) e conservar os outros status.
  updateStatus = async function (id, status) {
    var demand = state.demands.find(function (d) { return d.id === id; });
    if (demand && !isAdmin() && ['arte', 'video'].includes(demand.area) && status === 'purple') {
      toast('A aprovação do cliente é registrada pelo administrador.');
      return;
    }
    return originalUpdateStatus(id, status);
  };
  bindClientEvents = function (root) {
    originalBindClientEvents(root);
    if (!isAdmin()) root.querySelectorAll('.demand .status-btn[data-status="purple"]').forEach(function (button) {
      button.disabled = true;
      button.title = 'A aprovação do cliente é registrada pelo administrativo';
    });
    root.querySelectorAll('.ow-cal-demand').forEach(function (card) {
      var d = state.demands.find(function (item) { return item.id === card.dataset.owDemand; });
      card.classList.toggle('ow-cal-oneway', !!d && d.status === 'salmon' && d.area !== 'trafego');
    });
  };
  renderDemand = function (d, index, showAreaLabel) {
    var html = originalRenderDemand(d, index, showAreaLabel);
    if (d && /^(07|08):00$/.test(String(d.postTime || ''))) {
      var raw = '<p class="description">' + esc(fmtPostDate(d.postDate)) + '</p>';
      html = html.replace(raw, '<p class="description">' + esc(fmtPostDate(d.postDate)) +
        ' às ' + esc(d.postTime) + '</p>');
    }
    return html;
  };
  if (currentUser && currentArea === 'commemorativeDates') renderCommemorativeDates();
  if (currentUser && currentArea === 'agenda') renderAgenda();
})();


/* One Way · Social Media na Agenda (visualização dos registros protegidos) */
(function () {
  'use strict';
  if (typeof renderAgenda !== 'function' || typeof renderSocialMedia !== 'function' ||
      typeof smOpenModal !== 'function' || typeof smPersistItems !== 'function' ||
      typeof smRefreshFromRemote !== 'function') return;

  var previousRenderAgenda = renderAgenda;
  var previousRenderSocialMedia = renderSocialMedia;
  var previousSocialRefresh = smRefreshFromRemote;
  var previousPersistItems = smPersistItems;
  var SOCIAL_AREA = 'socialMedia';
  var workflowSaving = false;
  var STEPS = [
    { key: 'programar', label: 'Programar' },
    { key: 'verificarArquivos', label: 'Verificar arquivos' },
    { key: 'aguardandoMaterial', label: 'Aguardando material' },
    { key: 'finalizado', label: 'Finalizado' }
  ];

  function canSeeSocial() {
    return isAdmin() && adminAuthReady() && smUnlocked && Array.isArray(smItems);
  }
  function checksOf(item) {
    var saved = item && item.workflowChecks && typeof item.workflowChecks === 'object'
      ? item.workflowChecks : {};
    var result = {};
    STEPS.forEach(function (step) { result[step.key] = saved[step.key] === true; });
    return result;
  }
  function isFinished(item) {
    return checksOf(item).finalizado;
  }

  // A edição antiga recriava o registro sem os checks. Preserva-os ao salvar
  // título, descrição ou data; os campos permanecem no pacote criptografado.
  smPersistItems = function (nextItems) {
    var previous = new Map(smItems.map(function (item) { return [item.id, item]; }));
    var merged = nextItems.map(function (item) {
      var old = previous.get(item.id);
      if (!old || Object.prototype.hasOwnProperty.call(item, 'workflowChecks') ||
          !old.workflowChecks) return item;
      return Object.assign({}, item, { workflowChecks: old.workflowChecks });
    });
    return previousPersistItems.call(this, merged);
  };

  function refreshCurrentView() {
    if (currentArea === 'agenda') renderAgenda();
    if (currentArea === 'socialMedia') renderSocialMedia();
  }
  async function toggleSocialStep(id, stepKey, button) {
    if (!canSeeSocial() || workflowSaving || !STEPS.some(function (s) { return s.key === stepKey; }))
      return;
    var old = smItems.find(function (item) { return item.id === id; });
    if (!old) return;
    workflowSaving = true;
    if (button) button.setAttribute('aria-busy', 'true');
    try {
      var updated = Object.assign({}, old, {
        workflowChecks: Object.assign(checksOf(old), {
          [stepKey]: !checksOf(old)[stepKey]
        }),
        updatedAt: new Date().toISOString()
      });
      var items = smItems.map(function (item) { return item.id === id ? updated : item; });
      var saved = await smPersistItems(items);
      if (saved) toast('Etapa de Social Media atualizada.', null, null, 'success');
    } catch (error) {
      console.error('Falha ao atualizar etapa do Social Media', error);
      toast('Não foi possível atualizar o checklist de Social Media.');
    } finally {
      workflowSaving = false;
      refreshCurrentView();
    }
  }

  function stepControls(item, scope) {
    var values = checksOf(item);
    var row = document.createElement('div');
    row.className = 'ow-social-checks ' + (scope === 'agenda' ? 'ow-social-checks-agenda' : 'ow-social-checks-task');
    row.setAttribute('role', 'group');
    row.setAttribute('aria-label', 'Acompanhamento da demanda de Social Media');
    STEPS.forEach(function (step) {
      var checked = values[step.key];
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'ow-social-check' + (checked ? ' is-checked' : '');
      button.setAttribute('aria-pressed', String(checked));
      button.setAttribute('aria-label', step.label + (checked ? ': marcado' : ': não marcado'));
      button.innerHTML = '<span class="ow-social-check-icon" aria-hidden="true">' +
        (checked ? '✓' : '·') + '</span><span class="ow-social-check-label">' + esc(step.label) + '</span>';
      button.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        toggleSocialStep(item.id, step.key, button);
      });
      row.appendChild(button);
    });
    return row;
  }

  function socialRecords(area, search, finished) {
    if (!canSeeSocial() || (area !== 'all' && area !== SOCIAL_AREA)) return [];
    // Sem responsável: só aparece em "Todas as demandas" ou "Sem responsável".
    if (agendaAssigneeFilter !== 'all' && agendaAssigneeFilter !== 'unassigned') return [];
    var query = search ? String(document.getElementById('searchInput')?.value || '')
      .trim().toLocaleLowerCase('pt-BR') : '';
    return smItems.filter(function (item) {
      if (!item || !/^\d{4}-\d{2}-\d{2}$/.test(String(item.date || ''))) return false;
      if (finished !== undefined && isFinished(item) !== finished) return false;
      return !query || [item.client, item.title, item.description].some(function (text) {
        return String(text || '').toLocaleLowerCase('pt-BR').includes(query);
      });
    }).sort(function (a, b) {
      return a.date.localeCompare(b.date) ||
        String(a.title || '').localeCompare(String(b.title || ''), 'pt-BR');
    });
  }

  function openOriginalSocialTask(id) {
    if (!canSeeSocial()) return;
    var item = smItems.find(function (row) { return row.id === id; });
    if (!item) return;
    currentArea = SOCIAL_AREA;
    smMonth = item.date.slice(0, 7);
    smSelectedClient = smNormalizeName(item.client);
    smSearchText = '';
    openClientId = null;
    openDemandId = null;
    renderAll();
    smOpenModal(id);
  }

  function makeAgendaCard(item, index) {
    // Div, e não botão envolvendo botões: os quatro checks ficam realmente clicáveis.
    var el = document.createElement('div');
    el.className = 'agenda-item ow-social-agenda-item' + (isFinished(item) ? ' agenda-finished ow-social-finished' : '');
    el.dataset.owSocialAgendaId = item.id;
    el.style.animationDelay = Math.min(index * 35, 300) + 'ms';
    var date = new Date(item.date + 'T12:00:00');
    var month = new Intl.DateTimeFormat('pt-BR', {month:'short'}).format(date).replace('.', '');
    el.innerHTML = '<span class="agenda-date"><strong class="agenda-day">' +
      esc(String(date.getDate()).padStart(2, '0')) + '</strong><span class="agenda-month">' +
      esc(month) + '</span></span>' +
      '<div class="agenda-info ow-social-agenda-info">' +
      '<button type="button" class="ow-social-edit-title" title="Editar no Social Media">' +
      esc(item.title || 'Sem título') + '</button>' +
      '<span class="ow-social-client">' + esc(item.client || 'Cliente') + '</span>' +
      (item.description ? '<span class="ow-social-agenda-desc">' + esc(item.description) + '</span>' : '') +
      '</div>' +
      '<span class="area-chip ow-social-area-chip">Social Media</span>' +
      '<button type="button" class="agenda-arrow ow-social-edit-arrow" title="Editar demanda no Social Media" aria-label="Editar demanda no Social Media">›</button>';
    el.querySelector('.ow-social-agenda-info').appendChild(stepControls(item, 'agenda'));
    el.querySelectorAll('.ow-social-edit-title,.ow-social-edit-arrow').forEach(function (btn) {
      btn.addEventListener('click', function () { openOriginalSocialTask(item.id); });
    });
    return el;
  }

  function renderSocialList(area) {
    var root = document.getElementById('agendaList');
    if (!root || root.classList.contains('hidden')) return;
    var items = socialRecords(area, true, agendaView === 'finished');
    if (!items.length) {
      if (area === SOCIAL_AREA && root.querySelector('.empty')) {
        root.querySelector('.empty').innerHTML = '<strong>Sem demandas de Social Media neste filtro.</strong>' +
          '<span>Confira as outras datas ou a aba de demandas finalizadas.</span>';
      }
      return;
    }
    var empty = root.querySelector('.empty');
    if (empty) empty.remove();
    items.forEach(function (item, index) { root.appendChild(makeAgendaCard(item, index)); });
    var byDemand = new Map(state.demands.map(function (d) { return [d.id, d]; }));
    var bySocial = new Map(items.map(function (d) { return [d.id, d]; }));
    var today = typeof demandCreationCalendarDate === 'function'
      ? demandCreationCalendarDate() : calendarLocalISO(new Date());
    var cards = Array.from(root.querySelectorAll('.agenda-item'));
    cards.sort(function (a, b) {
      var aSocial = bySocial.get(a.dataset.owSocialAgendaId);
      var bSocial = bySocial.get(b.dataset.owSocialAgendaId);
      var aDemand = aSocial || byDemand.get(a.dataset.agendaId);
      var bDemand = bSocial || byDemand.get(b.dataset.agendaId);
      if (!aDemand || !bDemand) return 0;
      var aDate = String(aSocial?.date || aDemand.postDate || '9999-99-99');
      var bDate = String(bSocial?.date || bDemand.postDate || '9999-99-99');
      if (agendaView === 'finished') {
        return bDate.localeCompare(aDate) ||
          String(aDemand.title || '').localeCompare(String(bDemand.title || ''), 'pt-BR');
      }
      var aLate = aSocial ? aDate < today : agendaDemandIsOverdue(aDemand);
      var bLate = bSocial ? bDate < today : agendaDemandIsOverdue(bDemand);
      if (aLate !== bLate) return aLate ? -1 : 1;
      return aDate.localeCompare(bDate) ||
        String(aDemand.title || '').localeCompare(String(bDemand.title || ''), 'pt-BR');
    });
    cards.forEach(function (card) { root.appendChild(card); });
    var counter = document.getElementById('agendaCount');
    if (counter) counter.textContent = String(counter.textContent || '').replace(
      /^\d+ demanda(?:s)?/, cards.length + ' demanda' + (cards.length === 1 ? '' : 's'));
  }

  function makeCalendarCard(item) {
    var el = document.createElement('div');
    el.className = 'ow-cal-demand ow-cal-socialMedia' +
      (isFinished(item) ? ' ow-cal-social-finished' : '');
    el.dataset.owSocialAgendaId = item.id;
    el.draggable = false;
    el.tabIndex = 0;
    el.setAttribute('role', 'button');
    var title = (item.client || 'Cliente') + ' · ' + (item.title || 'Sem título');
    el.title = title + ' · Social Media';
    el.setAttribute('aria-label', 'Abrir ' + title + ' no Social Media');
    el.innerHTML = '<span class="ow-cal-text">' + esc(title) + '</span>' +
      '<button type="button" class="ow-cal-open" aria-label="Abrir no Social Media">↗</button>';
    el.addEventListener('click', function (event) {
      event.stopPropagation();
      openOriginalSocialTask(item.id);
    });
    el.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        event.stopPropagation();
        openOriginalSocialTask(item.id);
      }
    });
    return el;
  }

  function renderSocialCalendar(area) {
    var shell = document.querySelector('#owAgendaCalendar .ow-month-shell');
    if (!shell) return;
    var items = socialRecords(area, false, agendaView === 'finished');
    var dateMap = new Map();
    items.forEach(function (item) {
      if (!dateMap.has(item.date)) dateMap.set(item.date, []);
      dateMap.get(item.date).push(item);
    });
    var visibleCount = 0;
    shell.querySelectorAll('.ow-day[data-ow-date]').forEach(function (day) {
      if (day.classList.contains('ow-day-outside')) return;
      var dayItems = dateMap.get(day.dataset.owDate) || [];
      var list = day.querySelector('.ow-day-items');
      if (!list || !dayItems.length) return;
      dayItems.forEach(function (item) {
        list.appendChild(makeCalendarCard(item));
        visibleCount++;
      });
      var count = list.querySelectorAll('.ow-cal-demand').length;
      var label = day.querySelector('.ow-day-top small');
      if (!label) {
        label = document.createElement('small');
        day.querySelector('.ow-day-top')?.appendChild(label);
      }
      label.textContent = count + ' demanda' + (count === 1 ? '' : 's');
      day.classList.toggle('ow-day-busy', count > 1);
    });
    if (!visibleCount) return;
    var legend = shell.querySelector('.ow-month-legend');
    if (legend) {
      var chip = document.createElement('span');
      chip.className = 'ow-legend-socialMedia';
      chip.textContent = 'Social Media';
      legend.querySelector('.ow-legend-count')?.before(chip);
      var counter = legend.querySelector('.ow-legend-count');
      if (counter) {
        var countBefore = Number.parseInt(counter.textContent, 10) || 0;
        var total = countBefore + visibleCount;
        counter.textContent = total + ' demanda' + (total === 1 ? '' : 's') + ' no mês';
      }
    }
    var foot = shell.querySelector('.ow-month-foot');
    if (foot) foot.textContent += ' · Social Media: selecione uma demanda para editar os checks.';
  }

  // Na aba Social Media os mesmos quatro checks ficam disponíveis nos cards originais.
  renderSocialMedia = function () {
    previousRenderSocialMedia.apply(this, arguments);
    if (!canSeeSocial()) return;
    var root = document.getElementById('smTaskList');
    if (!root) return;
    var items = smVisibleItems();
    var cards = root.querySelectorAll('.sm-task');
    cards.forEach(function (card, i) {
      var item = items[i];
      if (!item) return;
      var line = document.createElement('div');
      line.className = 'ow-social-workflow';
      var caption = document.createElement('span');
      caption.className = 'ow-social-workflow-caption';
      caption.textContent = 'Acompanhamento';
      line.appendChild(caption);
      line.appendChild(stepControls(item, 'task'));
      card.appendChild(line);
      card.classList.toggle('ow-social-task-finished', isFinished(item));
    });
  };

  renderAgenda = function () {
    previousRenderAgenda.apply(this, arguments);
    if (currentArea !== 'agenda' || !isAdmin()) return;
    var activeArea = document.querySelector(
      '#owAgendaControls [data-ow-area].is-active')?.dataset.owArea || 'all';
    var description = document.querySelector('#agendaContent .agenda-summary span');
    if (activeArea === SOCIAL_AREA && description) {
      description.textContent = 'Demandas de Social Media com acompanhamento e datas.';
    }
    var finishedCount = document.getElementById('agendaFinishedCount');
    if (finishedCount) {
      var extra = socialRecords(activeArea, true, true).length;
      var current = Number.parseInt(finishedCount.textContent, 10) || 0;
      finishedCount.textContent = String(current + extra);
    }
    var list = document.getElementById('agendaList');
    if (list && !list.classList.contains('hidden')) renderSocialList(activeArea);
    else renderSocialCalendar(activeArea);
  };

  smRefreshFromRemote = async function () {
    var last = smUpdatedAt;
    var result = await previousSocialRefresh.apply(this, arguments);
    if (currentArea === 'agenda' && smUnlocked && smUpdatedAt !== last) renderAgenda();
    return result;
  };
})();
