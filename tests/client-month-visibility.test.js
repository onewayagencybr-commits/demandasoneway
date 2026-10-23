const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const html=fs.readFileSync('index.html','utf8');
function setup(role='admin'){
 const state={clients:[{id:'oro',name:'ORO Casa',area:'arte',type:'fixed',startMonth:'2026-10'}],demands:[3,5,9].map(day=>({clientId:'oro',area:'arte',month:'2026-11',postDate:`2026-11-${String(day).padStart(2,'0')}`,assignee:'João'})),archivedClientKeys:[],removedClientMonths:[]};
 const context={state,currentMonth:'2026-11',currentArea:'arte',isAdmin:()=>role==='admin',isDesign:()=>role==='design',isVideoUser:()=>role==='video',canAccessArea:a=>role==='video'?a==='video':a==='arte',cmKey:s=>s.toLowerCase(),allowedAreaKeys:()=>['arte'],openClientId:'oro',lastAddedClientId:null,AREAS:{arte:'Arte'},esc:s=>s,renderDemand:()=>'<div>demanda</div>'};
 vm.createContext(context);
 vm.runInContext(html.slice(html.indexOf('const DEMAND_ASSIGNEES='),html.indexOf('function safeUrl'))+html.slice(html.indexOf('function clientVisibleInMonth'),html.indexOf('function toast('))+html.slice(html.indexOf('let clientDemandFilterKey='),html.indexOf('function canEditFinalMaterial')),context);
 return {state,run:s=>vm.runInContext(s,context)};
}
test('Orocasa stays visible in November with three João arts hidden by admin default',()=>{
 const {run}=setup();assert.equal(run('clientsForMonth().length'),1);assert.equal(run('demandsFor("oro").length'),0);
 const card=run('renderClient(state.clients[0])');assert.match(card,/3 demandas estão ocultas pelo filtro/);assert.match(card,/show-all-assignees/);
 run("adminAssigneeFilter='all'");assert.equal(run('demandsFor("oro").length'),3);assert.doesNotMatch(run('renderClient(state.clients[0])'),/show-all-assignees/);
});
test('explicit responsible filter still narrows clients',()=>{const {run}=setup();run("adminAssigneeFilter='Gabriel'");assert.equal(run('clientsForMonth().length'),0)});
test('editors retain assignment and area restrictions',()=>{
 assert.equal(setup('design').run('demandsFor("oro").length'),3);
 assert.equal(setup('video').run('clientsForMonth().length'),0);
});
test('removed and archived clients remain excluded',()=>{
 const {state,run}=setup();state.removedClientMonths.push({clientId:'oro',area:'arte',month:'2026-11'});assert.equal(run('clientsForMonth().length'),0);
 state.removedClientMonths=[];state.archivedClientKeys=['oro casa'];assert.equal(run('clientsForMonth().length'),0);
});
