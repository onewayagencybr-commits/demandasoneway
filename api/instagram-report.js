// One Way Agency — API protegida de análises do Instagram via Apify.
// Nunca exponha APIFY_TOKEN no HTML, no browser ou no repositório.
const {serviceHeaders}=require('../lib/oneway-server');
const {ensureBucket}=require('../lib/instagram-data-store');
const APIFY = 'https://api.apify.com/v2';
const ACTOR = 'apify~instagram-post-scraper';
const allowedHandle = /^[a-zA-Z0-9._]{1,30}$/;
const allowedRun = /^[a-zA-Z0-9]{12,32}$/;
const day = /^\d{4}-\d{2}-\d{2}$/;

function json(res, code, obj) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.status(code).json(obj);
}
function localISO(x) {
  return new Date(new Date(x).getTime() - 4 * 3600000).toISOString().slice(0,10);
}
function intervalOk(from,to) {
  if (!day.test(from||'') || !day.test(to||'')) return false;
  const a = Date.parse(from+'T12:00:00Z'), b = Date.parse(to+'T12:00:00Z');
  return Number.isFinite(a)&&Number.isFinite(b)&&a<=b&&b-a<=366*86400000&&a>=Date.parse('2020-01-01T00:00:00Z')&&b<=Date.now()+86400000;
}
async function apiFetch(url, opts={}) {
  const response = await fetch(url, {...opts, headers: {'Authorization':`Bearer ${process.env.APIFY_TOKEN}`,'Content-Type':'application/json',...(opts.headers||{})}, signal:AbortSignal.timeout(25000)});
  if (!response.ok) throw new Error(`Apify respondeu HTTP ${response.status}`);
  return response.json();
}
async function authorized(req) {
  const base=process.env.SUPABASE_URL;
  const key=process.env.SUPABASE_PUBLISHABLE_KEY;
  if(!base||!key||!process.env.APIFY_TOKEN) throw Object.assign(new Error('Integração ainda sem variáveis configuradas na Vercel.'),{status:503});
  const match=/^Bearer\s+([\w.\-]+)$/.exec(req.headers.authorization||'');
  if(!match)throw Object.assign(new Error('Entre como administrador antes de gerar relatórios.'),{status:401});
  const headers={'Authorization':`Bearer ${match[1]}`,'apikey':key,'Content-Type':'application/json'};
  const user=await fetch(`${base.replace(/\/$/,'')}/auth/v1/user`,{headers,signal:AbortSignal.timeout(10000)});
  if(!user.ok)throw Object.assign(new Error('Sessão do administrador expirou; faça login novamente.'),{status:401});
  const permission=await fetch(`${base.replace(/\/$/,'')}/rest/v1/rpc/is_app_admin`,{method:'POST',headers,body:'{}',signal:AbortSignal.timeout(10000)});
  if(!permission.ok || (await permission.json())!==true)throw Object.assign(new Error('Acesso permitido apenas a administradores.'),{status:403});
}
module.exports=async function handler(req,res){
  if(!['POST','GET'].includes(req.method))return json(res,405,{error:'Método não permitido.'});
  try {
    await authorized(req);
    if(req.method==='POST'){
      // Evita cobrar outra coleta do Apify quando a chave de gravação está incorreta.
      serviceHeaders();
      await ensureBucket(); // Não cobrar coleta se dados não puderem ser armazenados.
      const {username,from,to,clientName}=req.body||{};
      if(!allowedHandle.test(username||'')||!intervalOk(from,to)) return json(res,400,{error:'Informe usuário e datas válidos (período máximo de 366 dias).'});
      const days=1+(Date.parse(to)-Date.parse(from))/86400000;
      const limit=Math.min(250, Math.max(50,Math.ceil(days*2.7)));
      // The Apify completion webhook generates/stores the PDF, independent of the browser.
      const secret=process.env.CRON_SECRET;
      if(!secret||!process.env.SUPABASE_SERVICE_ROLE_KEY)
        throw Object.assign(new Error('Configure o processamento em segundo plano na Vercel.'),{status:503});
      const safeClient=String(clientName||username).slice(0,100);
      const payload='{"username":'+JSON.stringify(username)+',"from":'+JSON.stringify(from)+',"to":'+JSON.stringify(to)+',"clientName":'+JSON.stringify(safeClient)+',"resource":{{resource}}}';
      const hook=[{eventTypes:['ACTOR.RUN.SUCCEEDED'],requestUrl:'https://onewaydemandas.vercel.app/api/instagram-background',headersTemplate:JSON.stringify({Authorization:'Bearer '+secret}),payloadTemplate:payload}];
      const launch=new URL(`${APIFY}/acts/${ACTOR}/runs`);
      launch.searchParams.set('webhooks',Buffer.from(JSON.stringify(hook)).toString('base64'));
      const resp=await apiFetch(launch.toString(),{method:'POST',body:JSON.stringify({username:[username],resultsLimit:limit,onlyPostsNewerThan:from,dataDetailLevel:'detailedData',skipPinnedPosts:false})});
      const run=resp.data||{};
      if(!run.id)throw new Error('Apify não retornou o identificador da análise.');
      return json(res,200,{runId:run.id,status:run.status||'RUNNING',username,from,to,limit,background:true});
    }
    const {runId,from,to}=req.query||{};
    if(!allowedRun.test(runId||'')||!intervalOk(from,to))return json(res,400,{error:'Parâmetros de consulta inválidos.'});
    const resp=await apiFetch(`${APIFY}/actor-runs/${runId}`);
    const run=resp.data||{};
    if(['FAILED','ABORTED','TIMED-OUT'].includes(run.status))return json(res,200,{status:run.status,error:'A coleta foi interrompida. Tente novamente.'});
    if(run.status!=='SUCCEEDED')return json(res,200,{status:run.status||'RUNNING',costUsd:run.usageTotalUsd??null});
    if(!run.defaultDatasetId)throw new Error('Análise concluída sem dataset.');
    const records=await apiFetch(`${APIFY}/datasets/${run.defaultDatasetId}/items?clean=true&limit=300`);
    if(!Array.isArray(records))throw new Error('Dataset retornou formato inesperado.');
    const windowDays=1+(Date.parse(to)-Date.parse(from))/86400000;
    const requestedLimit=Math.min(250,Math.max(50,Math.ceil(windowDays*2.7)));
    const seen=new Set();
    const posts=[];
    for(const p of records){
      if(!p.timestamp || !p.shortCode)continue;
      const date=localISO(p.timestamp);
      if(date<from||date>to||seen.has(p.shortCode))continue;
      seen.add(p.shortCode);
      const type=p.type==='Video'?'Reel':p.type==='Sidecar'?'Carrossel':'Imagem';
      posts.push({date,shortCode:p.shortCode,type,likes:Math.max(0,Number(p.likesCount)||0),comments:Math.max(0,Number(p.commentsCount)||0),plays:p.videoPlayCount==null?null:Math.max(0,Number(p.videoPlayCount)||0),owner:String(p.ownerUsername||'').slice(0,35),caption:String(p.caption||'').slice(0,800)});
    }
    posts.sort((a,b)=>b.date.localeCompare(a.date));
    return json(res,200,{status:'SUCCEEDED',costUsd:run.usageTotalUsd??null,posts,coverageNote:records.length>=requestedLimit?'Atenção: coleta pode ter atingido o limite de publicações; reduza o período para conferir a cobertura integral.':null});
  }catch(error){
    const code=error.status||500;
    return json(res,code,{error:code===500?'Não foi possível consultar o Apify agora. '+String(error.message||''):error.message});
  }
};