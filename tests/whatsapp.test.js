const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../lib/whatsapp-core');

const payload = (messages, contacts = []) => ({entry: [{changes: [{value: {messaging_product: 'whatsapp', contacts, messages}}]}]});

test('lê texto, áudio e legenda no formato da Cloud API', () => {
  const list = core.extractMessages(payload([
    {id: 'wamid.1', from: '55 65 99999-0000', type: 'text', text: {body: 'Preciso de uma arte para sexta'}, timestamp: '1700000000'},
    {id: 'wamid.2', from: '5565999990000', type: 'audio', audio: {id: 'MEDIA1', mime_type: 'audio/ogg; codecs=opus'}},
    {id: 'wamid.3', from: '5565999990000', type: 'image', image: {id: 'IMG', caption: 'Usar essa foto'}},
    {id: 'wamid.4', from: '5565999990000', type: 'reaction', reaction: {emoji: '👍'}},
    {from: '5565999990000', type: 'text', text: {body: 'sem id'}}
  ], [{wa_id: '5565999990000', profile: {name: 'Ana'}}]));
  assert.equal(list.length, 4);
  assert.deepEqual([list[0].from, list[0].name, list[0].text], ['5565999990000', 'Ana', 'Preciso de uma arte para sexta']);
  assert.equal(list[1].mediaId, 'MEDIA1');
  assert.equal(list[2].text, 'Usar essa foto');
  assert.equal(core.routeMessage(list[3]), 'ignore');
});

test('payloads quebrados não derrubam o webhook', () => {
  assert.deepEqual(core.extractMessages(null), []);
  assert.deepEqual(core.extractMessages({entry: 'x'}), []);
  assert.deepEqual(core.extractMessages({entry: [{changes: [{value: {statuses: [{id: 'a'}]}}]}]}), []);
});

test('rotas: cliente é classificado, áudio da equipe vira reunião', () => {
  const text = {type: 'text', text: 'oi'}, audio = {type: 'audio', mediaId: 'x'};
  assert.equal(core.routeMessage(text), 'classify');
  assert.equal(core.routeMessage(text, {isTeam: true}), 'note');
  assert.equal(core.routeMessage(audio), 'transcribe');
  assert.equal(core.routeMessage(audio, {isTeam: true}), 'meeting');
});

test('JSON do modelo é lido mesmo com texto em volta e limpo', () => {
  const raw = 'Claro!\n```json\n{"tipo":"solicitacao","resumo":"Arte de Black Friday","cliente":"Medina","prazo":"sexta","precisa_humano":false,"resposta":"Recebido!"}\n```';
  const c = core.cleanClassification(core.parseJsonReply(raw));
  assert.equal(c.kind, 'solicitacao');
  assert.equal(c.client, 'Medina');
  assert.equal(c.reply, 'Recebido!');
  assert.equal(core.cleanClassification({tipo: 'reuniao'}).kind, 'outro');
  assert.equal(core.cleanClassification(null).kind, 'outro');
  assert.equal(core.parseJsonReply('sem json'), null);
});

test('reunião: plano de ação só com tarefas válidas e áreas conhecidas', () => {
  const m = core.cleanMeeting({cliente: 'Boreal', titulo: 'Planejamento', resumo: 'ok', decisoes: ['a', ''], plano_de_acao: [{tarefa: 'Gravar reels', area: 'video', prazo: '05/12'}, {tarefa: '', area: 'arte'}, {tarefa: 'Post', area: 'xyz'}], pendencias_cliente: ['Mandar fotos']});
  assert.equal(m.plan.length, 2);
  assert.equal(m.plan[0].area, 'video');
  assert.equal(m.plan[1].area, 'outro');
  assert.deepEqual(m.decisions, ['a']);
  assert.deepEqual(m.clientPending, ['Mandar fotos']);
});

test('comparação de segredo segura', () => {
  assert.equal(core.safeEqual('abc', 'abc'), true);
  assert.equal(core.safeEqual('abc', 'abd'), false);
  assert.equal(core.safeEqual('', ''), false);
  assert.equal(core.safeEqual('abc', 'abcd'), false);
});

function fakeRes() {
  const res = {statusCode: 0, headers: {}, body: undefined};
  res.setHeader = (k, v) => { res.headers[k] = v; };
  res.status = code => { res.statusCode = code; return res; };
  res.json = data => { res.body = data; return res; };
  res.send = data => { res.body = data; return res; };
  return res;
}

test('webhook: verificação da Meta e bloqueio sem segredo', async () => {
  const handler = require('../api/whatsapp');
  process.env.WHATSAPP_VERIFY_TOKEN = 'tok';
  process.env.WHATSAPP_WEBHOOK_SECRET = 'segredo';
  let res = fakeRes();
  await handler({method: 'GET', query: {'hub.mode': 'subscribe', 'hub.verify_token': 'tok', 'hub.challenge': '123'}, headers: {}}, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body, '123');
  res = fakeRes();
  await handler({method: 'GET', query: {'hub.mode': 'subscribe', 'hub.verify_token': 'errado', 'hub.challenge': '123'}, headers: {}}, res);
  assert.equal(res.statusCode, 403);
  res = fakeRes();
  await handler({method: 'POST', query: {key: 'errado'}, headers: {}, body: payload([])}, res);
  assert.equal(res.statusCode, 401);
  res = fakeRes();
  await handler({method: 'POST', query: {key: 'segredo'}, headers: {}, body: payload([])}, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.received, 0);
});

test('webhook: ações do painel exigem Administrador', async () => {
  const handler = require('../api/whatsapp');
  const res = fakeRes();
  await handler({method: 'GET', query: {action: 'list'}, headers: {}}, res);
  assert.equal(res.statusCode, 401);
});

test('a página carrega o módulo do WhatsApp', () => {
  const html = require('node:fs').readFileSync('index.html', 'utf8');
  assert.match(html, /modules\/whatsapp-inbox\.js/);
  assert.match(html, /modules\/whatsapp-inbox\.css/);
});

test('conversa vermelha: cliente falou depois da última resposta humana', () => {
  assert.equal(core.isUnanswered({last_in_at: '2026-11-23T10:00:00Z', last_human_out_at: '2026-11-23T09:00:00Z'}), true);
  assert.equal(core.isUnanswered({last_in_at: '2026-11-23T10:00:00Z', last_human_out_at: '2026-11-23T10:05:00Z'}), false);
  assert.equal(core.isUnanswered({last_in_at: '2026-11-23T10:00:00Z', resolved_at: '2026-11-23T10:01:00Z'}), false);
  assert.equal(core.isUnanswered({last_in_at: null}), false);
});

test('janela de 24h do WhatsApp', () => {
  const now = Date.parse('2026-11-23T12:00:00Z');
  assert.equal(core.windowOpen('2026-11-23T00:00:00Z', now), true);
  assert.equal(core.windowOpen('2026-11-22T11:00:00Z', now), false);
  assert.equal(core.windowOpen(null, now), false);
});

test('confirmações de entrega e leitura', () => {
  const list = core.extractStatuses({entry: [{changes: [{value: {statuses: [{id: 'wamid.9', status: 'read'}, {id: 'x', status: 'deleted'}, {status: 'sent'}]}}]}]});
  assert.deepEqual(list, [{id: 'wamid.9', status: 'read', error: ''}]);
});

test('passe da equipe: assinado, com validade e sem senha errada', async () => {
  const t = core.signTeamToken('segredo', 'Design', 0);
  assert.deepEqual(core.readTeamToken('segredo', t, 1000), {name: 'Design'});
  assert.equal(core.readTeamToken('outro', t, 1000), null);
  assert.equal(core.readTeamToken('segredo', t, 13 * 60 * 60 * 1000), null);
  assert.equal(core.readTeamToken('segredo', t.replace(/.$/, c => (c === 'A' ? 'B' : 'A')), 1000), null);
  assert.equal(await core.verifyTeamPassword('senha-errada'), false);
});

test('API: senha errada da equipe e conversas sem login', async () => {
  const handler = require('../api/whatsapp');
  process.env.WHATSAPP_WEBHOOK_SECRET = 'segredo';
  let res = fakeRes();
  await handler({method: 'POST', query: {action: 'team-login'}, headers: {}, body: {password: 'errada'}}, res);
  assert.equal(res.statusCode, 401);
  res = fakeRes();
  await handler({method: 'GET', query: {action: 'conversations'}, headers: {'x-ow-team': 'falso.token'}}, res);
  assert.equal(res.statusCode, 401);
  res = fakeRes();
  await handler({method: 'POST', query: {action: 'chat-send'}, headers: {}, body: {phone: '5565999990000', text: 'oi'}}, res);
  assert.equal(res.statusCode, 401);
});
