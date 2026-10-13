/* Vercel Cron — remove análises JSON com mais de 30 dias e PDFs antigos expirados.
   Variáveis privadas: CRON_SECRET e SUPABASE_SERVICE_ROLE_KEY.
   Usa a Storage API oficial para apagar arquivo físico + metadados.
*/
const {timingSafeEqual}=require('node:crypto');
const {serviceHeaders}=require('../lib/oneway-server');
const collections=[{bucket:'oneway-instagram-data',prefix:'reports/',ext:'.json'},{bucket:'oneway-instagram-reports',prefix:'instagram/',ext:'.pdf'}];
const RETENTION_MS=30*86400000;
const ok=(req,secret)=>{
 const token=(req.headers.authorization||'').replace(/^Bearer\s+/,'');
 const a=Buffer.from(token),b=Buffer.from(secret);
 return a.length===b.length&&timingSafeEqual(a,b);
};
const respond=(res,status,json)=>{res.setHeader('Cache-Control','no-store');return res.status(status).json(json);};
module.exports=async function handler(req,res){
 if(req.method!=='GET')return respond(res,405,{error:'Método inválido.'});
 const cron=process.env.CRON_SECRET||'',key=process.env.SUPABASE_SERVICE_ROLE_KEY||'',base=process.env.SUPABASE_URL||'';
 if(!cron||!key||!base)return respond(res,503,{error:'Agendamento ainda sem as variáveis seguras configuradas.'});
 if(!ok(req,cron))return respond(res,401,{error:'Não autorizado.'});
 const root=base.replace(/\/$/,'')+'/storage/v1/object';
 let hdr;try{hdr=serviceHeaders();}catch(e){return respond(res,e.status||503,{error:e.message});}
 const call=async(path,method,body)=>{
   const r=await fetch(root+path,{method,headers:hdr,body:JSON.stringify(body),signal:AbortSignal.timeout(25000)});
   const json=await r.json().catch(()=>({}));
   if(!r.ok)throw Error('Supabase Storage respondeu '+r.status+': '+String(json.message||json.error||'erro'));
   return json;
 };
 try{
   const now=Date.now(),removed={json:0,legacyPdf:0};
   for(const group of collections){
    const old=[];
    for(let offset=0;offset<5000;offset+=100){
      const response=await fetch(root+'/list/'+group.bucket,{method:'POST',headers:hdr,body:JSON.stringify({prefix:group.prefix,limit:100,offset,sortBy:{column:'created_at',order:'asc'}}),signal:AbortSignal.timeout(25000)});
      if(response.status===404)break; // novo bucket ainda não criado
      if(!response.ok)throw Error('Listagem de dados retornou '+response.status);
      const items=await response.json();
      if(!Array.isArray(items))throw Error('Resposta de listagem inválida.');
      for(const p of items){
       const ms=Date.parse(p.created_at||'');
       if(p.name?.endsWith(group.ext)&&Number.isFinite(ms)&&now-ms>=RETENTION_MS)old.push(group.prefix+p.name);
      }
      if(items.length<100)break;
    }
    for(let i=0;i<old.length;i+=100){
     await call('/'+group.bucket,'DELETE',{prefixes:old.slice(i,i+100)});
    }
    removed[group.ext==='.json'?'json':'legacyPdf']=old.length;
   }
   return respond(res,200,{ok:true,deleted:removed,total:removed.json+removed.legacyPdf,expiresAfterDays:30});
 }catch(e){console.error('One Way report cleanup:',e);return respond(res,500,{error:'Falha ao excluir relatórios expirados.'});}
};
