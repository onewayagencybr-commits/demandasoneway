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
    if (currentArea === 'agenda' && typeof window.OneWayAgendaQuickEdit === 'function') {
      window.OneWayAgendaQuickEdit(id);
      return;
    }
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
    if (!selected || !DEMAND_ASSIGNEES.includes(assignee) || !['07:00', '08:00'].includes(time)) {
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
      toggle.innerHTML = 'Atribuir demanda <span class="ow-comm-caret" aria-hidden="true">⌄</span>';
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
        ['Gabriel', 'João'].concat(DEMAND_ASSIGNEES.filter(function (name) { return name !== 'Gabriel' && name !== 'João'; }))
          .map(function (name) { return '<option value="' + esc(name) + '">' + esc(name) + '</option>'; }).join('') + '</select></label>' +
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
  smPersistItems = async function (nextItems) {
    var previous = new Map(smItems.map(function (item) { return [item.id, item]; }));
    var merged = nextItems.map(function (item) {
      var old = previous.get(item.id);
      if (!old) return item;
      var mergedItem = Object.assign({}, item);
      // O editor antigo da aba Social Media envia somente os campos básicos.
      // Preserva os campos seguros adicionados pela Agenda quando não enviados.
      ['workflowChecks', 'status', 'finalLink'].forEach(function (key) {
        if (!Object.prototype.hasOwnProperty.call(mergedItem, key) &&
            Object.prototype.hasOwnProperty.call(old, key)) {
          mergedItem[key] = old[key];
        }
      });
      return mergedItem;
    });
    var persisted = await previousPersistItems.call(this, merged);
    if (persisted && currentArea === 'agenda') renderAgenda();
    return persisted;
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
      if (stepKey === 'finalizado') {
        updated.status = updated.workflowChecks.finalizado ? 'green' :
          (old.status === 'green' ? 'yellow' : (old.status || 'yellow'));
      }
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
    if (currentArea === 'agenda' && typeof window.OneWaySocialInlineEditor === 'function') {
      window.OneWaySocialInlineEditor(id);
      return;
    }
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
    var created = String(item.createdAt || '').slice(0, 10);
    var createdText = /^\d{4}-\d{2}-\d{2}$/.test(created)
      ? 'Criada em ' + created.slice(8, 10) + '/' + created.slice(5, 7) + '/' + created.slice(0, 4)
      : '';
    var statusKey = item.status && STATUS_DEFAULT[item.status] ? item.status :
      (isFinished(item) ? 'green' : 'yellow');
    var statusName = item.status && STATUS_DEFAULT[item.status] ?
      STATUS_DEFAULT[item.status] : (isFinished(item) ? 'Finalizado' : 'Em andamento');
    el.classList.add('ow-tone-'+statusKey);
    el.innerHTML = '<span class="agenda-date"><strong class="agenda-day">' +
      esc(String(date.getDate()).padStart(2, '0')) + '</strong><span class="agenda-month">' +
      esc(month) + '</span></span>' +
      '<div class="agenda-info ow-social-agenda-info">' +
      '<button type="button" class="ow-social-edit-title" title="Editar no Social Media">' +
      esc(item.title || 'Sem título') + '</button>' +
      '<span class="ow-social-client">' + esc(item.client || 'Cliente') + '</span>' +
      (item.description ? '<span class="ow-social-agenda-desc">' + esc(item.description) + '</span>' : '') +
      (createdText ? '<span class="agenda-created-date">' + esc(createdText) + '</span>' : '') +
      '</div>' +
      '<span class="area-chip ow-social-area-chip">Social Media</span>' +
      '<span class="current-status ' + esc(statusKey) +
      '" aria-label="Situação da demanda">' + esc(statusName) + '</span>' +
      '<button type="button" class="agenda-arrow ow-social-edit-arrow" title="Editar demanda no Social Media" aria-label="Editar demanda no Social Media">›</button>';
    var info = el.querySelector('.ow-social-agenda-info');
    info.insertBefore(stepControls(item, 'agenda'), info.firstChild);
    el.querySelectorAll('.ow-social-edit-title,.ow-social-edit-arrow').forEach(function (btn) {
      btn.addEventListener('click', function (event) {
        event.stopPropagation();
        openOriginalSocialTask(item.id);
      });
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


/* One Way · refinamento do fluxo de edição na Agenda.
   Reaproveita as permissões e funções de salvamento existentes. */
(function () {
  'use strict';
  if (typeof renderAgenda !== 'function' || typeof renderAll !== 'function' ||
      typeof openDemandModal !== 'function' || typeof saveFinalMaterialLink !== 'function' ||
      typeof updateStatus !== 'function') return;

  var previousRenderAgenda = renderAgenda;
  var previousRenderAll = renderAll;
  var previousOpenDemandModal = openDemandModal;
  var agendaEditing = false;
  var currentExpandedId = '';

  function getDemand(id) {
    return state.demands.find(function (item) {
      return item.id === id && canAccessDemand(item);
    });
  }

  function showMaterialLinkControls(container, demand, modalMode) {
    if (!container || !demand || !['arte', 'video'].includes(demand.area)) return;
    var outer = document.createElement('div');
    outer.className = 'ow-agenda-link-editor' + (modalMode ? ' ow-agenda-modal-link-editor' : '');
    var label = document.createElement('label');
    label.className = 'ow-agenda-editor-label';
    label.textContent = 'Link do material finalizado';
    var line = document.createElement('div');
    line.className = 'ow-agenda-link-row';
    var field = document.createElement('input');
    field.type = 'url';
    field.inputMode = 'url';
    field.placeholder = 'Cole o link do Drive, Frame.io, Canva...';
    field.value = String(demand.finalLink || '');
    field.setAttribute('aria-label', 'Link do material finalizado');
    var save = document.createElement('button');
    save.type = 'button';
    save.className = 'ow-agenda-inline-save';
    save.textContent = demand.finalLink ? 'Atualizar link' : 'Salvar link';
    line.append(field, save);
    outer.append(label, line);
    if (demand.finalLink && safeUrl(demand.finalLink) !== '#') {
      var open = document.createElement('a');
      open.className = 'ow-agenda-link-open';
      open.href = safeUrl(demand.finalLink);
      open.target = '_blank';
      open.rel = 'noopener';
      open.textContent = 'Abrir material finalizado';
      outer.appendChild(open);
    }
    if (canEditFinalMaterial(demand)) {
      save.addEventListener('click', async function () {
        if (save.disabled) return;
        save.disabled = true;
        var previousValue = demand.finalLink || '';
        await saveFinalMaterialLink(demand.id, field.value);
        save.disabled = false;
        var newValue = state.demands.find(function (d) { return d.id === demand.id; })?.finalLink || '';
        if (newValue !== previousValue || newValue === field.value.trim()) {
          save.textContent = newValue ? 'Atualizar link' : 'Salvar link';
          var existing = outer.querySelector('.ow-agenda-link-open');
          if (existing) existing.remove();
          if (newValue && safeUrl(newValue) !== '#') {
            var a = document.createElement('a');
            a.className = 'ow-agenda-link-open';
            a.href = safeUrl(newValue);
            a.target = '_blank';
            a.rel = 'noopener';
            a.textContent = 'Abrir material finalizado';
            outer.appendChild(a);
          }
        }
      });
    } else {
      field.disabled = true;
      save.remove();
    }
    container.appendChild(outer);
  }

  // O editor administrativo funciona sobre a Agenda e mantém os campos
  // originais (data, responsável, cliente, arquivos, descrição e status).
  openDemandModal = function (id, clientId) {
    var result = previousOpenDemandModal.apply(this, arguments);
    var modal = document.getElementById('demandModal');
    if (!modal || modal.classList.contains('hidden')) return result;
    modal.querySelectorAll('.ow-agenda-modal-link-host').forEach(function (node) { node.remove(); });
    if (id) {
      var demand = getDemand(id);
      var form = modal.querySelector('form');
      if (demand && form) {
        var actions = form.querySelector('.modal-actions');
        var location = actions ? actions.parentElement : form;
        var anchor = document.createElement('div');
        anchor.className = 'ow-agenda-modal-link-host';
        showMaterialLinkControls(anchor, demand, true);
        if (anchor.children.length) {
          if (actions && location) location.insertBefore(anchor, actions);
          else form.appendChild(anchor);
        }
      }
    }
    return result;
  };

  // Agenda · expande o mesmo componente de detalhes usado dentro do cliente.
  // Assim os status, arquivos, referências e link finalizado reutilizam as
  // funções originais e todas as permissões permanecem em vigor.
  function getAgendaCard(id) {
    return Array.from(document.querySelectorAll('#agendaList .agenda-item[data-agenda-id]'))
      .find(function (el) { return el.dataset.agendaId === id; });
  }

  function buildAdminFields(demand, host) {
    if (!isAdmin()) return;
    var actionArea = host.querySelector('.detail-actions');
    var toggle = host.querySelector('.edit-demand');
    if (!actionArea || !toggle) return;
    toggle.textContent = 'Editar informações';
    var panel = document.createElement('div');
    panel.className = 'ow-agenda-fields-panel';
    panel.hidden = true;
    var form = document.createElement('form');
    form.className = 'ow-agenda-fields-form';
    var clientList = state.clients.filter(function (c) {
      return !c.mergedInto && (c.area === demand.area || c.id === demand.clientId);
    }).sort(function (a,b) { return a.name.localeCompare(b.name, 'pt-BR'); });
    var staff = DEMAND_ASSIGNEES;
    form.innerHTML =
      '<div class="ow-agenda-fields-grid">' +
      '<label>Título da demanda<input name="title" required maxlength="240" value="' + esc(demand.title||'') + '"></label>' +
      '<label>Data da postagem<input name="postDate" type="date" required value="' + esc(demand.postDate||'') + '"></label>' +
      '<label>Cliente<select name="clientId">' + clientList.map(function (c) {
        return '<option value="' + esc(c.id) + '"' + (c.id === demand.clientId ? ' selected' : '') +
          '>' + esc(c.name) + '</option>';
      }).join('') + '</select></label>' +
      '<label>Responsável<select name="assignee"><option value="">Sem responsável</option>' +
      staff.map(function (name) {
        return '<option value="' + esc(name) + '"' + (demand.assignee === name ? ' selected' : '') +
          '>' + esc(name) + '</option>';
      }).join('') + '</select></label>' +
      '<label class="ow-agenda-fields-description">Descrição<textarea name="description" rows="3">' +
      esc(demand.description||'') + '</textarea></label></div>' +
      '<div class="ow-agenda-fields-actions"><button type="button" class="ghost small ow-agenda-fields-cancel">Cancelar</button>' +
      '<button type="submit" class="ow-agenda-inline-save">Salvar alterações</button></div>';
    panel.appendChild(form);
    actionArea.insertAdjacentElement('beforebegin', panel);
    toggle.onclick = function (e) {
      e.preventDefault();
      panel.hidden = !panel.hidden;
      toggle.setAttribute('aria-expanded',String(!panel.hidden));
      if (!panel.hidden) form.elements.namedItem('title')?.focus();
    };
    form.querySelector('.ow-agenda-fields-cancel').onclick = function () {
      panel.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
    };
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      if (!isAdmin() || !getDemand(demand.id)) return;
      var fd = new FormData(form);
      var title = String(fd.get('title')||'').trim();
      var postDate = String(fd.get('postDate')||'');
      var clientId = String(fd.get('clientId')||'');
      var assignee = String(fd.get('assignee')||'');
      var description = String(fd.get('description')||'').trim();
      if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(postDate) ||
          !state.clients.some(function (c) { return c.id === clientId && (c.area === demand.area || c.id === demand.clientId); }) ||
          (assignee && !DEMAND_ASSIGNEES.includes(assignee))) {
        toast('Confira os campos da demanda antes de salvar.');return;
      }
      var current = getDemand(demand.id);
      if (!current) return;
      var fields = ['title','postDate','month','description','assignee','clientId'];
      var backup = {};
      fields.forEach(function (key) { backup[key] = current[key]; });
      Object.assign(current,{title:title,postDate:postDate,month:postDate.slice(0,7),
        description:description,assignee:assignee,clientId:clientId});
      var submit = form.querySelector('[type="submit"]');
      submit.disabled=true;
      try {
        if (!await saveState({strictRemote:true})) {
          Object.assign(current,backup);
          toast('Não foi possível salvar. Nenhuma alteração foi aplicada.');
          return;
        }
        toast('Demanda atualizada na Agenda.',null,null,'success');
        renderAgenda();
      } catch (err) {
        Object.assign(current,backup);
        console.error('Falha ao editar demanda pela Agenda',err);
        toast('Não foi possível salvar a demanda.');
      } finally {
        submit.disabled=false;
      }
    });
  }

  // O contorno é um único elemento pai; o detalhe só aumenta sua altura.
  // Assim as quatro bordas e os raios não mudam durante a transformação.
  function owAgendaWrapCard(card,panel) {
    var group=card?.parentElement;
    if (group?.classList.contains('ow-agenda-group')) {
      if (panel.parentElement!==group) group.appendChild(panel);
      return group;
    }
    if (!card || !panel || !card.parentElement) return null;
    group=document.createElement('div');
    group.className='ow-agenda-group';
    var computed=getComputedStyle(card);
    group.style.setProperty('--ow-accent',computed.getPropertyValue('--ow-accent').trim()||'#77baff');
    group.style.setProperty('--ow-spot-rgb',computed.getPropertyValue('--ow-spot-rgb').trim()||'116,185,255');
    card.parentElement.insertBefore(group,card);
    group.appendChild(card);
    group.appendChild(panel);
    return group;
  }
  function owAgendaFlow(panel,opening,animated,onDone){
    if(!panel){if(onDone)onDone();return;}
    var card=panel.previousElementSibling;
    if(opening && card && card.classList.contains('agenda-item'))
      owAgendaWrapCard(card,panel);
    if (!panel.querySelector(':scope > .ow-agenda-detail-interior')) {
      var interior=document.createElement('div');
      interior.className='ow-agenda-detail-interior';
      while(panel.firstChild) interior.appendChild(panel.firstChild);
      panel.appendChild(interior);
    }
    card=panel.previousElementSibling;
    var group=panel.parentElement;
    var reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var previous=panel._owFlowAnimation;
    var from=panel.getBoundingClientRect().height;
    if(previous){
      previous.onfinish=null;
      previous.oncancel=null;
      previous.cancel();
      panel._owFlowAnimation=null;
      panel.style.height=from+'px';
    }
    panel.style.setProperty('animation','none','important');
    panel.style.overflow='hidden';
    panel.style.minHeight='0px';
    panel.style.boxSizing='border-box';
    var interior=panel.querySelector(':scope > .ow-agenda-detail-interior');
    var natural=interior ? interior.scrollHeight : panel.scrollHeight;
    if(opening && card)card.setAttribute('aria-expanded','true');
    if(opening){
      panel.dataset.owClosing='false';
      panel.classList.remove('ow-agenda-closing');
    }else{
      panel.dataset.owClosing='true';
      panel.classList.add('ow-agenda-closing');
    }
    function finish(){
      panel._owFlowAnimation=null;
      if(opening){
        panel.style.height='auto';
        panel.style.removeProperty('overflow');
        panel.dataset.owClosing='false';
        panel.classList.remove('ow-agenda-closing');
      }else{
        if(panel.isConnected)panel.remove();
        if(card && card.classList.contains('agenda-item')){
          card.setAttribute('aria-expanded','false');
          if(group?.classList.contains('ow-agenda-group')&&group.isConnected){
            group.parentElement.insertBefore(card,group);
            group.remove();
          }
        }
      }
      if(onDone)onDone();
    }
    if(!animated || reduced || !panel.animate){
      finish();return;
    }
    var start=opening?(previous?from:0):from;
    var stop=opening?natural:0;
    if(Math.abs(start-stop)<.5){finish();return;}
    var motion=panel.animate([
      {height:start+'px',opacity:opening && !previous?0.8:1},
      {height:stop+'px',opacity:opening?1:.94}
    ],{
      duration:opening?760:700,
      easing:'cubic-bezier(.25,.68,.22,1)',
      fill:'forwards'
    });
    panel._owFlowAnimation=motion;
    motion.onfinish=function(){
      if(panel._owFlowAnimation!==motion)return;
      motion.onfinish=null;
      motion.cancel();
      finish();
    };
  }
  function owDismissAgendaPanel(panel,animated,onDone){
    owAgendaFlow(panel,false,animated,onDone);
  }
  function owExpandAgendaPanel(panel,animated){
    owAgendaFlow(panel,true,animated);
  }
  window.OneWayAgendaDismissPanel=owDismissAgendaPanel;
  window.OneWayAgendaExpandPanel=owExpandAgendaPanel;

  function showAgendaDetails(id) {
    var demand = getDemand(id);
    if (!demand || currentArea !== 'agenda') return false;
    var list = document.getElementById('agendaList');
    var card = getAgendaCard(id);
    if (!card || list?.classList.contains('hidden')) {
      currentExpandedId = id;
      var mode = document.querySelector('#owAgendaControls [data-ow-agenda-mode="list"]');
      if (mode && !mode.classList.contains('is-active')) {
        mode.click();return true;
      }
      return false;
    }
    var pendingPanel=list.querySelector('.ow-agenda-inline-editor[data-ow-closing="true"]');
    if (pendingPanel && pendingPanel.previousElementSibling === card) {
      currentExpandedId=id;
      card.setAttribute('aria-expanded','true');
      owExpandAgendaPanel(pendingPanel,true);
      return true;
    }
    if (currentExpandedId === id && list.querySelector('.ow-agenda-inline-editor')) {
      owDismissAgendaPanel(list.querySelector('.ow-agenda-inline-editor'),true);
      currentExpandedId = '';
      return true;
    }
    currentExpandedId = id;
    list.querySelectorAll('.ow-agenda-inline-editor').forEach(function (e) {
      owDismissAgendaPanel(e,false);
    });
    list.querySelectorAll('.agenda-item[aria-expanded]').forEach(function (e) {
      e.setAttribute('aria-expanded','false');
    });
    card.setAttribute('aria-expanded','true');
    var oldOpen = openDemandId;
    var detailMarkup;
    try {
      openDemandId = id;
      detailMarkup = renderDemand(demand, 0, true);
    } finally {
      openDemandId = oldOpen;
    }
    var editor = document.createElement('div');
    editor.className = 'ow-agenda-inline-editor ow-agenda-native-detail';
    editor.setAttribute('aria-label','Detalhes de ' + (demand.title||'demanda'));
    editor.innerHTML = detailMarkup;
    var titleRow = editor.querySelector('.demand-row');
    if (titleRow) titleRow.remove();
    card.insertAdjacentElement('afterend', editor);

    // O cartão já apresenta título e situação. Repeti-los em outra barra
    // criava uma divisória visual desnecessária.
    editor.setAttribute('data-ow-parent-id',id);
    bindClientEvents(editor);
    buildAdminFields(demand,editor);
    owExpandAgendaPanel(editor,true);
    return true;
  }

  window.OneWayAgendaQuickEdit = showAgendaDetails;

  // A navegação é apenas reorganizada no DOM: nenhum botão é recriado e
  // seus eventos, IDs e permissões continuam exatamente os mesmos.
  function arrangeNavigation() {
    if (!isAdmin()) return;
    var nav = document.querySelector('#app .nav-row');
    var left = nav?.querySelector('.area-nav-cluster');
    var tools = nav?.querySelector('.admin-utility-tabs');
    if (!left || !tools) return;
    var group = left.querySelector('.ow-nav-core-tools');
    if (!group) {
      group = document.createElement('div');
      group.className = 'ow-nav-core-tools';
    }
    ['adminAgendaTab','manageClientsTab','weekCalendarTab'].forEach(function (id) {
      var button = document.getElementById(id);
      if (button) group.appendChild(button);
    });
    var trash = document.getElementById('trashTab');
    if (trash && trash.parentElement === left) left.insertBefore(group,trash);
    else left.appendChild(group);
    ['scriptsTab','instagramReportsTab','feedPlannerTab','commemorativeDatesTab'].forEach(function (id) {
      var button = document.getElementById(id);
      if (button) tools.appendChild(button);
    });
    // A lixeira fica na extremidade do menu, fora das três áreas prioritárias.
    if (trash) tools.appendChild(trash);
  }

  function positionSearch() {
    var search = document.getElementById('searchInput');
    var hero = document.getElementById('heroControls');
    if (!search || !hero) return;
    if (currentArea === 'agenda') {
      var line = document.querySelector('#agendaContent .ow-agenda-toolbar-line');
      if (line) {
        var group=line.querySelector('.ow-agenda-person-filters');
        if (!group) {
          group=document.createElement('div');
          group.className='ow-agenda-person-filters';
          line.appendChild(group);
        }
        var people=document.getElementById('owAgendaAssigneeToolbar');
        if (people) group.appendChild(people);
        search.classList.add('ow-agenda-search');
        search.placeholder = 'Buscar cliente ou demanda';
        group.appendChild(search);
      }
    } else {
      search.classList.remove('ow-agenda-search');
      if (search.parentElement !== hero) {
        var month = document.getElementById('monthSelect');
        if (month && month.parentElement === hero) hero.insertBefore(search,month);
        else hero.prepend(search);
      }
    }
  }

  function animateHeading(nextArea,previousArea) {
    if (nextArea===previousArea || !nextArea || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    ['pageTitle','pageSubtitle'].forEach(function (id,index) {
      var el=document.getElementById(id);
      if (!el || typeof el.animate!=='function') return;
      el.getAnimations().forEach(function (a) { a.cancel(); });
      el.animate([
        {opacity:0,transform:'translate3d(0,11px,0)',filter:'blur(2.5px)'},
        {opacity:1,transform:'translate3d(0,0,0)',filter:'blur(0)'}
      ],{duration:index?780:720,delay:index?75:0,easing:'cubic-bezier(.16,.75,.24,1)',fill:'both'});
    });
  }

  var lastArea = currentArea;
  renderAll = function () {
    if (currentArea !== 'agenda') positionSearch();
    var before=lastArea;
    var result=previousRenderAll.apply(this,arguments);
    arrangeNavigation();
    positionSearch();
    animateHeading(currentArea,before);
    lastArea=currentArea;
    return result;
  };

  renderAgenda = function () {
    var openId=currentExpandedId;
    var result=previousRenderAgenda.apply(this,arguments);
    if (currentArea !== 'agenda') {
      currentExpandedId='';
      return result;
    }
    positionSearch();
    var list=document.getElementById('agendaList');
    if (!list) return result;
    list.querySelectorAll('.agenda-item[data-agenda-id]').forEach(function (card) {
      card.onclick=function (e) {
        e.preventDefault();
        showAgendaDetails(card.dataset.agendaId);
      };
      card.setAttribute('aria-expanded','false');
      card.title='Ver detalhes sem sair da Agenda';
    });
    if (openId && !list.classList.contains('hidden') && getAgendaCard(openId)) {
      currentExpandedId='';
      showAgendaDetails(openId);
    }
    return result;
  };

  // A busca deve permanecer disponível na Agenda e os links do painel
  // devem refletir as mudanças sem redirecionar para clientes.
  [
    {get:function(){return addLink;},set:function(fn){addLink=fn;}},
    {get:function(){return removeLink;},set:function(fn){removeLink=fn;}},
    {get:function(){return addProductionLink;},set:function(fn){addProductionLink=fn;}},
    {get:function(){return removeProductionLink;},set:function(fn){removeProductionLink=fn;}},
    {get:function(){return addProductionFiles;},set:function(fn){addProductionFiles=fn;}},
    {get:function(){return removeProductionFile;},set:function(fn){removeProductionFile=fn;}},
    {get:function(){return addFiles;},set:function(fn){addFiles=fn;}},
    {get:function(){return removeFile;},set:function(fn){removeFile=fn;}}
  ].forEach(function (hook) {
    if (typeof hook.get()!=='function') return;
    var original=hook.get();
    hook.set(async function () {
      var value=await original.apply(this,arguments);
      if (currentArea==='agenda') renderAgenda();
      return value;
    });
  });
  // Luz suave seguindo o ponteiro, somente sobre superfícies transparentes.
  var shineFrame=0,shineTarget=null,shineX=0,shineY=0;
  document.addEventListener('pointermove',function(event){
    if (event.pointerType==='touch') return;
    var target=event.target.closest?.('.client, #agendaContent .agenda-item, .stats .stat, .sm-task, .ow-agenda-inline-editor, .ow-month-shell');
    if (!target) return;
    shineTarget=target;
    shineX=event.clientX;
    shineY=event.clientY;
    if (shineFrame) return;
    shineFrame=requestAnimationFrame(function(){
      shineFrame=0;
      if (!shineTarget?.isConnected) return;
      var rect=shineTarget.getBoundingClientRect();
      shineTarget.style.setProperty('--ow-pointer-x', Math.round(shineX-rect.left)+'px');
      shineTarget.style.setProperty('--ow-pointer-y', Math.round(shineY-rect.top)+'px');
    });
  },{passive:true});
})();


/* One Way · editor expansível de Social Media na Agenda · 2026-10-27 */
(function(){
  'use strict';
  if (typeof renderAgenda !== 'function' || typeof smPersistItems !== 'function' ||
      typeof smOpenModal !== 'function') return;

  var prevRenderAgenda=renderAgenda;
  var activeId='';
  var updating=false;

  function eligible(){
    return currentArea==='agenda' && isAdmin() && adminAuthReady() &&
      smUnlocked && Array.isArray(smItems);
  }
  function social(id){
    return eligible() ? smItems.find(function(item){return item.id===id;}) : null;
  }
  function socialCard(id){
    return Array.from(document.querySelectorAll('#agendaList .ow-social-agenda-item'))
      .find(function(el){return el.dataset.owSocialAgendaId===id;});
  }
  function checks(item) {
    var stored=item.workflowChecks && typeof item.workflowChecks==='object'?item.workflowChecks:{};
    return {
      programar:stored.programar===true,
      verificarArquivos:stored.verificarArquivos===true,
      aguardandoMaterial:stored.aguardandoMaterial===true,
      finalizado:stored.finalizado===true
    };
  }
  function stage(item){
    var v=String(item.status||'');
    if (Object.prototype.hasOwnProperty.call(STATUS_DEFAULT,v))return v;
    return checks(item).finalizado?'green':'yellow';
  }
  function closeExisting(){
    document.querySelectorAll('#agendaList .ow-agenda-inline-editor').forEach(function(node){
      if(typeof window.OneWayAgendaDismissPanel==='function')
        window.OneWayAgendaDismissPanel(node,false);
      else node.remove();
    });
    document.querySelectorAll('#agendaList .agenda-item[aria-expanded]').forEach(function(node){
      node.setAttribute('aria-expanded','false');
    });
  }
  function mount(id,restoring){
    var item=social(id);
    if(!item)return false;
    var card=socialCard(id);
    if (!card) {
      var calendarMode=document.querySelector('#owAgendaControls [data-ow-agenda-mode="calendar"].is-active');
      var button=document.querySelector('#owAgendaControls [data-ow-agenda-mode="list"]');
      if(calendarMode&&button){activeId=id;button.click();return true;}
      return false;
    }
    var opened=document.querySelector('#agendaList .ow-agenda-inline-editor');
    if (!restoring && opened?.dataset.owClosing==='true' &&
        opened.previousElementSibling===card &&
        typeof window.OneWayAgendaExpandPanel==='function') {
      activeId=id;
      card.setAttribute('aria-expanded','true');
      window.OneWayAgendaExpandPanel(opened,true);
      return true;
    }
    if(!restoring && activeId===id && opened){
      activeId='';
      if (typeof window.OneWayAgendaDismissPanel==='function') {
        window.OneWayAgendaDismissPanel(opened,true);
      } else closeExisting();
      card.focus();return true;
    }
    closeExisting();
    activeId=id;
    card.setAttribute('aria-expanded','true');
    var panel=document.createElement('section');
    panel.className='ow-agenda-inline-editor ow-agenda-native-detail ow-social-inline-editor';
    panel.setAttribute('aria-label','Editar demanda de Social Media');
    var clients=smAllClients();
    if (!clients.some(function(n){return smNormalizeName(n)===smNormalizeName(item.client);}))
      clients.unshift(item.client);
    var selected=stage(item);
    card.classList.add('ow-tone-'+selected);
    panel.innerHTML=
      '<div class="detail-panel ow-social-edit-panel">'+
      '<form class="ow-social-agenda-form">'+
      '<div class="detail-label">Informações da demanda</div>'+
      '<div class="ow-agenda-fields-grid">'+
      '<label>Cliente<select name="client" required>'+clients.map(function(n){
        return '<option value="'+esc(n)+'"'+(smNormalizeName(n)===smNormalizeName(item.client)?' selected':'')+'>'+esc(n)+'</option>';
      }).join('')+'</select></label>'+
      '<label>Data da demanda<input name="date" type="date" required value="'+esc(item.date||'')+'"></label>'+
      '<label class="ow-agenda-fields-description">Título<input name="title" required maxlength="240" value="'+esc(item.title||'')+'"></label>'+
      '<label class="ow-agenda-fields-description">Descrição<textarea name="description" rows="4">'+esc(item.description||'')+'</textarea></label>'+
      '</div>'+
      '<div class="ow-social-inline-section"><div class="detail-label">Situação da demanda</div>'+
      '<div class="status-edit ow-social-statuses" role="group" aria-label="Situação da demanda">'+
      Object.entries(STATUS_DEFAULT).map(function(entry){
        var key=entry[0],name=entry[1];
        return '<button type="button" class="status-btn'+(selected===key?' active':'')+
          '" data-sm-stage="'+esc(key)+'" aria-pressed="'+String(selected===key)+'">'+esc(name)+'</button>';
      }).join('')+'</div><input type="hidden" name="stage" value="'+esc(selected)+'"></div>'+
      '<div class="ow-social-inline-section"><div class="detail-label">Checklist de acompanhamento</div>'+
      '<div class="ow-social-inline-checks">'+
      [['programar','Programar'],['verificarArquivos','Verificar arquivos'],
       ['aguardandoMaterial','Aguardando material'],['finalizado','Finalizado']].map(function(entry){
        return '<label class="ow-social-inline-check"><input type="checkbox" name="'+entry[0]+'"'+
          (checks(item)[entry[0]]?' checked':'')+'><span>'+entry[1]+'</span></label>';
      }).join('')+'</div></div>'+
      '<div class="ow-social-inline-section"><label class="ow-agenda-editor-label">Link do material finalizado</label>'+
      '<input class="ow-social-final-link" type="url" name="finalLink" placeholder="Drive, Canva, Frame.io ou outro link (opcional)" value="'+esc(item.finalLink||'')+'">'+
      (item.finalLink && safeUrl(item.finalLink)!=='#'?'<a class="ow-agenda-link-open" href="'+esc(safeUrl(item.finalLink))+
      '" target="_blank" rel="noopener">Abrir material finalizado</a>':'')+
      '</div>'+
      '<footer class="ow-agenda-fields-actions"><button type="submit" class="ow-agenda-inline-save">Salvar alterações</button></footer></form></div>';
    card.insertAdjacentElement('afterend',panel);
    var form=panel.querySelector('form');
    // Para recolher basta clicar novamente no mesmo cartão da Agenda.
    function setStage(value){
      if(!Object.prototype.hasOwnProperty.call(STATUS_DEFAULT,value))return;
      form.elements.namedItem('stage').value=value;
      form.querySelectorAll('[data-sm-stage]').forEach(function(b){
        var on=b.dataset.smStage===value;
        b.classList.toggle('active',on);
        b.setAttribute('aria-pressed',String(on));
      });
      if(value==='green')form.elements.namedItem('finalizado').checked=true;
      else if(form.elements.namedItem('finalizado').checked)form.elements.namedItem('finalizado').checked=false;
    }
    panel.querySelectorAll('[data-sm-stage]').forEach(function(b){
      b.onclick=function(){setStage(b.dataset.smStage);};
    });
    form.elements.namedItem('finalizado').addEventListener('change',function(e){
      if(e.target.checked)setStage('green');
      else if(form.elements.namedItem('stage').value==='green')setStage('yellow');
    });
    form.addEventListener('submit',async function(event){
      event.preventDefault();
      if(updating || !social(id))return;
      var raw=new FormData(form);
      var client=String(raw.get('client')||'').trim();
      var date=String(raw.get('date')||'');
      var title=String(raw.get('title')||'').trim();
      var description=String(raw.get('description')||'').trim();
      var value=String(raw.get('stage')||'red');
      var finalLink=String(raw.get('finalLink')||'').trim();
      if(!client||!title||!/^\d{4}-\d{2}-\d{2}$/.test(date)||
         !Object.prototype.hasOwnProperty.call(STATUS_DEFAULT,value)){
        toast('Revise cliente, data, título e situação da demanda.');return;
      }
      if(finalLink){
        finalLink=safeUrl(/^https?:\/\//i.test(finalLink)?finalLink:'https://'+finalLink);
        if(finalLink==='#'){toast('Link finalizado inválido.');return;}
      }
      var old=social(id);
      if(!old)return;
      updating=true;
      var submit=form.querySelector('[type="submit"]');
      submit.disabled=true;
      var currentChecks=Object.assign({},old.workflowChecks||{});
      ['programar','verificarArquivos','aguardandoMaterial','finalizado'].forEach(function(key){
        currentChecks[key]=raw.has(key);
      });
      if(value==='green')currentChecks.finalizado=true;
      if(value!=='green'&&currentChecks.finalizado)value='green';
      var updated=Object.assign({},old,{client:client,date:date,title:title,description:description,
        status:value,finalLink:finalLink,workflowChecks:currentChecks,updatedAt:new Date().toISOString()});
      try{
        var success=await smPersistItems(smItems.map(function(v){return v.id===id?updated:v;}));
        if(success){
          toast('Social Media atualizado na Agenda.',null,null,'success');
          renderAgenda();
        }
      }catch(err){
        console.error('Falha ao salvar Social Media na Agenda',err);
        toast('Não foi possível salvar. Tente novamente.');
      }finally{
        updating=false;
        if(submit.isConnected)submit.disabled=false;
      }
    });
    if (typeof window.OneWayAgendaExpandPanel==='function' && !restoring) {
      window.OneWayAgendaExpandPanel(panel,true);
    }
    if(!restoring){
      panel.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'nearest'});
    }
    return true;
  }

  window.OneWaySocialInlineEditor=function(id){return mount(id,false);};

  renderAgenda=function(){
    var restore=activeId;
    var result=prevRenderAgenda.apply(this,arguments);
    if(currentArea!=='agenda'||!eligible()){activeId='';return result;}
    var root=document.getElementById('agendaList');
    if(!root||root.classList.contains('hidden'))return result;
    root.querySelectorAll('.ow-social-agenda-item').forEach(function(card){
      card.tabIndex=0;
      card.setAttribute('role','button');
      card.setAttribute('aria-expanded','false');
      card.title='Abrir e editar Social Media abaixo da demanda';
      card.addEventListener('click',function(event){
        if(event.target.closest('.ow-social-check')||event.target.closest('.ow-social-edit-title,.ow-social-edit-arrow'))return;
        mount(card.dataset.owSocialAgendaId,false);
      });
      card.addEventListener('keydown',function(event){
        if(event.target!==card || !['Enter',' '].includes(event.key))return;
        event.preventDefault();
        mount(card.dataset.owSocialAgendaId,false);
      });
    });
    if(restore&&socialCard(restore))mount(restore,true);
    return result;
  };
})();
