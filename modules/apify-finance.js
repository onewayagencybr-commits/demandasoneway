/* One Way - painel do consumo Apify (dados reais da API, USD, somente admin). */
(()=>{
 'use strict';
 let ready=false,busy=false,latest=null;
 const $=id=>document.getElementById(id);
 const money=v=>typeof v==='number'&&Number.isFinite(v)?new Intl.NumberFormat('pt-BR',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:4}).format(v):'Não informado';
 function install(){
  if($('igBudgetPanel'))return;
  const node=document.createElement('section');node.className='ig-panel';node.id='igBudgetPanel';
  node.innerHTML='<div class="ig-results-head ig-budget-title"><div><span class="ig-eyebrow">APIFY · CONTROLE DE CONSUMO</span><h3>Saldo e custos da conta</h3><p class="ig-muted">Valores diretamente da API do Apify, atualizados sob demanda. Moeda: dólar americano (USD).</p></div><button class="ig-secondary" type="button" id="igBudgetRefresh">Atualizar saldo ↻</button></div><div class="ig-budget-metrics" id="igBudgetMetrics"><p class="ig-muted">Buscando informações da conta…</p></div><p class="ig-muted" id="igBudgetNote"></p>';
  const root=$('instagramReportsContent')?.querySelector('.ig-shell'),result=$('igMetrics');
  if(!root||!result)return;
  root.insertBefore(node,result);
  $('igBudgetRefresh').onclick=refresh;
 }
 async function refresh(){
  install();if(busy)return;
  busy=true;$('igBudgetRefresh').disabled=true;
  try{
   if(typeof supabaseClient==='undefined'||!supabaseClient)throw Error('Entre como administrador.');
   const {data,error}=await supabaseClient.auth.getSession();if(error||!data?.session?.access_token)throw Error('Sessão expirada. Faça login novamente.');
   const res=await fetch('/api/apify-budget',{headers:{Authorization:'Bearer '+data.session.access_token},cache:'no-store'});
   const json=await res.json().catch(()=>({}));if(!res.ok)throw Error(json.error||'Não foi possível consultar o Apify.');
   latest=json;
   const cards=[
    ['CONSUMO NESTE CICLO',money(json.monthlyUsageUsd)],
    ['CRÉDITOS INCLUÍDOS RESTANTES¹',money(json.estimatedIncludedCreditsRemainingUsd)],
    ['LIMITE DE USO MENSAL',money(json.usageLimitUsd)],
    ['MARGEM ATÉ O LIMITE',money(json.remainingToUsageLimitUsd)]
   ];
   $('igBudgetMetrics').innerHTML=cards.map(([title,value])=>'<div class="ig-card"><span>'+title+'</span><strong>'+value+'</strong></div>').join('');
   const cycle=json.cycle?.to?new Date(json.cycle.to).toLocaleDateString('pt-BR'):'';
   $('igBudgetNote').textContent='¹ Estimativa: créditos mensais incluídos menos consumo registrado; não inclui recargas separadas. Atualizado às '+new Date(json.asOf).toLocaleString('pt-BR')+(cycle?' · Fim do ciclo: '+cycle:'')+'.';
  }catch(e){$('igBudgetMetrics').innerHTML='<p class="ig-muted">Saldo indisponível no momento: '+String(e.message||'falha na consulta').replace(/[<>]/g,'')+'</p>';$('igBudgetNote').textContent='A coleta de relatórios continua independente desta consulta.';}
  finally{busy=false;$('igBudgetRefresh').disabled=false;}
 }
 function init(){install();if(!ready){ready=true;refresh();}}
 window.igFinance={init,refresh,cost:v=>money(v)};
})();