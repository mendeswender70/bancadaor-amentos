import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { criarApp } from '../server/app.js';
import { visaoCliente } from '../server/visaoCliente.js';
import { carregarOrcamento } from '../server/orcamentos.js';
import { detalharSolucao, otimizarPlano, passosDaSerra } from '../public/shared/corte.js';

let servidor;
let base;
let app;
let pg;
let sock;
const cookies = {};

/** `quem`: 'admin', 'joao', 'pedro' ou null (sem sessão). */
async function chamar(quem, metodo, caminho, corpo) {
  const headers = { 'X-Requested-With': 'fetch' };
  if (quem && cookies[quem]) headers.cookie = cookies[quem];
  if (corpo !== undefined) headers['Content-Type'] = 'application/json';
  const r = await fetch(base + caminho, { method: metodo, headers, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
  const setCookie = r.headers.get('set-cookie');
  if (setCookie && quem) cookies[quem] = setCookie.split(';')[0];
  const tipo = r.headers.get('content-type') || '';
  const dados = tipo.includes('json') ? await r.json() : Buffer.from(await r.arrayBuffer());
  return { status: r.status, dados, headers: r.headers };
}

before(async () => {
  let url = 'memory://';
  let conexoes;
  if (process.env.TEST_BANCO === 'socket') {
    // Mesmo driver da produção (postgres.js), falando com o PGlite pela rede.
    const { PGlite } = await import('@electric-sql/pglite');
    const { PGLiteSocketServer } = await import('@electric-sql/pglite-socket');
    pg = await PGlite.create();
    sock = new PGLiteSocketServer({ db: pg, port: 0, host: '127.0.0.1', maxConnections: 10 });
    await sock.start();
    url = `postgres://postgres:postgres@127.0.0.1:${sock.server.address().port}/postgres?sslmode=disable`;
    conexoes = 1;
  }
  app = criarApp({ banco: { url, conexoes }, dataHoje: () => '2026-11-10' });
  await new Promise((resolve) => {
    servidor = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${servidor.address().port}/api`;
  const anterior = process.env.INITIAL_ADMIN_SETUP_SECRET;
  process.env.INITIAL_ADMIN_SETUP_SECRET = 'chave-inicial-de-teste-comprida';
  const r = await chamar('admin', 'POST', '/auth/configurar', {
    chave_configuracao: process.env.INITIAL_ADMIN_SETUP_SECRET,
    nome: 'Wender',
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
  await sock?.stop();
  await pg?.close();
});

let branco;
let carvalho;
let fita;
let joao;
let pedro;
let orcamentoId;
let trabalho;

test('o escritório cadastra chapas, fita e a equipe', async () => {
  branco = (await chamar('admin', 'POST', '/chapas', { nome: 'MDF Branco', espessura_mm: 18, comprimento_mm: 2750, largura_mm: 1840, preco_cents: 30000 })).dados;
  carvalho = (await chamar('admin', 'POST', '/chapas', { nome: 'MDF Carvalho', espessura_mm: 18, comprimento_mm: 2750, largura_mm: 1840, veio: true, preco_cents: 45000 })).dados;
  fita = (await chamar('admin', 'POST', '/fitas', { nome: 'Branca 22 mm', preco_metro_cents: 150 })).dados;
  assert.equal(branco.preco_cents, 30000);

  let r = await chamar('admin', 'POST', '/funcionarios', { nome: 'João', login: 'Joao.Silva', senha: 'serra123' });
  assert.equal(r.status, 201, JSON.stringify(r.dados));
  joao = r.dados;
  assert.equal(joao.login, 'joao.silva');
  pedro = (await chamar('admin', 'POST', '/funcionarios', { nome: 'Pedro', login: 'pedro', senha: 'serra456' })).dados;
  assert.equal((await chamar('admin', 'POST', '/funcionarios', { nome: 'Outro', login: 'pedro', senha: 'serra456' })).status, 400, 'usuário repetido');
  assert.equal((await chamar('admin', 'POST', '/funcionarios', { nome: 'Outro', login: 'a b', senha: 'serra456' })).status, 400, 'usuário inválido');
  assert.equal((await chamar('admin', 'GET', '/funcionarios')).dados.length, 2);
});

test('funcionário entra com o usuário e só acessa a produção', async () => {
  let r = await chamar('joao', 'POST', '/auth/entrar', { email: 'JOAO.SILVA', senha: 'serra123' });
  assert.equal(r.status, 200);
  assert.equal((await chamar('pedro', 'POST', '/auth/entrar', { email: 'pedro', senha: 'serra456' })).status, 200);
  r = await chamar('joao', 'GET', '/auth/estado');
  assert.equal(r.dados.usuario.tipo, 'producao');
  for (const caminho of ['/clientes', '/orcamentos', '/empresa', '/dashboard', '/funcionarios', '/chapas', '/relatorios']) {
    assert.equal((await chamar('joao', 'GET', caminho)).status, 403, caminho);
  }
  r = await chamar('joao', 'GET', '/producao/inicio');
  assert.equal(r.status, 200);
  assert.equal(r.dados.usuario.escritorio, false);
  assert.equal(r.dados.config.guia_paralela_mm, 900);
  assert.deepEqual(r.dados.funcionarios, []);
  r = await chamar('joao', 'GET', '/producao/chapas');
  assert.ok(r.dados.every((c) => c.preco_cents === undefined), 'funcionário não recebe preço');
  r = await chamar('joao', 'GET', '/producao/fitas');
  assert.ok(r.dados.every((f) => f.preco_metro_cents === undefined));
  assert.equal((await chamar('joao', 'PUT', '/producao/config', { refilo_mm: 5 })).status, 403);
});

test('o escritório manda um orçamento para o João, com instruções', async () => {
  const cliente = (await chamar('admin', 'POST', '/clientes', { nome: 'Maria Souza' })).dados;
  const modelo = (await chamar('admin', 'GET', '/orcamentos/modelo')).dados;
  const tipo = (await chamar('admin', 'GET', '/tipos-moveis')).dados.find((t) => t.nome === 'Guarda-roupa');
  let r = await chamar('admin', 'POST', '/orcamentos', {
    ...modelo,
    cliente_id: cliente.id,
    ambientes: [
      {
        nome: 'Quarto do casal',
        descricao: 'MDF branco TX, portas em carvalho',
        itens: [{ tipo_movel_id: tipo.id, tipo_nome: tipo.nome, descricao: 'Guarda-roupa', metodo_calculo: 'linear', largura_mm: 2400, quantidade: 1, preco_padrao_cents: tipo.preco_padrao_cents, preco_unitario_interno_cents: tipo.preco_padrao_cents }],
      },
    ],
  });
  assert.equal(r.status, 201);
  orcamentoId = r.dados.id;
  assert.equal((await chamar('admin', 'POST', `/orcamentos/${orcamentoId}/producao`, { funcionario_id: 99999 })).status, 400);
  r = await chamar('admin', 'POST', `/orcamentos/${orcamentoId}/producao`, { funcionario_id: joao.id, instrucoes: 'Portas com veio na vertical.' });
  assert.equal(r.status, 201, JSON.stringify(r.dados));
  trabalho = r.dados;
  assert.equal(trabalho.funcionario_nome, 'João');
  assert.equal(trabalho.situacao, 'novo');
  assert.equal(trabalho.atribuido, true);
  assert.equal(trabalho.ajustes.serra_decimos_mm, 40, 'vem da configuração da serra');
});

test('só o dono vê o trabalho, e sem nenhum valor do orçamento', async () => {
  let r = await chamar('joao', 'GET', '/producao/planos');
  assert.deepEqual(r.dados.map((p) => p.id), [trabalho.id]);
  assert.deepEqual((await chamar('pedro', 'GET', '/producao/planos')).dados, []);
  assert.equal((await chamar('pedro', 'GET', `/producao/planos/${trabalho.id}`)).status, 404);
  r = await chamar('joao', 'GET', `/producao/planos/${trabalho.id}`);
  assert.equal(r.status, 200);
  assert.equal(r.dados.instrucoes, 'Portas com veio na vertical.');
  assert.equal(r.dados.trabalho.cliente_nome, 'Maria Souza');
  assert.deepEqual(r.dados.trabalho.ambientes[0].itens, [{ nome: 'Guarda-roupa', tipo: 'Guarda-roupa', medida: '2,40 m', quantidade: 1 }]);
  const json = JSON.stringify(r.dados);
  assert.ok(!/cents|preco/.test(json), 'nenhum preço nem total para o funcionário');
  // O escritório vê todos os planos, filtra por funcionário e vê o total do orçamento.
  r = await chamar('admin', 'GET', `/producao/planos?funcionario=${joao.id}`);
  assert.equal(r.dados.length, 1);
  r = await chamar('admin', 'GET', `/producao/planos/${trabalho.id}`);
  assert.ok(r.dados.orcamento_total_cents > 0);
});

const pecasGuardaRoupa = () => [
  { grupo: 'Guarda-roupa', descricao: 'Lateral', chapa_id: branco.id, comprimento_mm: 2400, largura_mm: 550, quantidade: 2, fita_id: fita.id, fita_c1: 1 },
  { grupo: 'Guarda-roupa', descricao: 'Prateleira', chapa_id: branco.id, comprimento_mm: 1764, largura_mm: 530, quantidade: 4, fita_id: fita.id, fita_c1: 1 },
  { grupo: 'Guarda-roupa', descricao: 'Porta', chapa_id: carvalho.id, comprimento_mm: 2400, largura_mm: 450, quantidade: 2, veio: 1 },
];

const calcular = (plano) =>
  otimizarPlano({ pecas: plano.pecas, chapas: plano.chapas, ajustes: plano.ajustes, retalhos: plano.usar_retalhos ? plano.retalhos.filter((r) => r.situacao !== 'usado') : [], tempoMaximoMs: 400 });

test('o João monta, calcula e o servidor confere', async () => {
  let r = await chamar('joao', 'PUT', `/producao/planos/${trabalho.id}`, { ...trabalho.ajustes, versao: trabalho.versao, pecas: pecasGuardaRoupa() });
  assert.equal(r.status, 200, JSON.stringify(r.dados));
  assert.equal(r.dados.situacao, 'montando');
  let plano = r.dados;
  const resultado = calcular(plano);
  const adulterado = JSON.parse(JSON.stringify(resultado));
  adulterado.solucoes[0].chapas[0].pecas[0].girada = !adulterado.solucoes[0].chapas[0].pecas[0].girada;
  r = await chamar('joao', 'PUT', `/producao/planos/${plano.id}`, { ...plano.ajustes, versao: plano.versao, pecas: plano.pecas, resultado: adulterado });
  assert.equal(r.status, 400);
  r = await chamar('joao', 'PUT', `/producao/planos/${plano.id}`, { ...plano.ajustes, versao: plano.versao, pecas: plano.pecas, resultado });
  assert.equal(r.status, 200, JSON.stringify(r.dados));
  plano = r.dados;
  assert.equal(plano.situacao, 'pronto');
  assert.equal(plano.resultado.solucoes.length, resultado.solucoes.length);
  assert.equal(plano.custo, undefined, 'funcionário não vê custo');
  r = await chamar('admin', 'GET', `/producao/planos/${plano.id}`);
  assert.equal(r.dados.custo.chapas_cents, (r.dados.resultado.solucoes[0].chapas.filter((c) => c.chapa_id === branco.id).length * 30000) + 45000);
  trabalho = plano;
});

test('versão antiga não sobrescreve o plano', async () => {
  const r = await chamar('joao', 'PUT', `/producao/planos/${trabalho.id}`, { versao: trabalho.versao - 1, pecas: trabalho.pecas });
  assert.equal(r.status, 409);
});

let retalhoId;
let recorte;

test('retalho guardado é usado no recorte e fica reservado para ele', async () => {
  let r = await chamar('joao', 'POST', '/producao/retalhos', { retalhos: [{ chapa_id: branco.id, comprimento_mm: 1500, largura_mm: 800, local: 'Prateleira A' }], origem_plano_id: trabalho.id });
  assert.equal(r.status, 201);
  [retalhoId] = r.dados.ids;
  r = await chamar('joao', 'POST', '/producao/planos', {
    recorte_de: trabalho.id,
    pecas: [{ grupo: 'Guarda-roupa', descricao: 'Prateleira', chapa_id: branco.id, comprimento_mm: 700, largura_mm: 400, quantidade: 2 }],
  });
  assert.equal(r.status, 201, JSON.stringify(r.dados));
  recorte = r.dados;
  assert.match(recorte.nome, /^Recorte · /);
  assert.equal(recorte.orcamento_id, orcamentoId, 'o recorte continua ligado ao orçamento');
  assert.ok(recorte.retalhos.some((x) => x.id === retalhoId));
  const resultado = calcular(recorte);
  assert.deepEqual(resultado.solucoes[0].chapas.map((c) => c.retalho_id), [retalhoId], 'cabe no retalho, sem chapa nova');
  r = await chamar('joao', 'PUT', `/producao/planos/${recorte.id}`, { versao: recorte.versao, pecas: recorte.pecas, resultado });
  assert.equal(r.status, 200, JSON.stringify(r.dados));
  recorte = r.dados;
  r = await chamar('joao', 'GET', '/producao/retalhos?situacao=reservado');
  assert.deepEqual(r.dados.map((x) => x.id), [retalhoId]);
  assert.equal(r.dados[0].plano_nome, recorte.nome);
  // Reservado não pode ser descartado nem usado por outro plano.
  assert.equal((await chamar('pedro', 'PUT', `/producao/retalhos/${retalhoId}`, { situacao: 'descartado' })).status, 400);
  const outro = (await chamar('pedro', 'POST', '/producao/planos', { nome: 'Prateleira avulsa' })).dados;
  assert.ok(!outro.retalhos.some((x) => x.id === retalhoId), 'Pedro não recebe o retalho reservado');
  const pecasPedro = [{ descricao: 'Prateleira', chapa_id: branco.id, comprimento_mm: 700, largura_mm: 400, quantidade: 1 }];
  const salvo = (await chamar('pedro', 'PUT', `/producao/planos/${outro.id}`, { pecas: pecasPedro })).dados;
  const roubado = otimizarPlano({ pecas: salvo.pecas, chapas: salvo.chapas, ajustes: salvo.ajustes, retalhos: [{ id: retalhoId, chapa_id: branco.id, comprimento_mm: 1500, largura_mm: 800 }], tempoMaximoMs: 200 });
  r = await chamar('pedro', 'PUT', `/producao/planos/${outro.id}`, { pecas: salvo.pecas, resultado: roubado });
  assert.equal(r.status, 400);
  assert.match(r.dados.erro, /retalho/);
});

test('o andamento do corte é salvo e, ao concluir, o retalho vira usado', async () => {
  const solucao = recorte.resultado.solucoes[0];
  const passos = passosDaSerra(detalharSolucao(recorte, solucao), { guiaParalelaMm: recorte.config.guia_paralela_mm });
  let r = await chamar('joao', 'PUT', `/producao/planos/${recorte.id}/progresso`, { passo: 1, total: passos.length, estragadas: [] });
  assert.equal(r.status, 200, JSON.stringify(r.dados));
  assert.equal(r.dados.situacao, 'cortando');
  assert.equal(r.dados.progresso.passo, 1);
  assert.equal((await chamar('pedro', 'PUT', `/producao/planos/${recorte.id}/progresso`, { passo: 2, total: passos.length })).status, 404);
  // Trocar de solução depois de começar pede confirmação.
  assert.equal((await chamar('joao', 'PUT', `/producao/planos/${recorte.id}/solucao`, { escolhida: 0 })).status, 409);
  r = await chamar('joao', 'PUT', `/producao/planos/${recorte.id}/progresso`, { passo: passos.length, total: passos.length, estragadas: [2], concluido: true });
  assert.equal(r.dados.situacao, 'concluido');
  assert.deepEqual(r.dados.progresso.estragadas, [2]);
  r = await chamar('joao', 'GET', '/producao/retalhos?situacao=usado');
  assert.deepEqual(r.dados.map((x) => x.id), [retalhoId]);
  assert.equal((await chamar('joao', 'PUT', `/producao/planos/${recorte.id}`, { pecas: recorte.pecas })).status, 400, 'plano concluído não muda');
  assert.equal((await chamar('joao', 'GET', '/producao/planos')).dados.some((p) => p.id === recorte.id), false);
  assert.equal((await chamar('joao', 'GET', '/producao/planos?concluidos=1')).dados[0].id, recorte.id);
});

test('o escritório acompanha os trabalhos no orçamento, com custo', async () => {
  const r = await chamar('admin', 'GET', `/orcamentos/${orcamentoId}/producao`);
  assert.equal(r.status, 200);
  assert.equal(r.dados.length, 2);
  assert.deepEqual(r.dados.map((p) => p.situacao).sort(), ['concluido', 'pronto']);
  assert.ok(r.dados.find((p) => p.id === trabalho.id).custo.chapas_cents > 0);
  assert.equal((await chamar('joao', 'GET', `/orcamentos/${orcamentoId}/producao`)).status, 403);
});

test('trabalho mandado pelo escritório não é excluído pelo funcionário', async () => {
  assert.equal((await chamar('joao', 'DELETE', `/producao/planos/${trabalho.id}`)).status, 400);
  const avulso = (await chamar('joao', 'POST', '/producao/planos', { nome: 'Nicho' })).dados;
  assert.equal(avulso.atribuido, false);
  assert.equal((await chamar('joao', 'DELETE', `/producao/planos/${avulso.id}`)).status, 200);
});

test('gera o PDF de produção para o funcionário', async () => {
  const r = await chamar('joao', 'GET', `/producao/planos/${trabalho.id}/pdf`);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'application/pdf');
  assert.equal(r.dados.subarray(0, 5).toString(), '%PDF-');
});

test('nada da produção vai para o cliente', async () => {
  const db = await app.locals.obterDb();
  const orc = await carregarOrcamento(db, orcamentoId);
  const empresa = await db.get('SELECT * FROM empresa WHERE id = 1');
  const texto = JSON.stringify(visaoCliente(orc, empresa)).toLowerCase();
  for (const termo of ['plano', 'chapa', 'retalho', 'joão', 'portas com veio']) assert.ok(!texto.includes(termo), termo);
});

test('funcionário desativado perde o acesso na hora', async () => {
  let r = await chamar('admin', 'PUT', `/funcionarios/${pedro.id}`, { nome: 'Pedro', login: 'pedro', ativo: false });
  assert.equal(r.status, 200);
  assert.equal(r.dados.ativo, 0);
  assert.equal((await chamar('pedro', 'GET', '/producao/planos')).status, 401);
  assert.equal((await chamar('pedro', 'POST', '/auth/entrar', { email: 'pedro', senha: 'serra456' })).status, 401);
  r = await chamar('admin', 'PUT', `/funcionarios/${pedro.id}`, { nome: 'Pedro', login: 'pedro', ativo: true, senha: 'nova-senha' });
  assert.equal((await chamar('pedro', 'POST', '/auth/entrar', { email: 'pedro', senha: 'nova-senha' })).status, 200);
});

test('chapa em uso ou com retalho no estoque não é excluída', async () => {
  assert.equal((await chamar('admin', 'DELETE', `/chapas/${branco.id}`)).status, 400);
  assert.equal((await chamar('admin', 'DELETE', `/fitas/${fita.id}`)).status, 400);
});
