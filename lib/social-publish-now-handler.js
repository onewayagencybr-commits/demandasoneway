'use strict';
// Administrator-initiated publishing of one previously approved Instagram post.
// No global scheduler flag or secret is exposed; each POST is explicitly confirmed
// by the user in the admin UI before hitting this endpoint.
const {admin}=require('./oneway-server');
const {assertUuid,rest,reply,fail}=require('./social-scheduler-server');
const {publication,approvalDigest}=require('./social-run-handler');

async function publishNow(req,res){
  if(req.method!=='POST')return reply(res,405,{error:'Método não permitido.'});
  try{await admin(req);}catch(e){return reply(res,e.status===401||e.status===403?e.status:503,{error:'Acesso restrito à administração.'});}
  try{
    const id=assertUuid(req.body?.id);
    const rows=await rest('/social_post_schedules?id=eq.'+id+'&select=*&limit=1');
    const p=rows?.[0];
    if(!p)return reply(res,404,{error:'Agendamento não encontrado.'});
    if(p.status!=='scheduled'||p.publish_attempts!==0||p.instagram_media_id||
      !p.approved_at||!p.approved_content_hash||!p.media_path||
      !p.instagram_account_ref||!p.scheduled_at)
      return reply(res,409,{error:'Este post não está pronto para publicação manual, ou já foi processado.'});
    if(p.approved_content_hash!==approvalDigest(p))
      return reply(res,409,{error:'A aprovação não corresponde mais ao arquivo ou à legenda. Revise o agendamento.'});

    // Never publish a post under the wrong client's account.
    const account=await rest('/social_instagram_accounts?id=eq.'+
       encodeURIComponent(p.instagram_account_ref)+'&select=client_ref,connection_status&limit=1');
    if(account?.[0]?.connection_status!=='connected'||account[0].client_ref!==p.client_ref)
      return reply(res,409,{error:'O Instagram selecionado não está conectado a este cliente.'});

    // Atomic compare-and-swap: only one request can move scheduled -> publishing.
    const claimed=await rest('/social_post_schedules?id=eq.'+id+
      '&status=eq.scheduled&publish_attempts=eq.0&instagram_media_id=is.null',
      'PATCH',{
        status:'publishing',claim_token:null,publishing_started_at:new Date().toISOString(),
        publish_attempts:1,updated_at:new Date().toISOString()
      },{Prefer:'return=representation'});
    if(claimed?.length!==1)return reply(res,409,{error:'Este envio já foi iniciado. Atualize a lista.'});

    try{
      await publication(claimed[0]);
      const updated=await rest('/social_post_schedules?id=eq.'+id+
        '&select=id,status,published_permalink,instagram_media_id&limit=1');
      return reply(res,200,{ok:true,post:updated?.[0]});
    }catch(e){
      // Network failure after Meta publishing can be ambiguous: do not auto-retry.
      console.error('Manual Instagram publish needs review:',id,
        String(e?.message||'Erro').slice(0,120));
      try{await rest('/social_post_schedules?id=eq.'+id+'&status=eq.publishing',
        'PATCH',{last_error:'Revisão manual necessária: '+String(e?.message||'erro').slice(0,150),
         updated_at:new Date().toISOString()});}
      catch(saveError){console.error('Could not save manual publication warning',id);}
      return reply(res,202,{ok:false,status:'needs_review',post_id:id});
    }
  }catch(e){
    const code=[400,401,403,404,409].includes(e?.status)?e.status:503;
    console.error('Manual publish request rejected:',code);
    return reply(res,code,{error:code===503?'O servidor não conseguiu preparar esta publicação.':String(e?.message||'Agendamento inválido.')});
  }
}
module.exports=publishNow;
