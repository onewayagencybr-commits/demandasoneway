'use strict';
// Optional Cron endpoint. Disabled by default. Requires external schedule + CRON_SECRET.
const crypto=require('node:crypto');
const {url,serviceHeaders}=require('./oneway-server');
const {rest,sha,unseal,seal,metaJSON,fail,reply}=require('./social-scheduler-server');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function cronAuthorized(req){
 const provided=String(req.headers.authorization||'').replace(/^Bearer\s+/,'');
 const secret=process.env.CRON_SECRET||'';
 const a=Buffer.from(provided),b=Buffer.from(secret);
 return Boolean(secret)&&a.length===b.length&&crypto.timingSafeEqual(a,b);
}
async function meta(token,path,method='GET',body) {
 const v=(process.env.META_GRAPH_VERSION||'v25.0').replace(/^\/+|\/+$/g,'');
 const endpoint='https://graph.instagram.com/'+v+'/'+path.replace(/^\//,'');
 const opts={method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'}};
 if(body!==undefined)opts.body=JSON.stringify(body);
 return metaJSON(endpoint,opts);
}
async function signedMediaUrl(path){
 const response=await fetch(url()+'/storage/v1/object/sign/social-posts-temp/'+path,{
   method:'POST',headers:serviceHeaders(),body:JSON.stringify({expiresIn:3600}),signal:AbortSignal.timeout(18000)
 });
 const result=await response.json().catch(()=>({}));
 if(!response.ok||!result.signedURL)fail('Falha ao gerar URL temporária do arquivo.');
 return result.signedURL.startsWith('https://')?result.signedURL:url()+'/storage/v1/'+result.signedURL.replace(/^[/]+/,'');
}
async function activeAccount(ref,expectedClient) {
 const x=await rest('/social_instagram_accounts?id=eq.'+encodeURIComponent(ref)+'&select=*&limit=1');
 if(!x?.length||x[0].connection_status!=='connected')fail('Instagram desconectado.');
 if(String(x[0].client_ref)!==String(expectedClient))fail('O Instagram vinculado não pertence a este cliente.');
 let a=x[0],token=unseal(a.encrypted_access_token);
 if(Date.parse(a.token_expires_at)<Date.now())fail('Token expirado; reconecte o Instagram.');
 const age=Date.now()-Date.parse(a.updated_at||a.connected_at);
 if(Date.parse(a.token_expires_at)-Date.now()<7*86400000&&age>=24*3600000){
   const u=new URL('https://graph.instagram.com/refresh_access_token');
   u.searchParams.set('grant_type','ig_refresh_token');u.searchParams.set('access_token',token);
   const next=await metaJSON(u.toString());
   if(next.access_token&&next.expires_in){
     token=next.access_token;
     await rest('/social_instagram_accounts?id=eq.'+a.id,'PATCH',{
       encrypted_access_token:seal(token),token_expires_at:new Date(Date.now()+next.expires_in*1000).toISOString(),updated_at:new Date().toISOString()
     });
   }
 }
 return {user_id:a.instagram_user_id,token};
}
async function publication(post){
 if(post.approved_content_hash!==sha([post.caption,post.media_path,post.scheduled_at,post.client_ref].join('\n')))
    fail('Aprovação inválida para o material atual.');
 if(!post.approved_at||!post.media_path||!post.instagram_account_ref)fail('Agendamento incompleto.');
 const acc=await activeAccount(post.instagram_account_ref,post.client_ref);
 const mediaUrl=await signedMediaUrl(post.media_path);
 const isVideo=post.media_mime_type==='video/mp4';
 if(!isVideo&&post.media_mime_type!=='image/jpeg')fail('Formato não suportado.');
 const container=await meta(acc.token,acc.user_id+'/media','POST',isVideo
   ?{media_type:'REELS',video_url:mediaUrl,caption:post.caption,share_to_feed:true}
   :{image_url:mediaUrl,caption:post.caption});
 if(!container.id)fail('A Meta não retornou o ID de preparação.');
 let ready=false;
 for(let tries=0;tries<8;tries++){
   if(tries)await pause(3500);
   const status=await meta(acc.token,container.id+'?fields=status_code');
   if(status.status_code==='FINISHED'){ready=true;break;}
   if(status.status_code==='ERROR'||status.status_code==='EXPIRED')fail('A Meta não conseguiu processar o arquivo.');
 }
 if(!ready)fail('O Instagram ainda está processando a mídia. Confirme antes de tentar novamente.');
 // After this call, the outcome may be ambiguous if network fails. Never auto-retry.
 const published=await meta(acc.token,acc.user_id+'/media_publish','POST',{creation_id:container.id});
 if(!published.id)fail('A Meta não confirmou o identificador da publicação.');
 let permalink=null;
 try{permalink=(await meta(acc.token,published.id+'?fields=permalink')).permalink||null;}catch{}
 const update=await rest('/social_post_schedules?id=eq.'+post.id+'&status=eq.publishing','PATCH',{
   instagram_media_id:String(published.id),published_permalink:permalink,published_at:new Date().toISOString(),status:'published',last_error:null,updated_at:new Date().toISOString()
 },{Prefer:'return=representation'});
 if(update?.length!==1)fail('Publicação enviada, mas confirmação não persistida. Revisão manual necessária.');
 await rest('/social_post_events','POST',{post_id:post.id,event_type:'published',details:{instagram_media_id:String(published.id)}},{Prefer:'return=minimal'});
}
module.exports=async(req,res)=>{
 if(req.method!=='GET')return reply(res,405,{error:'Método não permitido.'});
 if(!cronAuthorized(req))return reply(res,401,{error:'Não autorizado.'});
 if(process.env.SOCIAL_PUBLISHING_ENABLED!=='true')
   return reply(res,503,{error:'Publicação automática desativada até finalizar testes com a Meta.'});
 let claimed=[];
 try{
   claimed=await rest('/rpc/social_claim_due_posts','POST',{batch_limit:2});
   const result={published:0,needsReview:0};
   for(const post of claimed||[]){
     try{await publication(post);result.published++;}
     catch(e){
       // Don't retry automatically: media_publish might have succeeded remotely.
       const message='Revisão manual necessária: '+String(e.message||'erro').slice(0,250);
       console.error('Social publish uncertain post',post.id,message);
       await rest('/social_post_schedules?id=eq.'+post.id+'&status=eq.publishing','PATCH',{
         last_error:message,updated_at:new Date().toISOString()
       });
       result.needsReview++;
     }
   }
   return reply(res,200,{ok:true,claimed:claimed?.length||0,...result});
 }catch(e){console.error('Social worker:',e?.message);return reply(res,503,{error:'Falha no processamento do agendador.'});}
};