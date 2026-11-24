/* One Way · Quem fez o quê
   - Sigla de 2 letras (ex.: LU, TI) ao lado de cada status marcado, da criação e do histórico da demanda.
   - Painel "Atividades" (só Administrador): tudo o que cada login fez, com filtros, em tempo real.
   - Cada e-mail de Administrador escolhe uma vez o nome e a sigla (fica salvo para toda a equipe).
   - Registros antigos (antes desta versão) aparecem como "AD": o sistema só sabia que era um Administrador. */
(function () {
  'use strict';
  if (typeof renderAll !== 'function' || typeof renderDemand !== 'function' || typeof owActorStamp !== 'function') return;

  var KIND_GROUPS = {
    created: 'Criação', restored: 'Criação', status: 'Status', edited: 'Edição',
    'final-link': 'Links e arquivos', reference: 'Links e arquivos', production: 'Links e arquivos',
    note: 'Notas', proposal: 'Propostas', deleted: 'Exclusões', profile: 'Equipe'
  };
  var GROUP_ORDER = ['Criação', 'Status', 'Edição', 'Links e arquivos', 'Notas', 'Propostas', 'Exclusões', 'Equipe'];
  var LEGACY_LABELS = { 'Aguardando aprovação': 'purple' };
  var ui = { open: false, tab: 'app', days: 30, person: 'all', group: 'all', query: '', limit: 300, server: null, serverError: '', serverLoading: false };
  var profilePromptShown = false, keyForEmail = '';

  /* ---------- quem é quem ---------- */
  function plainObj(v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
  function collaboratorFor(login) { return (state.collaborators || []).find(function (c) { return c.login === login; }); }
  function actorOf(e) {
    if (!e) return null;
    if (e.ini) return { by: e.by || '—', ini: owCleanInitials(e.ini) || '??', login: e.login || '' };
    var by = String(e.by || '');
    if (by === 'Administrador') return { by: 'Administrador (antes da identificação)', ini: 'AD', login: 'admin', legacy: true };
    if (by === 'Design Login' || by === 'Vídeos Login') {
      var login = by === 'Design Login' ? 'design' : 'video', c = collaboratorFor(login), name = (c && c.name) || by;
      return { by: name, ini: owInitialsFor(name), login: login, legacy: true };
    }
    if (by === 'Visitante') return { by: 'Visitante', ini: 'VS', login: 'status' };
    if (!by || by === 'Equipe One Way') return { by: 'Equipe One Way', ini: 'OW', login: '' };
    return { by: by, ini: owInitialsFor(by), login: '' };
  }
  var LOGIN_NAMES = { admin: 'login Administrador', design: 'login Design', video: 'login Vídeos', status: 'login Visitante' };
  function hue(text) { var h = 0; String(text).split('').forEach(function (ch) { h = (h * 31 + ch.charCodeAt(0)) % 360; }); return h; }
  function badge(actor, what, at) {
    if (!actor) return '';
    var when = at ? fmt(at) : '';
    var title = (what ? what + ' por ' : '') + actor.by + (LOGIN_NAMES[actor.login] ? ' (' + LOGIN_NAMES[actor.login] + ')' : '') + (when ? ' · ' + when : '');
    var cls = 'ow-who' + (actor.ini === 'AD' || actor.ini === 'OW' || actor.ini === '--' ? ' ow-who-neutral' : '');
    var style = cls.indexOf('neutral') > -1 ? '' : ' style="--ow-who-h:' + hue(actor.ini + actor.by) + '"';
    return '<span class="' + cls + '"' + style + ' title="' + esc(title) + '" aria-label="' + esc(title) + '">' + esc(actor.ini) + '</span>';
  }
  function fmt(value) {
    var d = new Date(value);
    return Number.isFinite(d.getTime()) ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Cuiaba', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(d) : '';
  }

  /* Quem marcou cada status (o último a marcar). Usa o histórico da demanda e as marcas novas. */
  function statusMarks(d) {
    var marks = {}, labels = {};
    var set = typeof statusesForArea === 'function' ? statusesForArea(d.area) : {};
    Object.keys(set).forEach(function (k) { labels[set[k]] = k; });
    Object.keys(LEGACY_LABELS).forEach(function (l) { if (!labels[l] && set[LEGACY_LABELS[l]]) labels[l] = LEGACY_LABELS[l]; });
    (Array.isArray(d.activityLog) ? d.activityLog : []).forEach(function (e) {
      if (!e || e.kind !== 'status') return;
      var target = String(e.detail || '').split('→').pop().trim(), key = labels[target];
      if (key) marks[key] = { actor: actorOf(e), at: e.at };
    });
    var explicit = plainObj(d.statusMarks);
    Object.keys(explicit).forEach(function (k) {
      var m = explicit[k];
      if (m && m.ini && (!marks[k] || String(m.at || '') >= String(marks[k].at || ''))) marks[k] = { actor: actorOf(m), at: m.at };
    });
    return marks;
  }
  function creatorOf(d) {
    if (d.createdBy && d.createdBy.ini) return { actor: actorOf(d.createdBy), at: d.createdBy.at || d.createdAt };
    var e = (Array.isArray(d.activityLog) ? d.activityLog : []).find(function (x) { return x && x.kind === 'created'; });
    if (e) return { actor: actorOf(e), at: e.at };
    // Demandas criadas antes do histórico: mostra que o criador não foi registrado.
    return d.createdAt ? { actor: UNKNOWN_CREATOR, at: d.createdAt, unknown: true } : null;
  }
  var UNKNOWN_CREATOR = { by: 'Não registrado — criada antes do sistema guardar quem cria (24/11/2026)', ini: '--', login: '', legacy: true };
  window.OWActivity = { actorOf: actorOf, statusMarks: statusMarks, creatorOf: creatorOf, collectEvents: collectEvents, badge: badge };

  /* ---------- siglas nas demandas ---------- */
  var prevRenderDemand = renderDemand;
  renderDemand = function (d) {
    var html = prevRenderDemand.apply(this, arguments);
    if (!d || typeof html !== 'string') return html;
    var marks = statusMarks(d);
    html = html.replace(/(<button class="status-btn[^"]*" data-status="([a-z]+)">)([^<]*)(<\/button>)/g, function (all, open, key, label, close) {
      var m = marks[key];
      return m ? open + label + badge(m.actor, 'Marcado “' + label.trim() + '”', m.at) + close : all;
    });
    html = decorateItems(d, html);
    var creator = creatorOf(d), current = marks[d.status] || (creator && !creator.unknown ? creator : null);
    if (current) {
      html = html.replace(/(<span class="current-status [^"]*">)([^<]*)(<\/span>)/, function (all, open, label, close) {
        return open + label + badge(current.actor, marks[d.status] ? 'Status atual marcado' : 'Criada', current.at) + close;
      });
    }
    return html;
  };
  /* Quem inseriu cada link/arquivo de referência, de produção e o link do material finalizado. */
  function itemActor(m) { return m && (m.ini || m.addedByIni) ? actorOf(m.ini ? m : { by: m.addedBy, ini: m.addedByIni, login: m.addedByLogin }) : null; }
  function itemMeta(m, what) {
    var a = itemActor(m), at = m && (m.at || m.addedAt);
    if (!a) return '';
    return '<small class="ow-item-who">' + esc(what) + ' por ' + badge(a, what, at) + (at ? ' <span>' + esc(fmt(at)) + '</span>' : '') + '</small>';
  }
  function decorateItems(d, html) {
    var marks = plainObj(d.itemMarks);
    var links = (d.links || []), files = (d.attachments || []), i = 0;
    html = html.replace(/<div class="ref-item">(<a [^>]*>[^<]*<\/a>|<span>[^<]*<\/span>)/g, function (all, inner) {
      var n = i++, meta = n < links.length ? itemMeta(marks['links|' + links[n]], 'Inserido') : itemMeta(files[n - links.length], 'Enviado');
      return meta ? '<div class="ref-item"><div class="ow-ref-main">' + inner + meta + '</div>' : all;
    });
    var plinks = (d.productionLinks || []).filter(Boolean), pfiles = (d.productionAttachments || []), j = 0;
    html = html.replace(/(<div class="production-asset-main"><strong[^>]*>[^<]*<\/strong><span>[^<]*<\/span>)(<\/div>)/g, function (all, inner, close) {
      var n = j++, meta = n < plinks.length ? itemMeta(marks['productionLinks|' + plinks[n]], 'Inserido') : itemMeta(pfiles[n - plinks.length], 'Enviado');
      return meta ? inner + meta + close : all;
    });
    var added = d.finalLinkAddedAt ? actorOf({ by: d.finalLinkAddedBy, ini: d.finalLinkAddedByIni, login: d.finalLinkAddedByLogin }) : null;
    var updated = d.finalLinkUpdatedBy ? actorOf({ by: d.finalLinkUpdatedBy, ini: d.finalLinkUpdatedByIni, login: d.finalLinkUpdatedByLogin }) : null;
    var k = 0;
    html = html.replace(/<small>Por [^<]*<\/small>/g, function (all) {
      var a = (k++ === 0 && added) ? added : updated;
      return a ? '<small>Por ' + esc(a.by) + badge(a, 'Link do material finalizado', '') + '</small>' : all;
    });
    return html;
  }
  if (typeof formatDemandCreatedMini === 'function') {
    var prevCreatedMini = formatDemandCreatedMini;
    formatDemandCreatedMini = function (d) {
      var html = prevCreatedMini.apply(this, arguments), c = d && creatorOf(d);
      return html && c ? html.replace(/<\/span>$/, ' ' + createdByHTML(c) + '</span>') : html;
    };
  }
  if (typeof demandLatestActivityMini === 'function') {
    demandLatestActivityMini = function (d) {
      var events = Array.isArray(d.activityLog) ? d.activityLog : [], e = events.length ? events[events.length - 1] : null;
      if (!e || !e.at) return '';
      var when = fmt(e.at);
      return when ? '<span class="agenda-last-action" title="Última atividade registrada">' + esc(e.detail || 'Atualização') + ' · ' + esc(when) + ' ' + badge(actorOf(e), e.detail, e.at) + '</span>' : '';
    };
  }
  if (typeof demandActivityHTML === 'function') {
    demandActivityHTML = function (d) {
      var entries = (Array.isArray(d.activityLog) ? d.activityLog : []).slice().reverse();
      return '<section class="ow-demand-audit" aria-label="Registros de atividades"><div class="ow-demand-audit-heading">Atividades registradas <span>' + entries.length + '</span></div><div class="ow-demand-audit-list">' +
        (entries.length ? entries.map(function (e) {
          var a = actorOf(e);
          return '<div class="ow-demand-audit-event">' + badge(a, e.detail, e.at).replace('class="ow-who', 'class="ow-who ow-who-lg') +
            '<div><strong>' + esc(e.detail || e.kind || 'Atualização') + '</strong><small>' + esc(fmt(e.at) || 'Data indisponível') + ' · ' + esc(a.by) + (LOGIN_NAMES[a.login] ? ' · ' + esc(LOGIN_NAMES[a.login]) : '') + '</small></div></div>';
        }).join('') : '<p class="ow-demand-audit-empty">Novas atualizações serão registradas aqui. Não estimamos horários antigos.</p>') + '</div></section>';
    };
  }
  function createdByHTML(c) {
    if (c.unknown) return '<span class="ow-who-label" title="' + esc(c.actor.by) + '">· criador não registrado (demanda antiga)</span>';
    return '<span class="ow-who-label">por</span>' + badge(c.actor, 'Criada', c.at);
  }
  function decorateAgenda() {
    document.querySelectorAll('#agendaList .agenda-item[data-agenda-id]').forEach(function (card) {
      var d = state.demands.find(function (x) { return x.id === card.dataset.agendaId; });
      if (!d) return;
      var pill = card.querySelector('.current-status');
      if (pill && !pill.querySelector('.ow-who')) {
        var cr = creatorOf(d), m = statusMarks(d)[d.status] || (cr && !cr.unknown ? cr : null);
        if (m) pill.insertAdjacentHTML('beforeend', badge(m.actor, 'Status atual marcado', m.at));
      }
      var created = card.querySelector('.agenda-created-date');
      var c = creatorOf(d);
      if (created && c && !created.querySelector('.ow-who-created')) {
        var holder = document.createElement('span');
        holder.className = 'ow-who-created';
        holder.innerHTML = createdByHTML(c);
        var last = created.querySelector('.agenda-last-action');
        created.insertBefore(holder, last || null);
      }
    });
  }
  // A Agenda também é redesenhada por outros módulos (Lista/Panorama, filtros): observa a lista.
  var agendaQueued = false;
  function queueAgenda() {
    if (agendaQueued) return; agendaQueued = true;
    requestAnimationFrame(function () { agendaQueued = false; try { decorateAgenda(); } catch (e) {} });
  }
  try {
    new MutationObserver(function (list) {
      for (var i = 0; i < list.length; i++) {
        var t = list[i].target;
        if (t && t.closest && t.closest('#agendaList') && !(t.closest('.ow-who') || t.classList && t.classList.contains('ow-who-created'))) { queueAgenda(); return; }
      }
    }).observe(document.body, { childList: true, subtree: true });
  } catch (e) {}
  if (typeof renderAgenda === 'function') {
    var prevRenderAgenda = renderAgenda;
    renderAgenda = function () { var r = prevRenderAgenda.apply(this, arguments); try { decorateAgenda(); } catch (e) { console.warn(e); } return r; };
  }

  /* ---------- gravação: quem salvou por último (usado pelo registro do banco) ---------- */
  if (typeof saveState === 'function') {
    var prevSave = saveState;
    saveState = function () {
      try { var a = owActorStamp(); state.lastActor = { by: a.by, ini: a.ini, login: a.login, at: new Date().toISOString() }; } catch (e) {}
      return prevSave.apply(this, arguments);
    };
  }

  /* ---------- nome e sigla de cada e-mail de Administrador ---------- */
  async function hashEmail(email) {
    var bytes = new TextEncoder().encode('oneway-admin|' + String(email || '').trim().toLowerCase());
    var digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    return 'u_' + Array.from(digest.slice(0, 10)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
  }
  function adminEmail() { try { return typeof supabaseAdminEmail === 'string' ? supabaseAdminEmail : ''; } catch (e) { return ''; } }
  async function ensureAdminKey() {
    var email = adminEmail();
    if (!isAdmin() || !email) return;
    if (keyForEmail === email && owAdminProfileKey) return;
    if (keyForEmail !== email) profilePromptShown = false;
    keyForEmail = email;
    owAdminProfileKey = await hashEmail(email);
    refreshUserChip();
    if (!plainObj(state.adminProfiles)[owAdminProfileKey] && !profilePromptShown) {
      profilePromptShown = true;
      // Espera os dados chegarem do banco antes de perguntar.
      setTimeout(function () { if (isAdmin() && !plainObj(state.adminProfiles)[owAdminProfileKey]) openProfileModal(); }, 2500);
    }
  }
  function refreshUserChip() {
    if (!isAdmin()) return;
    var p = owAdminProfileKey && plainObj(state.adminProfiles)[owAdminProfileKey];
    var name = document.getElementById('userName'), avatar = document.getElementById('avatar');
    if (p && p.name && name) { name.textContent = p.name; if (avatar) avatar.textContent = owCleanInitials(p.ini) || 'A'; }
  }
  function suggestInitials(name) { name = String(name || '').trim(); return name ? owInitialsFor(name) : ''; }
  function openProfileModal() {
    closeProfileModal();
    var current = plainObj(state.adminProfiles)[owAdminProfileKey] || {};
    var names = (state.collaborators || []).map(function (c) { return c.name; }).concat(['Thiago']);
    var wrap = document.createElement('div');
    wrap.className = 'ow-act-overlay ow-act-profile';
    wrap.id = 'owActProfile';
    wrap.innerHTML = '<form class="ow-act-box ow-act-profile-box" role="dialog" aria-modal="true" aria-label="Quem está usando este login">' +
      '<h3>Quem está usando este login de Administrador?</h3>' +
      '<p>Escolha uma vez. A partir de agora, tudo o que for feito com este e-mail aparece com o seu nome e a sua sigla (o quadradinho).</p>' +
      '<label>Seu nome<input name="name" list="owActNames" required maxlength="40" value="' + esc(current.name || '') + '" placeholder="Ex.: Thiago"></label>' +
      '<datalist id="owActNames">' + names.filter(function (n, i, a) { return n && a.indexOf(n) === i; }).map(function (n) { return '<option value="' + esc(n) + '">'; }).join('') + '</datalist>' +
      '<label>Sigla (2 letras)<input name="ini" required maxlength="2" value="' + esc(current.ini || '') + '" placeholder="TI"></label>' +
      '<div class="ow-act-preview">Vai aparecer assim: <span class="ow-act-preview-badge"></span></div>' +
      '<p class="ow-act-warning" hidden></p>' +
      '<p class="ow-act-small">Importante: cada pessoa precisa entrar com o próprio e-mail. Se duas pessoas usarem o mesmo e-mail, o sistema não tem como separar quem fez.</p>' +
      '<div class="ow-act-actions"><button type="submit" class="primary small">Salvar</button><button type="button" class="ghost small" data-ow-act-later>Depois</button></div></form>';
    document.body.appendChild(wrap);
    var form = wrap.querySelector('form'), nameIn = form.elements.namedItem('name'), iniIn = form.elements.namedItem('ini');
    var touchedIni = !!current.ini;
    function preview() {
      if (!touchedIni) iniIn.value = suggestInitials(nameIn.value);
      var ini = owCleanInitials(iniIn.value);
      form.querySelector('.ow-act-preview-badge').innerHTML = ini ? badge({ by: nameIn.value || '—', ini: ini, login: 'admin' }) : '';
      var clash = Object.keys(plainObj(state.adminProfiles)).filter(function (k) { return k !== owAdminProfileKey; })
        .map(function (k) { return state.adminProfiles[k]; }).find(function (p) { return owCleanInitials(p.ini) === ini; });
      var warn = form.querySelector('.ow-act-warning');
      warn.hidden = !clash;
      warn.textContent = clash ? 'Atenção: a sigla ' + ini + ' já é usada por ' + clash.name + '. Escolha outra para não confundir.' : '';
    }
    nameIn.addEventListener('input', preview);
    iniIn.addEventListener('input', function () { touchedIni = true; preview(); });
    preview();
    wrap.querySelector('[data-ow-act-later]').onclick = closeProfileModal;
    form.addEventListener('submit', async function (ev) {
      ev.preventDefault();
      var name = String(nameIn.value || '').trim().slice(0, 40), ini = owCleanInitials(iniIn.value);
      if (!name || ini.length < 2) { toast('Informe o nome e uma sigla de 2 letras.'); return; }
      if (!owAdminProfileKey) { toast('Entre como Administrador com seu e-mail para salvar.'); return; }
      var before = plainObj(state.adminProfiles)[owAdminProfileKey];
      state.adminProfiles = Object.assign({}, plainObj(state.adminProfiles));
      state.adminProfiles[owAdminProfileKey] = { name: name, ini: ini, since: (before && before.since) || new Date().toISOString(), updatedAt: new Date().toISOString() };
      owLogAction('profile', before ? 'Nome/sigla do login alterado para ' + name + ' (' + ini + ')' : 'Login de Administrador identificado como ' + name + ' (' + ini + ')');
      if (!await saveState({ strictRemote: true })) { toast('Não foi possível salvar agora. Tente de novo.'); return; }
      closeProfileModal(); refreshUserChip(); toast('Pronto! Suas ações aparecem como ' + ini + '.');
      renderAll();
    });
    setTimeout(function () { nameIn.focus(); }, 30);
  }
  function closeProfileModal() { var x = document.getElementById('owActProfile'); if (x) x.remove(); }

  /* ---------- relatório ---------- */
  function clientName(id) { var c = (state.clients || []).find(function (x) { return x.id === id; }); return c ? c.name : ''; }
  function collectEvents() {
    var out = [];
    function fromDemand(d, removed) {
      var base = { client: clientName(d.clientId), title: d.title || '', area: (typeof AREAS === 'object' && AREAS[d.area]) || d.area || '', demandId: d.id, removed: !!removed };
      var log = Array.isArray(d.activityLog) ? d.activityLog : [];
      log.forEach(function (e) {
        if (!e || !e.at) return;
        out.push(Object.assign({ id: e.id || (d.id + e.at), at: e.at, kind: e.kind || 'edited', detail: e.detail || 'Atualização', actor: actorOf(e) }, base));
      });
      if (!log.some(function (e) { return e && e.kind === 'created'; }) && d.createdAt) {
        out.push(Object.assign({ id: d.id + ':created', at: d.createdAt, kind: 'created', detail: 'Demanda criada', actor: d.createdBy ? actorOf(d.createdBy) : { by: 'Não registrado', ini: '--', login: '', legacy: true } }, base));
      }
      if (removed && d.deletedAt && !log.some(function (e) { return e && e.kind === 'deleted'; })) {
        out.push(Object.assign({ id: d.id + ':deleted', at: d.deletedAt, kind: 'deleted', detail: 'Demanda movida para Excluídos', actor: d.deletedByIni ? actorOf({ by: d.deletedBy, ini: d.deletedByIni, login: d.deletedByLogin }) : actorOf({ by: d.deletedBy }) }, base));
      }
    }
    (state.demands || []).forEach(function (d) { fromDemand(d, false); });
    (state.deletedDemands || []).forEach(function (d) { fromDemand(d, true); });
    (Array.isArray(state.auditLog) ? state.auditLog : []).forEach(function (e) {
      if (e && e.at) out.push({ id: e.id, at: e.at, kind: e.kind, detail: e.detail, actor: actorOf(e), client: e.client || '', title: e.title || '', area: e.kind === 'proposal' ? 'Propostas' : '' });
    });
    (state.proposalHistory || []).forEach(function (r) {
      if (!r || r.createdBy || !r.generatedAt) return; // as novas já estão no registro geral
      out.push({ id: r.id + ':proposal', at: r.generatedAt, kind: 'proposal', detail: 'Proposta criada (registro antigo)', actor: { by: 'Administrador (antes da identificação)', ini: 'AD', login: 'admin', legacy: true }, client: (r.data && r.data.client) || '', title: (r.data && (r.data.title || '')) || '', area: 'Propostas' });
    });
    return out.sort(function (a, b) { return String(b.at).localeCompare(String(a.at)); });
  }
  function personKey(a) { return a ? a.ini + '|' + a.by : ''; }
  function filtered(events) {
    var since = ui.days ? Date.now() - ui.days * 864e5 : 0, q = owPlainText(ui.query).toLowerCase().trim();
    return events.filter(function (e) {
      var t = Date.parse(e.at);
      if (since && !(t >= since)) return false;
      if (ui.group !== 'all' && (KIND_GROUPS[e.kind] || 'Edição') !== ui.group) return false;
      if (q && owPlainText([e.client, e.title, e.detail, e.actor && e.actor.by].join(' ')).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
  }
  function rowHTML(e) {
    var context = [e.client, e.title].filter(Boolean).join(' · ');
    return '<div class="ow-act-row' + (e.actor && e.actor.legacy ? ' ow-act-legacy' : '') + '">' +
      '<span class="ow-act-when">' + esc(fmt(e.at)) + '</span>' + badge(e.actor, e.detail, e.at).replace('class="ow-who', 'class="ow-who ow-who-lg') +
      '<span class="ow-act-main"><strong>' + esc(e.detail) + '</strong>' +
      (context ? '<small>' + esc(context) + (e.area ? ' · ' + esc(e.area) : '') + (e.removed ? ' · (excluída)' : '') + '</small>' : '') + '</span>' +
      '<span class="ow-act-person">' + esc(e.actor ? e.actor.by : '') + '</span></div>';
  }
  function renderReport() {
    var box = document.getElementById('owActReport');
    if (!box) return;
    var body = box.querySelector('.ow-act-body');
    box.querySelectorAll('[data-ow-act-tab]').forEach(function (b) { b.classList.toggle('active', b.dataset.owActTab === ui.tab); });
    if (ui.tab === 'server') { renderServer(body); return; }
    if (ui.tab === 'team') { renderTeam(body); return; }
    var all = filtered(collectEvents());
    var people = {};
    all.forEach(function (e) { var k = personKey(e.actor); if (!people[k]) people[k] = { actor: e.actor, count: 0 }; people[k].count++; });
    var list = ui.person === 'all' ? all : all.filter(function (e) { return personKey(e.actor) === ui.person; });
    var groups = {};
    list.forEach(function (e) { var g = KIND_GROUPS[e.kind] || 'Edição'; groups[g] = (groups[g] || 0) + 1; });
    var peopleKeys = Object.keys(people).sort(function (a, b) { return people[b].count - people[a].count; });
    body.innerHTML =
      '<div class="ow-act-filters">' +
        '<label>Período<select data-ow-act="days">' + [[1, 'Hoje e ontem'], [7, '7 dias'], [30, '30 dias'], [90, '90 dias'], [0, 'Tudo']].map(function (o) { return '<option value="' + o[0] + '"' + (ui.days === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></label>' +
        '<label>Tipo<select data-ow-act="group"><option value="all">Todos</option>' + GROUP_ORDER.map(function (g) { return '<option' + (ui.group === g ? ' selected' : '') + '>' + g + '</option>'; }).join('') + '</select></label>' +
        '<label class="ow-act-search">Buscar<input data-ow-act="query" value="' + esc(ui.query) + '" placeholder="Cliente, demanda ou ação"></label>' +
        '<button type="button" class="ghost small" data-ow-act-csv>Baixar planilha (CSV)</button>' +
      '</div>' +
      '<div class="ow-act-people"><button type="button" class="ow-act-chip' + (ui.person === 'all' ? ' active' : '') + '" data-ow-act-person="all">Todos <b>' + all.length + '</b></button>' +
        peopleKeys.map(function (k) { var p = people[k]; return '<button type="button" class="ow-act-chip' + (ui.person === k ? ' active' : '') + '" data-ow-act-person="' + esc(k) + '">' + badge(p.actor) + ' ' + esc(p.actor.by) + ' <b>' + p.count + '</b></button>'; }).join('') + '</div>' +
      '<div class="ow-act-summary">' + (list.length ? GROUP_ORDER.filter(function (g) { return groups[g]; }).map(function (g) { return '<span>' + esc(g) + ': <b>' + groups[g] + '</b></span>'; }).join('') : '') + '</div>' +
      '<div class="ow-act-list">' + (list.length ? list.slice(0, ui.limit).map(rowHTML).join('') +
        (list.length > ui.limit ? '<button type="button" class="ghost small ow-act-more" data-ow-act-more>Mostrar mais (' + (list.length - ui.limit) + ')</button>' : '')
        : '<p class="ow-act-empty">Nenhuma atividade neste filtro.</p>') + '</div>' +
      '<p class="ow-act-small">Atualiza sozinho quando alguém mexe no sistema. <b>AD</b> = feito com login de Administrador antes da identificação por nome (24/11/2026); <b>--</b> = demanda criada antes de existir o histórico.</p>';
  }
  function renderTeam(body) {
    var profiles = plainObj(state.adminProfiles);
    var teamRows = ['design', 'video'].map(function (login) { var c = collaboratorFor(login); return c ? { login: login, name: c.name } : null; }).filter(Boolean);
    body.innerHTML = '<p class="ow-act-small">Cada e-mail de Administrador escolhe o próprio nome e sigla no primeiro acesso. Os logins da equipe usam a sigla do colaborador vinculado.</p>' +
      '<div class="ow-act-team"><h4>Administradores</h4>' +
      (Object.keys(profiles).length ? Object.keys(profiles).map(function (k) {
        var p = profiles[k];
        return '<div class="ow-act-team-row">' + badge({ by: p.name, ini: p.ini, login: 'admin' }) + '<strong>' + esc(p.name) + '</strong><span>' + (k === owAdminProfileKey ? 'este é o seu login' : (p.since ? 'identificado em ' + esc(fmt(p.since)) : '')) + '</span>' +
          (k === owAdminProfileKey ? '<button type="button" class="ghost small" data-ow-act-edit-me>Alterar</button>' : '') + '</div>';
      }).join('') : '<p class="ow-act-empty">Nenhum Administrador identificado ainda.</p>') +
      (owAdminProfileKey && !profiles[owAdminProfileKey] ? '<button type="button" class="primary small" data-ow-act-edit-me>Identificar o meu login</button>' : '') +
      '<h4>Logins da equipe</h4>' + teamRows.map(function (r) {
        return '<div class="ow-act-team-row">' + badge({ by: r.name, ini: owInitialsFor(r.name), login: r.login }) + '<strong>' + esc(r.name) + '</strong><span>' + esc(LOGIN_NAMES[r.login]) + '</span>' +
          '<input class="ow-act-ini" maxlength="2" data-ow-act-team-ini="' + esc(r.name) + '" value="' + esc(owInitialsFor(r.name)) + '" aria-label="Sigla de ' + esc(r.name) + '"></div>';
      }).join('') + '<div class="ow-act-team-row">' + badge({ by: 'Visitante', ini: 'VS', login: 'status' }) + '<strong>Visitante</strong><span>login Visitante (senha da equipe)</span></div></div>';
  }
  function serverActor(row) {
    var p = row._profile;
    if (p) return { by: p.name, ini: p.ini, login: 'admin' };
    if (row.actor_ini) return { by: row.actor_name || '—', ini: row.actor_ini, login: row.actor_login || '' };
    return { by: row.actor_email ? 'Administrador' : 'Login da equipe', ini: row.actor_email ? 'AD' : 'OW', login: row.actor_email ? 'admin' : '' };
  }
  var SERVER_ACTIONS = { created: 'Demanda apareceu (criada ou restaurada)', status: 'Status alterado', removed: 'Demanda sumiu da lista', deleted: 'Demanda movida para Excluídos' };
  function statusName(area, key) { var s = typeof statusesForArea === 'function' ? statusesForArea(area) : {}; return s[key] || key || '—'; }
  async function loadServer() {
    if (ui.serverLoading) return;
    ui.serverLoading = true; ui.serverError = '';
    try {
      if (!supabaseClient || !adminAuthReady()) throw new Error('Entre como Administrador para ver o registro do banco.');
      var since = new Date(Date.now() - (ui.days || 365) * 864e5).toISOString();
      var res = await supabaseClient.from('app_activity_log').select('*').gte('at', since).order('at', { ascending: false }).limit(1500);
      if (res.error) throw res.error;
      var rows = res.data || [], cache = {};
      for (var i = 0; i < rows.length; i++) {
        var em = rows[i].actor_email;
        if (em) { if (!(em in cache)) cache[em] = plainObj(state.adminProfiles)[await hashEmail(em)] || null; rows[i]._profile = cache[em]; }
      }
      ui.server = rows;
    } catch (e) {
      var msg = String((e && e.message) || e || '');
      ui.serverError = /app_activity_log|does not exist|schema cache|42P01|PGRST205/i.test(msg + (e && e.code || '')) ?
        'O registro do banco ainda não foi ativado. Rode no Supabase o arquivo supabase/migrations/20261124_app_activity_log.sql (SQL Editor → New query → colar tudo → Run).' : msg;
      ui.server = null;
    } finally { ui.serverLoading = false; renderReport(); }
  }
  function renderServer(body) {
    if (!ui.server && !ui.serverError && !ui.serverLoading) loadServer();
    var rows = ui.server || [];
    body.innerHTML = '<p class="ow-act-small">Este registro é feito pelo próprio banco de dados, a cada gravação — não depende do navegador de ninguém. Serve para tirar a prova quando houver dúvida. ' +
      '<b>⚠</b> marca um status que mudou sem nenhuma ação registrada na demanda: normalmente é uma tela aberta com dados antigos que salvou por cima.</p>' +
      '<div class="ow-act-filters"><button type="button" class="ghost small" data-ow-act-reload>Atualizar</button></div>' +
      (ui.serverLoading ? '<p class="ow-act-empty">Carregando…</p>' : ui.serverError ? '<p class="ow-act-warning">' + esc(ui.serverError) + '</p>' :
        '<div class="ow-act-list">' + (rows.length ? rows.map(function (r) {
          var a = serverActor(r), detail = SERVER_ACTIONS[r.action] || r.action;
          if (r.action === 'status') detail += ': ' + statusName(r.area, r.old_status) + ' → ' + statusName(r.area, r.new_status);
          return '<div class="ow-act-row' + (r.without_app_record ? ' ow-act-alert' : '') + '"><span class="ow-act-when">' + esc(fmt(r.at)) + '</span>' + badge(a, detail, r.at).replace('class="ow-who', 'class="ow-who ow-who-lg') +
            '<span class="ow-act-main"><strong>' + (r.without_app_record ? '⚠ ' : '') + esc(detail) + '</strong><small>' + esc([clientName(r.client_id), r.demand_title].filter(Boolean).join(' · ')) +
            (r.without_app_record ? ' · sem ação registrada no app' : '') + '</small></span><span class="ow-act-person">' + esc(a.by) + '</span></div>';
        }).join('') : '<p class="ow-act-empty">Nenhum registro no período.</p>') + '</div>');
  }
  function csv() {
    var list = filtered(collectEvents());
    if (ui.person !== 'all') list = list.filter(function (e) { return personKey(e.actor) === ui.person; });
    var cell = function (v) { v = String(v == null ? '' : v); return /[";\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var lines = [['Data e hora', 'Sigla', 'Pessoa', 'Login', 'Tipo', 'Ação', 'Cliente', 'Demanda', 'Área'].join(';')].concat(list.map(function (e) {
      return [fmt(e.at), e.actor.ini, e.actor.by, LOGIN_NAMES[e.actor.login] || '', KIND_GROUPS[e.kind] || 'Edição', e.detail, e.client, e.title, e.area].map(cell).join(';');
    }));
    var blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'atividades-oneway-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function openReport() {
    if (!isAdmin()) return;
    closeReport();
    ui.open = true; ui.limit = 300;
    var wrap = document.createElement('div');
    wrap.className = 'ow-act-overlay'; wrap.id = 'owActReport';
    wrap.innerHTML = '<div class="ow-act-box" role="dialog" aria-modal="true" aria-label="Atividades da equipe">' +
      '<div class="ow-act-head"><div><h3>Atividades da equipe</h3><p>Quem criou, mudou status, editou ou excluiu — por login.</p></div><button type="button" class="ghost small" data-ow-act-close>Fechar</button></div>' +
      '<div class="ow-act-tabs"><button type="button" data-ow-act-tab="app">Atividades</button><button type="button" data-ow-act-tab="server">Prova do banco</button><button type="button" data-ow-act-tab="team">Siglas da equipe</button></div>' +
      '<div class="ow-act-body"></div></div>';
    document.body.appendChild(wrap);
    wrap.addEventListener('click', function (ev) {
      var t = ev.target;
      if (t === wrap || t.closest('[data-ow-act-close]')) { closeReport(); return; }
      var tab = t.closest('[data-ow-act-tab]'); if (tab) { ui.tab = tab.dataset.owActTab; if (ui.tab === 'server') ui.server = null, ui.serverError = ''; renderReport(); return; }
      var person = t.closest('[data-ow-act-person]'); if (person) { ui.person = person.dataset.owActPerson; ui.limit = 300; renderReport(); return; }
      if (t.closest('[data-ow-act-more]')) { ui.limit += 300; renderReport(); return; }
      if (t.closest('[data-ow-act-csv]')) { csv(); return; }
      if (t.closest('[data-ow-act-reload]')) { ui.server = null; ui.serverError = ''; renderReport(); return; }
      if (t.closest('[data-ow-act-edit-me]')) { openProfileModal(); return; }
    });
    wrap.addEventListener('change', async function (ev) {
      var t = ev.target;
      if (t.dataset.owAct === 'days') { ui.days = Number(t.value); ui.server = null; renderReport(); }
      else if (t.dataset.owAct === 'group') { ui.group = t.value; renderReport(); }
      else if (t.dataset.owActTeamIni) {
        var ini = owCleanInitials(t.value); if (ini.length < 2) { toast('Use 2 letras.'); return; }
        state.teamInitials = Object.assign({}, plainObj(state.teamInitials)); state.teamInitials[t.dataset.owActTeamIni] = ini;
        owLogAction('profile', 'Sigla de ' + t.dataset.owActTeamIni + ' alterada para ' + ini);
        await saveState(); renderAll(); toast('Sigla atualizada.');
      }
    });
    var typing;
    wrap.addEventListener('input', function (ev) {
      if (ev.target.dataset.owAct !== 'query') return;
      clearTimeout(typing);
      typing = setTimeout(function () {
        ui.query = ev.target.value; renderReport();
        var input = wrap.querySelector('[data-ow-act="query"]'); if (input) { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }
      }, 250);
    });
    renderReport();
  }
  function closeReport() { ui.open = false; var x = document.getElementById('owActReport'); if (x) x.remove(); }
  window.OWActivity.openReport = openReport;
  window.OWActivity.openProfile = openProfileModal;

  function ensureButton() {
    var btn = document.getElementById('owActivityBtn');
    if (!btn) {
      var logout = document.getElementById('logoutBtn');
      if (!logout || !logout.parentNode) return;
      btn = document.createElement('button');
      btn.type = 'button'; btn.id = 'owActivityBtn'; btn.className = 'ghost small hidden'; btn.title = 'Quem fez o quê no sistema';
      btn.textContent = 'Atividades';
      btn.onclick = openReport;
      logout.parentNode.insertBefore(btn, logout);
    }
    btn.classList.toggle('hidden', !(currentUser && isAdmin()));
  }

  var prevRenderAll = renderAll;
  renderAll = function () {
    var r = prevRenderAll.apply(this, arguments);
    try {
      ensureButton();
      if (isAdmin()) { ensureAdminKey().catch(function (e) { console.warn(e); }); refreshUserChip(); }
      if (ui.open && ui.tab !== 'server') {
        var focused = document.activeElement && document.activeElement.closest && document.activeElement.closest('#owActReport input, #owActReport select');
        if (!focused) renderReport();
      }
      if (document.getElementById('owActProfile') && owAdminProfileKey && plainObj(state.adminProfiles)[owAdminProfileKey] && !document.activeElement.closest('#owActProfile')) closeProfileModal();
    } catch (e) { console.warn('Atividades', e); }
    return r;
  };
  if (typeof logout === 'function') {
    var prevLogout = logout;
    logout = function () { owAdminProfileKey = ''; keyForEmail = ''; profilePromptShown = false; closeReport(); closeProfileModal(); return prevLogout.apply(this, arguments); };
    var logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn && logoutBtn.onclick === prevLogout) logoutBtn.onclick = logout;
  }
  document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape' && ui.open) closeReport(); });
  if (currentUser) renderAll(); else ensureButton();
})();
