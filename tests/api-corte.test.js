import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { criarApp } from '../server/app.js';
import { visaoCliente } from '../server/visaoCliente.js';
import { carregarOrcamento } from '../server/orcamentos.js';
import { otimizarPlano } from '../public/shared/corte.js';

let servidor;
let base;
let cookie = '';
let app;

async function chamar(metodo, caminho, corpo) {
  const headers = { 'X-Requested-With': 'fetch' };
  if (cookie) headers.cookie = cookie;
  if (corpo !== undefined) headers['Content-Type'] = 'application/json';
  const r = await fetch(base + caminho, { method: metodo, headers, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
  const setCookie = r.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  const tipo = r.headers.get('content-type') || '';
  const dados = tipo.includes('json') ? await r.json() : Buffer.from(await r.arrayBuffer());
  return { status: r.status, dados, headers: r.headers };
}

before(async () => {
  app = criarApp({ banco: { url: 'memory://' }, dataHoje: () => '2026-11-10' });
  await new Promise((resolve) => {
    servidor = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${servidor.address().port}/api`;
  const anterior = process.env.INITIAL_ADMIN_SETUP_SECRET;
  process.env.INITIAL_ADMIN_SETUP_SECRET = 'chave-inicial-de-teste-comprida';
  const r = await chamar('POST', '/auth/configurar', {
    chave_configuracao: process.env.INITIAL_ADMIN_SETUP_SECRET,
    nome: 'Admin',
    email: 'admin@marcenaria.com',
    senha: 'segredo123',
  });
  if (anterior === undefined) delete process.env.INITIAL_ADMIN_SETUP_SECRET;
  else process.env.INITIAL_ADMIN_SETUP_SECRET = anterior;
  assert.equal(r.status, 201);
});

after(async () => {
  servidor.close();
  await (await app.locals.obterDb()).close();
});

let branco;
let carvalho;
let fita;
let orcamentoId;
let plano;

test('o plano de corte exige login', async () => {
  const salvo = cookie;
  cookie = '';
  assert.equal((await chamar('GET', '/planos-corte')).status, 401);
  assert.equal((await chamar('GET', '/chapas')).status, 401);
  cookie = salvo;
});

test('cadastra chapas e fitas e valida as medidas', async () => {
  let r = await chamar('POST', '/chapas', { nome: 'MDF Branco', espessura_mm: 18, comprimento_mm: 2750, largura_mm: 1840, preco_cents: 30000 });
  assert.equal(r.status, 201, JSON.stringify(r.dados));
  branco = r.dados;
  assert.equal(branco.veio, 0);
  r = await chamar('POST', '/chapas', { nome: 'MDF Carvalho', espessura_mm: 18, comprimento_mm: 2750, largura_mm: 1840, veio: true, preco_cents: 45000 });
  carvalho = r.dados;
  assert.equal(carvalho.veio, 1);
  r = await chamar('POST', '/chapas', { nome: 'Errada', espessura_mm: 18, comprimento_mm: 50, largura_mm: 1840 });
  assert.equal(r.status, 400);
  r = await chamar('POST', '/fitas', { nome: 'Branca 22 mm', preco_metro_cents: 150 });
  assert.equal(r.status, 201);
  fita = r.dados;
  r = await chamar('PUT', `/chapas/${branco.id}`, { ...branco, preco_cents: 32000 });
  assert.equal(r.dados.preco_cents, 32000);
  branco = r.dados;
  assert.equal((await chamar('GET', '/chapas')).dados.length, 2);
});

test('o plano do orçamento é único e sugere os móveis do orçamento', async () => {
  const cliente = (await chamar('POST', '/clientes', { nome: 'Maria Souza' })).dados;
  const modelo = (await chamar('GET', '/orcamentos/modelo')).dados;
  const tipo = (await chamar('GET', '/tipos-moveis')).dados.find((t) => t.nome === 'Guarda-roupa');
  let r = await chamar('POST', '/orcamentos', {
    ...modelo,
    cliente_id: cliente.id,
    ambientes: [
      {
        nome: 'Quarto do casal',
        itens: [{ tipo_movel_id: tipo.id, tipo_nome: tipo.nome, descricao: 'Guarda-roupa', metodo_calculo: 'linear', largura_mm: 2400, quantidade: 1, preco_padrao_cents: tipo.preco_padrao_cents, preco_unitario_interno_cents: tipo.preco_padrao_cents }],
      },
    ],
  });
  assert.equal(r.status, 201, JSON.stringify(r.dados));
  orcamentoId = r.dados.id;

  r = await chamar('POST', '/planos-corte', { orcamento_id: orcamentoId });
  assert.equal(r.status, 201, JSON.stringify(r.dados));
  plano = r.dados;
  assert.match(plano.nome, /Orçamento 0*1 · Maria Souza/);
  assert.deepEqual(plano.grupos_sugeridos, ['Quarto do casal · Guarda-roupa']);
  assert.deepEqual(plano.ajustes, { serra_decimos_mm: 40, refilo_mm: 10, modo: 'aproveitamento', margem_fita_pct: 10 });

  r = await chamar('POST', '/planos-corte', { orcamento_id: orcamentoId });
  assert.equal(r.status, 200, 'o mesmo orçamento abre o plano que já existe');
  assert.equal(r.dados.id, plano.id);
  assert.equal((await chamar('POST', '/planos-corte', { orcamento_id: 99999 })).status, 404);
});

const pecasPlano = () => [
  { grupo: 'Guarda-roupa', descricao: 'Lateral', chapa_id: branco.id, comprimento_mm: 2400, largura_mm: 550, quantidade: 2, fita_id: fita.id, fita_c1: true },
  { grupo: 'Guarda-roupa', descricao: 'Prateleira', chapa_id: branco.id, comprimento_mm: 1764, largura_mm: 530, quantidade: 4, fita_id: fita.id, fita_c1: 1 },
  { grupo: 'Guarda-roupa', descricao: 'Porta', chapa_id: carvalho.id, comprimento_mm: 2400, largura_mm: 450, quantidade: 2, veio: true, fita_id: fita.id, fita_c1: 1, fita_c2: 1, fita_l1: 1, fita_l2: 1 },
];

test('salva a lista, confere o resultado calculado e recusa resultado adulterado', async () => {
  const pecas = pecasPlano();
  let r = await chamar('PUT', `/planos-corte/${plano.id}`, { nome: plano.nome, ...plano.ajustes, versao: plano.versao, pecas });
  assert.equal(r.status, 200, JSON.stringify(r.dados));
  assert.equal(r.dados.pecas.length, 3);
  assert.equal(r.dados.resultado, null);
  assert.equal(r.dados.resumo.total_pecas, 8);
  plano = r.dados;

  const resultado = otimizarPlano({ pecas: plano.pecas, chapas: plano.chapas, ajustes: plano.ajustes, tempoMaximoMs: 500 });
  const adulterado = JSON.parse(JSON.stringify(resultado));
  adulterado.chapas[0].pecas[0].x = adulterado.chapas[0].pecas[1].x;
  adulterado.chapas[0].pecas[0].y = adulterado.chapas[0].pecas[1].y;
  r = await chamar('PUT', `/planos-corte/${plano.id}`, { nome: plano.nome, ...plano.ajustes, versao: plano.versao, pecas: plano.pecas, resultado: adulterado });
  assert.equal(r.status, 400);
  assert.match(r.dados.erro, /sobrepõem/);

  r = await chamar('PUT', `/planos-corte/${plano.id}`, { nome: plano.nome, ...plano.ajustes, versao: plano.versao, pecas: plano.pecas, resultado });
  assert.equal(r.status, 200, JSON.stringify(r.dados));
  plano = r.dados;
  assert.ok(plano.resultado);
  assert.ok(plano.calculado_em);
  assert.equal(plano.resumo.total_chapas, resultado.chapas.length);
  assert.equal(plano.resumo.custo_chapas_cents, plano.resumo.materiais.reduce((s, m) => s + m.custo_cents, 0));
  // Fita: laterais 2×2,4 m, prateleiras 4×1,764 m e portas 2×(2×2,4 + 2×0,45) m.
  assert.equal(plano.resumo.fitas[0].metros, 23.3);
});

test('mudar a descrição mantém o cálculo; mudar uma medida pede para calcular de novo', async () => {
  const pecas = plano.pecas.map((p, i) => (i ? p : { ...p, descricao: 'Lateral direita' }));
  let r = await chamar('PUT', `/planos-corte/${plano.id}`, { nome: plano.nome, ...plano.ajustes, versao: plano.versao, pecas });
  assert.ok(r.dados.resultado, 'a descrição não muda o corte');
  plano = r.dados;
  const outras = plano.pecas.map((p, i) => (i ? p : { ...p, largura_mm: 560 }));
  r = await chamar('PUT', `/planos-corte/${plano.id}`, { nome: plano.nome, ...plano.ajustes, versao: plano.versao, pecas: outras });
  assert.equal(r.dados.resultado, null);
  assert.equal(r.dados.resultado_desatualizado, true);
  plano = r.dados;
});

test('versão antiga não sobrescreve o plano', async () => {
  const r = await chamar('PUT', `/planos-corte/${plano.id}`, { nome: 'outro', ...plano.ajustes, versao: plano.versao - 1, pecas: plano.pecas });
  assert.equal(r.status, 409);
});

test('valida a lista: chapa inexistente, medidas e limite de linhas', async () => {
  const salvar = (pecas) => chamar('PUT', `/planos-corte/${plano.id}`, { nome: plano.nome, ...plano.ajustes, pecas });
  assert.equal((await salvar([{ chapa_id: 9999, comprimento_mm: 100, largura_mm: 100, quantidade: 1 }])).status, 400);
  assert.equal((await salvar([{ chapa_id: branco.id, comprimento_mm: 0, largura_mm: 100, quantidade: 1 }])).status, 400);
  assert.equal((await salvar([{ chapa_id: branco.id, comprimento_mm: 100, largura_mm: 100, quantidade: 501 }])).status, 400);
  assert.equal((await salvar(Array.from({ length: 401 }, () => ({ chapa_id: branco.id, comprimento_mm: 100, largura_mm: 100, quantidade: 1 })))).status, 400);
  const semChapa = await chamar('PUT', `/planos-corte/${plano.id}`, {
    nome: plano.nome,
    ...plano.ajustes,
    pecas: [{ comprimento_mm: 100, largura_mm: 100, quantidade: 1 }],
    resultado: { chapas: [], nao_cabem: [] },
  });
  assert.equal(semChapa.status, 400);
  assert.match(semChapa.dados.erro, /Escolha a chapa/);
});

test('gera o PDF de produção e lista os planos', async () => {
  const resultado = otimizarPlano({ pecas: plano.pecas, chapas: plano.chapas, ajustes: plano.ajustes, tempoMaximoMs: 500 });
  plano = (await chamar('PUT', `/planos-corte/${plano.id}`, { nome: plano.nome, ...plano.ajustes, pecas: plano.pecas, resultado })).dados;
  const r = await chamar('GET', `/planos-corte/${plano.id}/pdf`);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'application/pdf');
  assert.equal(r.dados.subarray(0, 5).toString(), '%PDF-');
  const lista = (await chamar('GET', '/planos-corte')).dados;
  assert.equal(lista.length, 1);
  assert.equal(lista[0].orcamento_numero, 1);
  assert.equal(lista[0].pecas, 8);
  assert.equal(lista[0].chapas, resultado.chapas.length);
});

test('nada do plano de corte vai para o cliente', async () => {
  const db = await app.locals.obterDb();
  const orc = await carregarOrcamento(db, orcamentoId);
  const empresa = await db.get('SELECT * FROM empresa WHERE id = 1');
  const texto = JSON.stringify(visaoCliente(orc, empresa));
  for (const termo of ['plano', 'chapa', 'Lateral', 'MDF', 'fita']) assert.ok(!texto.toLowerCase().includes(termo.toLowerCase()), termo);
});

test('chapa e fita em uso não são excluídas; o plano pode ser excluído', async () => {
  assert.equal((await chamar('DELETE', `/chapas/${branco.id}`)).status, 400);
  assert.equal((await chamar('DELETE', `/fitas/${fita.id}`)).status, 400);
  assert.equal((await chamar('DELETE', `/planos-corte/${plano.id}`)).status, 200);
  assert.equal((await chamar('GET', `/planos-corte/${plano.id}`)).status, 404);
  assert.equal((await chamar('DELETE', `/chapas/${branco.id}`)).status, 200);
});

test('excluir o orçamento deixa o plano avulso', async () => {
  const novo = (await chamar('POST', '/planos-corte', { orcamento_id: orcamentoId })).dados;
  assert.equal((await chamar('DELETE', `/orcamentos/${orcamentoId}`)).status, 200);
  const r = await chamar('GET', `/planos-corte/${novo.id}`);
  assert.equal(r.status, 200);
  assert.equal(r.dados.orcamento_id, null);
});
