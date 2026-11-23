const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync('index.html', 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));

function extract(name) {
  const begin = html.indexOf(`function ${name}(`);
  assert.ok(begin >= 0, `${name} não encontrado`);
  const end = html.indexOf('\n', begin);
  return html.slice(begin, end);
}

test('normalizeState e seed preservam a rotina de contato', () => {
  const context = {};
  vm.createContext(context);
  vm.runInContext(extract('seed') + '\n' + extract('normalizeState'), context);
  assert.deepEqual(JSON.parse(JSON.stringify(context.seed().contactRoutine)), {});
  const saved = {responsible: 'Gabriel', clients: {boreal: {priority: 'alta'}}, weeks: {'2026-11-23': {entries: {'boreal|seg': {done: true}}}}};
  const normalized = context.normalizeState({clients: [], contactRoutine: saved});
  assert.deepEqual(JSON.parse(JSON.stringify(normalized.contactRoutine)), saved);
  assert.deepEqual(JSON.parse(JSON.stringify(context.normalizeState({contactRoutine: []}).contactRoutine)), {});
});

function load(todayISO) {
  const src = fs.readFileSync('modules/contact-routine.js', 'utf8');
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const addDays = (s, n) => { const d = new Date(`${s}T12:00:00`); d.setDate(d.getDate() + n); return iso(d); };
  const context = {
    state: {clients: [], contactRoutine: {}},
    window: {},
    document: {readyState: 'complete', getElementById: () => null, activeElement: null},
    isAdmin: () => true,
    currentUser: 'Administrador',
    calendarLocalISO: () => todayISO,
    calendarAddDays: addDays,
    calendarMonday: s => { const d = new Date(`${s}T12:00:00`); return addDays(s, -((d.getDay() + 6) % 7)); },
    cmSelectableRecords: () => [{name: 'Cuiabá Leilões'}, {name: 'EAG'}, {name: 'Boreal'}],
    cmSelectionKey: n => String(n).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, ''),
    setInterval: () => 0,
    Intl, Date, Math, JSON, Object, Array, String, Number, Set, Map
  };
  vm.createContext(context);
  vm.runInContext(src, context);
  return {api: context.window.owContactRoutine._test, context};
}

test('segunda tem todos os clientes e os outros dias seguem a prioridade', () => {
  const {api} = load('2026-11-23');
  const list = api.contacts('2026-11-23');
  assert.deepEqual(plain(list.filter(c => c.day === 'seg').map(c => c.key).sort()), ['boreal', 'cuiabaleiloes', 'eag']);
  assert.deepEqual(plain(list.filter(c => c.key === 'cuiabaleiloes').map(c => c.day)), ['seg', 'ter', 'qua', 'qui', 'sex']);
  assert.deepEqual(plain(list.filter(c => c.key === 'eag').map(c => c.day)), ['seg', 'sex']);
  assert.deepEqual(plain(list.filter(c => c.key === 'boreal').map(c => c.day)), ['seg', 'ter', 'qui', 'sex']);
});

test('a própria agência fica fora e entra/sai da rotina com um clique', () => {
  const {api, context} = load('2026-11-23');
  context.cmSelectableRecords = () => [{name: 'One Way Agency'}, {name: 'Boreal'}];
  assert.deepEqual(plain(api.activeClients().map(c => c.key)), ['boreal']);
  context.state.contactRoutine = {clients: {onewayagency: {active: true}, boreal: {active: false}}};
  assert.deepEqual(plain(api.activeClients().map(c => c.key)), ['onewayagency']);
});

test('alerta: vermelho com o dia incompleto, piscando quando um dia passa sem 100%', () => {
  const full = {checks: {sent: true, replied: true, noted: true}};
  let {api, context} = load('2026-11-23');
  assert.equal(api.alertInfo('2026-11-23').level, 'red');
  context.state.contactRoutine = {weeks: {'2026-11-23': {entries: {'boreal|seg': full, 'eag|seg': full, 'cuiabaleiloes|seg': full}}}};
  assert.equal(api.alertInfo('2026-11-23').level, 'ok');
  context.state.contactRoutine.weeks['2026-11-23'].entries['eag|seg'] = {checks: {sent: true, replied: true}};
  assert.equal(api.alertInfo('2026-11-23').level, 'red');
  ({api, context} = load('2026-11-24'));
  context.state.contactRoutine = {weeks: {'2026-11-23': {entries: {'boreal|seg': full, 'eag|seg': {checks: {sent: true}}, 'cuiabaleiloes|seg': full}}}};
  const info = api.alertInfo('2026-11-23');
  assert.equal(info.level, 'blink');
  assert.equal(info.late, 1);
});

test('contato remanejado muda de dia e notas ficam no mês do cliente', () => {
  const {api, context} = load('2026-11-23');
  context.state.contactRoutine = {
    clients: {boreal: {priority: 'leve'}},
    weeks: {'2026-11-23': {entries: {'boreal|ter': {day: 'qua', checks: {sent: true}}}}},
    notes: {'2026-11': {boreal: [{id: 'n1', text: 'Pediu orçamento'}]}}
  };
  const boreal = api.contacts('2026-11-23').filter(c => c.key === 'boreal');
  assert.deepEqual(plain(boreal.map(c => c.day).sort()), ['qua', 'seg', 'sex']);
  assert.equal(api.notes('2026-11', 'boreal')[0].text, 'Pediu orçamento');
  assert.equal(api.notes('2026-12', 'boreal').length, 0);
});
