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
test('Vídeos Login sees only Tiago videos',()=>{
 const role=asRole('video');
 assert.equal(ids(fixtures.filter(role.isDemandVisible)),'v-tiago');
 assert.equal(role.canAccessDemand(fixtures[5]),false);
 assert.equal(role.canAccessDemand(fixtures[0]),false);
});
test('administrator sees all demands by default and can select others or an individual',()=>{
 const role=asRole('admin');
 assert.equal(fixtures.filter(role.isDemandVisible).length,fixtures.length);
 role.setFilter('others');assert.equal(ids(fixtures.filter(role.isDemandVisible)),'a-gabriel,a-lucas,a-old-unassigned,v-fernando,v-old-unassigned');
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

test('Agenda filters each responsible independently from the area filter',()=>{
 const api=vm.runInNewContext(functions+';({matchesAgendaAssignee,setAgenda(x){agendaAssigneeFilter=x},setArea(x){adminAssigneeFilter=x}})',{
  isAdmin:()=>true,isDesign:()=>false,isVideoUser:()=>false,canAccessArea:()=>true,
  document:{getElementById:()=>null},esc:x=>x
 });
 assert.equal(fixtures.filter(api.matchesAgendaAssignee).length,fixtures.length);
 for(const person of ['Gabriel','João','Tiago','Fernando','Lucas']){
  api.setAgenda(person);
  assert.equal(ids(fixtures.filter(api.matchesAgendaAssignee)),ids(fixtures.filter(d=>d.assignee===person)));
 }
 api.setAgenda('unassigned');assert.equal(ids(fixtures.filter(api.matchesAgendaAssignee)),'a-old-unassigned,v-old-unassigned');
 api.setArea('João');api.setAgenda('all');
 assert.equal(fixtures.filter(api.matchesAgendaAssignee).length,fixtures.length);
});
test('Agenda filter cannot widen editor permissions',()=>{
 for(const role of ['design','video']){
  const api=vm.runInNewContext(functions+';agendaAssigneeFilter="Gabriel";({matchesAgendaAssignee})',{
   isAdmin:()=>false,isDesign:()=>role==='design',isVideoUser:()=>role==='video',
   canAccessArea:area=>area===(role==='design'?'arte':'video'),document:{getElementById:()=>null},esc:x=>x
  });
  assert.equal(ids(fixtures.filter(api.matchesAgendaAssignee)),role==='design'?'a-joao':'v-tiago');
 }
});

test('Pedro saiu da equipe e o Vídeos Login segue o colaborador vinculado',()=>{
 assert.ok(!/'Pedro'/.test(functions.split('function ensureCollaborators')[0]),'Pedro não está na lista padrão');
 const ctx={isAdmin:()=>false,isDesign:()=>false,isVideoUser:()=>true,canAccessArea:a=>a==='video',document:{getElementById:()=>null},esc:x=>x,
  state:{collaborators:[{id:'1',name:'Tiago',login:''},{id:'2',name:'Fernando',login:'video'}],demands:[]}};
 const api=vm.runInNewContext(functions+';({canAccessDemand,syncCollaborators})',ctx);
 api.syncCollaborators();
 assert.equal(api.canAccessDemand({area:'video',assignee:'Fernando'}),true);
 assert.equal(api.canAccessDemand({area:'video',assignee:'Tiago'}),false);
 ctx.state.collaborators[1].login='';
 assert.equal(api.canAccessDemand({area:'video',assignee:''}),false,'sem login vinculado, nada de demandas sem responsável');
});
test('primeira carga cria colaboradores e transfere as demandas do Pedro para o Tiago',()=>{
 const ctx={document:{getElementById:()=>null},esc:x=>x,
  state:{demands:[{id:'a',assignee:'Pedro'},{id:'b',assignee:'João'}],deletedDemands:[{id:'c',assignee:'Pedro'}]}};
 const api=vm.runInNewContext(functions+';({ensureCollaborators,syncCollaborators,DEMAND_ASSIGNEES})',ctx);
 assert.equal(api.ensureCollaborators(),true);
 assert.deepEqual(ctx.state.demands.map(d=>d.assignee),['Tiago','João']);
 assert.equal(ctx.state.deletedDemands[0].assignee,'Tiago');
 assert.equal(ctx.state.collaborators.find(c=>c.login==='video').name,'Tiago');
 assert.equal(api.ensureCollaborators(),false,'roda uma única vez');
 assert.equal(api.syncCollaborators().join(','),'Gabriel,João,Tiago,Fernando,Lucas');
});
