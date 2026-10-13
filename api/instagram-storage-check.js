/* One Way — verifica armazenamento de dados JSON, sem PDF nem coleta Apify. */
const {admin,reply}=require('../lib/oneway-server');
const {testStore}=require('../lib/instagram-data-store');
module.exports=async function handler(req,res){
 if(req.method!=='POST')return reply(res,405,{error:'Método não permitido.'});
 try{
  await admin(req);
  return reply(res,200,await testStore());
 }catch(e){
  console.error('Teste de salvamento JSON',e.message);
  return reply(res,e.status>=400&&e.status<500?e.status:503,{
   ok:false,error:'Não foi possível salvar os dados JSON: '+String(e.message||'erro').slice(0,230)
  });
 }
};