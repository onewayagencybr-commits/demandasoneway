const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');

const html=fs.readFileSync('index.html','utf8');
const start=html.indexOf('/* Quem fez cada ação');
const end=html.indexOf('function demandActivityHTML',start);
assert.ok(start>0&&end>start,'Actor helpers must exist in index.html');
const code=html.slice(start,end).replace('let owAdminProfileKey','var owAdminProfileKey');

function ctx(user,{profiles={},key=''}={}){
 let n=0;
 const c={USERS:{Administrador:'admin',Visitante:'status','Design Login':'design','Vídeos Login':'video'},currentUser:user,
  state:{adminProfiles:profiles,teamInitials:{},collaborators:[{name:'João',login:'design'},{name:'Tiago',login:'video'},{name:'Lucas'}],auditLog:[]},
  uid:()=>'id'+(++n),Date,JSON};
 vm.runInNewContext(code+';owAdminProfileKey='+JSON.stringify(key)+';this.api={owActorStamp,appendDemandActivity,owLogAction,owInitialsFor}',c);
 return c;
}

test('admin logins are identified by the name and initials chosen for the e-mail',()=>{
 const c=ctx('Administrador',{profiles:{u_lucas:{name:'Lucas',ini:'lu'}},key:'u_lucas'});
 assert.deepEqual({...c.api.owActorStamp()},{by:'Lucas',ini:'LU',login:'admin'});
 const d={status:'green',activityLog:[]};
 c.api.appendDemandActivity(d,'status','Status: Em produção → Finalizado');
 assert.equal(d.activityLog[0].ini,'LU');assert.equal(d.activityLog[0].by,'Lucas');
 assert.equal(d.statusMarks.green.ini,'LU');
});
test('unidentified admin stays AD and team logins use the linked collaborator',()=>{
 assert.equal(ctx('Administrador').api.owActorStamp().ini,'AD');
 assert.deepEqual({...ctx('Design Login').api.owActorStamp()},{by:'João',ini:'JO',login:'design'});
 assert.equal(ctx('Vídeos Login').api.owActorStamp().by,'Tiago');
 assert.equal(ctx('Visitante').api.owActorStamp().ini,'VS');
});
test('Thiago defaults to TI and creation is stamped once',()=>{
 const c=ctx('Administrador',{profiles:{k:{name:'Thiago'}},key:'k'});
 assert.equal(c.api.owActorStamp().ini,'TI');
 const d={status:'red'};c.api.appendDemandActivity(d,'created','Demanda criada');
 assert.equal(d.createdBy.by,'Thiago');
 c.api.owLogAction('proposal','Proposta criada',{client:'Medina'});
 assert.equal(c.state.auditLog[0].ini,'TI');assert.equal(c.state.auditLog[0].client,'Medina');
});
test('new state fields survive normalizeState and the module is loaded',()=>{
 for(const f of ['auditLog:','adminProfiles:','teamInitials:'])assert.ok(html.includes('contactRoutine:{},auditLog:[],adminProfiles:{},teamInitials:{}')&&html.includes(f));
 assert.match(html,/auditLog:Array\.isArray\(s\.auditLog\)/);
 assert.match(html,/src="\/modules\/activity-tracking\.js/);
 assert.ok(fs.existsSync('supabase/migrations/20261124_app_activity_log.sql'));
});
