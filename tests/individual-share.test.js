const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('modules/individual-share.js','utf8');

function fixture(options = {}) {
  const created=[];
  function element() {
    return {
      dataset:{}, classList:{add(){},remove(){},contains(){return false;}},
      style:{}, parentNode:{insertBefore(){}}, children:[],
      appendChild(x){this.children.push(x);},
      insertBefore(x){this.children.push(x);},
      addEventListener(){}, setAttribute(){}, querySelector(){return null;}, querySelectorAll(){return [];},
      textContent:'', value:'', firstChild:null
    };
  }
  const footer=element();
  const form=element(); form.querySelector=selector=>selector==='.modal-actions'?footer:null;
  const modal=element();
  const clients=element();
  const fields={
    wkEventId:'e1',wkEventType:'Gravação',wkEventTitle:'Seminovos e Entrevista pro 60 Anos',
    wkEventDate:'2026-10-30',wkEventTime:'09:00',wkEventDescription:'Rota Oeste – Scania',
    wkEventClient:'c1'
  };
  const nodes=Object.fromEntries(Object.entries(fields).map(([k,v])=>[k,{value:v,addEventListener(){}}]));
  const selected=[{value:'sony-a6700'},{value:'ronin-rs3'},{value:'lark-m2'}];
  const document={
    head:{appendChild(){}},body:{appendChild(){}},
    getElementById(id){return id==='wkEventForm'?form:id==='weekEventModal'?modal:id==='clients'?clients:nodes[id]||null;},
    querySelectorAll(selector){return selector.includes(':checked')?selected:[];},
    querySelector(){return null;},createElement(tag){const x=element(); created.push(x);return x;},
    addEventListener(){},execCommand(){return true;}
  };
  const state={
    clients:[{id:'c1',name:'Scania – Rota Oeste'}],
    calendarEvents:[{id:'e1',date:'2026-10-30',title:'Evento',clientId:'c1'}],
    demands:[{id:'d1',clientId:'c1',area:'video',title:'Vídeo 60 anos',description:'Captação de entrevistas',
      postDate:'2026-10-30',assignee:'Pedro',status:'yellow',links:['https://drive.google.com/a'],
      productionLinks:['https://drive.google.com/b'],finalLink:''}]
  };
  const ctx={document,window:{OWEquipmentChecklist:{groups:[
    {title:'Câmeras',items:[['sony-a6700','Sony A6700'],['blackmagic','Blackmagic']]},
    {title:'Estabilizadores',items:[['ronin-rs3','Ronin RS3']]},
    {title:'Áudio',items:[['lark-m2','Lapela Lark M2']]}
  ]}},state,
  navigator:{clipboard:{writeText:async()=>{}}},MutationObserver:class{observe(){}},
  isAdmin:()=>options.admin!==false,canAccessDemand:()=>true,
  statusLabel:()=> 'Em produção',demandAssignee:d=>d.assignee,
  AREAS:{video:'Vídeo'},toast(){}};
  vm.createContext(ctx);
  vm.runInContext(source,ctx);
  return {api:ctx.window.OWIndividualShare,state,fields,selected,document};
}
test('one click exports only the checked equipment, grouped for WhatsApp',()=>{
  const f=fixture();
  const text=f.api.formatAppointment(f.api.currentAppointment(),true);
  assert.match(text,/CHECKLIST DE EQUIPAMENTOS/);
  assert.match(text,/Scania – Rota Oeste/);
  assert.match(text,/30\/10\/2026 às 09:00/);
  assert.match(text,/Equipamentos para levar \(3\)/);
  for(const x of ['☐ Sony A6700','☐ Ronin RS3','☐ Lapela Lark M2'])assert.ok(text.includes(x));
  assert.ok(!text.includes('Blackmagic'));
  assert.ok(!text.includes('Captação de entrevistas'));
});
test('the full appointment includes notes and selected gear',()=>{
  const f=fixture();const text=f.api.formatAppointment(f.api.currentAppointment(),false);
  assert.match(text,/COMPROMISSO/);
  assert.match(text,/Observações:\* Rota Oeste – Scania/);
  assert.match(text,/Sony A6700/);
});
test('individual demand shares only that demand, status, responsible and links',()=>{
  const f=fixture();const text=f.api.formatDemand(f.state.demands[0]);
  assert.match(text,/DEMANDA/);
  assert.match(text,/Vídeo 60 anos/);
  assert.match(text,/Responsável:\* Pedro/);
  assert.match(text,/Em produção/);
  assert.match(text,/https:\/\/drive.google.com\/a/);
  assert.match(text,/https:\/\/drive.google.com\/b/);
  assert.ok(!text.includes('CHECKLIST DE EQUIPAMENTOS'));
});
test('unselected gear is never included in shared list',()=>{
  const f=fixture();const t=f.api.formatAppointment({...f.api.currentAppointment(),equipmentIds:[]},true);
  assert.match(t,/Nenhum equipamento selecionado/);
  assert.ok(!t.includes('☐ Sony A6700'));
});
test('dates from unavailable or malformed data remain safe',()=>{
  const f=fixture();const t=f.api.formatAppointment({...f.api.currentAppointment(),date:'wrong'},false);
  assert.match(t,/Não definida/);
});
