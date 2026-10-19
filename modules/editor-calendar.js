/* One Way - Calendário semanal da equipe de Artes e Vídeos.
   Reutiliza somente o visual da agenda administrativa e os dados da área autorizada.
   Não concede acesso a compromissos, reuniões nem a outras áreas. */
(function () {
  'use strict';
  if (typeof renderAll !== 'function' || typeof renderTabs !== 'function') return;

  var previousRenderAll = renderAll;
  var previousRenderTabs = renderTabs;
  var editorCalendarOpen = false;

  function editorArea() {
    if (isDesign()) return 'arte';
    if (isVideoUser()) return 'video';
    return null;
  }

  function demandInArea(d, area, date) {
    return !!d && d.area === area && d.postDate === date && canAccessArea(area);
  }

  function editorWeekCalendar() {
    var area = editorArea();
    if (!area) return;
    var days = calendarDays(), today = calendarLocalISO(new Date());
    var monthTitle = document.getElementById('wkWeekTitle');
    var picker = document.getElementById('wkPickDate');
    if (!monthTitle || !picker) return;
    monthTitle.textContent = calendarWeekTitle();
    picker.value = calendarWeekStart;

    var weeklyCount = 0, occupiedDays = 0;
    var cards = days.map(function (date) {
      var items = state.demands.filter(function (d) {
        return demandInArea(d, area, date);
      }).sort(function (a, b) {
        return String(a.title || '').localeCompare(String(b.title || ''), 'pt-BR');
      });
      weeklyCount += items.length;
      if (items.length) occupiedDays++;
      var when = new Date(date + 'T12:00:00');
      var weekday = when.toLocaleDateString('pt-BR', { weekday: 'long' });
      var dayLabel = String(when.getDate()).padStart(2, '0') + ' de ' +
        when.toLocaleDateString('pt-BR', { month: 'long' });
      var content = items.map(function (d) {
        var client = state.clients.find(function (c) { return c.id === d.clientId; });
        var approval = d.status === 'purple' ? ' ow-week-approval' : '';
        return '<div class="wk-line wk-line-action' + approval +
          '" tabindex="0" role="button" data-ow-editor-demand="' + esc(d.id) + '">' +
          '<strong><span class="wk-type-pill">' + esc(AREAS[area]) + '</span>' +
          esc(d.title || 'Demanda sem título') + '</strong><small>' +
          esc(client ? client.name : 'Cliente') + ' · ' + esc(statusLabel(d)) +
          '</small></div>';
      }).join('');
      return '<article class="wk-day ' + (date === today ? 'is-today ' : '') +
        (items.length ? '' : 'is-empty') + '"><header class="wk-day-head"><div class="wk-day-label">' +
        '<strong>' + esc(weekday.charAt(0).toUpperCase() + weekday.slice(1)) +
        '</strong><span>' + esc(dayLabel) + '</span>' +
        (date === today ? '<span class="wk-today-mark">Hoje</span>' : '') +
        '</div></header>' +
        (items.length ? '<section class="wk-day-section"><div class="wk-section-caption">' +
          esc(AREAS[area].toUpperCase()) + ' · ' + items.length + '</div>' + content +
          '</section>' : '<p class="wk-day-empty-note">Sem demandas deste setor.</p>') +
        '</article>';
    });

    document.getElementById('wkStats').innerHTML =
      '<div class="wk-stat"><span>' + (area === 'arte' ? 'Artes previstas' : 'Vídeos previstos') +
      '</span><strong>' + weeklyCount + '</strong></div>' +
      '<div class="wk-stat"><span>Dias com demandas</span><strong>' +
      occupiedDays + ' / 7</strong></div>';
    var dayRoot = document.getElementById('wkDays');
    dayRoot.innerHTML = cards.join('');
    dayRoot.querySelectorAll('[data-ow-editor-demand]').forEach(function (button) {
      function openDemand() {
        var d = state.demands.find(function (x) {
          return x.id === button.dataset.owEditorDemand;
        });
        if (!d || d.area !== editorArea() || !canAccessArea(d.area)) return;
        editorCalendarOpen = false;
        currentArea = d.area;
        currentMonth = d.month;
        openClientId = d.clientId;
        openDemandId = d.id;
        renderAll();
        var root = document.getElementById('clients');
        if (root) root.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      button.onclick = openDemand;
      button.onkeydown = function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault();openDemand(); }
      };
    });

    // Navegação sem acesso aos eventos administrativos.
    document.getElementById('wkPreviousBtn').onclick = function () {
      calendarWeekStart = calendarAddDays(calendarWeekStart, -7);
      editorWeekCalendar();
    };
    document.getElementById('wkNextBtn').onclick = function () {
      calendarWeekStart = calendarAddDays(calendarWeekStart, 7);
      editorWeekCalendar();
    };
    document.getElementById('wkCurrentBtn').onclick = function () {
      calendarWeekStart = calendarMonday(calendarLocalISO(new Date()));
      editorWeekCalendar();
    };
    picker.onchange = function (event) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(event.target.value)) {
        calendarWeekStart = calendarMonday(event.target.value);
        editorWeekCalendar();
      }
    };
    var info = document.querySelector('#weekCalendarContent .wk-toolbar h2');
    if (info) info.textContent = 'Calendário de ' + AREAS[area];
    var subtitle = document.querySelector('#weekCalendarContent .wk-toolbar p');
    if (subtitle) subtitle.textContent = 'Somente demandas de ' + AREAS[area].toLowerCase() +
      '. Nenhuma reunião, compromisso ou demanda de outro setor aparece aqui.';
    var foot = document.querySelector('#weekCalendarContent .wk-footer-note');
    if (foot) foot.textContent = 'Calendário da equipe · Somente demandas do seu setor. ' +
      'Selecione uma demanda para abrir os detalhes e atualizar o andamento.';
  }

  renderTabs = function () {
    previousRenderTabs.apply(this, arguments);
    var area = editorArea();
    if (!area) return;
    var tab = document.getElementById('weekCalendarTab');
    if (!tab) return;
    tab.classList.remove('hidden');
    tab.classList.toggle('active', editorCalendarOpen);
    tab.onclick = function () {
      if (!editorArea()) return;
      editorCalendarOpen = true;
      openClientId = null;
      openDemandId = null;
      renderAll();
    };
  };

  renderAll = function () {
    var area = editorArea();
    if (!area || !editorCalendarOpen) {
      previousRenderAll.apply(this, arguments);
      var week = document.getElementById('weekCalendarContent');
      if (area && week) week.classList.remove('ow-editor-week');
      if (area) document.body.classList.remove('calendar-view');
      return;
    }
    // Mantém a área atual válida durante o render original, preservando todas
    // as verificações de autenticação e autorização do aplicativo.
    var oldArea = currentArea;
    currentArea = area;
    try {
      previousRenderAll.apply(this, arguments);
    } finally {
      currentArea = oldArea;
    }
    var content = document.getElementById('weekCalendarContent');
    content.classList.remove('hidden');
    content.classList.add('ow-editor-week');
    document.body.classList.add('calendar-view');
    document.getElementById('areaContent').classList.add('hidden');
    document.getElementById('agendaContent').classList.add('hidden');
    document.getElementById('heroControls').classList.add('hidden');
    document.getElementById('pageTitle').textContent = 'Calendário';
    document.getElementById('pageSubtitle').textContent =
      'Programação semanal de ' + AREAS[area].toLowerCase() + '.';
    document.querySelectorAll('#tabs .tab').forEach(function (tab) {
      tab.classList.remove('active');
    });
    var tab = document.getElementById('weekCalendarTab');
    if (tab) tab.classList.add('active');
    editorWeekCalendar();
  };

  document.addEventListener('click', function (event) {
    if (!editorArea()) return;
    if (event.target.closest('#tabs [data-area],#logoutBtn')) {
      editorCalendarOpen = false;
    }
  }, true);
  if (typeof currentUser !== 'undefined' && currentUser && editorArea()) renderAll();
})();
