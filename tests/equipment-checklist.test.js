const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('modules/equipment-checklist.js', 'utf8');

function fixture() {
  const listeners = {};
  const form = {addEventListener(event, callback) {listeners[event] = callback;}};
  const eventId = {value:'existing'};
  const eventType = {value:'Gravação', addEventListener() {}};
  const count = {textContent:''};
  const details = {open:false};
  const inputs = [
    {value:'sony-a6700',checked:false,addEventListener() {}},
    {value:'godox-nova-1',checked:false,addEventListener() {}},
    {value:'godox-nova-2',checked:false,addEventListener() {}}
  ];
  const panel = {
    innerHTML:'',id:'',className:'',
    querySelectorAll(selector) {return selector === 'input[data-ow-equip]' ? inputs : []; }
  };
  const description = {closest() {return {insertAdjacentElement(_where,element) {
    assert.equal(element,panel);
  }};}};
  const elements = {
    wkEventForm:form,weekEventModal:{classList:{contains(){return true;}}},
    wkEventDescription:description,wkEventId:eventId,
    wkEventType:eventType,owEquipDetails:details,owEquipCount:count
  };
  const document = {
    head:{appendChild() {}},
    getElementById(id) {return elements[id] || null;},
    createElement(tag) {return tag === 'section' ? panel : {id:'',textContent:''};}
  };
  const state = {calendarEvents:[{id:'existing',equipmentChecklist:['sony-a6700']}]};
  let saved = 0;
  const context = {
    window:{},document,state,
    isAdmin:()=>true,
    saveCalendarAdminState:async()=>{saved++;return true;},
    MutationObserver:class {observe() {}},
    queueMicrotask
  };
  vm.runInNewContext(source,context);
  return {context,state,listeners,eventId,inputs,details,saved:()=>saved};
}

test('script is valid, catalog uses unique IDs and keeps both new Godox lights separately',()=>{
  new vm.Script(source);
  const {context}=fixture();
  const groups=context.window.OWEquipmentChecklist.groups;
  const all=groups.flatMap(group=>group.items);
  assert.equal(groups.length,6);
  assert.ok(all.length>=35);
  assert.equal(new Set(all.map(item=>item[0])).size,all.length);
  assert.ok(all.some(item=>item[0]==='godox-nova-1'));
  assert.ok(all.some(item=>item[0]==='godox-nova-2'));
  assert.equal(JSON.stringify(context.window.OWEquipmentChecklist.selectedIds(['sony-a6700','sony-a6700','invalid'])),JSON.stringify(['sony-a6700']));
});

test('editing a commitment syncs its checked equipment in the existing calendar record',async()=>{
  const f=fixture();
  const api=f.context.window.OWEquipmentChecklist;
  api.hydrate();
  assert.equal(f.inputs[0].checked,true);
  assert.equal(f.details.open,true);
  f.inputs[1].checked=true;
  f.listeners.submit();
  assert.equal(await f.context.saveCalendarAdminState(),true);
  assert.equal(f.saved(),1);
  assert.equal(JSON.stringify(f.state.calendarEvents[0].equipmentChecklist),JSON.stringify(['sony-a6700','godox-nova-1']));
  await f.context.saveCalendarAdminState();
  assert.equal(JSON.stringify(f.state.calendarEvents[0].equipmentChecklist),JSON.stringify(['sony-a6700','godox-nova-1']));
});

test('new commitment stores chosen equipment without changing previous appointments',async()=>{
  const f=fixture();
  f.eventId.value='';
  f.inputs[2].checked=true;
  f.state.calendarEvents.push({id:'new'});
  f.listeners.submit();
  await f.context.saveCalendarAdminState();
  assert.equal(JSON.stringify(f.state.calendarEvents[1].equipmentChecklist),JSON.stringify(['godox-nova-2']));
  assert.equal(JSON.stringify(f.state.calendarEvents[0].equipmentChecklist),JSON.stringify(['sony-a6700']));
});
