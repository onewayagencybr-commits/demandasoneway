'use strict';
// Executes exactly one approved post after a one-time server-side authorization.
// The ticket is a random UUID stored in the private database's claim_token.
// No general scheduler enablement or public unauthenticated publishing.
const crypto=require('node:crypto');
const {rest,assertUuid,reply}=require('./social-scheduler-server');
const {publication}=require('./social-run-handler');
module.exports=async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return reply(res,405,{error:'Método não permitido.'});
  try{
    const id=assertUuid(req.body?.id);
    const match=/^Bearer\s+([a-f0-9-]{36})$/i.exec(req.headers.authorization||'');
    if(!match)return reply(res,401,{error:'Autorização temporária necessária.'});
    const ticket=match[1].toLowerCase();
    const records=await rest('/social_post_schedules?id=eq.'+id+'&select=*&limit=1');
    const post=records?.[0];
    if(!post||!post.claim_token)return reply(res,403,{error:'Execução não autorizada.'});
    const expected=String(post.claim_token).toLowerCase();
    if(expected.length!==ticket.length||
      !crypto.timingSafeEqual(Buffer.from(ticket),Buffer.from(expected)))
      return reply(res,403,{error:'Execução não autorizada.'});
    if(post.status!=='scheduled'||!post.approved_at||!post.approved_content_hash||
      !post.media_path||!post.instagram_account_ref||!post.scheduled_at||
      Date.parse(post.scheduled_at)>Date.now())
      return reply(res,409,{error:'Publicação não está pronta para execução.'});
    const age=Date.now()-Date.parse(post.updated_at);
    if(!Number.isFinite(age)||age<0||age>5*60000)
      return reply(res,403,{error:'Autorização de uso único expirada.'});
    // Atomic conditional claim: a second request cannot execute this job.
    const changed=await rest(
      '/social_post_schedules?id=eq.'+id+'&status=eq.scheduled&claim_token=eq.'+ticket,
      'PATCH',{
        status:'publishing',claim_token:null,publishing_started_at:new Date().toISOString(),
        publish_attempts:(post.publish_attempts||0)+1,
        updated_at:new Date().toISOString()
      },{Prefer:'return=representation'});
    if(changed?.length!==1)return reply(res,409,{error:'Execução já iniciada.'});
    try{
      await publication(changed[0]);
      return reply(res,200,{ok:true,status:'published',post_id:id});
    }catch(err){
      // A failed/unknown API result must never be retried without checking Instagram.
      const safeText=String(err?.message||'Falha não identificada').slice(0,170);
      console.error('Manual Instagram publication needs review:',id,safeText);
      try{
        await rest('/social_post_schedules?id=eq.'+id+'&status=eq.publishing','PATCH',{
          last_error:'Revisão manual necessária: '+safeText,
          updated_at:new Date().toISOString()
        });
      }catch(e){console.error('Unable to record manual publishing review:',id,e?.message);}
      return reply(res,202,{ok:false,status:'needs_review',post_id:id});
    }
  }catch(e){
    console.error('One-off publishing dispatch failed:',e?.status||'unhandled');
    return reply(res,503,{error:'Não foi possível iniciar o envio único.'});
  }
};
