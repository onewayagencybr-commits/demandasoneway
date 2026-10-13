/* One Way — recover a completed Apify run without running the Actor again.
 * Authenticated agency admin only. Verifies actor and saved input.
 */
const {admin,apify,serviceHeaders,url,reply}=require('../lib/oneway-server');
const {normalize}=require('../lib/instagram-posts');
const {createPDF}=require('../lib/instagram-pdf-server');
const USER=/^[a-z0-9._]{1,30}$/i,DAY=/^\d{4}-\d{2}-\d{2}$/;
const ACTOR_ID='nH2AHrwxeTRJoN5hX';
function safe(v){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9_-]/gi,'_').replace(/_+/g,'_').slice(0,65)||'Cliente';}
module.exports=async function handler(req,res){
 if(req.method!=='POST')return reply(res,405,{error:'Método não permitido.'});
 try{
  await admin(req);
  const {username,from,to,clientName}=req.body||{};
  if(!USER.test(username||'')||!DAY.test(from||'')||!DAY.test(to||'')||from>to||to>new Date(Date.now()+86400000).toISOString().slice(0,10))
    return reply(res,400,{error:'Informe o perfil e as datas usados na coleta original.'});
  const result=await apify('/actor-runs?desc=1&status=SUCCEEDED&limit=45');
  const recent=Array.isArray(result?.data?.items)?result.data.items:[];
  let selected=null;
  for(const run of recent){
   if(run.actId!==ACTOR_ID||!run.defaultKeyValueStoreId||!run.defaultDatasetId)continue;
   if(Date.now()-Date.parse(run.startedAt)>7*86400000)continue;
   try{
    const input=await apify('/key-value-stores/'+run.defaultKeyValueStoreId+'/records/INPUT');
    const user=Array.isArray(input?.username)?input.username[0]:input?.username;
    if(String(user||'').toLowerCase()===username.toLowerCase()&&input?.onlyPostsNewerThan===from){selected=run;break;}
   }catch(e){console.warn('One Way recovery: run input not available',run.id);}
  }
  if(!selected)return reply(res,404,{error:'Não encontrei uma coleta concluída desse perfil e período nos últimos 7 dias. Não gere outra análise antes de conferir as datas.'});
  const records=await apify('/datasets/'+selected.defaultDatasetId+'/items?clean=true&limit=300');
  if(!Array.isArray(records))throw Error('Dataset da execução anterior indisponível.');
  const posts=normalize(records,from,to);
  const report={username,from,to,clientName:String(clientName||username).slice(0,100),posts};
  const pdf=await createPDF(report);
  if(pdf.length<3000||pdf.length>15*1024*1024)throw Error('Arquivo PDF incompleto.');
  const stamp=String(selected.startedAt).replace(/[-:]/g,'').replace(/\.\d+Z$/,'Z');
  const n=Number(selected.usageTotalUsd);
  const costPart=selected.usageTotalUsd!=null&&Number.isFinite(n)?'usd-'+n.toFixed(5).replace('.','p'):'usd-unknown';
  const name=[stamp,username,from,to,safe(report.clientName),costPart,selected.id].join('__')+'.pdf';
  const target=url()+'/storage/v1/object/oneway-instagram-reports/instagram/'+encodeURIComponent(name);
  const up=await fetch(target,{method:'POST',headers:{...serviceHeaders('application/pdf'),'x-upsert':'false'},body:pdf,signal:AbortSignal.timeout(25000)});
  if(up.status===409)return reply(res,200,{ok:true,alreadySaved:true,runId:selected.id,posts:posts.length,costUsd:selected.usageTotalUsd??null});
  if(!up.ok){const detail=(await up.text()).slice(0,500);console.error('One Way recovery storage error',up.status,detail);return reply(res,502,{error:'A gravação ainda foi negada pelo Supabase (HTTP '+up.status+'). Use Testar salvamento para verificar a chave.'});}
  return reply(res,200,{ok:true,saved:true,runId:selected.id,posts:posts.length,costUsd:selected.usageTotalUsd??null});
 }catch(e){console.error('One Way recovery failed',e?.message);return reply(res,e?.status===401||e?.status===403?e.status:503,{error:e?.status===401||e?.status===403?e.message:'Não foi possível recuperar o PDF. Confira a conexão com Apify e Supabase.'});}
};