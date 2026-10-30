const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync('modules/traffic-report-history.js','utf8');

function node() {
  const events={}, classes=new Set(['hidden']);
  return {
    events, value:'', dataset:{}, disabled:false, textContent:'',
    parentNode:{insertBefore(){}},
    classList:{
      toggle(c,on){if(on)classes.add(c);else classes.delete(c)},
      contains:c=>classes.has(c),add:c=>classes.add(c),remove:c=>classes.delete(c)
    },
    addEventListener(k,fn){events[k]=fn},appendChild(){},remove(){},focus(){},
    set innerHTML(value){this._html=value},get innerHTML(){return this._html||''}
  };
}
function fixture(options={}) {
  let counter=0, calls=0, saves=0, restored=0, failed=false;
  const main=node(), overlay=node(), children={};
  overlay.querySelector=(selector)=>children[selector]||(children[selector]=node());
  const document={
    getElementById:id=>id==='trafficReportBtn'?main:null,
    createElement:tag=>tag==='div'?overlay:node(),
    head:{appendChild(){}},body:{appendChild(){}},
    addEventListener(){},removeEventListener(){}
  };
  const reports=options.legacy||{};
  const context={
    document,window:{},MutationObserver:class{observe(){}},
    state:{analyticsReports:reports},
    currentArea:'trafego',currentMonth:'2026-10',activeAnalytics:{type:'traffic'},
    exportActiveAnalyticsPDF:async()=>{calls++},
    exportActiveAnalyticsJPEG:async()=>{calls++},
    isAdmin:()=>options.admin!==false,
    adminAuthReady:()=>options.auth!==false,
    supabaseClient:{},
    syncTrafficTotalsFromCampaigns(){},
    readTrafficForm:()=>({
      _clientName:'Medina Informática',_reportMonth:'2026-10',
      spend:2400,leads:48,analysis:'Análise original',
      campaigns:[{name:'Campanha A',spend:2400,leads:48},{name:'Sem gasto',spend:0}],
      _jpegMetrics:{leads:false,cpl:true}
    }),
    trafficCampaignHasSpend:r=>Number(r.spend)>0,
    trafficAnalysisText:()=> 'Texto automático',
    analyticsMoney:v=>'R$ '+v,compactInt:v=>String(v),monthKeyLabel:v=>v,
    saveState:async()=>{saves++;return !failed},
    writeLocalCache(){restored++},
    toast(){},
    uid:()=> 'snapshot-'+ ++counter,
    esc:x=>String(x),
    openTrafficAnalytics(){},renderTrafficEditor(){},
    buildMonth12Select:() =>'<option value="2026-10">outubro</option>',
    confirm:()=>true
  };
  vm.runInNewContext(source,context);
  return {
    context,overlay,children,history:context.window.OWTrafficReportHistory,
    saves:()=>saves,calls:()=>calls,restored:()=>restored,fail:()=>{failed=true}
  };
}
test('each PDF and JPEG export records a frozen independent snapshot',async()=>{
  const f=fixture();
  await f.context.exportActiveAnalyticsPDF();
  await f.context.exportActiveAnalyticsJPEG();
  const list=f.history.entries();
  assert.equal(list.length,2);
  assert.equal(list[0].format,'JPEG');
  assert.equal(list[1].format,'PDF');
  assert.equal(list[0].name,'Medina Informática');
  assert.equal(list[1].month,'2026-10');
  assert.equal(list[1].data.analysis,'Análise original');
  assert.equal(list[0].data.campaigns.length,1);
  assert.equal(list[0].data._jpegMetrics.leads,false);
  assert.equal(f.calls(),2);assert.equal(f.saves(),2);
  list[0].data.leads=999;
  assert.equal(f.history.entries()[0].data.leads,48);
});
test('a remote save failure restores prior history without claiming a saved report',async()=>{
  const f=fixture();
  await f.context.exportActiveAnalyticsPDF();
  f.fail();
  await f.context.exportActiveAnalyticsJPEG();
  assert.equal(f.history.entries().length,1);
  assert.equal(f.saves(),2);
  assert.equal(f.restored(),1);
});
test('the latest previous traffic record remains recoverable',()=>{
  const f=fixture({legacy:{'traffic|cliente|2026-10':{
    type:'traffic',clientName:'Cliente Antigo',month:'2026-10',
    updatedAt:'2026-10-22T15:00:00Z',
    data:{_clientName:'Cliente Antigo',_reportMonth:'2026-10',spend:120,campaigns:[]}
  }}});
  const list=f.history.entries();
  assert.equal(list.length,1);
  assert.equal(list[0].legacy,true);
  assert.equal(list[0].name,'Cliente Antigo');
  assert.equal(list[0].data.spend,120);
});
test('Instagram reports are not archived by the traffic module',async()=>{
  const f=fixture();
  f.context.activeAnalytics={type:'instagram'};
  await f.context.exportActiveAnalyticsJPEG();
  assert.equal(f.saves(),0);
  assert.equal(f.calls(),1);
  assert.equal(f.history.entries().length,0);
});
test('archival requires an authenticated administrator',async()=>{
  const f=fixture({auth:false});
  await f.context.exportActiveAnalyticsPDF();
  assert.equal(f.saves(),0);
  assert.equal(f.history.entries().length,0);
});
