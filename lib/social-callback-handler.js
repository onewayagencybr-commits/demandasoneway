'use strict';
const {rest,appConfig,metaJSON,seal,sha}=require('./social-scheduler-server');
module.exports=async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Referrer-Policy','no-referrer');
  const end=success=>res.redirect(302,'https://onewaydemandas.vercel.app/?instagram_connection='+success);
  if(req.method!=='GET')return res.status(405).end();
  let phase='start';
  try{
    if(req.query?.error)return end('denied');
    const state=String(req.query?.state||''),code=String(req.query?.code||'');
    if(!/^[A-Za-z0-9_-]{30,120}$/.test(state)||!code||code.length>1500)return end('error');
    // Single-use OAuth state; deleted atomically so it cannot be replayed.
    phase='oauth_state';
    const rows=await rest('/social_oauth_states?state_hash=eq.'+encodeURIComponent(sha(state))+'&select=client_ref,expires_at','DELETE',undefined,{Prefer:'return=representation'});
    if(rows?.length!==1||Date.parse(rows[0].expires_at)<=Date.now())return end('expired');
    const {clientId,clientSecret,redirect}=appConfig();
    const form=new URLSearchParams({client_id:clientId,client_secret:clientSecret,grant_type:'authorization_code',redirect_uri:redirect,code:code.replace(/#_$/,'')});
    phase='code_exchange';
    const access=await metaJSON('https://api.instagram.com/oauth/access_token',{method:'POST',body:form});
    const short=access.access_token||access.data?.[0]?.access_token;
    if(!short)throw Error('Meta não retornou acesso de curta duração.');
    const u=new URL('https://graph.instagram.com/access_token');
    u.searchParams.set('grant_type','ig_exchange_token');
    u.searchParams.set('client_secret',clientSecret);
    u.searchParams.set('access_token',short);
    phase='long_token_exchange';
    const long=await metaJSON(u.toString());
    if(!long.access_token||!Number.isFinite(Number(long.expires_in)))throw Error('Não foi possível estender o acesso.');
    const p=new URL('https://graph.instagram.com/me');
    p.searchParams.set('fields','user_id,username');
    p.searchParams.set('access_token',long.access_token);
    phase='profile_lookup';
    const profile=await metaJSON(p.toString());
    const instagram_user_id=String(profile.user_id||profile.id||access.user_id||'');
    const username=String(profile.username||'').replace(/^@/,'').slice(0,60);
    if(!/^[0-9]+$/.test(instagram_user_id)||!username)throw Error('O Instagram não confirmou a conta profissional.');
    const client_ref=rows[0].client_ref;
    phase='connection_save';
    await rest('/social_instagram_accounts?on_conflict=client_ref','POST',{
      client_ref,instagram_user_id,username,
      encrypted_access_token:seal(long.access_token),
      token_expires_at:new Date(Date.now()+Number(long.expires_in)*1000).toISOString(),
      connection_status:'connected',updated_at:new Date().toISOString()
    },{Prefer:'resolution=merge-duplicates,return=minimal'});
    return end('ok');
  }catch(e){
    const safePhase=['start','oauth_state','code_exchange','long_token_exchange','profile_lookup','connection_save'].includes(phase)?phase:'error';
    const details={phase:safePhase,
      http:Number.isInteger(e?.metaHttpStatus)?e.metaHttpStatus:null,
      metaCode:Number.isInteger(e?.metaCode)?e.metaCode:null,
      metaSubcode:Number.isInteger(e?.metaSubcode)?e.metaSubcode:null,
      metaReason:['redirect_mismatch','invalid_app_secret','invalid_app_id','invalid_or_expired_code','other_meta_rejection'].includes(e?.metaReason)?e.metaReason:null,
      category:e?.metaHttpStatus?'meta_api':(e?.status?'backend':'unexpected')};
    console.error('Instagram OAuth callback failed (safe diagnostics):',JSON.stringify(details));
    const notice=({
      code_exchange:'code_exchange_failed',
      long_token_exchange:'long_token_failed',
      profile_lookup:'profile_failed',
      connection_save:'save_failed',
      oauth_state:'state_failed'
    })[safePhase]||'error';
    return end(notice);
  }
};