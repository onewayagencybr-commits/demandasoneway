/* Recebe a conclusão do Apify e produz/arquiva o PDF independente do navegador.
 * Segurança: Authorization Bearer CRON_SECRET. Idempotência: arquivo pelo ID da execução.
 */
const {timingSafeEqual}=require('node:crypto');
const {apify,serviceHeaders,url,reply}=require('../lib/oneway-server');
const {normalize}=require('../lib/instagram-posts');
const {createPDF}=require('../lib/instagram-pdf-server');
const DAY=/^\d{4}-\d{2}-\d{2}$/;
function auth(req){const expected=process.env.CRON_SECRET||'',provided=/^Bearer\s+(.+)$/.exec(req.headers.authorization||'')?.[1]||'';const a=Buffer.from(expected),b=Buffer.from(provided);return a.length>0&&a.length===b.length&&timingSafeEqual(a,b);}
const safeName=n=>String(n||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9_-]/gi,'_').replace(/_+/g,'_').slice(0,65)||'Cliente';
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
  const pdf=await createPDF(report);
  if(pdf.length<3000||pdf.length>15*1024*1024)throw Error('Tamanho do PDF inesperado.');
  const started=String(run.startedAt||new Date().toISOString()).replace(/[-:]/g,'').replace(/\.\d+Z$/,'Z');
  const cost=Number(run.usageTotalUsd);
  const costPart=run.usageTotalUsd!=null&&Number.isFinite(cost)?'usd-'+cost.toFixed(5).replace('.','p'):'usd-unknown';
  const name=[started,username,from,to,safeName(clientName||username),costPart,runId].join('__')+'.pdf';
  const store=url()+'/storage/v1/object/oneway-instagram-reports/instagram/'+encodeURIComponent(name);
  const response=await fetch(store,{method:'POST',headers:{...serviceHeaders('application/pdf'),'x-upsert':'false'},body:pdf,signal:AbortSignal.timeout(25000)});
  if(response.status===409)return reply(res,200,{ok:true,duplicate:true,runId});
  if(!response.ok){const err=await response.text().catch(()=>String(response.status));throw Error('Supabase Storage '+response.status+' '+err.slice(0,180));}
  return reply(res,200,{ok:true,runId,posts:posts.length,costUsd:run.usageTotalUsd??null});
 }catch(e){console.error('Instagram background report failed',{runId,error:e.message});return reply(res,503,{error:'O PDF ainda não pôde ser concluído; Apify pode tentar novamente.'});}
};