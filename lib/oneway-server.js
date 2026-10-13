// Backend-only helpers: no service keys are sent to the browser.
const APIFY='https://api.apify.com/v2';
const url=()=>String(process.env.SUPABASE_URL||'').replace(/\/$/,'');
const key=()=>process.env.SUPABASE_SERVICE_ROLE_KEY||'';
const budgetToken=()=>process.env.APIFY_TOKEN||'';
async function requestJSON(full,options={}){
  const r=await fetch(full,{...options,signal:AbortSignal.timeout(25000)});
  const b=await r.json().catch(()=>({}));
  if(!r.ok)throw Object.assign(new Error(String(b?.error?.message||b?.message||`HTTP ${r.status}`)),{status:r.status});
  return b;
}
async function apify(path){
  if(!budgetToken())throw Object.assign(new Error('Token do Apify não configurado.'),{status:503});
  return requestJSON(APIFY+path,{headers:{Authorization:'Bearer '+budgetToken()}});
}
async function admin(req){
  const token=/^Bearer\s+([\w.\-]+)$/.exec(req.headers.authorization||'')?.[1];
  if(!token)throw Object.assign(new Error('Entre como administrador.'),{status:401});
  if(!url()||!process.env.SUPABASE_PUBLISHABLE_KEY)throw Object.assign(new Error('Supabase indisponível.'),{status:503});
  const headers={apikey:process.env.SUPABASE_PUBLISHABLE_KEY,Authorization:'Bearer '+token,'Content-Type':'application/json'};
  await requestJSON(url()+'/auth/v1/user',{headers});
  const allowed=await requestJSON(url()+'/rest/v1/rpc/is_app_admin',{method:'POST',headers,body:'{}'});
  if(allowed!==true)throw Object.assign(new Error('Acesso exclusivo para administradores.'),{status:403});
}
function serviceHeaders(contentType='application/json'){
  if(!url()||!key())throw Object.assign(new Error('Configuração do Supabase incompleta.'),{status:503});
  return {apikey:key(),Authorization:'Bearer '+key(),'Content-Type':contentType};
}
const reply=(res,status,data)=>{res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');return res.status(status).json(data);};
module.exports={APIFY,url,key,requestJSON,apify,admin,serviceHeaders,reply};