'use strict';
const crypto=require('node:crypto');
const {admin,serviceHeaders,url}=require('./oneway-server');
const {rest,assertUuid,fail,reply}=require('./social-scheduler-server');
module.exports=async(req,res)=>{
  try{
    if(req.method!=='POST')return reply(res,405,{error:'Método não permitido.'});
    await admin(req);
    const id=assertUuid(req.body?.id),size=Number(req.body?.size),mime=req.body?.mime;
    const allow={'image/jpeg':{ext:'jpg',max:10*1048576},'video/mp4':{ext:'mp4',max:45*1048576}};
    if(!allow[mime]||!Number.isSafeInteger(size)||size<=0||size>allow[mime].max)
      fail('Envie JPEG até 10 MB ou MP4 até 45 MB.');
    const rows=await rest('/social_post_schedules?id=eq.'+id+'&select=status&limit=1');
    if(!rows?.length||!['draft','approved','failed','scheduled'].includes(rows[0].status))
      fail('Esta publicação não aceita novos arquivos.',409);
    const path=id+'/'+crypto.randomUUID()+'.'+allow[mime].ext;
    const r=await fetch(url()+'/storage/v1/object/upload/sign/social-posts-temp/'+path,{
      method:'POST',headers:serviceHeaders(),body:'{}',signal:AbortSignal.timeout(15000)
    });
    const data=await r.json().catch(()=>({}));
    if(!r.ok||!data.token)fail('Não foi possível autorizar o upload privado.',503);
    return reply(res,200,{path,token:data.token,mime});
  }catch(e){console.error('Social media upload:',e?.message);
    return reply(res,e.status>=400&&e.status<500?e.status:503,{error:e.status>=400&&e.status<500?e.message:'Erro ao preparar upload privado.'});}
};