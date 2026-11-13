/* One Way · Acabamento premium: detalhes dinâmicos da camada visual.
   - Contagem de demandas do mês em cada área de trabalho.
   - Data de hoje como "sobretítulo" na tela inicial.
   Só lê o estado; nunca grava nada. */
(function () {
  'use strict';
  if (window.owRefined || typeof renderAll !== 'function') return;

  var previous = renderAll;

  function monthCount(area) {
    var month = typeof currentMonth !== 'undefined' ? currentMonth : '';
    return (state.demands || []).filter(function (d) {
      if (!d || d.month !== month) return false;
      if (typeof canAccessDemand === 'function' && !canAccessDemand(d)) return false;
      return area === 'geral' ? (typeof canAccessArea !== 'function' || canAccessArea(d.area)) : d.area === area;
    }).length;
  }

  function decorateTabs() {
    var tabs = document.querySelectorAll('#tabs .tab[data-area]');
    // No celular o menu é montado a partir do texto dos botões: lá a contagem fica de fora.
    var compact = window.matchMedia && window.matchMedia('(max-width:700px)').matches;
    tabs.forEach(function (tab) {
      var area = tab.dataset.area;
      var old = tab.querySelector('.ow-tab-count'); if (old) old.remove();
      if (compact) return;
      if (area === 'agenda' || area === 'socialMedia' || area === 'deleted') return;
      var n = monthCount(area);
      var badge = document.createElement('span');
      badge.className = 'ow-tab-count';
      badge.textContent = String(n);
      badge.title = n + (n === 1 ? ' demanda' : ' demandas') + ' neste mês';
      tab.appendChild(badge);
    });
  }

  function decorateHero() {
    var app = document.getElementById('app');
    var eyebrow = document.querySelector('.hero .eyebrow');
    if (!app || !eyebrow) return;
    if (!eyebrow.dataset.owDefault) eyebrow.dataset.owDefault = eyebrow.textContent;
    if (app.classList.contains('home-mode')) {
      var today = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
      eyebrow.textContent = today.charAt(0).toUpperCase() + today.slice(1);
    } else {
      eyebrow.textContent = eyebrow.dataset.owDefault;
    }
  }

  // Menu do celular: é montado à parte, então marcamos o botão "Agenda" para o destaque azul.
  function markMobileAgenda() {
    document.querySelectorAll('.ow-mob-nav-button').forEach(function (b) {
      b.classList.toggle('ow-mob-agenda', b.textContent.trim() === 'Agenda');
    });
  }
  var pending = false;
  new MutationObserver(function () {
    if (pending) return; pending = true;
    requestAnimationFrame(function () { pending = false; markMobileAgenda(); });
  }).observe(document.body, { childList: true, subtree: true });

  renderAll = function () {
    var result = previous.apply(this, arguments);
    try { decorateTabs(); decorateHero(); markMobileAgenda(); } catch (e) { console.error('Acabamento visual:', e); }
    return result;
  };

  window.owRefined = { decorateTabs: decorateTabs, monthCount: monthCount };
})();
