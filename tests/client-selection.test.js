const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
function setup(){
 const state={clients:[{id:'ka',name:'K- Energy',area:'arte'},{id:'kv',name:'K - Energy',area:'video'},{id:'oldk',name:'K - E nergy',area:'video'},{id:'oa',name:'ORO Casa',area:'arte'},{id:'ov',name:'orocasa',area:'video'},{id:'del',name:'Deleted',deletedAt:'today'},{id:'merged',name:'Old alias',mergedInto:'oa'}],clientDirectory:['K- Energy','Directory only','Deleted','Old alias'],archivedClientKeys:['k e nergy'],recentClients:['Historic'],demands:[]};
 const ctx={state,smUnlocked:false,smItems:[{client:'Historic Social'}]};vm.createContext(ctx);
 vm.runInContext(html.slice(html.indexOf('function cmKey('),html.indexOf('function cmNamesSimilar')),ctx);
 return {state,run:s=>vm.runInContext(s,ctx),ctx};
}
test('names exclude archives and history, collapse spacing/case/hyphen duplicates',()=>{
 const {run}=setup();assert.deepEqual(Array.from(run('cmSelectableNames()')),['Directory only','K- Energy','ORO Casa']);
});
test('social unlock and navigation month do not alter registry suggestions',()=>{
 const {run}=setup();const before=JSON.stringify(run('cmSelectableNames()'));run("smUnlocked=true;currentMonth='2027-01'");assert.equal(JSON.stringify(run('cmSelectableNames()')),before);
});
test('record selectors prefer destination area without changing ids or data',()=>{
 const {run,state}=setup(),before=JSON.stringify(state);assert.equal(run("cmSelectableRecords('video','ka').find(c=>cmSelectionKey(c.name)==='kenergy').id"),'kv');assert.equal(JSON.stringify(state),before);
});
test('registered changes are reflected without reloading',()=>{
 const {run,state}=setup();state.archivedClientKeys.push('oro casa','orocasa');assert.ok(!Array.from(run('cmSelectableNames()')).some(n=>/oro/i.test(n)));state.clients.push({id:'new',name:'New Client',area:'arte'});assert.ok(Array.from(run('cmSelectableNames()')).includes('New Client'));
});
test('demand edit preserves historical id without offering it for new demand',()=>{
 const {ctx,run}=setup();const select={value:'',innerHTML:''};Object.assign(ctx,{document:{getElementById:()=>select},esc:s=>s,AREAS:{arte:'Arte',video:'Vídeo'}});
 vm.runInContext(html.slice(html.indexOf('function demandClientOptions('),html.indexOf('function setDemandArea(')),ctx);
 run("demandClientOptions('video')");assert.doesNotMatch(select.innerHTML,/value="oldk"/);
 run("demandClientOptions('video','oldk')");assert.equal(select.value,'oldk');assert.match(select.innerHTML,/value="oldk"/);
});
test('contracts suggest only registered clients and keep newest profile per client',()=>{
 const {ctx,run}=setup();Object.assign(ctx,{hiddenContractClientProfiles:[],secureContracts:[{id:'old',createdAt:'2026-01',client:{legalName:'ORO Casa',document:'1'}},{id:'new',createdAt:'2026-10',client:{legalName:'ORO Casa',document:'2'}},{id:'hist',client:{legalName:'Historic Contract',document:'3'}}]});
 vm.runInContext(html.slice(html.indexOf('function contractProfileNorm('),html.indexOf('function contractAgencyProfiles(')),ctx);
 assert.deepEqual(Array.from(run('contractClientProfiles()'),p=>p.id),['new']);assert.equal(ctx.secureContracts.length,3);
});
