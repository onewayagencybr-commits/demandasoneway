'use strict';
// One Way Social Media: one route serves multiple actions to fit Vercel Hobby
// No public content publishing until migrations, OAuth and secure cron are configured.
const {reply,admin,serviceHeaders,url}=require('../lib/oneway-server');
const {rest}=require('../lib/social-scheduler-server');
const handlers={
  connect:require('../lib/social-connect-handler'),
  callback:require('../lib/social-callback-handler'),
  schedule:require('../lib/social-schedule-handler'),
  upload:require('../lib/social-upload-handler'),
  run:require('../lib/social-run-handler'),
  cleanup:require('../lib/social-cleanup-handler')
};
// Meta may replace the query part of a registered redirect_uri with ?code&state.
// Detect a legitimate OAuth response independently of the optional action selector.
function resolveAction(req){
  const explicit=typeof req.query?.action==='string'?req.query.action:'';
  if(explicit)return explicit;
  if(req.method==='GET'&&(
    typeof req.query?.code==='string'||
    typeof req.query?.state==='string'||
    typeof req.query?.error==='string'
  ))return 'callback';
  return '';
}
module.exports=async function(req,res){
  const action=resolveAction(req);
  if(!action&&req.method==='GET'){
    // Avoid a confusing bare 404 after Meta strips the original query string.
    console.warn('Social OAuth callback without authorization query parameters.');
    return res.redirect(302,'https://onewaydemandas.vercel.app/?instagram_connection=callback_missing');
  }
  if(action==='callback')return handlers.callback(req,res);
  if(action==='run')return handlers.run(req,res);
  if(action==='cleanup')return handlers.cleanup(req,res);
  if(action==='status'){
    if(req.method!=='GET')return reply(res,405,{error:'Método não permitido.'});
    try{
      await admin(req);
      const secretsReady=Boolean(process.env.META_INSTAGRAM_APP_ID&&process.env.META_INSTAGRAM_APP_SECRET&&process.env.META_INSTAGRAM_REDIRECT_URI&&process.env.META_TOKEN_ENCRYPTION_KEY&&process.env.SUPABASE_SERVICE_ROLE_KEY);
      let schemaReady=false,storageReady=false;
      if(process.env.SUPABASE_SERVICE_ROLE_KEY){
        try{
          await rest('/social_instagram_accounts?select=id&limit=1');
          await rest('/social_oauth_states?select=state_hash&limit=1');
          await rest('/social_post_schedules?select=id&limit=1');
          await rest('/social_post_events?select=id&limit=1');
          schemaReady=true;
        }catch(e){console.error('Social schema pending:',e.message);}
        try{
          const r=await fetch(url()+'/storage/v1/object/list/social-posts-temp',{
            method:'POST',headers:serviceHeaders(),body:JSON.stringify({prefix:'',limit:1,offset:0}),signal:AbortSignal.timeout(10000)
          });
          storageReady=r.ok;
        }catch(e){console.error('Social private Storage bucket pending:',e.message);}
      }
      const ready=secretsReady&&schemaReady&&storageReady;
      return reply(res,200,{ready,schemaReady,secretsReady,storageReady,publishingEnabled:process.env.SOCIAL_PUBLISHING_ENABLED==='true'});
    }catch(e){return reply(res,e.status===401||e.status===403?e.status:503,{error:'Não foi possível validar a configuração.'});}
  }
  if(!handlers[action])return reply(res,404,{error:'Rota não encontrada.'});
  return handlers[action](req,res);
};
module.exports.resolveAction=resolveAction;
