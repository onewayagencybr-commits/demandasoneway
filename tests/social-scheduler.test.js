'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {seal,unseal,sha,assertUuid,appConfig}=require('../lib/social-scheduler-server');
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
    process.env.META_INSTAGRAM_REDIRECT_URI='https://onewaydemandas.vercel.app/api/social?action=callback';
    assert.equal(appConfig().clientId,'123456');
  }finally{
    for(const [k,v] of Object.entries(saved)){if(v===undefined)delete process.env[k];else process.env[k]=v;}
  }
});
