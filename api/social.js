'use strict';
// One Way Social Media: one route serves multiple actions to fit Vercel Hobby
// No public content publishing until migrations, OAuth and secure cron are configured.
const {reply,admin}=require('../lib/oneway-server');
const {rest}=require('../lib/social-scheduler-server');
const handlers={
  connect:require('../lib/social-connect-handler'),
  callback:require('../lib/social-callback-handler'),
  schedule:require('../lib/social-schedule-handler'),
  upload:require('../lib/social-upload-handler'),
  run:require('../lib/social-run-handler'),
  cleanup:require('../lib/social-cleanup-handler')
};
module.exports=async function(req,res){
  const action=String(req.query?.action||'');
  if(action==='callback')return handlers.callback(req,res);
  if(action==='run')return handlers.run(req,res);
  if(action==='cleanup')return handlers.cleanup(req,res);
  if(action==='status'){
    if(req.method!=='GET')return reply(res,405,{error:'Método não permitido.'});
    try{
      await admin(req);
      const secretsReady=Boolean(process.env.META_INSTAGRAM_APP_ID&&process.env.META_INSTAGRAM_APP_SECRET&&process.env.META_INSTAGRAM_REDIRECT_URI&&process.env.META_TOKEN_ENCRYPTION_KEY&&process.env.SUPABASE_SERVICE_ROLE_KEY);
      let schemaReady=false;
      try{
        await rest('/social_instagram_accounts?select=id&limit=1');
        await rest('/social_oauth_states?select=state_hash&limit=1');
        await rest('/social_post_schedules?select=id&limit=1');
        schemaReady=true;
      }catch(e){console.error('Social schema pending:',e.message);}
      return reply(res,200,{ready:secretsReady&&schemaReady,schemaReady,secretsReady,publishingEnabled:process.env.SOCIAL_PUBLISHING_ENABLED==='true'});
    }catch(e){return reply(res,e.status===401||e.status===403?e.status:503,{error:'Não foi possível validar a configuração.'});}
  }
  if(!handlers[action])return reply(res,404,{error:'Rota não encontrada.'});
  return handlers[action](req,res);
};