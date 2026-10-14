'use strict';
// Backend-only service helpers for One Way Social Media. Never return service or Meta keys to browsers.
const crypto=require('node:crypto');
const {url,serviceHeaders,requestJSON,reply}=require('./oneway-server');
const base=()=>url()+'/rest/v1';
function assertUuid(s){if(!/^[a-f0-9-]{36}$/i.test(String(s||'')))throw Object.assign(Error('Identificador inválido.'),{status:400});return s;}
function fail(msg,status=400){throw Object.assign(Error(msg),{status});}
async function rest(path,method='GET',body,extra={}) {
  const response=await fetch(base()+path,{method,headers:{...serviceHeaders(),...extra},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
  const text=await response.text(),data=text?(()=>{try{return JSON.parse(text)}catch{return{text}}})():null;
  if(!response.ok)fail('Falha de consulta ao banco ('+response.status+').',response.status);
  return data;
}
// One Way stores one operational client record per work area (arte/video/trafego).
// Social Media must instead identify the business using the canonical, accent-insensitive name.
function socialClientKey(name){
  return String(name||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toLocaleLowerCase('pt-BR').replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
}
async function assertClient(clientRef){
  if(!clientRef||typeof clientRef!=='string'||clientRef.length>180)fail('Selecione um cliente.');
  const rows=await rest('/app_state?id=eq.main&select=data&limit=1');
  const data=rows?.[0]?.data||{};
  const clients=Array.isArray(data.clients)?data.clients:[];
  const directory=Array.isArray(data.clientDirectory)?data.clientDirectory:[];
  const archived=new Set(Array.isArray(data.archivedClientKeys)?data.archivedClientKeys:[]);
  const activeNames=[
    ...clients.filter(c=>c?.name&&!c.mergedInto).map(c=>c.name),
    ...directory
  ].filter(name=>socialClientKey(name)&&!archived.has(socialClientKey(name)));
  const current=new Set(activeNames.map(name=>'client:'+socialClientKey(name)));
  const legacy=clients.some(c=>String(c?.id)===clientRef&&!c.mergedInto
    && !archived.has(socialClientKey(c.name)));
  if(!current.has(clientRef)&&!legacy)fail('Cliente ativo não encontrado no cadastro central.',404);
}
const sha=s=>crypto.createHash('sha256').update(String(s)).digest('hex');
const key=()=>{
  const hex=process.env.META_TOKEN_ENCRYPTION_KEY||'';
  if(!/^[0-9a-fA-F]{64}$/.test(hex))fail('A chave de criptografia da Meta ainda não foi configurada.',503);
  return Buffer.from(hex,'hex');
};
function seal(token){
  const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key(),iv);
  const data=Buffer.concat([cipher.update(String(token),'utf8'),cipher.final()]);
  return [iv.toString('base64url'),cipher.getAuthTag().toString('base64url'),data.toString('base64url')].join('.');
}
function unseal(payload){
  const [a,b,c]=String(payload).split('.');
  if(!a||!b||!c)fail('Token criptografado inválido.',503);
  const decrypt=crypto.createDecipheriv('aes-256-gcm',key(),Buffer.from(a,'base64url'));
  decrypt.setAuthTag(Buffer.from(b,'base64url'));
  return Buffer.concat([decrypt.update(Buffer.from(c,'base64url')),decrypt.final()]).toString('utf8');
}
function appConfig(){
  const clientId=process.env.META_INSTAGRAM_APP_ID||'';
  const clientSecret=process.env.META_INSTAGRAM_APP_SECRET||'';
  const redirect=process.env.META_INSTAGRAM_REDIRECT_URI||'';
  if(!/^\d+$/.test(clientId)||!clientSecret||!redirect.startsWith('https://'))
    fail('A conexão oficial da Meta ainda não está configurada na Vercel.',503);
  if(redirect!=='https://onewaydemandas.vercel.app/api/social')fail('Configure a URL OAuth sem parâmetros: https://onewaydemandas.vercel.app/api/social',503);
  return {clientId,clientSecret,redirect};
}
async function metaJSON(link,options){
  const response=await fetch(link,{...options,signal:AbortSignal.timeout(18000)});
  const body=await response.json().catch(()=>({}));
  if(!response.ok){
    const problem=body&&typeof body.error==='object'?body.error:{};
    // Instagram Login OAuth may return top-level error_type/error_message/code
    // instead of Facebook Graph's nested error object.
    // Map a limited set of known failures to static categories; never log the
    // raw response, codes of authorization, secrets or access tokens.
    const message=String(problem.message||body?.error_message||'').slice(0,1000).toLowerCase();
    const metaReason=/redirect_uri|redirect uri|callback url|callback_uri/.test(message)?'redirect_mismatch'
      :/client_secret|client secret|app secret|secret key/.test(message)?'invalid_app_secret'
      :/client_id|client id|invalid application/.test(message)?'invalid_app_id'
      :/verification code|matching code|already used|invalid code|expired code/.test(message)?'invalid_or_expired_code'
      :'other_meta_rejection';
    const topLevelCode=Number(body?.code);
    const error=Object.assign(new Error('A Meta recusou a solicitação.'),{
      status:502,metaHttpStatus:response.status,
      metaCode:Number.isInteger(problem.code)?problem.code:(Number.isInteger(topLevelCode)?topLevelCode:null),
      metaSubcode:Number.isInteger(problem.error_subcode)?problem.error_subcode:null,
      metaReason
    });
    throw error;
  }
  return body;
}
const noCache=res=>res.setHeader('Cache-Control','no-store');
module.exports={assertUuid,fail,rest,assertClient,socialClientKey,sha,seal,unseal,appConfig,metaJSON,reply,noCache};
