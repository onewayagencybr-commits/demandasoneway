'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {seal,unseal,sha,assertUuid,appConfig,socialClientKey,assertClient}=require('../lib/social-scheduler-server');
test('Instagram tokens are encrypted before database storage',()=>{
  const before=process.env.META_TOKEN_ENCRYPTION_KEY;
  process.env.META_TOKEN_ENCRYPTION_KEY='11'.repeat(32); // Synthetic test key, NOT a production secret.
  try{
    const token='IG-test-token-should-not-be-visible';
    const first=seal(token),second=seal(token);
    assert.notEqual(first,token);
    assert.notEqual(first,second,'random AES-GCM IV on every encryption');
    assert.equal(unseal(first),token);
    assert.equal(unseal(second),token);
    assert.throws(()=>unseal(first.slice(0,-2)+'xx'));
  }finally{
    if(before===undefined)delete process.env.META_TOKEN_ENCRYPTION_KEY;
    else process.env.META_TOKEN_ENCRYPTION_KEY=before;
  }
});
test('Instagram encryption fails closed when no key is configured',()=>{
  const saved=process.env.META_TOKEN_ENCRYPTION_KEY;
  delete process.env.META_TOKEN_ENCRYPTION_KEY;
  try{assert.throws(()=>seal('demo'),/criptografia/);}
  finally{if(saved!==undefined)process.env.META_TOKEN_ENCRYPTION_KEY=saved;}
});
test('Post approval hashes detect changed captions or files',()=>{
  const info=['Legenda aprovada','post/media.jpg','2026-11-01T22:00:00.000Z','client-123'];
  const approved=sha(info.join('\n'));
  assert.equal(approved,sha(info.join('\n')));
  assert.notEqual(approved,sha(['Legenda alterada',...info.slice(1)].join('\n')));
  assert.notEqual(approved,sha([info[0],'outra-foto.jpg',...info.slice(2)].join('\n')));
});
test('Post ids must be UUID-shaped',()=>{
  assert.equal(assertUuid('04cb24aa-3647-42b1-ac7a-0d86b2d97c1a'),'04cb24aa-3647-42b1-ac7a-0d86b2d97c1a');
  assert.throws(()=>assertUuid('bypass/../../../another-client'),/inválido/);
});
test('Meta redirect is restricted to the official One Way hostname',()=>{
  const saved={
    META_INSTAGRAM_APP_ID:process.env.META_INSTAGRAM_APP_ID,
    META_INSTAGRAM_APP_SECRET:process.env.META_INSTAGRAM_APP_SECRET,
    META_INSTAGRAM_REDIRECT_URI:process.env.META_INSTAGRAM_REDIRECT_URI
  };
  try{
    process.env.META_INSTAGRAM_APP_ID='123456';
    process.env.META_INSTAGRAM_APP_SECRET='synthetic-test-secret';
    process.env.META_INSTAGRAM_REDIRECT_URI='https://wrong.example.com/api/social?action=callback';
    assert.throws(()=>appConfig(),/incorreta/);
    process.env.META_INSTAGRAM_REDIRECT_URI='https://onewaydemandas.vercel.app/api/social';
    assert.equal(appConfig().clientId,'123456');
    process.env.META_INSTAGRAM_REDIRECT_URI='https://onewaydemandas.vercel.app/api/social?action=callback';
    assert.throws(()=>appConfig(),/sem parâmetros/);
  }finally{
    for(const [k,v] of Object.entries(saved)){if(v===undefined)delete process.env[k];else process.env[k]=v;}
  }
});

test('Social clients are resolved per company across multiple departments',async()=>{
  assert.equal(socialClientKey('Cuiabá Leilões'),'cuiaba leiloes');
  assert.equal(socialClientKey('CUIABA - LEILÕES  '),'cuiaba leiloes');
  const data={
    clients:[
      {id:'dept-arte',name:'Cuiabá Leilões',area:'arte'},
      {id:'dept-video',name:'Cuiabá Leilões',area:'video'},
      {id:'dept-old',name:'K- Energy',area:'arte'},
      {id:'dept-merged',name:'Cuiabá Leilões 2',area:'trafego',mergedInto:'dept-arte'}
    ],
    clientDirectory:['Scania - Rota Oeste'],
    archivedClientKeys:['k energy']
  };
  const savedFetch=global.fetch;
  const saved={url:process.env.SUPABASE_URL,key:process.env.SUPABASE_SERVICE_ROLE_KEY};
  process.env.SUPABASE_URL='https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY='sb_secret_example_test_only';
  global.fetch=async()=>({ok:true,status:200,text:async()=>JSON.stringify([{data}])});
  try{
    await assert.doesNotReject(assertClient('client:cuiaba leiloes'));
    await assert.doesNotReject(assertClient('client:scania rota oeste'));
    await assert.doesNotReject(assertClient('dept-video'));
    await assert.rejects(assertClient('client:k energy'),/não encontrado/);
    await assert.rejects(assertClient('dept-old'),/não encontrado/);
    await assert.rejects(assertClient('client:cliente inexistente'),/não encontrado/);
    await assert.rejects(assertClient('dept-merged'),/não encontrado/);
  }finally{
    global.fetch=savedFetch;
    if(saved.url===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=saved.url;
    if(saved.key===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=saved.key;
  }
});

test('Instagram OAuth callbacks are recognized after Meta replaces action selector',()=>{
  const {resolveAction}=require('../api/social');
  const request=(query,method='GET')=>({query,method});
  assert.equal(resolveAction(request({action:'callback',code:'abc',state:'opaque'})),'callback');
  assert.equal(resolveAction(request({code:'abc',state:'opaque'})),'callback');
  assert.equal(resolveAction(request({state:'opaque'})),'callback');
  assert.equal(resolveAction(request({error:'access_denied'})),'callback');
  assert.equal(resolveAction(request({action:'connect'},'POST')),'connect');
  assert.equal(resolveAction(request({})),'');
  assert.equal(resolveAction(request({code:'abc'},'POST')),'');
});

test('Meta OAuth failures expose only safe numeric diagnostics',async()=>{
  const {metaJSON}=require('../lib/social-scheduler-server');
  const old=global.fetch;
  global.fetch=async()=>({
    ok:false,status:400,
    json:async()=>({error:{message:'PRIVATE_TOKEN_DO_NOT_LEAK',code:100,error_subcode:36008}})
  });
  try{
    await assert.rejects(metaJSON('https://api.instagram.com/oauth/access_token'),err=>{
      assert.equal(err.metaHttpStatus,400);
      assert.equal(err.metaReason,'other_meta_rejection');
      assert.equal(err.metaCode,100);
      assert.equal(err.metaSubcode,36008);
      assert.equal(err.message.includes('PRIVATE_TOKEN_DO_NOT_LEAK'),false);
      assert.equal(err.status,502);
      return true;
    });
  }finally{global.fetch=old;}
});

test('Instagram top-level OAuth errors are safely categorized',async()=>{
  const {metaJSON}=require('../lib/social-scheduler-server');
  const original=global.fetch;
  global.fetch=async()=>({ok:false,status:400,json:async()=>({
    error_type:'OAuthException',code:400,
    error_message:'Redirect URI does not match the original redirect_uri'
  })});
  try{await assert.rejects(metaJSON('https://api.instagram.com/oauth/access_token'),err=>{
    assert.equal(err.metaCode,400);
    assert.equal(err.metaReason,'redirect_mismatch');
    assert.equal(err.message.includes('Redirect URI'),false);
    return true;
  });}finally{global.fetch=original;}
});

test('Approval hash accepts equivalent UTC date serializations from Supabase',()=>{
  const {approvalDigest}=require('../lib/social-run-handler');
  const {sha}=require('../lib/social-scheduler-server');
  const input={caption:'Publicação de teste',media_path:'draft/asset.jpg',client_ref:'client:one way agency',scheduled_at:'2026-10-14T19:03:00+00:00'};
  const hash=sha([input.caption,input.media_path,'2026-10-14T19:03:00.000Z',input.client_ref].join(String.fromCharCode(10)));
  assert.equal(approvalDigest(input),hash);
  assert.equal(approvalDigest({...input,scheduled_at:'2026-10-14T19:03:00.000Z'}),hash);
  assert.notEqual(approvalDigest({...input,media_path:'draft/other.jpg'}),hash);
});
