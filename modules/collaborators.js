/* Aba "Colaboradores": cadastro da equipe (nome, função, área, contato e qual
   login — Design ou Vídeos — mostra as demandas daquela pessoa). A lista
   alimenta DEMAND_ASSIGNEES, usada em todos os seletores de responsável.
   Renomear ou remover alguém transfere as demandas para outra pessoa. */
(function () {
  'use strict';
  if (window.owCollaborators) return;

  var AREA_LABELS = { '': 'Geral', arte: 'Arte', video: 'Vídeo', trafego: 'Tráfego', social: 'Social Media' };
  var LOGIN_LABELS = { '': 'Sem login próprio', design: 'Design Login', video: 'Vídeos Login' };
  var STYLE_ID = 'ow-collab-style';
  var CSS = [
    '.ow-collab{display:grid;gap:16px}',
    '.ow-collab-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}',
    '.ow-collab-head p{margin:0;font-size:12px;color:rgba(230,241,255,.65)}',
    '.ow-collab-grid{display:grid;gap:14px;grid-template-columns:repeat(auto-fill,minmax(260px,1fr))}',
    '.ow-collab-card{display:grid;gap:10px;padding:18px;border-radius:16px;border:1px solid rgba(220,234,255,.15);background:rgba(9,27,66,.52);color:#eef4ff;min-width:0}',
    '.ow-collab-top{display:flex;align-items:center;gap:12px;min-width:0}',
    '.ow-collab-avatar{flex:0 0 42px;height:42px;border-radius:50%;display:grid;place-items:center;font-weight:700;background:linear-gradient(135deg,var(--dark,#0d1b3d),var(--accent,#2f66ff));color:#fff}',
    '.ow-collab-name{font-size:15px;font-weight:650;overflow-wrap:anywhere}',
    '.ow-collab-role{font-size:11.5px;color:rgba(230,241,255,.65)}',
    '.ow-collab-tags{display:flex;flex-wrap:wrap;gap:6px}',
    '.ow-collab-tag{font-size:10.5px;padding:3px 9px;border-radius:999px;background:rgba(47,102,255,.22);color:#dce8ff}',
    '.ow-collab-tag.ow-collab-login{background:rgba(22,163,74,.25);color:#d6ffe3}',
    '.ow-collab-stats{display:flex;gap:14px;font-size:11.5px;color:rgba(230,241,255,.75)}',
    '.ow-collab-stats b{color:#fff;font-size:14px}',
    '.ow-collab-contact{font-size:11.5px;color:rgba(230,241,255,.7);overflow-wrap:anywhere}',
    '.ow-collab-contact a{color:#9fc0ff}',
    '.ow-collab-actions{display:flex;gap:8px;flex-wrap:wrap}',
    '.ow-collab-overlay{position:fixed;inset:0;z-index:9998;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(3,10,24,.72)}',
    '.ow-collab-form{width:100%;max-width:460px;max-height:90vh;overflow:auto;display:grid;gap:12px;padding:22px;border-radius:16px;background:#0d1b3d;border:1px solid rgba(180,207,255,.23);color:#f2f6ff}',
    '.ow-collab-form h3{margin:0;font-size:17px}',
    '.ow-collab-form p{margin:0;font-size:12px;line-height:1.6;color:#bfd0ea}',
    '.ow-collab-form label{display:grid;gap:5px;font-size:11.5px;color:#bfd0ea}',
    '.ow-collab-form input,.ow-collab-form select{width:100%;box-sizing:border-box;min-height:40px;padding:9px 12px;border-radius:10px;border:1px solid rgba(180,207,255,.25);background:rgba(255,255,255,.06);color:#f2f6ff;font:inherit;font-size:13px}',
    '.ow-collab-form select option{background:#0d1b3d;color:#f2f6ff}',
    '.ow-collab-form .ow-collab-actions{justify-content:flex-end;margin-top:4px}'
  ].join('\n');

  function root() { return document.getElementById('collaboratorsContent'); }
  function list() { return Array.isArray(state.collaborators) ? state.collaborators : []; }
  function clean(v, max) { return String(v == null ? '' : v).trim().slice(0, max || 120); }
  function initials(name) { return clean(name).split(/\s+/).slice(0, 2).map(function (p) { return p.charAt(0).toUpperCase(); }).join('') || '?'; }
  function sameName(a, b) { return clean(a).toLocaleLowerCase('pt-BR') === clean(b).toLocaleLowerCase('pt-BR'); }

  function demandStats(name) {
    var month = typeof currentMonthKey === 'function' ? currentMonthKey() : '';
    var open = 0, monthCount = 0;
    (state.demands || []).forEach(function (d) {
      if (!d || d.assignee !== name) return;
      if (d.status !== 'green') open++;
      if (d.month === month) monthCount++;
    });
    return { open: open, month: monthCount };
  }

  function reassignDemands(from, to) {
    var moved = 0;
    [state.demands, state.deletedDemands].forEach(function (items) {
      (items || []).forEach(function (d) { if (d && d.assignee === from) { d.assignee = to; moved++; } });
    });
    return moved;
  }

  async function persist(message) {
    if (typeof syncCollaborators === 'function') syncCollaborators();
    var ok = await saveState({ strictRemote: true });
    if (!ok) toast('Não foi possível salvar no Supabase. Verifique a conexão e tente de novo.');
    else if (message) toast(message);
    renderAll();
    return ok;
  }

  function closeOverlay() { var o = document.getElementById('owCollabOverlay'); if (o) o.remove(); }
  function openOverlay(html, onSubmit) {
    closeOverlay();
    var overlay = document.createElement('div');
    overlay.className = 'ow-collab-overlay'; overlay.id = 'owCollabOverlay';
    overlay.innerHTML = '<form class="ow-collab-form" role="dialog" aria-modal="true">' + html + '</form>';
    overlay.addEventListener('click', function (e) { if (e.target === overlay) closeOverlay(); });
    var form = overlay.querySelector('form');
    form.querySelector('[data-cancel]').onclick = closeOverlay;
    form.onsubmit = async function (e) {
      e.preventDefault();
      var btn = form.querySelector('button[type="submit"]'); btn.disabled = true;
      try { if (await onSubmit(form) !== false) closeOverlay(); } finally { btn.disabled = false; }
    };
    document.body.appendChild(overlay);
    var first = form.querySelector('input,select'); if (first) first.focus();
    return form;
  }

  function options(map, selected) {
    return Object.keys(map).map(function (k) {
      return '<option value="' + esc(k) + '"' + (k === (selected || '') ? ' selected' : '') + '>' + esc(map[k]) + '</option>';
    }).join('');
  }

  function openEditor(id) {
    if (!isAdmin()) return;
    var current = list().find(function (c) { return c.id === id; }) || null;
    var c = current || { name: '', role: '', area: '', login: '', phone: '', email: '' };
    openOverlay(
      '<h3>' + (current ? 'Editar colaborador' : 'Novo colaborador') + '</h3>' +
      '<label>Nome<input name="name" required maxlength="60" value="' + esc(c.name) + '"></label>' +
      '<label>Função<input name="role" maxlength="80" placeholder="Ex.: Designer, Editor de vídeo" value="' + esc(c.role) + '"></label>' +
      '<label>Área principal<select name="area">' + options(AREA_LABELS, c.area) + '</select></label>' +
      '<label>Login vinculado<select name="login">' + options(LOGIN_LABELS, c.login) + '</select></label>' +
      '<p>O login vinculado mostra só as demandas desta pessoa (Design Login: artes; Vídeos Login: vídeos). Cada login fica com uma pessoa.</p>' +
      '<label>WhatsApp<input name="phone" maxlength="30" inputmode="tel" value="' + esc(c.phone) + '"></label>' +
      '<label>E-mail<input name="email" type="email" maxlength="120" value="' + esc(c.email) + '"></label>' +
      '<div class="ow-collab-actions"><button type="button" class="ghost small" data-cancel>Cancelar</button><button type="submit" class="primary small">Salvar</button></div>',
      async function (form) {
        var data = {
          name: clean(form.name.value, 60), role: clean(form.role.value, 80),
          area: AREA_LABELS.hasOwnProperty(form.area.value) ? form.area.value : '',
          login: LOGIN_LABELS.hasOwnProperty(form.login.value) ? form.login.value : '',
          phone: clean(form.phone.value, 30), email: clean(form.email.value, 120)
        };
        if (!data.name) { toast('Informe o nome.'); return false; }
        if (list().some(function (x) { return x.id !== id && sameName(x.name, data.name); })) {
          toast('Já existe um colaborador com esse nome.'); return false;
        }
        if (data.login) list().forEach(function (x) { if (x.id !== id && x.login === data.login) x.login = ''; });
        var moved = 0;
        if (current) {
          if (current.name !== data.name) moved = reassignDemands(current.name, data.name);
          Object.assign(current, data, { updatedAt: new Date().toISOString() });
        } else {
          list().push(Object.assign({ id: uid(), createdAt: new Date().toISOString() }, data));
        }
        await persist(current ? 'Colaborador atualizado' + (moved ? ' (' + moved + ' demanda(s) renomeadas).' : '.') : 'Colaborador adicionado.');
      });
  }

  function openRemove(id) {
    if (!isAdmin()) return;
    var c = list().find(function (x) { return x.id === id; }); if (!c) return;
    var total = (state.demands || []).filter(function (d) { return d && d.assignee === c.name; }).length;
    var others = list().filter(function (x) { return x.id !== id; });
    openOverlay(
      '<h3>Remover ' + esc(c.name) + '</h3>' +
      '<p>' + (total ? esc(c.name) + ' tem <b>' + total + '</b> demanda(s). Escolha para quem transferir:' : 'Nenhuma demanda está com essa pessoa.') + '</p>' +
      '<label>Transferir demandas para<select name="target">' +
      others.map(function (x) { return '<option value="' + esc(x.name) + '">' + esc(x.name) + '</option>'; }).join('') +
      '<option value="">Ninguém (ficam sem responsável)</option></select></label>' +
      (c.login ? '<p>' + esc(LOGIN_LABELS[c.login]) + ' ficará com quem receber as demandas, se essa pessoa ainda não tiver login.</p>' : '') +
      '<div class="ow-collab-actions"><button type="button" class="ghost small" data-cancel>Cancelar</button><button type="submit" class="primary small">Remover</button></div>',
      async function (form) {
        var target = form.target.value;
        var moved = reassignDemands(c.name, target);
        var heir = list().find(function (x) { return x.name === target; });
        if (c.login && heir && !heir.login) heir.login = c.login;
        state.collaborators = list().filter(function (x) { return x.id !== id; });
        await persist(c.name + ' removido' + (moved ? '; ' + moved + ' demanda(s) ' + (target ? 'transferidas para ' + target : 'sem responsável') : '') + '.');
      });
  }

  function render() {
    var el = root(); if (!el || !isAdmin()) return;
    if (!document.getElementById(STYLE_ID)) {
      var st = document.createElement('style'); st.id = STYLE_ID; st.textContent = CSS; document.head.appendChild(st);
    }
    var people = list().slice().sort(function (a, b) { return clean(a.name).localeCompare(clean(b.name), 'pt-BR'); });
    el.innerHTML =
      '<div class="ow-collab">' +
      '<div class="ow-collab-head"><p>' + people.length + ' colaborador(es). Os nomes aparecem como responsáveis nas demandas, agenda, calendário e roteiros.</p>' +
      '<button type="button" class="primary small" data-new>+ Novo colaborador</button></div>' +
      '<div class="ow-collab-grid">' + people.map(function (c) {
        var s = demandStats(c.name);
        var contact = [
          c.phone ? '<a href="https://wa.me/' + esc(String(c.phone).replace(/\D/g, '')) + '" target="_blank" rel="noopener">' + esc(c.phone) + '</a>' : '',
          c.email ? '<a href="mailto:' + esc(c.email) + '">' + esc(c.email) + '</a>' : ''
        ].filter(Boolean).join(' · ');
        return '<article class="ow-collab-card">' +
          '<div class="ow-collab-top"><div class="ow-collab-avatar">' + esc(initials(c.name)) + '</div><div>' +
          '<div class="ow-collab-name">' + esc(c.name) + '</div><div class="ow-collab-role">' + esc(c.role || 'Função não informada') + '</div></div></div>' +
          '<div class="ow-collab-tags"><span class="ow-collab-tag">' + esc(AREA_LABELS[c.area || ''] || 'Geral') + '</span>' +
          (c.login ? '<span class="ow-collab-tag ow-collab-login">' + esc(LOGIN_LABELS[c.login]) + '</span>' : '') + '</div>' +
          '<div class="ow-collab-stats"><span><b>' + s.open + '</b> em aberto</span><span><b>' + s.month + '</b> neste mês</span></div>' +
          (contact ? '<div class="ow-collab-contact">' + contact + '</div>' : '') +
          '<div class="ow-collab-actions"><button type="button" class="ghost small" data-edit="' + esc(c.id) + '">Editar</button>' +
          '<button type="button" class="ghost small" data-remove="' + esc(c.id) + '">Remover</button></div>' +
          '</article>';
      }).join('') + '</div></div>';
    el.querySelector('[data-new]').onclick = function () { openEditor(null); };
    el.querySelectorAll('[data-edit]').forEach(function (b) { b.onclick = function () { openEditor(b.dataset.edit); }; });
    el.querySelectorAll('[data-remove]').forEach(function (b) { b.onclick = function () { openRemove(b.dataset.remove); }; });
  }

  window.owCollaborators = { render: render, reassignDemands: reassignDemands };
})();
