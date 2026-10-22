const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');

const html=fs.readFileSync('index.html','utf8');
const calendar=fs.readFileSync('modules/editor-calendar.js','utf8');
const start=html.indexOf("const DEMAND_ASSIGNEES=");
const end=html.indexOf("function safeUrl",start);
assert.ok(start>0&&end>start,'Responsibility logic must exist in index.html');
const functions=html.slice(start,end);
const fixtures=[
 {area:'arte',assignee:'João',id:'a-joao'},
 {area:'arte',assignee:'Gabriel',id:'a-gabriel'},
 {area:'arte',assignee:'Lucas',id:'a-lucas'},
 {area:'arte',id:'a-old-unassigned'},
 {area:'video',assignee:'Pedro',id:'v-pedro'},
 {area:'video',assignee:'Tiago',id:'v-tiago'},
 {area:'video',assignee:'Fernando',id:'v-fernando'},
 {area:'video',id:'v-old-unassigned'},
 {area:'trafego',assignee:'João',id:'t-joao'}
];
function asRole(role){
 return vm.runInNewContext(functions+';({isDemandVisible,canAccessDemand,demandAssignee,setFilter(x){adminAssigneeFilter=x}})',{
  isAdmin:()=>role==='admin',
  isDesign:()=>role==='design',
  isVideoUser:()=>role==='video',
  canAccessArea:area=>role==='design'?area==='arte':role==='video'?area==='video':true,
  document:{getElementById:()=>null},esc:x=>x
 });
}
const ids=items=>Array.from(items,x=>x.id).join(',');
test('Design Login sees only João arts',()=>{
 const role=asRole('design');
 assert.equal(ids(fixtures.filter(role.isDemandVisible)),'a-joao');
 assert.equal(role.canAccessDemand(fixtures[1]),false);
 assert.equal(role.canAccessDemand(fixtures[4]),false);
});
test('Vídeos Login sees only Pedro videos',()=>{
 const role=asRole('video');
 assert.equal(ids(fixtures.filter(role.isDemandVisible)),'v-pedro');
 assert.equal(role.canAccessDemand(fixtures[5]),false);
 assert.equal(role.canAccessDemand(fixtures[0]),false);
});
test('administrator sees others by default but can select all or an individual',()=>{
 const role=asRole('admin');
 assert.equal(ids(fixtures.filter(role.isDemandVisible)),'a-gabriel,a-lucas,a-old-unassigned,v-tiago,v-fernando,v-old-unassigned');
 role.setFilter('all');assert.equal(fixtures.filter(role.isDemandVisible).length,fixtures.length);
 role.setFilter('João');assert.equal(ids(fixtures.filter(role.isDemandVisible)),'a-joao,t-joao');
 role.setFilter('unassigned');assert.equal(ids(fixtures.filter(role.isDemandVisible)),'a-old-unassigned,v-old-unassigned');
});
test('Visitante visibility remains unchanged',()=>{
 const role=asRole('visitor');
 assert.equal(fixtures.filter(role.isDemandVisible).length,fixtures.length);
});
test('editor calendar, agenda, status and final-material updates check attribution',()=>{
 assert.match(calendar,/canAccessDemand\(d\)/);
 assert.match(html,/const base=state\.demands\.filter\(d=>\(!filterArea\|\|d\.area===filterArea\)&&canAccessDemand\(d\)\)/);
 assert.match(html,/async function updateStatus\(id,status\)\{const d=state\.demands\.find\(x=>x\.id===id\);if\(!canAccessDemand\(d\)/);
 assert.match(html,/function canEditFinalMaterial\(d\).*canAccessDemand\(d\)/);
});
test('assignment field is editable and persisted on new and existing demands',()=>{
 assert.match(html,/id="formAssignee"/);
 assert.match(html,/formAssignee'\)\.value=demandAssignee\(d\)/);
 assert.match(html,/const id=document\.getElementById\('editDemandId'\).*assignee=document\.getElementById\('formAssignee'\)/);
 assert.match(html,/Object\.assign\(d,\{clientId:targetClientId.*description,assignee,status/);
 assert.match(html,/createdDate:demandCreationCalendarDate\(\)/);
 assert.match(html,/description,assignee,status:statusesForArea/);
 assert.match(html,/isDemandVisible\(d\)/);
});
