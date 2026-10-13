/* One Way — recover a completed Apify run without running the Actor again.
 * Authenticated agency admin only. Verifies actor and saved input.
 */
const {admin,apify,reply}=require('../lib/oneway-server');
const {storeReport}=require('../lib/instagram-data-store');
const {normalize}=require('../lib/instagram-posts');
const USER=/^[a-z0-9._]{1,30}$/i,DAY=/^\d{4}-\d{2}-\d{2}$/;
const ACTOR_ID='nH2AHrwxeTRJoN5hX';
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
  const resultSaved=await storeReport(report,selected);
  return reply(res,200,{ok:true,saved:!!resultSaved.saved,alreadySaved:!!resultSaved.duplicate,runId:selected.id,posts:posts.length,costUsd:selected.usageTotalUsd??null,format:'json'});
 }catch(e){console.error('One Way recovery failed',e?.message);return reply(res,e?.status===401||e?.status===403?e.status:503,{error:e?.status===401||e?.status===403?e.message :'Não foi possível recuperar os dados da análise. Confira Apify e Supabase.'});}
};