const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const helper = html.match(/function clientExportPart\(value,[\s\S]*?window\.onewayClientFilename=clientDocumentFilename;/);
assert.ok(helper, 'Gerador de nomes de arquivos deve estar presente');
const sandbox = {window: {}, Date, Intl};
vm.runInNewContext(helper[0], sandbox, {timeout: 1000});
const name = sandbox.window.onewayClientFilename;

test('proposta comercial com cliente em formato humano', () => {
  assert.equal(name('Proposta Comercial', 'loca 10'), 'Proposta Comercial - Loca 10.pdf');
  assert.equal(name('Proposta Comercial', '  Loca   10  '), 'Proposta Comercial - Loca 10.pdf');
});

test('relatórios e planejamento com mês legível e extensão correta', () => {
  assert.equal(name('Relatório de Tráfego', 'Oro Casa', '2026-11', 'pdf'),
    'Relatório de Tráfego - Oro Casa - Novembro 2026.pdf');
  assert.equal(name('Planejamento de Conteúdo', 'CUIABÁ LEILÕES', '2026-10', 'jpg'),
    'Planejamento de Conteúdo - Cuiabá Leilões - Outubro 2026.jpg');
});

test('remove caracteres proibidos em nomes de arquivos no Windows', () => {
  assert.equal(name('Proposta Comercial', 'Acme / SP: Norte'),
    'Proposta Comercial - Acme SP Norte.pdf');
});

test('PDFs impressos e download direto utilizam o formatador', () => {
  assert.match(html, /anchor\.download=productSafeFilename\(data\)/);
  assert.match(html, /docTitle:clientDocumentFilename\('Relatório de Entregas'/);
  assert.match(html, /docTitle:clientDocumentFilename\('Planejamento de Conteúdo'/);
});
