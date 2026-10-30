/* Histórico persistente de leituras de Tráfego: guarda snapshots imutáveis
   dos dados revisados, nunca arquivos JPEG/PDF em base64 no app_state. */
(function () {
  'use strict';
  if (window.OWTrafficReportHistory) return;
  if (typeof exportActiveAnalyticsPDF !== 'function' ||
      typeof exportActiveAnalyticsJPEG !== 'function' ||
      !document.getElementById('trafficReportBtn')) return;

  var KEY = '__ow_traffic_report_history_v1__';
  var saving = false;
  var overlay = null;
  var query = '';
  var monthFilter = '';

  function copy(value) { return JSON.parse(JSON.stringify(value)); }
  function known() {
    var source = state && state.analyticsReports && state.analyticsReports[KEY];
    return Array.isArray(source) ? source.filter(function(item) {
      return item && item.id && item.data && typeof item.data === 'object';
    }).map(copy) : [];
  }
  function existingLegacy() {
    var reports = state && state.analyticsReports || {};
    return Object.keys(reports).filter(function(key) {
      return key !== KEY && reports[key] && reports[key].type === 'traffic' &&
        reports[key].data && typeof reports[key].data === 'object';
    }).map(function(key) {
      var r = reports[key], d = r.data;
      return {
        id:'legacy:' + key, legacy:true,
        savedAt:r.updatedAt || '',
        name:d._clientName || r.clientName || 'Análise Geral',
        month:d._reportMonth || r.month || '',
        format:'Dados anteriores',
        data:copy(d)
      };
    });
  }
  function entries() {
    return known().concat(existingLegacy()).sort(function(a,b) {
      return String(b.savedAt).localeCompare(String(a.savedAt));
    });
  }
  function sanitizeName(value) { return String(value || 'Análise Geral').trim().slice(0,140) || 'Análise Geral'; }
  function prepare(data) {
    var d=copy(data);
    d._clientName=sanitizeName(d._clientName);
    d._reportMonth=/^\d{4}-(0[1-9]|1[0-2])$/.test(d._reportMonth || '') ? d._reportMonth : currentMonth;
    if (!d.analysis) d.analysis=trafficAnalysisText(d);
    d._metaLevel=['campaign','adset','ad'].includes(d._metaLevel) ? d._metaLevel : 'campaign';
    d.campaigns=Array.isArray(d.campaigns) ? d.campaigns.filter(trafficCampaignHasSpend) : [];
    return d;
  }
  async function record(data,format) {
    if (saving || !isAdmin()) return false;
    if (!adminAuthReady() || !supabaseClient) {
      toast('O arquivo foi gerado, mas o histórico precisa do login administrativo conectado ao Supabase.');
      return false;
    }
    saving=true;
    var old=state.analyticsReports && state.analyticsReports[KEY];
    try {
      var snapshot=prepare(data);
      var list=known().slice();
      list.unshift({
        id:uid(), savedAt:new Date().toISOString(),
        name:snapshot._clientName, month:snapshot._reportMonth,
        format:format, data:snapshot
      });
      state.analyticsReports=state.analyticsReports || {};
      state.analyticsReports[KEY]=list;
      var ok=await saveState({strictRemote:true});
      if (!ok) throw new Error('O Supabase não confirmou o salvamento.');
      if (overlay && !overlay.classList.contains('hidden')) render();
      toast('Relatório guardado no histórico de tráfego.',null,null,'success');
      return true;
    } catch(error) {
      if (old === undefined) delete state.analyticsReports[KEY];
      else state.analyticsReports[KEY]=old;
      writeLocalCache(state);
      toast('Não foi possível arquivar o relatório. ' + (error.message || 'Confira sua conexão.'));
      return false;
    } finally { saving=false; }
  }

  var originalPdf=exportActiveAnalyticsPDF;
  var originalJpeg=exportActiveAnalyticsJPEG;

  async function exportWithArchive(format,original,args,context) {
    if (!activeAnalytics || activeAnalytics.type !== 'traffic' || !isAdmin())
      return original.apply(context,args);
    syncTrafficTotalsFromCampaigns();
    var data=prepare(readTrafficForm());
    // Só arquiva depois que a exportação original terminou sem lançar erro.
    var result=await original.apply(context,args);
    await record(data,format);
    return result;
  }
  exportActiveAnalyticsPDF=function() {
    return exportWithArchive('PDF',originalPdf,arguments,this);
  };
  exportActiveAnalyticsJPEG=function() {
    return exportWithArchive('JPEG',originalJpeg,arguments,this);
  };

  var style=document.createElement('style');
  style.textContent=[
    '.ow-traffic-history-trigger{white-space:nowrap;font-family:Montserrat,Arial,sans-serif}',
    '.ow-traffic-history-overlay{position:fixed;inset:0;z-index:10500;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(3,13,30,.80);backdrop-filter:blur(8px)}',
    '.ow-traffic-history-overlay.hidden{display:none!important}',
    '.ow-traffic-history-dialog{width:min(880px,100%);max-height:min(90vh,900px);display:flex;flex-direction:column;overflow:hidden;border:1px solid rgba(173,203,249,.23);border-radius:19px;background:linear-gradient(155deg,#102d5d,#071733 82%);box-shadow:0 25px 90px rgba(0,0,0,.5);color:#eff6ff;font-family:Montserrat,Arial,sans-serif}',
    '.ow-traffic-history-head{padding:22px 24px;border-bottom:1px solid rgba(195,219,255,.14);display:flex;justify-content:space-between;gap:15px;align-items:flex-start}',
    '.ow-traffic-history-head small{display:block;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#93bdf5;margin-bottom:8px}',
    '.ow-traffic-history-head h3{font-size:20px;line-height:1.2;font-weight:600;margin:0 0 7px}',
    '.ow-traffic-history-head p{margin:0;font-size:11px;line-height:1.6;color:#bed1eb}',
    '.ow-traffic-history-x{border:0;background:rgba(255,255,255,.10);color:#fff;border-radius:9px;min-width:38px;min-height:38px;cursor:pointer;font-size:24px}',
    '.ow-traffic-history-controls{display:grid;grid-template-columns:1fr 185px;gap:10px;padding:18px 24px 10px}',
    '.ow-traffic-history-controls input,.ow-traffic-history-controls select{width:100%;min-width:0;background:#0d254d;border:1px solid rgba(175,209,250,.26);border-radius:10px;padding:11px;color:#fff;font:400 12px Montserrat,Arial,sans-serif}',
    '.ow-traffic-history-list{padding:8px 24px 24px;overflow:auto;display:grid;gap:11px;min-height:110px}',
    '.ow-traffic-history-item{padding:16px;border:1px solid rgba(180,209,248,.16);border-radius:13px;background:rgba(255,255,255,.055)}',
    '.ow-traffic-history-item-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}',
    '.ow-traffic-history-item h4{margin:0 0 8px;font-size:13px;font-weight:600;line-height:1.4;overflow-wrap:anywhere}',
    '.ow-traffic-history-meta{font-size:10px;line-height:1.65;color:#b9cdea}',
    '.ow-traffic-history-tag{font-size:10px;padding:5px 9px;background:rgba(69,137,243,.20);border-radius:40px;color:#cde3ff;white-space:nowrap}',
    '.ow-traffic-history-kpis{margin:12px 0;display:flex;gap:8px 14px;flex-wrap:wrap;font-size:10px;color:#dee9fc}',
    '.ow-traffic-history-actions{display:flex;flex-wrap:wrap;gap:8px}',
    '.ow-traffic-history-actions button{font:500 11px Montserrat,Arial,sans-serif;min-height:35px;padding:8px 12px;border:1px solid rgba(157,192,240,.32);border-radius:8px;background:rgba(91,144,227,.14);color:#fff;cursor:pointer}',
    '.ow-traffic-history-actions button:hover{background:rgba(91,144,227,.3)}',
    '.ow-traffic-history-actions [data-ow-history-action="delete"]{margin-left:auto;color:#ffbfc7;border-color:rgba(249,133,145,.25)}',
    '.ow-traffic-history-empty{padding:30px;text-align:center;color:#c7d8ef;font-size:12px;line-height:1.8}',
    '@media(max-width:700px){.ow-traffic-history-overlay{padding:8px}.ow-traffic-history-dialog{max-height:94vh;border-radius:14px}.ow-traffic-history-head{padding:18px 15px}.ow-traffic-history-head h3{font-size:17px}.ow-traffic-history-controls{padding:12px 14px 9px;grid-template-columns:1fr}.ow-traffic-history-list{padding:8px 14px 15px}.ow-traffic-history-item{padding:12px}.ow-traffic-history-actions button{flex:1 0 auto}.ow-traffic-history-actions [data-ow-history-action="delete"]{margin-left:0}}'
  ].join('\n');
  document.head.appendChild(style);

  var mainBtn=document.getElementById('trafficReportBtn');
  var historyButton=document.createElement('button');
  historyButton.id='owTrafficHistoryBtn';
  historyButton.type='button';
  historyButton.className='ghost small ow-traffic-history-trigger';
  historyButton.textContent='Histórico de relatórios';
  mainBtn.parentNode.insertBefore(historyButton,mainBtn.nextSibling);
  function buttonVisibility() {
    historyButton.classList.toggle('hidden',!isAdmin() || currentArea!=='trafego');
  }
  new MutationObserver(buttonVisibility).observe(mainBtn,{attributes:true,attributeFilter:['class']});
  buttonVisibility();

  overlay=document.createElement('div');
  overlay.className='ow-traffic-history-overlay hidden';
  overlay.id='owTrafficHistoryModal';
  overlay.innerHTML=
    '<div class="ow-traffic-history-dialog" role="dialog" aria-modal="true" aria-labelledby="owTrafficHistoryTitle">' +
    '<div class="ow-traffic-history-head"><div><small>ONE WAY · ARQUIVO DE TRÁFEGO</small>' +
    '<h3 id="owTrafficHistoryTitle">Histórico de relatórios</h3>' +
    '<p>As leituras salvas mantêm os números e campanhas daquela data. Reabra ou gere novamente PDF/JPEG sem precisar do CSV original.</p></div>' +
    '<button type="button" class="ow-traffic-history-x" aria-label="Fechar histórico" id="owTrafficHistoryClose">×</button></div>' +
    '<div class="ow-traffic-history-controls"><input type="search" id="owTrafficHistorySearch" placeholder="Buscar cliente ou mês" aria-label="Buscar relatórios">' +
    '<select id="owTrafficHistoryMonth" aria-label="Filtrar mês"><option value="">Todos os meses</option></select></div>' +
    '<div class="ow-traffic-history-list" id="owTrafficHistoryList"></div></div>';
  document.body.appendChild(overlay);
  function close() {
    overlay.classList.add('hidden');
    document.removeEventListener('keydown',onKey);
  }
  function onKey(event) { if (event.key==='Escape') close(); }
  function open() {
    if (!isAdmin()) return;
    query='';monthFilter='';
    overlay.querySelector('#owTrafficHistorySearch').value='';
    overlay.classList.remove('hidden');
    render();
    document.addEventListener('keydown',onKey);
    overlay.querySelector('#owTrafficHistorySearch').focus();
  }
  historyButton.addEventListener('click',open);
  overlay.querySelector('#owTrafficHistoryClose').addEventListener('click',close);
  overlay.addEventListener('click',function(event) { if(event.target===overlay)close(); });
  overlay.querySelector('#owTrafficHistorySearch').addEventListener('input',function(event) {
    query=event.target.value.trim().toLocaleLowerCase('pt-BR');
    render(false);
  });
  overlay.querySelector('#owTrafficHistoryMonth').addEventListener('change',function(event) {
    monthFilter=event.target.value;
    render(false);
  });
  function niceMonth(month) {
    try {return /^\d{4}-\d{2}$/.test(month) ? monthKeyLabel(month) : month || 'Sem período';}
    catch(error) { return month || 'Sem período'; }
  }
  function dateLabel(date) {
    var d=new Date(date);return isNaN(d.getTime())?'Data anterior':d.toLocaleString('pt-BR',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
  }
  function safeAttr(value) { return esc(String(value || '')); }
  function render(updateFilter) {
    if (!isAdmin()) {close();return;}
    var all=entries(),months=Array.from(new Set(all.map(function(item){return item.month;}).filter(Boolean))).sort().reverse();
    var picker=overlay.querySelector('#owTrafficHistoryMonth');
    if (updateFilter!==false) {
      picker.innerHTML='<option value="">Todos os meses</option>'+months.map(function(m) {
        return '<option value="'+safeAttr(m)+'">'+safeAttr(niceMonth(m))+'</option>';
      }).join('');
      picker.value=monthFilter;
    }
    var selected=all.filter(function(item) {
      return (!monthFilter || item.month===monthFilter) &&
        (!query || (item.name+' '+item.month+' '+niceMonth(item.month)).toLocaleLowerCase('pt-BR').includes(query));
    });
    overlay.querySelector('#owTrafficHistoryList').innerHTML=selected.length ? selected.map(function(item) {
      var campaignCount=Array.isArray(item.data.campaigns) ? item.data.campaigns.filter(trafficCampaignHasSpend).length : 0;
      return '<article class="ow-traffic-history-item" data-ow-history-id="'+safeAttr(item.id)+'">'+
        '<div class="ow-traffic-history-item-head"><div><h4>'+safeAttr(item.name)+'</h4>'+
        '<div class="ow-traffic-history-meta">'+safeAttr(niceMonth(item.month))+' · Salvo em '+safeAttr(dateLabel(item.savedAt))+'</div></div>'+
        '<span class="ow-traffic-history-tag">'+safeAttr(item.format)+'</span></div>'+
        '<div class="ow-traffic-history-kpis"><span>Investimento: <strong>'+safeAttr(analyticsMoney(item.data.spend))+'</strong></span>'+
        '<span>Leads: <strong>'+safeAttr(compactInt(item.data.leads))+'</strong></span>'+
        '<span>Campanhas: <strong>'+campaignCount+'</strong></span></div>'+
        '<div class="ow-traffic-history-actions"><button type="button" data-ow-history-action="open">Reabrir dados</button>'+
        '<button type="button" data-ow-history-action="jpeg">Gerar JPEG</button>'+
        '<button type="button" data-ow-history-action="pdf">Gerar PDF</button>'+
        (!item.legacy?'<button type="button" data-ow-history-action="delete">Excluir</button>':'')+
        '</div></article>';
    }).join('') : '<div class="ow-traffic-history-empty">Nenhum relatório encontrado.<br>Ao salvar um JPEG ou PDF de Tráfego, ele aparecerá aqui automaticamente.</div>';
  }
  function getItem(id) {return entries().find(function(item){return item.id===id;});}
  function showPdf(entry) {
    var w=window.open('','_blank');
    if (!w) {toast('Permita pop-ups para gerar o PDF.');return;}
    var html=trafficReportHTML(prepare(entry.data),entry.name);
    w.document.open();w.document.write(html);w.document.close();
  }
  function reopen(entry) {
    var data=prepare(entry.data);
    close();
    openTrafficAnalytics();
    metaCsvCurrentLevel=data._metaLevel;
    document.getElementById('trafficClientName').value=entry.name;
    document.getElementById('trafficMonthSelect').innerHTML=buildMonth12Select(data._reportMonth);
    document.getElementById('trafficMonthSelect').value=data._reportMonth;
    activeAnalytics.reportName=entry.name;
    activeAnalytics.reportMonth=data._reportMonth;
    renderTrafficEditor(data);
    toast('Leitura antiga recuperada. Edite ou exporte sem alterar a versão guardada.',null,null,'success');
  }
  async function remove(entry) {
    if (entry.legacy || !isAdmin() || !adminAuthReady()) {
      toast('É necessário o login administrativo para excluir do histórico.');return;
    }
    if(!confirm('Excluir definitivamente esta versão do histórico de tráfego?'))return;
    var old=state.analyticsReports[KEY];
    state.analyticsReports[KEY]=known().filter(function(item){return item.id!==entry.id;});
    if(!await saveState({strictRemote:true})) {
      state.analyticsReports[KEY]=old;writeLocalCache(state);
      toast('Não foi possível excluir. O relatório continua no histórico.');return;
    }
    render();toast('Versão removida do histórico.',null,null,'success');
  }
  overlay.querySelector('#owTrafficHistoryList').addEventListener('click',async function(event) {
    var button=event.target.closest('[data-ow-history-action]');
    if(!button||button.disabled)return;
    var card=button.closest('[data-ow-history-id]');
    var item=getItem(card && card.dataset.owHistoryId);
    if(!item || !isAdmin()) return;
    var action=button.dataset.owHistoryAction;
    if(action==='open'){reopen(item);return;}
    if(action==='pdf'){showPdf(item);return;}
    if(action==='jpeg') {
      button.disabled=true;var before=button.textContent;button.textContent='Gerando...';
      try {await exportTrafficJPEG(prepare(item.data),item.name);toast('JPEG antigo gerado.',null,null,'success');}
      catch(error) {toast('Falha ao gerar JPEG: '+(error.message||'tente novamente.'));}
      finally {button.disabled=false;button.textContent=before;}
      return;
    }
    if(action==='delete'){button.disabled=true;try{await remove(item);}finally{button.disabled=false;}}
  });
  window.OWTrafficReportHistory={open:open,entries:entries,record:record};
})();
