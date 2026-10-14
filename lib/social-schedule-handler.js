'use strict';
const {admin,serviceHeaders,url}=require('./oneway-server');
const {rest,assertUuid,assertClient,sha,fail,reply}=require('./social-scheduler-server');
const POST_FIELDS='id,client_ref,instagram_account_ref,media_path,media_mime_type,caption,scheduled_at,timezone,approved_at,status,publish_attempts,instagram_media_id,published_permalink,published_at,last_error,created_at';
async function uploaded(path) {
  const response=await fetch(url()+'/storage/v1/object/info/social-posts-temp/'+path,{
    headers:serviceHeaders(),signal:AbortSignal.timeout(15000)
  });
  if(!response.ok)fail('O arquivo não foi encontrado no Storage privado. Reenvie a mídia.',400);
}
module.exports=async(req,res)=>{
  try{
    if(!['GET','POST','PATCH'].includes(req.method))return reply(res,405,{error:'Método não permitido.'});
    await admin(req);
    if(req.method==='GET'){
      const rows=await rest('/social_post_schedules?select='+POST_FIELDS+'&order=created_at.desc&limit=150');
      return reply(res,200,{posts:rows||[]});
    }
    if(req.method==='POST'){
      const client_ref=String(req.body?.client_ref||'');
      await assertClient(client_ref);
      const rows=await rest('/social_post_schedules','POST',{client_ref,status:'draft'},{
        Prefer:'return=representation'
      });
      return reply(res,201,{post:rows[0]});
    }
    const id=assertUuid(req.body?.id);
    const rows=await rest('/social_post_schedules?id=eq.'+id+'&select='+POST_FIELDS+'&limit=1');
    const original=rows?.[0];
    if(!original)fail('Agendamento não encontrado.',404);
    if(['publishing','published'].includes(original.status))fail('Esta publicação já está em processamento ou foi publicada.',409);
    const action=String(req.body?.action||'');
    if(action==='cancel'){
      const done=await rest('/social_post_schedules?id=eq.'+id+'&status=in.(draft,awaiting_approval,approved,failed,scheduled)','PATCH',
        {status:'canceled',updated_at:new Date().toISOString()},{Prefer:'return=representation'});
      if(done?.length!==1)fail('A publicação já começou a ser processada ou foi cancelada.',409);
      await rest('/social_post_events','POST',{post_id:id,event_type:'canceled',details:{previous_status:original.status}},{Prefer:'return=minimal'});
      return reply(res,200,{post:done[0]});
    }
    if(action!=='schedule')fail('Ação inválida.');
    const caption=String(req.body?.caption??'').trim();
    const scheduled_at=String(req.body?.scheduled_at||'');
    const media_path=String(req.body?.media_path||'');
    const media_mime_type=String(req.body?.media_mime_type||'');
    const approved=req.body?.approved===true;
    if(!caption||caption.length>2200)fail('Escreva uma legenda de até 2200 caracteres.');
    if(!approved)fail('Confirme a aprovação recebida pelo WhatsApp.');
    if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(scheduled_at)||!Number.isFinite(Date.parse(scheduled_at))||Date.parse(scheduled_at)<Date.now()+60000)fail('Escolha um horário futuro para publicar.');
    if(!media_path.startsWith(id+'/')||!/^[-a-f0-9/]+\.(jpg|mp4)$/.test(media_path))
      fail('Arquivo inválido para esta publicação.');
    if(!['image/jpeg','video/mp4'].includes(media_mime_type))fail('Use JPEG ou MP4 para publicar.');
    await uploaded(media_path);
    const accounts=await rest('/social_instagram_accounts?client_ref=eq.'+encodeURIComponent(original.client_ref)+'&select=id,connection_status,token_expires_at&limit=1');
    const account=accounts?.[0];
    if(!account||account.connection_status!=='connected')fail('Conecte o Instagram deste cliente antes de agendar.');
    if(Date.parse(account.token_expires_at)<Date.parse(scheduled_at))fail('O acesso do Instagram expirará antes da data escolhida. Reconecte a conta ou agende para uma data anterior.');
    const time=new Date().toISOString(),digest=sha([caption,media_path,scheduled_at,original.client_ref].join('\n'));
    // status remains scheduled; the worker is separately gated and not deployed in production yet.
    const upd={caption,scheduled_at,media_path,media_mime_type,instagram_account_ref:account.id,
      status:'scheduled',approved_at:time,approved_by:'WhatsApp (registro manual)',approved_content_hash:digest,
      updated_at:time,last_error:null};
    const done=await rest('/social_post_schedules?id=eq.'+id+'&status=in.(draft,awaiting_approval,approved,failed,scheduled)','PATCH',upd,{Prefer:'return=representation'});
    if(done?.length!==1)fail('O agendamento foi alterado por outra operação. Atualize a página.',409);
    if(original.media_path&&original.media_path!==media_path&&original.media_path.startsWith(id+'/')){
      try{
        const removed=await fetch(url()+'/storage/v1/object/social-posts-temp',{
          method:'DELETE',headers:serviceHeaders(),body:JSON.stringify({prefixes:[original.media_path]}),
          signal:AbortSignal.timeout(15000)
        });
        if(!removed.ok)console.error('Old social media file cleanup deferred:',id,removed.status);
      }catch(e){console.error('Old social media file cleanup deferred:',id,e.message);}
    }
    await rest('/social_post_events','POST',{post_id:id,event_type:'schedule_approved',actor_ref:'One Way admin',details:{scheduled_at,client_ref:original.client_ref}},{Prefer:'return=minimal'});
    return reply(res,200,{post:done[0]});
  }catch(e){
    console.error('Social post API:',e?.message);
    return reply(res,e.status>=400&&e.status<500?e.status:503,{error:e.status>=400&&e.status<500?e.message:'Não foi possível salvar o agendamento. Confira a conexão do Supabase.'});
  }
};