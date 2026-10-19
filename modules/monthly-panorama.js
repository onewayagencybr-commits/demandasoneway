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
      return areaAccessible(d) && (agendaCalendarArea === 'all' || d.area === agendaCalendarArea) &&
        validISO(d.postDate) && d.postDate.slice(0, 7) === month;
    }).sort(sortClientDemandsByPostDate);
  }
  function areaLabel(area) {
    return AREAS[area] || area;
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
    });

    var controls = document.createElement('div');
    controls.id = 'owAgendaControls';
    controls.className = 'ow-agenda-controls';
    var areaButtons = '';
    if (allowedAreaKeys().length > 1) {
      areaButtons = '<div class="ow-agenda-areas"><span>Filtrar</span>' +
        [{ key: 'all', name: 'Tudo' }].concat(allowedAreaKeys().map(function (area) {
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
    wrap.insertBefore(controls, tabs);
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
