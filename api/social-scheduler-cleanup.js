'use strict';
// Daily post-media cleanup. Only published media after safety window; never delete failures.
const crypto=require('node:crypto');
const {url,serviceHeaders}=require('../lib/oneway-server');
const {rest,reply}=require('../lib/social-scheduler-server');
function authorized(req){
 const secret=process.env.CRON_SECRET||'',provided=String(req.headers.authorization||'').replace(/^Bearer\s+/,'');
 const a=Buffer.from(secret),b=Buffer.from(provided);
 return Boolean(secret)&&a.length===b.length&&crypto.timingSafeEqual(a,b);
}
module.exports=async(req,res)=>{
 if(req.method!=='GET')return reply(res,405,{error:'Método não permitido.'});
 if(!authorized(req))return reply(res,401,{error:'Não autorizado.'});
 try{
  const cutoff=new Date(Date.now()-2*3600000).toISOString();
  const rows=await rest('/social_post_schedules?status=eq.published&published_at=lt.'+encodeURIComponent(cutoff)+'&media_deleted_at=is.null&select=id,media_path&limit=100');
  let deleted=0;
  for(const p of rows||[]){
    if(!p.media_path||!String(p.media_path).startsWith(p.id+'/'))continue;
    const r=await fetch(url()+'/storage/v1/object/social-posts-temp',{method:'DELETE',headers:serviceHeaders(),body:JSON.stringify({prefixes:[p.media_path]}),signal:AbortSignal.timeout(20000)});
    if(!r.ok){console.error('Social media storage cleanup error:',p.id,r.status);continue;}
    await rest('/social_post_schedules?id=eq.'+p.id+'&status=eq.published','PATCH',{media_deleted_at:new Date().toISOString(),updated_at:new Date().toISOString()});
    deleted++;
  }
  return reply(res,200,{ok:true,deleted,checked:rows?.length||0});
 }catch(e){console.error('Social scheduler cleanup:',e.message);return reply(res,503,{error:'Falha ao limpar mídias temporárias.'});}
};