/* One Way — biblioteca administrada: somente dados estruturados JSON.
 * Nenhum endpoint persiste arquivos PDF ou expõe a chave secret ao navegador.
 */
const {admin,reply}=require('../lib/oneway-server');
const {listReports,getReport,removeReports,testStore,valid}=require('../lib/instagram-data-store');
module.exports=async function handler(req,res){
 if(!['GET','POST','DELETE'].includes(req.method))return reply(res,405,{error:'Método não permitido.'});
 try{
  await admin(req);
  if(req.method==='POST'){
    if(req.body?.action!=='check')return reply(res,400,{error:'Ação não reconhecida.'});
    return reply(res,200,await testStore());
  }
  if(req.method==='GET'){
    if(req.query?.mode==='list')return reply(res,200,{items:await listReports(),format:'json',retentionDays:30});
    if(req.query?.mode==='read'){
       const name=String(req.query?.name||'');
       if(!valid(name))return reply(res,400,{error:'Identificador de análise inválido.'});
       return reply(res,200,{report:await getReport(name)});
    }
    return reply(res,400,{error:'Consulta inválida.'});
  }
  const name=String(req.body?.name||'');
  if(!valid(name))return reply(res,400,{error:'Identificador inválido.'});
  await removeReports([name]);
  return reply(res,200,{ok:true});
 }catch(err){
  const message=String(err?.message||'Erro do armazenamento');
  console.error('One Way Instagram saved data:',req.method,err?.status||500,message.slice(0,180));
  return reply(res,err?.status>=400&&err.status<500?err.status:503,{error:message.slice(0,240)});
 }
};