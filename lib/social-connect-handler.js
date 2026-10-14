'use strict';
const crypto=require('node:crypto');
const {admin}=require('./oneway-server');
const {rest,assertClient,sha,appConfig,reply}=require('./social-scheduler-server');
module.exports=async(req,res)=>{
  try {
    if(!['GET','POST'].includes(req.method))return reply(res,405,{error:'Método não permitido.'});
    await admin(req);
    if(req.method==='GET'){
      const ids=await rest('/social_instagram_accounts?select=client_ref,username,connection_status,token_expires_at,connected_at&order=connected_at.desc');
      return reply(res,200,{accounts:ids||[],oauthConfigured:Boolean(process.env.META_INSTAGRAM_APP_ID&&process.env.META_INSTAGRAM_APP_SECRET&&process.env.META_TOKEN_ENCRYPTION_KEY)});
    }
    const client_ref=req.body?.client_ref;
    await assertClient(client_ref);
    const {clientId,redirect}=appConfig();
    const state=crypto.randomBytes(32).toString('base64url');
    await rest('/social_oauth_states','POST',{state_hash:sha(state),client_ref,expires_at:new Date(Date.now()+10*60000).toISOString()},{Prefer:'return=minimal'});
    const target=new URL('https://www.instagram.com/oauth/authorize');
    for(const [k,v] of Object.entries({
      client_id:clientId,redirect_uri:redirect,response_type:'code',
      scope:'instagram_business_basic,instagram_business_content_publish',
      state,enable_fb_login:'0',force_authentication:'1'
    }))target.searchParams.set(k,v);
    return reply(res,200,{authorization_url:target.toString()});
  }catch(e){
    console.error('Social Instagram connect:',e?.message);
    return reply(res,e.status>=400&&e.status<500?e.status:503,{error:e.status===401||e.status===403?e.message:'Conexão indisponível. Confira a configuração da Meta e a migração do banco.'});
  }
};