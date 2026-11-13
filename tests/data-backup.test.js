const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('modules/data-backup.js', 'utf8');

function fixture({ admin = true, authed = true, tables = {}, failing = [] } = {}) {
  function element(tag) {
    const classes = new Set();
    return {
      tag, children: [], attrs: {}, textContent: '', disabled: false,
      classList: { add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c) },
      set className(v) { classes.clear(); String(v).split(/\s+/).filter(Boolean).forEach(c => classes.add(c)); },
      setAttribute(k, v) { this.attrs[k] = v; if (k === 'id') this.id = v; },
      appendChild(x) { this.children.push(x); x.parentNode = this; return x; },
      insertBefore(x) { this.children.push(x); x.parentNode = this; return x; },
      addEventListener() {}, click() {}, remove() {}
    };
  }
  const actions = element('div');
  const logout = element('button'); logout.id = 'logoutBtn'; actions.appendChild(logout);
  const byId = { logoutBtn: logout };
  const document = {
    readyState: 'complete',
    head: element('head'), body: element('body'),
    createElement: tag => element(tag),
    getElementById: id => byId[id] || actions.children.find(c => c.id === id) || null,
    addEventListener() {}
  };
  const supabaseClient = {
    from(name) {
      return {
        select: async () => failing.includes(name)
          ? { data: null, error: { message: 'negado' } }
          : { data: tables[name] || [], error: null }
      };
    }
  };
  const context = {
    window: {}, document, console, setInterval() {}, setTimeout() {}, JSON, Date, Blob: class {}, URL: {},
    supabaseClient, supabaseAdminEmail: 'admin@exemplo.com',
    state: { clients: [{ id: 'c1' }], demands: [], financeItems: [{ secret: 1 }] },
    sharedStateSnapshot: s => { const c = JSON.parse(JSON.stringify(s)); delete c.financeItems; return c; },
    isAdmin: () => admin, adminAuthReady: () => authed, toast() {}
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  return { api: context.window.OWDataBackup, actions };
}

test('botão de backup aparece só para administrador autenticado', () => {
  const visible = fixture();
  const btn = visible.actions.children.find(c => c.id === 'dataBackupBtn');
  assert.ok(btn, 'botão inserido ao lado de "Sair"');
  assert.equal(btn.classList.contains('hidden'), false);

  for (const opts of [{ admin: false }, { authed: false }]) {
    const hidden = fixture(opts).actions.children.find(c => c.id === 'dataBackupBtn');
    assert.equal(hidden.classList.contains('hidden'), true);
  }
});

test('backup inclui todas as linhas do app_state e roteiros', async () => {
  const rows = [
    { id: 'main', data: { clients: [{ id: 'c1' }] }, updated_at: '2026-11-13T10:00:00Z' },
    { id: 'finance-secure-v1', data: { cipher: 'x', iv: 'y' }, updated_at: '2026-11-13T10:00:00Z' }
  ];
  const { api } = fixture({ tables: { app_state: rows, video_scripts: [{ id: 's1' }] } });
  const out = await api.collectBackup();
  assert.equal(out.app, 'oneway-demandas');
  assert.deepEqual(out.tables.app_state.map(r => r.id), ['main', 'finance-secure-v1']);
  assert.equal(out.tables.video_scripts.length, 1);
  assert.equal(out.errors.length, 0);
  assert.equal(out.localStateFallback, undefined);
  assert.equal(out.exportedBy, 'admin@exemplo.com');
});

test('se o Supabase falhar, usa o estado local sem dados financeiros abertos', async () => {
  const { api } = fixture({ failing: ['app_state', 'video_scripts'] });
  const out = await api.collectBackup();
  assert.equal(out.errors.length, 2);
  assert.deepEqual(out.localStateFallback.clients, [{ id: 'c1' }]);
  assert.equal(out.localStateFallback.financeItems, undefined);
});
