/* Capas são demandas de Arte independentes, vinculadas ao vídeo de origem. */
(function () {
  'use strict';
  const pending = new Set();
  const byId = id => state.demands.find(d => d.id === id);
  function findCover(videoId) {
    return [...state.demands, ...state.deletedDemands].find(d => d.sourceVideoId === videoId || d.id === 'cover-' + videoId);
  }
  function validate(video, assignee) {
    if (!isAdmin()) throw new Error('Apenas o administrador pode atribuir uma capa.');
    if (!video || video.area !== 'video') throw new Error('Selecione uma demanda de vídeo.');
    if (!DEMAND_ASSIGNEES.includes(assignee)) throw new Error('Escolha o responsável pela capa.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(video.postDate || '')) throw new Error('Defina a data do vídeo antes de produzir a capa.');
    if (!state.clients.some(c => c.id === video.clientId)) throw new Error('Cliente do vídeo não encontrado.');
    if (findCover(video.id)) throw new Error('Este vídeo já tem uma capa. Confira a demanda existente ou a lixeira.');
  }
  function stage(video, request) {
    if (!request) return null;
    validate(video, request.assignee);
    const sourceClient = state.clients.find(c => c.id === video.clientId);
    const month = video.postDate.slice(0, 7);
    let client = state.clients.find(c => c.area === 'arte' && !c.mergedInto && cmSelectionKey(c.name) === cmSelectionKey(sourceClient.name));
    let createdClientId = null;
    if (!client) {
      client = {id: uid(), name: sourceClient.name, area: 'arte', type: sourceClient.type || 'fixed', startMonth: month, createdAt: new Date().toISOString()};
      createdClientId = client.id;
      state.clients.push(client);
    }
    const removed = state.removedClientMonths.filter(r => r.clientId === client.id && r.area === 'arte' && r.month === month);
    state.removedClientMonths = state.removedClientMonths.filter(r => !removed.includes(r));
    const cover = {
      id: 'cover-' + video.id, sourceVideoId: video.id, sourceVideoTitle: video.title,
      clientId: client.id, month, area: 'arte', title: 'Capa — ' + video.title,
      postDate: video.postDate, description: 'Produzir a capa do vídeo: ' + video.title,
      assignee: request.assignee, status: 'red', links: [], attachments: [],
      productionLinks: [], productionAttachments: [],
      createdAt: new Date().toISOString(), createdDate: demandCreationCalendarDate()
    };
    state.demands.push(cover);
    return {cover, rollback() {
      state.demands = state.demands.filter(d => d.id !== cover.id);
      if (createdClientId && !state.demands.some(d => d.clientId === createdClientId)) state.clients = state.clients.filter(c => c.id !== createdClientId);
      state.removedClientMonths.push(...removed.filter(r => !state.removedClientMonths.some(x => x.id === r.id)));
    }};
  }
  function updateForm() {
    const section = document.getElementById('formVideoCover');
    if (!section) return;
    const cover = findCover(document.getElementById('editDemandId').value);
    const visible = formDemandArea === 'video';
    section.classList.toggle('hidden', !visible);
    const check = document.getElementById('formProduceCover');
    check.disabled = !!cover || !visible;
    if (cover || !visible) check.checked = false;
    const select = document.getElementById('formCoverAssignee');
    select.disabled = !visible || !check.checked;
    select.required = visible && check.checked;
    document.getElementById('formCoverFields').classList.toggle('hidden', !check.checked);
    document.getElementById('formCoverHint').textContent = cover
      ? 'Este vídeo já possui uma demanda de capa' + (state.deletedDemands.some(d => d.id === cover.id) ? ' em Excluídos. Restaure pela lixeira.' : ' atribuída a ' + (cover.assignee || 'definir') + '.')
      : 'Cria uma nova demanda em Arte, com o mesmo cliente e a mesma data do vídeo.';
  }
  function resetForm() {
    document.getElementById('formProduceCover').checked = false;
    document.getElementById('formCoverAssignee').value = '';
    updateForm();
  }
  function readForm() {
    if (formDemandArea !== 'video' || !document.getElementById('formProduceCover').checked) return null;
    const assignee = document.getElementById('formCoverAssignee').value;
    if (!DEMAND_ASSIGNEES.includes(assignee)) throw new Error('Escolha o responsável pela capa.');
    const id = document.getElementById('editDemandId').value;
    if (id && findCover(id)) throw new Error('Este vídeo já possui uma demanda de capa.');
    return {assignee};
  }
  function detailHTML(d) {
    if (d.sourceVideoId) {
      const video = byId(d.sourceVideoId);
      return '<section class="ow-cover-panel"><strong>Vídeo de origem</strong><p>' + esc(video?.title || d.sourceVideoTitle || 'Vídeo removido') + '</p>' +
        (video && canAccessDemand(video) ? '<button type="button" class="ghost small" data-open-cover-demand="' + esc(video.id) + '">Abrir vídeo</button>' : '') + '</section>';
    }
    if (d.area !== 'video') return '';
    const cover = findCover(d.id);
    if (cover) {
      const deleted = state.deletedDemands.some(x => x.id === cover.id);
      return '<section class="ow-cover-panel"><strong>Capa do vídeo</strong><p>' + esc(cover.title) + '</p><small>' + esc(cover.assignee || 'Sem responsável') + ' · ' + esc(fmtPostDate(cover.postDate)) + ' · ' + esc(deleted ? 'Em Excluídos' : statusLabel(cover)) + '</small>' +
        (!deleted && canAccessDemand(cover) ? '<button type="button" class="ghost small" data-open-cover-demand="' + esc(cover.id) + '">Abrir demanda da capa</button>' : '') +
        (deleted && isAdmin() ? '<small>Restaure a capa pela lixeira para continuar.</small>' : '') + '</section>';
    }
    if (!isAdmin()) return '';
    const disabled = !d.postDate || pending.has(d.id);
    return '<section class="ow-cover-panel"><strong>Capa do vídeo</strong><p>Nova demanda em Arte, com o mesmo cliente e prazo: ' + esc(fmtPostDate(d.postDate)) + '.</p><div class="ow-cover-controls"><label>Responsável pela capa<select data-cover-assignee="' + esc(d.id) + '" aria-label="Responsável pela capa de ' + esc(d.title) + '"><option value="">Selecione o responsável</option>' + DEMAND_ASSIGNEES.map(p => '<option>' + esc(p) + '</option>').join('') + '</select></label><button type="button" class="primary" data-produce-cover="' + esc(d.id) + '"' + (disabled ? ' disabled' : '') + '>Produzir capa</button></div>' + (!d.postDate ? '<small>Edite o vídeo e defina a data antes de criar a capa.</small>' : '') + '</section>';
  }
  async function create(videoId, assignee) {
    if (pending.has(videoId)) return;
    let transaction;
    pending.add(videoId);
    try {
      if (!supabaseClient) throw new Error('A conexão está indisponível. Tente novamente para atribuir a capa à equipe.');
      transaction = stage(byId(videoId), {assignee});
      if (!await saveState({strictRemote: true})) throw new Error('Não foi possível sincronizar a capa. Tente novamente.');
      renderAll();
      toast('Capa atribuída a ' + assignee + ', com o mesmo prazo do vídeo.', null, null, 'success');
      return transaction.cover;
    } catch (error) {
      transaction?.rollback();
      if (transaction) writeLocalCache(state);
      toast(error.message || 'Não foi possível criar a capa.');
      return null;
    } finally { pending.delete(videoId); }
  }
  function openLinked(id) {
    const d = byId(id);
    if (!d || !canAccessDemand(d)) return;
    currentArea = d.area; currentMonth = d.month;
    if (isAdmin()) adminAssigneeFilter = 'all';
    document.getElementById('searchInput').value = '';
    clientDemandFilters = [d.area]; clientDemandFilterKey = null;
    openClientId = d.clientId; openDemandId = d.id;
    renderAll();
  }
  window.OWVideoCovers = {findCover, stage, readForm, updateForm, resetForm, detailHTML, create};
  document.getElementById('formProduceCover')?.addEventListener('change', updateForm);
  document.addEventListener('click', async event => {
    const open = event.target.closest('[data-open-cover-demand]');
    if (open) { event.preventDefault(); openLinked(open.dataset.openCoverDemand); return; }
    const button = event.target.closest('[data-produce-cover]');
    if (!button) return;
    event.preventDefault();
    const assignee = button.closest('.ow-cover-panel').querySelector('select').value;
    button.disabled = true; button.textContent = 'Criando capa...';
    await create(button.dataset.produceCover, assignee);
    button.disabled = false; button.textContent = 'Produzir capa';
  });
})();


/* Extensão isolada do checklist de equipamentos da Agenda. */
(function () {
  if (typeof document.createElement !== 'function' || !document.head ||
      !document.getElementById('wkEventForm')) return;
  var script = document.createElement('script');
  script.src = '/modules/equipment-checklist.js?v=20261029-1';
  script.async = true;
  document.head.appendChild(script);
})();


/* Histórico de Relatórios de Tráfego: módulo isolado, aditivo e sem migração de banco. */
(function () {
  if (typeof document.createElement !== 'function' || !document.head ||
      !document.getElementById('trafficReportBtn')) return;
  var script = document.createElement('script');
  script.src = '/modules/traffic-report-history.js?v=20261029-1';
  script.async = true;
  document.head.appendChild(script);
})();
