const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {webcrypto}=require('node:crypto');

function api(){
 const window={addEventListener(){}};
 vm.runInNewContext(fs.readFileSync('modules/scripts-ui.js','utf8'),{
  window,document:{getElementById(){}},crypto:webcrypto,URL,structuredClone,
  DEMAND_ASSIGNEES:['Gabriel','João','Pedro','Tiago','Fernando','Lucas']
 });
 return window.owScripts;
}
function source(mode='scenes'){
 return {id:'8c2338aa-fc9a-4314-990b-cafdd08dfdd2',client:'Rota Oeste',title:'',
  videos:[mode==='scenes'?
   {id:'10dd110a-e072-4c10-958f-7ed7c1fe5252',title:'Scania 60 anos',mode,
    duration:'',text:'',references:'https://youtu.be/example',
    scenes:[{text:'Fala principal',visual:'Plano aberto da fachada',seconds:'10'},{text:'Fala final',visual:'',seconds:'5'}]}:
   {id:'10dd110a-e072-4c10-958f-7ed7c1fe5252',title:'Scania 60 anos',mode,
    duration:'30',text:'Um texto completo para gravar e editar.',references:'',scenes:[]}]
 };
}
test('Demanda recebe roteiro cena a cena completo, referências, data, horário e responsável',()=>{
 const p=api().scriptDemandPayload(source(),0,{postDate:'2026-11-28',postTime:'16:00',assignee:'Pedro'});
 assert.equal(p.clientName,'Rota Oeste');
 assert.equal(p.title,'Scania 60 anos');
 assert.equal(p.postDate,'2026-11-28');
 assert.equal(p.postTime,'16:00');
 assert.equal(p.assignee,'Pedro');
 assert.equal(p.sourceScriptId,source().id);
 assert.equal(p.sourceScriptVideoId,source().videos[0].id);
 assert.match(p.description,/HORÁRIO PREVISTO DE POSTAGEM: 16:00/);
 for(const part of ['CENA 01','Texto \/ fala: Fala principal','Imagem \/ ação: Plano aberto da fachada','CENA 02','Fala final','Duração da cena: 10s','https:\/\/youtu.be\/example']){
  assert.ok(p.description.includes(part),part);
 }
 assert.equal(p.links.length,1);
 assert.equal(p.links[0],'https://youtu.be/example');
 assert.equal(p.scriptSnapshot.scenes.length,2);
});
test('Demanda preserva o texto integral dos roteiros no modo completo',()=>{
 const p=api().scriptDemandPayload(source('full'),0,{postDate:'2026-12-01',postTime:'08:45',assignee:'Gabriel'});
 assert.ok(p.description.includes('ROTEIRO COMPLETO'));
 assert.ok(p.description.includes('Um texto completo para gravar e editar.'));
 assert.equal(p.scriptSnapshot.mode,'full');
});
test('Requer data real, horário, responsável e vídeo preenchido',()=>{
 const a=api(),doc=source(),valid={postDate:'2026-11-28',postTime:'16:00',assignee:'Pedro'};
 for(const invalid of [
  {...valid,postDate:'2026-02-30'},
  {...valid,postDate:'invalid'},
  {...valid,postTime:''},
  {...valid,postTime:'25:99'},
  {...valid,assignee:'Pessoa inexistente'}
 ])assert.throws(()=>a.scriptDemandPayload(doc,0,invalid));
 assert.throws(()=>a.scriptDemandPayload({...doc,client:''},0,valid));
 assert.throws(()=>a.scriptDemandPayload({...doc,videos:[{...doc.videos[0],scenes:[{text:'',visual:'',seconds:''}]}]},0,valid));
});
test('Vídeos salvos ganham ID estável e roteiros antigos continuam válidos',()=>{
 const a=api(),doc=source(),first=a.validate(doc),again=a.validate(first);
 assert.equal(first.videos[0].id,doc.videos[0].id);
 assert.equal(again.videos[0].id,doc.videos[0].id);
 const old=source();delete old.videos[0].id;
 const upgraded=a.validate(old);
 assert.match(upgraded.videos[0].id,/^[a-f0-9-]{36}$/i);
 assert.equal(upgraded.videos[0].scenes[1].text,'Fala final');
});
