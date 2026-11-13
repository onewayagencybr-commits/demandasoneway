/* Backup One Way: botão exclusivo do administrador para baixar todos os dados
   do Supabase em um arquivo .json e restaurar versões salvas automaticamente
   em public.app_state_history (ver supabase/migrations/20261113_app_state_backup_and_security.sql). */
(function () {
  'use strict';
  if (window.OWDataBackup) return;

  var STYLE_ID = 'ow-backup-style';
  var CSS = [
    '.ow-backup-overlay{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(3,10,24,.72)}',
    '.ow-backup-box{width:100%;max-width:560px;max-height:86vh;overflow:auto;padding:22px;border-radius:16px;background:#0d1b3d;border:1px solid rgba(180,207,255,.23);color:#f2f6ff;font-family:Montserrat,Arial,sans-serif}',
    '.ow-backup-box h3{margin:0 0 6px;font-size:17px}',
    '.ow-backup-box p{margin:0 0 14px;font-size:12px;line-height:1.6;color:#bfd0ea}',
    '.ow-backup-actions{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:18px}',
    '.ow-backup-list{display:flex;flex-direction:column;gap:8px}',
    '.ow-backup-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;border-radius:10px;background:rgba(24,55,110,.35);font-size:12px}',
    '.ow-backup-row span{color:#bfd0ea}',
    '.ow-backup-status{font-size:12px;color:#bfd0ea;margin:6px 0 12px}'
  ].join('\n');

  var LABELS = {
    main: 'Painel (clientes e demandas)',
    'finance-secure-v1': 'Financeiro (criptografado)',
    'contracts-secure-v1': 'Contratos (criptografado)'
  };
  var REASONS = { auto: 'automático', initial: 'cópia inicial', 'before-restore': 'antes de restaurar', delete: 'antes de excluir' };

  function client() { return typeof supabaseClient !== 'undefined' ? supabaseClient : null; }
  function adminOk() {
    try { return typeof isAdmin === 'function' && isAdmin() && typeof adminAuthReady === 'function' && adminAuthReady(); }
    catch (e) { return false; }
  }
  function notify(msg) { try { if (typeof toast === 'function') toast(msg); else window.alert(msg); } catch (e) {} }
  function pad(n) { return String(n).padStart(2, '0'); }
  function stamp(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + '_' + pad(d.getHours()) + 'h' + pad(d.getMinutes()); }
  function fmt(iso) { try { return new Date(iso).toLocaleString('pt-BR'); } catch (e) { return String(iso); } }
  function el(tag, attrs, text) {
    var x = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { if (k === 'className') x.className = attrs[k]; else x.setAttribute(k, attrs[k]); });
    if (text != null) x.textContent = text;
    return x;
  }

  async function collectBackup() {
    var db = client();
    var out = { app: 'oneway-demandas', format: 1, exportedAt: new Date().toISOString(), tables: {}, errors: [] };
    try { if (typeof supabaseAdminEmail !== 'undefined' && supabaseAdminEmail) out.exportedBy = supabaseAdminEmail; } catch (e) {}
    if (db) {
      for (var t of [['app_state', 'id,data,updated_at'], ['video_scripts', '*']]) {
        try {
          var res = await db.from(t[0]).select(t[1]);
          if (res.error) throw res.error;
          out.tables[t[0]] = res.data || [];
        } catch (e) { out.errors.push(t[0] + ': ' + (e && e.message || e)); }
      }
    }
    var hasMain = (out.tables.app_state || []).some(function (r) { return r.id === 'main'; });
    if (!hasMain) {
      try {
        if (typeof state !== 'undefined' && state) {
          out.localStateFallback = typeof sharedStateSnapshot === 'function' ? sharedStateSnapshot(state) : JSON.parse(JSON.stringify(state));
        }
      } catch (e) { out.errors.push('estado local: ' + (e && e.message || e)); }
    }
    return out;
  }

  function download(name, text) {
    var blob = new Blob([text], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = el('a', { href: url, download: name });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  async function downloadBackup(btn) {
    if (!adminOk()) { notify('Entre como administrador para baixar o backup.'); return; }
    if (btn) { btn.disabled = true; btn.textContent = 'Gerando backup…'; }
    try {
      var data = await collectBackup();
      download('backup-oneway_' + stamp(new Date()) + '.json', JSON.stringify(data, null, 2));
      notify(data.errors.length ? 'Backup baixado, com avisos: ' + data.errors.join(' | ') : 'Backup baixado com sucesso.');
    } catch (e) {
      console.error('Falha no backup:', e); notify('Não foi possível gerar o backup.');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Baixar backup agora'; }
    }
  }

  async function loadHistory() {
    var db = client(); if (!db) throw new Error('Supabase indisponível.');
    var res = await db.from('app_state_history').select('history_id,state_id,reason,saved_at')
      .order('saved_at', { ascending: false }).limit(40);
    if (res.error) throw res.error;
    return res.data || [];
  }

  async function restore(row, button) {
    var label = LABELS[row.state_id] || row.state_id;
    if (!window.confirm('Restaurar "' + label + '" para a versão de ' + fmt(row.saved_at) + '?\n\nA versão atual será guardada no histórico antes, então dá para desfazer.')) return;
    button.disabled = true; button.textContent = 'Restaurando…';
    try {
      var res = await client().rpc('restore_app_state', { p_history_id: row.history_id });
      if (res.error) throw res.error;
      notify('Versão restaurada. Recarregando o painel…');
      setTimeout(function () { window.location.reload(); }, 900);
    } catch (e) {
      console.error('Falha ao restaurar:', e);
      notify('Não foi possível restaurar: ' + (e && e.message || e));
      button.disabled = false; button.textContent = 'Restaurar';
    }
  }

  function closeModal() { var o = document.getElementById('owBackupOverlay'); if (o) o.remove(); }

  async function openModal() {
    if (!adminOk()) { notify('Entre como administrador para acessar o backup.'); return; }
    closeModal();
    var overlay = el('div', { className: 'ow-backup-overlay', id: 'owBackupOverlay' });
    var box = el('div', { className: 'ow-backup-box', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Backup dos dados' });
    box.appendChild(el('h3', {}, 'Backup dos dados'));
    box.appendChild(el('p', {}, 'Baixe uma cópia completa (clientes, demandas, agenda, roteiros, financeiro e contratos — estes dois continuam criptografados). Guarde o arquivo no Google Drive ou no computador.'));
    var actions = el('div', { className: 'ow-backup-actions' });
    var dl = el('button', { type: 'button', className: 'ghost small' }, 'Baixar backup agora');
    dl.onclick = function () { downloadBackup(dl); };
    var close = el('button', { type: 'button', className: 'ghost small' }, 'Fechar');
    close.onclick = closeModal;
    actions.appendChild(dl); actions.appendChild(close);
    box.appendChild(actions);
    box.appendChild(el('h3', {}, 'Versões salvas automaticamente'));
    var status = el('div', { className: 'ow-backup-status' }, 'Carregando histórico…');
    var list = el('div', { className: 'ow-backup-list' });
    box.appendChild(status); box.appendChild(list);
    overlay.appendChild(box);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) closeModal(); });
    document.body.appendChild(overlay);

    try {
      var rows = await loadHistory();
      status.textContent = rows.length ? 'O sistema guarda uma versão a cada 30 min de uso (últimos 2 dias) e uma por dia até 45 dias.' : 'Nenhuma versão salva ainda.';
      rows.forEach(function (row) {
        var line = el('div', { className: 'ow-backup-row' });
        var info = el('div');
        info.appendChild(el('strong', {}, fmt(row.saved_at)));
        info.appendChild(el('br'));
        info.appendChild(el('span', {}, (LABELS[row.state_id] || row.state_id) + ' · ' + (REASONS[row.reason] || row.reason)));
        var b = el('button', { type: 'button', className: 'ghost small' }, 'Restaurar');
        b.onclick = function () { restore(row, b); };
        line.appendChild(info); line.appendChild(b);
        list.appendChild(line);
      });
    } catch (e) {
      console.error('Histórico de backup indisponível:', e);
      status.textContent = 'Histórico automático ainda não ativado no Supabase. O botão "Baixar backup agora" funciona normalmente.';
    }
  }

  function ensureButton() {
    var btn = document.getElementById('dataBackupBtn');
    if (!btn) {
      var logout = document.getElementById('logoutBtn');
      if (!logout || !logout.parentNode) return null;
      btn = el('button', { type: 'button', className: 'ghost small hidden', id: 'dataBackupBtn', title: 'Backup e restauração dos dados' }, 'Backup');
      btn.onclick = openModal;
      logout.parentNode.insertBefore(btn, logout);
    }
    btn.classList[adminOk() ? 'remove' : 'add']('hidden');
    return btn;
  }

  function init() {
    if (!document.getElementById(STYLE_ID)) {
      var st = el('style', { id: STYLE_ID }); st.textContent = CSS; document.head.appendChild(st);
    }
    ensureButton();
    setInterval(ensureButton, 1500);
  }

  window.OWDataBackup = { collectBackup: collectBackup, openModal: openModal, ensureButton: ensureButton };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
