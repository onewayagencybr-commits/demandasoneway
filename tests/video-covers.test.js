const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync('modules/video-covers.js', 'utf8');
function fixture(options = {}) {
  let counter = 0, saves = 0, cached = 0;
  const video = {id:'v1', area:'video', clientId:'cv', month:'2026-11', title:'Entrega da obra', postDate:'2026-11-05', assignee:'Pedro', status:'green', notes:[{text:'Nota do vídeo'}]};
  const state = {clients:[{id:'cv',name:'Cliente Teste',area:'video',type:'oneoff',startMonth:'2026-11'}],demands:[video],deletedDemands:[],removedClientMonths:[]};
  const ctx = {state,window:{},document:{getElementById:()=>null,addEventListener(){}},isAdmin:()=>options.admin!==false,
    DEMAND_ASSIGNEES:['Gabriel','João','Pedro','Tiago','Fernando','Lucas'],uid:()=>`id${++counter}`,cmSelectionKey:n=>n.trim().toLowerCase(),
    demandCreationCalendarDate:()=> '2026-10-29',supabaseClient:options.offline?null:{},
    saveState:async()=>{saves++;return options.save?await options.save():!options.fail},writeLocalCache:()=>cached++,renderAll(){},toast(){},
    esc:x=>String(x),fmtPostDate:x=>x,statusLabel:d=>d.status,canAccessDemand:()=>true};
  vm.runInNewContext(source,ctx);
  return {state,video,api:ctx.window.OWVideoCovers,saves:()=>saves,cached:()=>cached};
}
test('every employee receives an independent art demand with the video deadline and client',()=>{
  for(const person of ['Gabriel','João','Pedro','Tiago','Fernando','Lucas']) {
    const {state,video,api}=fixture();const {cover}=api.stage(video,{assignee:person});
    assert.equal(cover.area,'arte');assert.equal(cover.assignee,person);assert.equal(cover.postDate,video.postDate);
    assert.equal(cover.month,'2026-11');assert.equal(cover.title,'Capa — Entrega da obra');assert.equal(cover.sourceVideoId,video.id);
    assert.equal(cover.status,'red');assert.equal(cover.notes,undefined);assert.notEqual(cover.id,video.id);
    assert.equal(state.clients.find(c=>c.id===cover.clientId).name,'Cliente Teste');
    assert.equal(state.clients.find(c=>c.id===cover.clientId).type,'oneoff');
    cover.status='yellow';assert.equal(video.status,'green');assert.equal(state.demands.length,2);
  }
});
test('existing art client is reused and removal for this month is undone',()=>{
  const {state,video,api}=fixture();state.clients.push({id:'ca',name:'Cliente Teste',area:'arte'});
  state.removedClientMonths.push({id:'r',clientId:'ca',month:'2026-11',area:'arte'});
  const tx=api.stage(video,{assignee:'João'});assert.equal(tx.cover.clientId,'ca');assert.equal(state.clients.length,2);
  assert.equal(state.removedClientMonths.length,0);tx.rollback();assert.equal(state.removedClientMonths.length,1);
});
test('repeated creation and covers in trash cannot duplicate the task',()=>{
  const {state,video,api}=fixture();const {cover}=api.stage(video,{assignee:'João'});
  assert.throws(()=>api.stage(video,{assignee:'Lucas'}),/já tem uma capa/);
  state.demands=state.demands.filter(d=>d!==cover);state.deletedDemands.push(cover);
  assert.throws(()=>api.stage(video,{assignee:'Lucas'}),/já tem uma capa/);
});
test('role, date, area and assignee validation leave state untouched',()=>{
  const restricted=fixture({admin:false});assert.throws(()=>restricted.api.stage(restricted.video,{assignee:'João'}),/administrador/);
  const {state,video,api}=fixture();const before=JSON.stringify(state);
  assert.throws(()=>api.stage({...video,postDate:''},{assignee:'João'}),/data/);
  assert.throws(()=>api.stage({...video,area:'arte'},{assignee:'João'}),/vídeo/);
  assert.throws(()=>api.stage(video,{assignee:'Intruso'}),/responsável/);
  assert.equal(JSON.stringify(state),before);
});
test('remote failure rolls back both cover and new art client and corrects cache',async()=>{
  const f=fixture({fail:true});const before=JSON.stringify(f.state);
  assert.equal(await f.api.create('v1','João'),null);assert.equal(f.saves(),1);
  assert.equal(JSON.stringify(f.state),before);assert.equal(f.cached(),1);
});
test('offline creation does not claim to assign a cover to the team',async()=>{
  const f=fixture({offline:true});assert.equal(await f.api.create('v1','João'),null);
  assert.equal(f.state.demands.length,1);assert.equal(f.saves(),0);
});
test('double click while saving creates and persists only one cover',async()=>{
  let done;const f=fixture({save:()=>new Promise(r=>{done=r})});
  const first=f.api.create('v1','João');await f.api.create('v1','Lucas');done(true);await first;
  assert.equal(f.state.demands.length,2);assert.equal(f.saves(),1);assert.equal(f.state.demands[1].assignee,'João');
});
