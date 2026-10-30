const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

// Executa o handler real do formulário para garantir que a lista
// já integra o snapshot enviado ao Supabase (sem depender de outro listener).
const html = fs.readFileSync('index.html', 'utf8');
const begin = html.indexOf('async function submitWeekEvent(evt){');
const end = html.indexOf('async function deleteWeekEvent(){', begin);
assert.ok(begin > 0 && end > begin, 'handler de compromisso não encontrado');
const handler = html.slice(begin, end);

function fixture({id = '', events = [], selected = [], saveSuccess = true, equipmentAvailable = true} = {}) {
  let remoteSnapshot = null;
  const fields = {
    wkEventId: id,
    wkEventTitle: 'Gravação de teste',
    wkEventDate: '2026-11-03',
    wkEventTime: '09:00',
    wkEventType: 'Gravação',
    wkEventClient: '',
    wkEventDescription: 'Compromisso teste'
  };
  const context = {
    state: {calendarEvents: structuredClone(events)},
    window: equipmentAvailable ? {
      OWEquipmentChecklist: {
        selected: () => selected,
        selectedIds: values => [...new Set(values)]
      }
    } : {},
    document: {getElementById: key => ({value: fields[key]})},
    isAdmin: () => true,
    uid: () => 'new-event',
    toast: () => {},
    saveCalendarAdminState: async () => {
      remoteSnapshot = structuredClone(context.state.calendarEvents);
      return saveSuccess;
    },
    writeLocalCache: () => {},
    calendarWeekStart: '2026-11-02',
    calendarMonday: date => date,
    closeModal: () => {},
    renderWeekCalendar: () => {}
  };
  vm.createContext(context);
  vm.runInContext(handler, context);
  return {
    context,
    save: async () => context.submitWeekEvent({preventDefault() {}}),
    remote: () => remoteSnapshot
  };
}

test('novo compromisso inclui equipamentos no registro enviado ao banco', async () => {
  const f = fixture({selected: ['sony-a6700', 'ronin-rs3']});
  await f.save();
  assert.deepEqual(f.remote()[0].equipmentChecklist, ['sony-a6700', 'ronin-rs3']);
  assert.deepEqual(f.context.state.calendarEvents[0].equipmentChecklist, ['sony-a6700', 'ronin-rs3']);
});

test('edição salva checklist por evento sem mexer em outros compromissos', async () => {
  const f = fixture({
    id: 'edit',
    events: [
      {id: 'other', equipmentChecklist: ['godox-1']},
      {id: 'edit', equipmentChecklist: ['sony-a6700']}
    ],
    selected: ['red-24-70', 'godox-nova-2']
  });
  await f.save();
  assert.deepEqual(f.remote()[0].equipmentChecklist, ['godox-1']);
  assert.deepEqual(f.remote()[1].equipmentChecklist, ['red-24-70', 'godox-nova-2']);
  // Reabertura a partir da persistência remota deve encontrar a mesma lista.
  const reopened = structuredClone(f.remote()[1]);
  assert.deepEqual(reopened.equipmentChecklist, ['red-24-70', 'godox-nova-2']);
});

test('limpar itens salva lista vazia e falha remota reverte alteração', async () => {
  const previous = [{id: 'edit', equipmentChecklist: ['sony-a6700']}];
  const clearing = fixture({id: 'edit', events: previous, selected: []});
  await clearing.save();
  assert.deepEqual(clearing.remote()[0].equipmentChecklist, []);
  const failure = fixture({id: 'edit', events: previous, selected: ['drone-fpv'], saveSuccess: false});
  await failure.save();
  assert.deepEqual(failure.context.state.calendarEvents[0].equipmentChecklist, ['sony-a6700']);
});

test('sem módulo carregado mantém o checklist do compromisso existente', async () => {
  const f = fixture({
    id: 'edit',
    events: [{id: 'edit', equipmentChecklist: ['sony-a6700']}],
    equipmentAvailable: false
  });
  await f.save();
  assert.deepEqual(f.remote()[0].equipmentChecklist, ['sony-a6700']);
});
