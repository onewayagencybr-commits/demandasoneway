const {randomUUID}=require('node:crypto');
const {PDFDocument}=require('pdf-lib');
const {admin,url,serviceHeaders,reply}=require('../lib/oneway-server');
module.exports=async function(req,res){
 if(req.method!=='POST')return reply(res,405,{error:'Método não permitido.'});
 try{
  await admin(req);
  const doc=await PDFDocument.create();
  doc.addPage([200,100]);
  const data=Buffer.from(await doc.save());
  const pathname='instagram/check-'+randomUUID()+'.pdf';
  const uploaded=await fetch(url()+'/storage/v1/object/oneway-instagram-reports/'+pathname,{
   method:'POST',headers:serviceHeaders('application/pdf'),body:data,signal:AbortSignal.timeout(15000)
  });
  if(!uploaded.ok){
   const raw=await uploaded.text();
   console.error('Storage write test rejected',uploaded.status,raw.slice(0,180));
   return reply(res,502,{ok:false,error:'O Supabase recusou a gravação do arquivo de teste (HTTP '+uploaded.status+'). Verifique se a variável SUPABASE_SERVICE_ROLE_KEY é uma chave secret/service_role válida do projeto correto.'});
  }
  const deleted=await fetch(url()+'/storage/v1/object/oneway-instagram-reports',{
   method:'DELETE',headers:serviceHeaders(),body:JSON.stringify({prefixes:[pathname]}),
   signal:AbortSignal.timeout(15000)
  });
  return reply(res,deleted.ok?200:207,{ok:true,deleted:deleted.ok,message:deleted.ok?'PDF de teste salvo e removido com sucesso, sem custos no Apify.':'Gravação funcionou, mas exclusão do arquivo de teste falhou.'});
 }catch(e){console.error('Storage test error',e.message);return reply(res,503,{ok:false,error:'Não foi possível validar o Supabase Storage. Confira a configuração da chave administrativa.'});}
};