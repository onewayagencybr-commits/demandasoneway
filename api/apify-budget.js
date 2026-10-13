// The account budget is refreshed on demand. Values are in USD, not BRL.
const {admin,apify,reply}=require('../lib/oneway-server');
module.exports=async(req,res)=>{
 if(req.method!=='GET')return reply(res,405,{error:'Método não permitido.'});
 try{
  await admin(req);
  const [limits,user,usage]=await Promise.allSettled([
    apify('/users/me/limits'),apify('/users/me'),apify('/users/me/usage/monthly')
  ]);
  if(limits.status!=='fulfilled')throw limits.reason;
  const l=limits.value.data||{},u=user.status==='fulfilled'?user.value.data||{}:{},m=usage.status==='fulfilled'?usage.value.data||{}:{};
  const used=Number(l.current?.monthlyUsageUsd),cap=Number(l.limits?.maxMonthlyUsageUsd),credits=Number(u.plan?.monthlyUsageCreditsUsd);
  const n=v=>Number.isFinite(v)?v:null;
  return reply(res,200,{
   currency:'USD',asOf:new Date().toISOString(),
   cycle:{from:l.monthlyUsageCycle?.startAt||m.usageCycle?.startAt||null,to:l.monthlyUsageCycle?.endAt||m.usageCycle?.endAt||null},
   monthlyUsageUsd:n(used),usageAfterDiscountUsd:n(Number(m.totalUsageCreditsUsdAfterVolumeDiscount)),
   usageLimitUsd:n(cap),remainingToUsageLimitUsd:Number.isFinite(cap)&&Number.isFinite(used)?Math.max(0,cap-used):null,
   planMonthlyIncludedCreditsUsd:n(credits),estimatedIncludedCreditsRemainingUsd:Number.isFinite(used)&&Number.isFinite(credits)?Math.max(0,credits-used):null,
   accountPlan:u.plan?.id||null,
   note:'Créditos remanescentes são uma estimativa (créditos incluídos menos uso total); não representam saldo bancário, cobranças externas nem recargas avulsas.'
  });
 }catch(e){return reply(res,e.status===401||e.status===403?e.status:502,{error:'Não foi possível consultar o consumo do Apify: '+(e.message||'erro temporário')});}
};