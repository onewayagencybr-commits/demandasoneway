/* One Way Agency — Área de Relatórios Instagram. Sem dependência de estado do sistema. */
(() => {
  'use strict';
  let report = null, running = false, initialized = false;
  const $ = (id) => document.getElementById(id);
  const fmt = (n) => Math.round(Number(n)||0).toLocaleString('pt-BR');
  const esc = (s) => String(s??'').replace(/[&<>"']/g, v=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[v]));
  const normalize = s => String(s||'').trim().replace(/^@/,'').toLowerCase();
  const dateString = d => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`; };
  function notify(message, error=false) { const el=$('igStatus'); if(!el)return;el.textContent=message;el.style.color=error?'#ffc1c8':'#cbd9ff'; }
  function dates(){ const to=new Date(), from=new Date(to); from.setDate(from.getDate()-29); return {from:dateString(from),to:dateString(to)}; }
  function storedClients(){ try{return JSON.parse(localStorage.getItem('oneway-ig-profiles-v1')||'{}')}catch{return{}} }
  function clientNames(){
    if(typeof state==='undefined'||!Array.isArray(state.clients))return[];
    return [...new Set(state.clients.map(c=>String(c.name||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
  }
  function rememberClient(){ const c=$('igClient').value.trim(), user=normalize($('igUsername').value); if(!c||!user)return;const map=storedClients();map[c]=user;localStorage.setItem('oneway-ig-profiles-v1',JSON.stringify(map)); }
  async function token(){
    if(typeof supabaseClient==='undefined'||!supabaseClient)throw new Error('Entre com seu login de administrador do Supabase.');
    const {data,error}=await supabaseClient.auth.getSession();
    const bearer=data?.session?.access_token;
    if(error||!bearer)throw new Error('Sua sessão de administrador não está ativa. Faça login novamente.');
    return bearer;
  }
  async function request(url, opts={}){
    const bearer=await token();
    const res=await fetch(url,{...opts,headers:{'Content-Type':'application/json','Authorization':`Bearer ${bearer}`,...(opts.headers||{})},cache:'no-store'});
    const body=await res.json().catch(()=>({}));
    if(!res.ok)throw new Error(body.error||'Serviço temporariamente indisponível.');
    return body;
  }
  function renderResult(){
    if(!report) return;
    const posts=report.posts, interactions=posts.reduce((n,p)=>n+p.likes+p.comments,0), plays=posts.reduce((n,p)=>n+(p.plays??0),0);
    const reels=posts.filter(p=>p.type==='Reel').length;
    $('igMetrics').classList.remove('hidden');
    $('igRankingPanel').classList.remove('hidden');
    $('igMetrics').innerHTML=[['Publicações',fmt(posts.length)],['Interações públicas',fmt(interactions)],['Reproduções',fmt(plays)],['Reels',fmt(reels)]].map(([label,value])=>`<div class="ig-card"><span>${label}</span><strong>${value}</strong></div>`).join('');
    $('igCount').textContent=`${fmt(posts.length)} publicações no período`;
    const rank=[...posts].sort((a,b)=>(b.likes+b.comments)-(a.likes+a.comments)).slice(0,8);
    $('igRanking').innerHTML=rank.map(p=>`<tr><td>${esc(p.date.split('-').reverse().join('/'))}</td><td>${esc(p.type)}</td><td>${fmt(p.likes+p.comments)}</td><td>${p.plays==null?'—':fmt(p.plays)}</td><td><a target="_blank" rel="noopener noreferrer" href="https://www.instagram.com/${p.type==='Reel'?'reel':'p'}/${encodeURIComponent(p.shortCode)}/">Abrir ↗</a></td></tr>`).join('');
    $('igCoverage').textContent=report.coverageNote||'';
    if(report.costUsd!=null){$('igCoverage').textContent=($('igCoverage').textContent||'')+' · Custo efetivo da execução: '+(window.igFinance?.cost(report.costUsd)||('USD '+Number(report.costUsd).toFixed(4)));}
    $('igDownload').disabled=false;
  }
  const wait=(ms)=>new Promise(resolve=>setTimeout(resolve,ms));
  async function generate(){
    if(running)return;
    const username=normalize($('igUsername').value),from=$('igFrom').value,to=$('igTo').value;
    if(!/^[a-z0-9._]{1,30}$/.test(username))return notify('Informe um perfil válido, como @abelcarames.',true);
    if(!from||!to||from>to)return notify('Confira o intervalo de datas.',true);
    if(window.igReportLibrary?.findSaved(username,from,to)&&!confirm('Já existem dados salvos para este perfil e período. Deseja refazer a coleta e gerar novo custo no Apify?'))return;
    running=true;report=null;$('igGenerate').disabled=true;$('igDownload').disabled=true;
    $('igMetrics').classList.add('hidden');$('igRankingPanel').classList.add('hidden');
    rememberClient();
    try{
      notify('Solicitando coleta ao Apify…');
      const start=await request('/api/instagram-report',{method:'POST',keepalive:true,body:JSON.stringify({username,from,to,clientName:$('igClient').value.trim()||username})});
      localStorage.setItem('oneway-ig-run-v1',JSON.stringify({runId:start.runId,username,from,to,clientName:$('igClient').value.trim()||username,startedAt:Date.now()}));
      notify('Análise solicitada! O Apify continuará trabalhando e salvará os dados na biblioteca, mesmo que você feche esta aba.');
      let output;
      for(let count=0;count<48;count++){
        if(count)await wait(5000);
        output=await request(`/api/instagram-report?runId=${encodeURIComponent(start.runId)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
        if(output.status==='SUCCEEDED')break;
        if(['FAILED','ABORTED','TIMED-OUT'].includes(output.status))throw new Error(output.error||'A consulta do Apify falhou.');
        notify('Coleta em andamento. Pode fechar esta aba: os dados serão salvos automaticamente em Relatórios salvos.');
      }
      if(output?.status!=='SUCCEEDED')throw new Error('A análise ainda está em processamento. Você pode solicitar novamente mais tarde.');
      report={username,from,to,clientName:$('igClient').value.trim()||username,posts:output.posts,coverageNote:output.coverageNote,background:start.background,costUsd:output.costUsd};
      localStorage.removeItem('oneway-ig-run-v1');
      renderResult();notify('Coleta concluída! Custo desta análise: '+(window.igFinance?.cost(output.costUsd)||'Não informado')+'. Os dados estão sendo salvos automaticamente. Você pode fechar esta aba.');
      window.igFinance?.refresh();setTimeout(()=>window.igReportLibrary?.refresh(),5000);
    }catch(err){notify(err.message||'Não foi possível concluir.',true)}finally{running=false;$('igGenerate').disabled=false}
  }

  function monthly(posts){
    const map=new Map();
    for(const p of posts){const key=p.date.slice(0,7);if(!map.has(key))map.set(key,{month:key,count:0,likes:0,comments:0,plays:0});const d=map.get(key);d.count++;d.likes+=p.likes;d.comments+=p.comments;d.plays+=p.plays??0;}
    return [...map.values()].sort((a,b)=>a.month.localeCompare(b.month));
  }
  function makePages(data,logo){
    const W=1100,H=1556,pages=[];
    const C={navy:'#102648',navy2:'#244777',card:'#2b4c7d',line:'#45628c',white:'#f9fbff',muted:'#bfcfeb',soft:'#96add4',accent:'#b5c8fb'};
    const e=(s)=>String(s||'');
    const font=(ctx,size=22,weight=300)=>{ctx.font=`${weight} ${size}px Montserrat, sans-serif`};
    const txt=(ctx,s,x,y,size=22,color=C.white,weight=300,align='left')=>{font(ctx,size,weight);ctx.fillStyle=color;ctx.textAlign=align;ctx.fillText(e(s),x,y)};
    const rect=(ctx,x,y,w,h,r=20,fill=C.card)=>{ctx.fillStyle=fill;ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill()};
    const wrap=(ctx,s,x,y,w,size=18,leading=29,color=C.muted,weight=300,linesMax=4)=>{
      font(ctx,size,weight);ctx.textAlign='left';let line='',lines=0;
      for(const word of e(s).split(/\s+/)){
        const next=(line+' '+word).trim();
        if(ctx.measureText(next).width>w&&line){txt(ctx,line,x,y+leading*lines,size,color,weight);line=word;lines++;if(lines>=linesMax)return y+leading*lines}
        else line=next;
      }
      if(line){txt(ctx,line,x,y+leading*lines,size,color,weight);lines++}return y+leading*lines;
    };
    function base(title,sub){
      const cv=document.createElement('canvas');cv.width=W;cv.height=H;
      const ctx=cv.getContext('2d');const g=ctx.createLinearGradient(0,0,W,H);g.addColorStop(0,C.navy);g.addColorStop(1,C.navy2);ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
      if(logo?.naturalWidth && logo?.naturalHeight){const h=70,w=Math.min(195,h*logo.naturalWidth/logo.naturalHeight);ctx.drawImage(logo,76,46,w,h)}else{txt(ctx,'ONE WAY',76,92,38,C.accent,600);txt(ctx,'AGENCY',77,113,12,C.soft,500)}
      txt(ctx,title,76,235,46,C.white,300);
      if(sub)wrap(ctx,sub,77,282,W-160,20,34,C.muted,300,2);
      pages.push(cv);return ctx;
    }
    const posts=data.posts||[], rank=[...posts].sort((a,b)=>(b.likes+b.comments)-(a.likes+a.comments));
    const total=(key)=>posts.reduce((n,p)=>n+(Number(p[key])||0),0);
    const totalLikes=total('likes'),totalComments=total('comments'),totalPlays=total('plays'),totalEng=totalLikes+totalComments;
    const reels=posts.filter(p=>p.type==='Reel').length, carousel=posts.filter(p=>p.type==='Carrossel').length,images=posts.filter(p=>p.type==='Imagem').length;
    const mo=monthly(posts),sorted=posts.map(p=>p.likes+p.comments).sort((a,b)=>a-b),median=sorted.length?(sorted.length%2?sorted[Math.floor(sorted.length/2)]:(sorted[sorted.length/2-1]+sorted[sorted.length/2])/2):0;
    let ctx=base(data.clientName,'@'+data.username+'  ·  '+data.from.split('-').reverse().join('/')+' a '+data.to.split('-').reverse().join('/'));
    const metrics=[['PUBLICAÇÕES',posts.length],['INTERAÇÕES',totalEng],['REPRODUÇÕES',totalPlays]];
    metrics.forEach(([label,n],i)=>{const x=75+i*324;rect(ctx,x,355,303,160);txt(ctx,fmt(n),x+19,439,41,C.white,400);txt(ctx,label,x+21,484,15,C.muted,500)});
    txt(ctx,`Curtidas ${fmt(totalLikes)}   •   Comentários ${fmt(totalComments)}`,78,560,21,C.muted,300);
    txt(ctx,'RESULTADOS MENSAIS',77,664,24,C.white,500);
    rect(ctx,74,700,950,53,8,'#19385f');[['Mês',95],['Posts',392],['Curtidas',534],['Coment.',705],['Interações',867]].forEach(([t,x])=>txt(ctx,t,x,735,16,C.muted,500));
    mo.forEach((m,i)=>{const y=797+i*65;const label=new Date(m.month+'-03T12:00:00').toLocaleDateString('pt-BR',{month:'long',year:'numeric'});txt(ctx,label,93,y,18,C.white);txt(ctx,fmt(m.count),390,y,18,C.white);txt(ctx,fmt(m.likes),530,y,18,C.white);txt(ctx,fmt(m.comments),704,y,18,C.white);txt(ctx,fmt(m.likes+m.comments),861,y,18,C.white);ctx.strokeStyle=C.line;ctx.beginPath();ctx.moveTo(78,y+22);ctx.lineTo(1017,y+22);ctx.stroke()});
    const yFormat=Math.min(1150,800+mo.length*65+70);txt(ctx,'FORMATOS PUBLICADOS',77,yFormat,24,C.white,500);
    [['REELS',reels],['CARROSSÉIS',carousel],['ESTÁTICOS',images]].forEach(([label,n],i)=>{const x=76+i*325;rect(ctx,x,yFormat+38,304,120);txt(ctx,fmt(n),x+19,yFormat+106,39,C.white,400);txt(ctx,label,x+20,yFormat+142,13,C.muted,500)});
    ctx=base('Conteúdos de destaque','Publicações com maior volume de curtidas e comentários.');
    const top=rank.slice(0,5);
    top.forEach((p,i)=>{const y=340+i*198;rect(ctx,77,y,946,169,18,'#1d3b65');txt(ctx,String(i+1).padStart(2,'0'),103,y+64,43,C.accent,400);const caption=(p.caption||'Publicação').replace(/\s+/g,' ');wrap(ctx,caption,202,y+52,765,21,28,C.white,400,2);txt(ctx,`${p.date.split('-').reverse().join('/')}   •   ${p.type}`,202,y+114,18,C.muted);txt(ctx,`${fmt(p.likes+p.comments)} interações   •   ${fmt(p.plays||0)} reproduções`,202,y+146,18,C.soft);txt(ctx,'ABRIR PUBLICAÇÃO ↗',836,y+146,14,C.accent,500)});
    if(!top.length)txt(ctx,'Nenhuma publicação encontrada nesse período.',80,390,25,C.muted);
    ctx=base('Leitura estratégica','O que os números sugerem para o próximo ciclo.');
    let y=355;
    const share=totalEng?((rank[0]?.likes+rank[0]?.comments||0)*100/totalEng):0;
    const insight=[
      ['DESTAQUE',`O conteúdo líder representa ${share.toFixed(1).replace('.',',')}% das interações do período.`],
      ['FORMATO',`${reels} Reels em ${posts.length} publicações. O vídeo pode continuar como formato prioritário.`],
      ['CONSISTÊNCIA',`Mediana de ${fmt(median)} interações por conteúdo. A mediana ajuda a compreender o resultado típico sem o peso de um viral.`],
      ['DIREÇÃO', 'Reaproveitar assuntos e aberturas dos melhores vídeos, com testes de séries, roteiros curtos e chamadas claras para comentários.']
    ];
    insight.forEach(([label,detail])=>{rect(ctx,76,y,947,185,19,'#1d3b65');txt(ctx,label,106,y+51,16,C.accent,500);wrap(ctx,detail,106,y+102,865,21,32,C.white,300,2);y+=220;});
    txt(ctx,'ONE WAY  /  ESTRATÉGIA · CRIAÇÃO · CONEXÃO',77,1395,16,C.accent,500);
    return pages;
  }
  async function buildPDFBlob(data){
    if(!data||!Array.isArray(data.posts))throw Error('Informações da análise indisponíveis.');
    if(document.fonts?.load)await Promise.allSettled([document.fonts.load('300 46px Montserrat'),document.fonts.load('500 16px Montserrat')]);
    const logo=await new Promise(resolve=>{
      const im=new Image(),timeout=setTimeout(()=>resolve(null),3500);
      im.onload=()=>{clearTimeout(timeout);resolve(im)};
      im.onerror=()=>{clearTimeout(timeout);resolve(null)};
      im.src='/oneway-logo.png';
    });
    if(!window.onewayInstagramPDF?.build)throw Error('Gerador de PDFs indisponível. Atualize a página.');
    const blob=window.onewayInstagramPDF.build(makePages(data,logo),data.posts);
    if(blob.size<5000)throw Error('Não foi possível finalizar o PDF. Tente novamente.');
    return blob;
  }
  window.igPdfFromData=buildPDFBlob;
  window.igShowSavedData=data=>{
    if(!data||!Array.isArray(data.posts))return;
    report=data;
    $('igClient').value=data.clientName||data.username;
    $('igUsername').value='@'+data.username;
    $('igFrom').value=data.from;$('igTo').value=data.to;
    renderResult();
    notify('Análise restaurada a partir dos dados salvos. Nenhum crédito Apify foi consumido.');
  };
  async function download(){
    if(!report)return;
    const btn=$('igDownload');btn.disabled=true;
    notify('Montando o PDF a partir dos dados. Nenhum PDF será armazenado no Supabase…');
    try{
      const blob=await buildPDFBlob(report);
      const url=URL.createObjectURL(blob),link=document.createElement('a');
      link.href=url;
      link.download='One_Way_Instagram_'+report.username.replace(/[^a-z0-9_]/gi,'_')+'_'+report.from+'_a_'+report.to+'.pdf';
      document.body.appendChild(link);link.click();link.remove();
      setTimeout(()=>URL.revokeObjectURL(url),90000);
      notify('PDF baixado. A biblioteca guarda somente os dados da análise, por 30 dias.');
    }catch(err){console.error('Gerador de PDF Instagram:',err);notify(err?.message||'Falha ao montar o PDF.',true);}
    finally{btn.disabled=false;}
  }

  window.igRender=function(){
    if(!initialized){initialized=true;
      const d=dates();$('igFrom').value=d.from;$('igTo').value=d.to;
      $('igGenerate').addEventListener('click',generate);
      $('igDownload').addEventListener('click',download);
      $('igRecover')?.addEventListener('click',async()=>{
        const username=normalize($('igUsername').value),from=$('igFrom').value,to=$('igTo').value;
        if(!/^[a-z0-9._]{1,30}$/.test(username)||!from||!to||from>to){
          notify('Escolha o perfil e as datas exatas da análise anterior.',true);return;
        }
        const button=$('igRecover');
        button.disabled=true;button.textContent='Recuperando…';
        try{
          notify('Procurando a coleta anterior no Apify, sem iniciar uma nova análise e sem cobrar outra execução…');
          const result=await request('/api/instagram-recover',{method:'POST',body:JSON.stringify({
            username,from,to,clientName:$('igClient').value.trim()||username
          })});
          notify((result.alreadySaved?'Análise anterior já estava salva. ':'Dados da análise recuperados! ')+'Nenhuma nova coleta do Apify foi executada.');
          if(window.igReportLibrary?.refresh)await window.igReportLibrary.refresh();
        }catch(err){notify(err.message||'A recuperação ainda não foi concluída.',true);}
        finally{button.disabled=false;button.textContent='Recuperar análise sem custo';}
      });
      $('igLast30').addEventListener('click',()=>{const d=dates();$('igFrom').value=d.from;$('igTo').value=d.to});
      $('igSinceJuly').textContent='Últimos 3 meses';
      $('igSinceJuly').addEventListener('click',()=>{
        const end=new Date(),from=new Date(end.getFullYear(),end.getMonth()-3,1);
        from.setDate(Math.min(end.getDate(),new Date(from.getFullYear(),from.getMonth()+1,0).getDate()));
        $('igFrom').value=dateString(from);$('igTo').value=dateString(end);
      });
      $('igClient').addEventListener('change',()=>{const username=storedClients()[$('igClient').value.trim()];if(username)$('igUsername').value='@'+username});
    }
    $('igClientList').innerHTML=clientNames().map(name=>`<option value="${esc(name)}"></option>`).join('');
    window.igReportLibrary?.init();
    const storageCheck=$('igStorageCheck');
    if(storageCheck){
      storageCheck.onclick=async()=>{
        storageCheck.disabled=true;storageCheck.textContent='Testando…';
        const note=$('igSavedMessage');
        if(note)note.textContent='Testando gravação de dados JSON privados. Não armazena PDFs nem cobra o Apify…';
        try{
          const result=await request('/api/instagram-storage-check',{method:'POST',body:'{}'});
          if(note)note.textContent=result.message||'Teste de salvamento concluído.';
        }catch(error){if(note)note.textContent='Falha no salvamento: '+(error.message||'Confira a configuração Supabase');}
        finally{storageCheck.disabled=false;storageCheck.textContent='Testar salvamento';}
      };
    }
    window.igFinance?.init();
    if(!running){try{
      const pending=JSON.parse(localStorage.getItem('oneway-ig-run-v1')||'null');
      if(pending?.runId&&Date.now()-Number(pending.startedAt||0)<24*3600000){
        notify('Você tem uma análise iniciada anteriormente. O processo continua no servidor; confira Relatórios salvos em alguns instantes.');
        request('/api/instagram-report?runId='+encodeURIComponent(pending.runId)+'&from='+encodeURIComponent(pending.from)+'&to='+encodeURIComponent(pending.to)).then(o=>{
          if(o.status==='SUCCEEDED'){
            report={...pending,posts:o.posts||[],background:true,costUsd:o.costUsd,coverageNote:o.coverageNote};renderResult();
            notify('Sua coleta anterior concluiu. Custo: '+(window.igFinance?.cost(o.costUsd)||'Não informado')+'. Confira a biblioteca para baixar o PDF.');
            localStorage.removeItem('oneway-ig-run-v1');
            setTimeout(()=>window.igReportLibrary?.refresh(),4000);
          }else if(['FAILED','ABORTED','TIMED-OUT'].includes(o.status)){localStorage.removeItem('oneway-ig-run-v1');notify('A coleta anterior não foi concluída. Verifique o Apify.',true);}
        }).catch(()=>{});
      }
    }catch{}}

  };
})();