/* One Way: recebe conclusão do Apify e arquiva SOMENTE dados JSON em segundo plano.
 * Segurança: Authorization Bearer CRON_SECRET. PDFs são gerados sob demanda no navegador.
 */
const {timingSafeEqual}=require('node:crypto');
const {apify,reply}=require('../lib/oneway-server');
const {storeReport}=require('../lib/instagram-data-store');
const {normalize}=require('../lib/instagram-posts');
const DAY=/^\d{4}-\d{2}-\d{2}$/;
function auth(req){const expected=process.env.CRON_SECRET||'',provided=/^Bearer\s+(.+)$/.exec(req.headers.authorization||'')?.[1]||'';const a=Buffer.from(expected),b=Buffer.from(provided);return a.length>0&&a.length===b.length&&timingSafeEqual(a,b);}
module.exports=async function webhook(req,res){
 if(req.method!=='POST')return reply(res,405,{error:'Método inválido.'});
 if(!auth(req))return reply(res,401,{error:'Não autorizado.'});
 const {username,from,to,clientName,resource}=req.body||{};
 const runId=String(resource?.id||'');
 if(!/^[a-zA-Z0-9]{12,32}$/.test(runId)||!/^[a-z0-9._]{1,30}$/i.test(username||'')||!DAY.test(from||'')||!DAY.test(to||''))return reply(res,400,{error:'Webhook inválido.'});
 try{
  const run=(await apify('/actor-runs/'+encodeURIComponent(runId))).data||{};
  if(run.status==='FAILED'||run.status==='ABORTED'||run.status==='TIMED-OUT')return reply(res,200,{ok:true,skipped:run.status});
  if(run.status!=='SUCCEEDED'||!run.defaultDatasetId)return reply(res,503,{error:'Execução ainda não finalizada.'});
  const rows=await apify('/datasets/'+encodeURIComponent(run.defaultDatasetId)+'/items?clean=true&limit=300');
  if(!Array.isArray(rows))throw Error('Dataset com dados inválidos.');
  const posts=normalize(rows,from,to);
  const report={username,from,to,clientName:String(clientName||username).slice(0,100),posts};
  const stored=await storeReport(report,run);
  return reply(res,200,{ok:true,runId,posts:posts.length,costUsd:run.usageTotalUsd??null,bytes:stored.bytes,alreadySaved:!!stored.duplicate,format:'json'});
 }catch(e){console.error('Instagram JSON background save failed',{runId,error:e.message});return reply(res,503,{error:'Os dados da análise ainda não puderam ser salvos; Apify pode tentar novamente.'});}
};