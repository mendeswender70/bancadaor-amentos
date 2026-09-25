import { test, before, after } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { criarApp } from '../server/app.js';
import { visaoCliente } from '../server/visaoCliente.js';
import { carregarOrcamento } from '../server/orcamentos.js';

let servidor;
let base;
let cookie = '';
let hojeFalso = '2026-09-24';
let app;
let pastaTemp;
let pgliteServidor;
let socketServidor;

async function chamar(metodo, caminho, corpo, { semCookie = false, semCabecalho = false } = {}) {
  const headers = {};
  if (!semCookie && cookie) headers.cookie = cookie;
  if (!semCabecalho) headers['X-Requested-With'] = 'fetch';
  if (corpo !== undefined) headers['Content-Type'] = 'application/json';
  const r = await fetch(base + caminho, { method: metodo, headers, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
  const setCookie = r.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  const tipo = r.headers.get('content-type') || '';
  const dados = tipo.includes('json') ? await r.json() : Buffer.from(await r.arrayBuffer());
  return { status: r.status, dados, headers: r.headers };
}

before(async () => {
  pastaTemp = mkdtempSync(join(tmpdir(), 'orcamentos-'));
  let url = 'memory://';
  if (process.env.TEST_BANCO === 'socket') {
    // Mesmo driver da produção (postgres.js), falando com um Postgres de verdade
    // pela rede — aqui o PGlite exposto como servidor.
    const { PGlite } = await import('@electric-sql/pglite');
    const { PGLiteSocketServer } = await import('@electric-sql/pglite-socket');
    pgliteServidor = await PGlite.create();
    socketServidor = new PGLiteSocketServer({ db: pgliteServidor, port: 0, host: '127.0.0.1', maxConnections: 10 });
    await socketServidor.start();
    const porta = socketServidor.server.address().port;
    url = `postgres://postgres:postgres@127.0.0.1:${porta}/postgres?sslmode=disable`;
  }
  app = criarApp({ banco: { url }, dataHoje: () => hojeFalso });
  await new Promise((resolve) => {
    servidor = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${servidor.address().port}/api`;
});

after(async () => {
  servidor.close();
  await (await app.locals.obterDb()).close();
  await socketServidor?.stop();
  await pgliteServidor?.close();
  rmSync(pastaTemp, { recursive: true, force: true });
});

let clienteId;
let tipos;
let orcamentoId;

test('primeiro acesso cria o administrador', async () => {
  let r = await chamar('GET', '/auth/estado');
  assert.equal(r.dados.precisa_configurar, true);
  r = await chamar('GET', '/clientes');
  assert.equal(r.status, 401);
  r = await chamar('POST', '/auth/configurar', {
    nome: 'Admin',
    email: 'admin@marcenaria.com',
    senha: 'segredo123',
    empresa: 'Marcenaria Teste',
  });
  assert.equal(r.status, 201);
  r = await chamar('POST', '/auth/configurar', { nome: 'Outro', email: 'x@y.com', senha: 'segredo123' });
  assert.equal(r.status, 403, 'não pode configurar duas vezes');
});

test('login, logout e senha errada', async () => {
  await chamar('POST', '/auth/sair');
  let r = await chamar('GET', '/clientes');
  assert.equal(r.status, 401);
  r = await chamar('POST', '/auth/entrar', { email: 'admin@marcenaria.com', senha: 'errada' });
  assert.equal(r.status, 401);
  r = await chamar('POST', '/auth/entrar', { email: 'ADMIN@marcenaria.com', senha: 'segredo123' });
  assert.equal(r.status, 200);
  r = await chamar('GET', '/auth/estado');
  assert.equal(r.dados.usuario.nome, 'Admin');
});

test('alterações exigem o cabeçalho anti-CSRF', async () => {
  const r = await chamar('POST', '/clientes', { nome: 'Invasor' }, { semCabecalho: true });
  assert.equal(r.status, 403);
});

test('cadastra e procura clientes por nome, telefone e WhatsApp', async () => {
  let r = await chamar('POST', '/clientes', { nome: 'João da Silva', telefone: '(11) 3333-4444', whatsapp: '(11) 98888-7777' });
  assert.equal(r.status, 201);
  clienteId = r.dados.id;
  await chamar('POST', '/clientes', { nome: 'Maria Souza', telefone: '(21) 2222-1111' });
  r = await chamar('POST', '/clientes', { nome: '' });
  assert.equal(r.status, 400);

  r = await chamar('GET', '/clientes?q=joao');
  assert.deepEqual(r.dados.map((c) => c.nome), ['João da Silva']);
  r = await chamar('GET', '/clientes?q=98888');
  assert.deepEqual(r.dados.map((c) => c.nome), ['João da Silva']);
  r = await chamar('GET', '/clientes?q=2222');
  assert.deepEqual(r.dados.map((c) => c.nome), ['Maria Souza']);
});

test('tipos de móveis vêm com preços padrão', async () => {
  const r = await chamar('GET', '/tipos-moveis');
  tipos = Object.fromEntries(r.dados.map((t) => [t.nome, t]));
  assert.equal(tipos['Guarda-roupa'].preco_padrao_cents, 180000);
  assert.equal(tipos['Guarda-roupa'].metodo_calculo, 'linear');
  assert.equal(tipos.Bancada.metodo_calculo, 'quadrado');
});

const item = (tipo, extra) => ({
  tipo_movel_id: tipo.id,
  tipo_nome: tipo.nome,
  descricao: tipo.nome_cliente,
  metodo_calculo: tipo.metodo_calculo,
  preco_padrao_cents: tipo.preco_padrao_cents,
  preco_unitario_interno_cents: tipo.preco_padrao_cents,
  quantidade: 1,
  ...extra,
});

test('cria orçamento e o servidor recalcula os valores', async () => {
  const modelo = (await chamar('GET', '/orcamentos/modelo')).dados;
  assert.equal(modelo.validade_dias, 10);
  assert.equal(modelo.pagamento_descricao, '50% de entrada + 50% na entrega');
  const r = await chamar('POST', '/orcamentos', {
    ...modelo,
    cliente_id: clienteId,
    itens: [
      item(tipos['Guarda-roupa'], { largura_mm: 3200, valor_total_cents: 1 }), // valor enviado é ignorado
      item(tipos.Painel, { largura_mm: 2500 }),
      item(tipos['Cozinha planejada'], { largura_mm: 4800 }),
    ],
  });
  assert.equal(r.status, 201, JSON.stringify(r.dados));
  orcamentoId = r.dados.id;
  assert.equal(r.dados.numero, 1);
  assert.equal(r.dados.data_validade, '2026-10-04');
  assert.deepEqual(r.dados.ambientes[0].itens.map((i) => i.valor_total_cents), [576000, 225000, 768000]);
  assert.equal(r.dados.ambientes[0].nome, 'Móveis', 'lista simples vira o ambiente Móveis');
  assert.equal(r.dados.itens, undefined);
  assert.equal(r.dados.total_cents, 1569000);
});

test('rejeita medidas inválidas', async () => {
  const modelo = (await chamar('GET', '/orcamentos/modelo')).dados;
  const r = await chamar('POST', '/orcamentos', {
    ...modelo,
    cliente_id: clienteId,
    itens: [item(tipos['Guarda-roupa'], { largura_mm: 0 })],
  });
  assert.equal(r.status, 400);
  assert.match(r.dados.erro, /Medida/);
});

test('mudar o preço cadastrado não altera orçamentos antigos', async () => {
  let r = await chamar('PUT', '/precos', { precos: [{ id: tipos['Guarda-roupa'].id, preco_padrao_cents: 200000 }] });
  assert.equal(r.status, 200);
  r = await chamar('GET', `/orcamentos/${orcamentoId}`);
  assert.equal(r.dados.ambientes[0].itens[0].preco_unitario_interno_cents, 180000);
  assert.equal(r.dados.total_cents, 1569000);
  // Salvar o orçamento antigo de novo também mantém o preço gravado.
  r = await chamar('PUT', `/orcamentos/${orcamentoId}`, r.dados);
  assert.equal(r.dados.total_cents, 1569000);
});

test('edição registra histórico com os valores', async () => {
  let r = await chamar('GET', `/orcamentos/${orcamentoId}`);
  r = await chamar('PUT', `/orcamentos/${orcamentoId}`, {
    ...r.dados,
    servicos: [
      { descricao: 'Montagem', valor_cents: 60000, quantidade: 1 },
      { descricao: 'Frete', valor_cents: 30000, quantidade: 1 },
    ],
    desconto_tipo: 'valor',
    desconto_valor: 59000,
    status: 'enviado',
  });
  assert.equal(r.dados.total_cents, 1600000);
  r = await chamar('GET', `/orcamentos/${orcamentoId}/historico`);
  assert.deepEqual(
    r.dados.map((h) => [h.evento, h.total_cents]),
    [
      ['Orçamento criado', 1569000],
      ['Serviços adicionais alterados; Desconto aplicado; Status: Rascunho → Enviado', 1600000],
    ],
  );
});

test('preço personalizado só vale para aquele orçamento', async () => {
  const r = await chamar('GET', `/orcamentos/${orcamentoId}`);
  const orc = r.dados;
  orc.ambientes[0].itens[0].preco_unitario_interno_cents = 165000;
  const salvo = (await chamar('PUT', `/orcamentos/${orcamentoId}`, orc)).dados;
  assert.equal(salvo.ambientes[0].itens[0].valor_total_cents, 528000);
  assert.equal(salvo.ambientes[0].itens[0].preco_padrao_cents, 180000);
  const tipo = (await chamar('GET', '/tipos-moveis')).dados.find((t) => t.nome === 'Guarda-roupa');
  assert.equal(tipo.preco_padrao_cents, 200000);
});

test('a visão do cliente não contém nenhum dado interno de preço', async () => {
  const db = await app.locals.obterDb();
  const orc = await carregarOrcamento(db, orcamentoId);
  orc.observacoes_internas = 'margem de 40%';
  const empresa = await db.get('SELECT * FROM empresa WHERE id = 1');
  const v = visaoCliente(orc, empresa);
  const chaves = [];
  const coletar = (obj) => {
    if (obj && typeof obj === 'object') {
      for (const [k, valor] of Object.entries(obj)) {
        chaves.push(k);
        coletar(valor);
      }
    }
  };
  coletar(v);
  const json = JSON.stringify(v);
  for (const proibido of [
    'preco',
    'largura',
    'altura',
    'medida',
    'metodo',
    'desconto_tipo',
    'desconto_valor',
    'interno',
    'margem',
    'tipo_movel',
  ]) {
    assert.ok(!chaves.some((k) => k.includes(proibido)), `visão do cliente contém o campo "${proibido}"`);
  }
  // 1.650 e 1.800 por metro e a observação interna não aparecem em lugar nenhum.
  assert.ok(!json.includes('165000') && !json.includes('180000'));
  assert.ok(!json.includes('margem de 40%'));
  assert.deepEqual(
    v.ambientes.flatMap((a) => a.itens).map((i) => [i.descricao, i.valor_cents]),
    [
      ['Guarda-roupa planejado', 528000],
      ['Painel planejado', 225000],
      ['Cozinha planejada', 768000],
    ],
  );
  assert.equal(v.desconto_cents, 59000);
});

test('gera o PDF do cliente', async () => {
  const r = await chamar('GET', `/orcamentos/${orcamentoId}/pdf`);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'application/pdf');
  assert.match(r.headers.get('content-disposition'), /Orcamento-00001-joao-da-silva\.pdf/);
  assert.equal(r.dados.subarray(0, 5).toString(), '%PDF-');
  const semLogin = await chamar('GET', `/orcamentos/${orcamentoId}/pdf`, undefined, { semCookie: true });
  assert.equal(semLogin.status, 401);
});

test('logo da empresa entra no PDF', async () => {
  // PNG 1×1 transparente
  const png =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  let r = await chamar('PUT', '/empresa/logo', { imagem: png });
  assert.equal(r.dados.tem_logo, true);
  r = await chamar('PUT', '/empresa/logo', { imagem: 'data:image/png;base64,AAAA' });
  assert.equal(r.status, 400);
  r = await chamar('GET', `/orcamentos/${orcamentoId}/pdf`);
  assert.equal(r.status, 200);
});

let duplicadoId;
test('duplica o orçamento com novo número e mesmos preços', async () => {
  const r = await chamar('POST', `/orcamentos/${orcamentoId}/duplicar`);
  assert.equal(r.status, 201);
  duplicadoId = r.dados.id;
  assert.equal(r.dados.numero, 2);
  assert.equal(r.dados.status, 'rascunho');
  assert.equal(r.dados.duplicado_de_numero, 1);
  assert.equal(r.dados.total_cents, 1552000); // 5.280 + 2.250 + 7.680 + 900 − 590
  assert.equal(r.dados.ambientes[0].itens[0].preco_unitario_interno_cents, 165000);

  // Altera a medida na cópia: 3,50 m × R$ 1.650
  const copia = r.dados;
  copia.ambientes[0].itens[0].largura_mm = 3500;
  const salvo = (await chamar('PUT', `/orcamentos/${duplicadoId}`, copia)).dados;
  assert.equal(salvo.ambientes[0].itens[0].valor_total_cents, 577500);
  const original = (await chamar('GET', `/orcamentos/${orcamentoId}`)).dados;
  assert.equal(original.ambientes[0].itens[0].largura_mm, 3200);
});

test('histórico de orçamentos: busca por nome, número, status e valor', async () => {
  let r = await chamar('GET', '/orcamentos?q=joão');
  assert.equal(r.dados.total, 2);
  r = await chamar('GET', '/orcamentos?q=%2300002');
  assert.deepEqual(r.dados.orcamentos.map((o) => o.numero), [2]);
  r = await chamar('GET', '/orcamentos?status=rascunho');
  assert.deepEqual(r.dados.orcamentos.map((o) => o.numero), [2]);
  r = await chamar('GET', '/orcamentos?min=1550000&max=1560000');
  assert.deepEqual(r.dados.orcamentos.map((o) => o.numero), [1]);
  r = await chamar('GET', '/orcamentos?de=2026-09-01&ate=2026-09-30');
  assert.equal(r.dados.total, 2);
  r = await chamar('GET', '/orcamentos?q=maria');
  assert.equal(r.dados.total, 0);
});

test('dashboard mostra indicadores do mês', async () => {
  const r = await chamar('GET', '/dashboard');
  assert.equal(r.dados.mes.quantidade, 2);
  assert.equal(r.dados.em_aberto, 2);
  assert.equal(r.dados.mes.aprovados, 0);
  assert.equal(r.dados.recentes.length, 2);
  await chamar('PATCH', `/orcamentos/${duplicadoId}/status`, { status: 'aprovado' });
  const r2 = await chamar('GET', '/dashboard');
  assert.equal(r2.dados.mes.aprovados, 1);
  assert.equal(r2.dados.em_aberto, 1);
});

test('orçamento enviado expira após a validade', async () => {
  hojeFalso = '2026-10-05';
  const r = await chamar('GET', `/orcamentos/${orcamentoId}`);
  assert.equal(r.dados.status, 'expirado');
  const aprovado = await chamar('GET', `/orcamentos/${duplicadoId}`);
  assert.equal(aprovado.dados.status, 'aprovado', 'aprovado não expira');
  hojeFalso = '2026-09-24';
});

test('não exclui cliente com orçamentos', async () => {
  const r = await chamar('DELETE', `/clientes/${clienteId}`);
  assert.equal(r.status, 400);
});

let orcamentoAmbientesId;
test('orçamento com móveis separados por ambiente', async () => {
  const modelo = (await chamar('GET', '/orcamentos/modelo')).dados;
  let r = await chamar('POST', '/orcamentos', {
    ...modelo,
    cliente_id: clienteId,
    ambientes: [
      {
        nome: 'Quarto do casal',
        descricao: 'MDF branco, puxador cava',
        itens: [item(tipos['Guarda-roupa'], { largura_mm: 3200 }), item(tipos['Criado-mudo'], { quantidade: 2 })],
      },
      { nome: 'Cozinha', itens: [item(tipos['Cozinha planejada'], { largura_mm: 4800 })] },
      { nome: 'Sala de estar', itens: [] },
    ],
  });
  assert.equal(r.status, 201, JSON.stringify(r.dados));
  orcamentoAmbientesId = r.dados.id;
  assert.deepEqual(
    r.dados.ambientes.map((a) => [a.nome, a.itens.length]),
    [
      ['Quarto do casal', 2],
      ['Cozinha', 1],
      ['Sala de estar', 0],
    ],
  );
  // guarda-roupa 3,20 m × R$ 1.800 + 2 criados-mudos + cozinha
  assert.equal(r.dados.total_cents, 576000 + 160000 + 768000);

  // Move a cozinha para o quarto e remove a sala
  const orc = r.dados;
  orc.ambientes[0].itens.push(orc.ambientes[1].itens[0]);
  orc.ambientes.splice(1, 2);
  r = await chamar('PUT', `/orcamentos/${orcamentoAmbientesId}`, orc);
  assert.deepEqual(r.dados.ambientes.map((a) => [a.nome, a.itens.length]), [['Quarto do casal', 3]]);
  assert.equal(r.dados.total_cents, 576000 + 160000 + 768000);
  const hist = (await chamar('GET', `/orcamentos/${orcamentoAmbientesId}/historico`)).dados;
  assert.equal(hist.at(-1).evento, 'Ambiente removido; Móveis alterados');

  r = await chamar('POST', '/orcamentos', { ...modelo, cliente_id: clienteId, ambientes: [{ nome: '', itens: [] }] });
  assert.equal(r.status, 400);
  assert.match(r.dados.erro, /Nome do ambiente/);

  const pdf = await chamar('GET', `/orcamentos/${orcamentoAmbientesId}/pdf`);
  assert.equal(pdf.status, 200);
});

// ------------------------------------------------ Link da proposta (público)

const semLogin = (metodo, caminho, corpo, opcoes = {}) => chamar(metodo, caminho, corpo, { semCookie: true, ...opcoes });

let token;
test('link da proposta mostra ao cliente só o que ele pode ver', async () => {
  let orc = (await chamar('GET', `/orcamentos/${orcamentoAmbientesId}`)).dados;
  orc.observacoes_internas = 'margem de 40%';
  await chamar('PUT', `/orcamentos/${orcamentoAmbientesId}`, orc);
  await chamar('PATCH', `/orcamentos/${orcamentoAmbientesId}/status`, { status: 'enviado' });

  let r = await chamar('POST', `/orcamentos/${orcamentoAmbientesId}/link`);
  assert.equal(r.status, 200);
  token = r.dados.token;
  assert.match(token, /^[A-Za-z0-9_-]{32}$/);
  assert.equal(r.dados.caminho, `/p/${token}`);
  r = await chamar('POST', `/orcamentos/${orcamentoAmbientesId}/link`);
  assert.equal(r.dados.token, token, 'o link não muda');
  assert.equal((await semLogin('POST', `/orcamentos/${orcamentoAmbientesId}/link`)).status, 401);

  r = await semLogin('GET', `/publico/propostas/${token}`);
  assert.equal(r.status, 200);
  const p = r.dados;
  assert.equal(p.numero, '00003');
  assert.deepEqual(p.cliente, { nome: 'João da Silva', cidade: '', estado: '' }, 'sem telefone do cliente no link');
  assert.equal(p.situacao.status, 'enviado');
  assert.equal(p.situacao.pode_aprovar, true);
  assert.equal(p.tem_logo, true);
  const chaves = [];
  const coletar = (obj) => {
    if (obj && typeof obj === 'object') for (const [k, v] of Object.entries(obj)) chaves.push(k), coletar(v);
  };
  coletar(p);
  for (const proibido of ['preco', 'largura', 'altura', 'medida', 'metodo', 'interno', 'tipo_movel', 'token']) {
    assert.ok(!chaves.some((k) => k.includes(proibido)), `a proposta pública contém o campo "${proibido}"`);
  }
  const json = JSON.stringify(p);
  assert.ok(!json.includes('180000') && !json.includes('margem de 40%') && !json.includes('98888'));

  assert.equal((await semLogin('GET', '/publico/propostas/abc')).status, 404);
  assert.equal((await semLogin('GET', `/publico/propostas/${'x'.repeat(32)}`)).status, 404);
  const logo = await semLogin('GET', `/publico/propostas/${token}/logo`);
  assert.equal(logo.status, 200);
  const pdf = await semLogin('GET', `/publico/propostas/${token}/pdf`);
  assert.equal(pdf.dados.subarray(0, 5).toString(), '%PDF-');
});

test('visitas do cliente são contadas; as da própria empresa, não', async () => {
  let orc = (await chamar('GET', `/orcamentos/${orcamentoAmbientesId}`)).dados;
  assert.equal(orc.visualizacoes, 1);
  await chamar('GET', `/publico/propostas/${token}`); // logado: não conta
  await semLogin('GET', `/publico/propostas/${token}`);
  orc = (await chamar('GET', `/orcamentos/${orcamentoAmbientesId}`)).dados;
  assert.equal(orc.visualizacoes, 2);
  const hist = (await chamar('GET', `/orcamentos/${orcamentoAmbientesId}/historico`)).dados;
  assert.equal(hist.filter((h) => h.evento === 'Cliente abriu a proposta pelo link').length, 1);
  const painel = (await chamar('GET', '/dashboard')).dados;
  assert.ok(painel.atencao.some((a) => a.id === orcamentoAmbientesId && a.motivo === 'visto'));
});

test('cliente aprova a proposta pelo link', async () => {
  let r = await semLogin('POST', `/publico/propostas/${token}/aprovar`, { nome: 'João da Silva', aceite: true }, { semCabecalho: true });
  assert.equal(r.status, 403, 'exige o cabeçalho anti-CSRF');
  r = await semLogin('POST', `/publico/propostas/${token}/aprovar`, { nome: 'João da Silva' });
  assert.equal(r.status, 400);
  r = await semLogin('POST', `/publico/propostas/${token}/aprovar`, { nome: 'Jo', aceite: true });
  assert.equal(r.status, 400);
  r = await semLogin('POST', `/publico/propostas/${token}/aprovar`, { nome: 'João da Silva', aceite: true });
  assert.equal(r.status, 200, JSON.stringify(r.dados));
  assert.equal(r.dados.situacao.status, 'aprovado');
  assert.equal(r.dados.situacao.aprovado_por, 'João da Silva');
  assert.equal(r.dados.situacao.pode_aprovar, false);
  // aprovar de novo não dá erro nem duplica o histórico
  r = await semLogin('POST', `/publico/propostas/${token}/aprovar`, { nome: 'João da Silva', aceite: true });
  assert.equal(r.status, 200);

  const orc = (await chamar('GET', `/orcamentos/${orcamentoAmbientesId}`)).dados;
  assert.equal(orc.status, 'aprovado');
  assert.equal(orc.aprovado_pelo_link, 1);
  assert.equal(orc.aprovado_por, 'João da Silva');
  const hist = (await chamar('GET', `/orcamentos/${orcamentoAmbientesId}/historico`)).dados;
  assert.equal(hist.filter((h) => h.evento.startsWith('Aprovado pelo cliente')).length, 1);
  const painel = (await chamar('GET', '/dashboard')).dados;
  assert.ok(painel.atencao.some((a) => a.id === orcamentoAmbientesId && a.motivo === 'aprovado'));
  const clientes = (await chamar('GET', '/clientes?q=joao')).dados;
  assert.ok(clientes[0].aprovado_cents >= orc.total_cents);
});

test('proposta vencida ou recusada não pode ser aprovada', async () => {
  const { token: t } = (await chamar('POST', `/orcamentos/${duplicadoId}/link`)).dados;
  await chamar('PATCH', `/orcamentos/${duplicadoId}/status`, { status: 'recusado' });
  let r = await semLogin('POST', `/publico/propostas/${t}/aprovar`, { nome: 'João da Silva', aceite: true });
  assert.equal(r.status, 409);
  await chamar('PATCH', `/orcamentos/${duplicadoId}/status`, { status: 'enviado' });
  hojeFalso = '2026-12-01';
  r = await semLogin('GET', `/publico/propostas/${t}`);
  assert.equal(r.dados.situacao.status, 'expirado');
  assert.equal(r.dados.situacao.pode_aprovar, false);
  r = await semLogin('POST', `/publico/propostas/${t}/aprovar`, { nome: 'João da Silva', aceite: true });
  assert.equal(r.status, 409);
  assert.match(r.dados.erro, /validade/);
  hojeFalso = '2026-09-24';
});

test('edições seguidas (salvamento automático) viram um só registro no histórico', async () => {
  const antes = (await chamar('GET', `/orcamentos/${orcamentoAmbientesId}/historico`)).dados.length;
  const orc = (await chamar('GET', `/orcamentos/${orcamentoAmbientesId}`)).dados;
  orc.prazo_entrega = '45 dias úteis';
  await chamar('PUT', `/orcamentos/${orcamentoAmbientesId}`, orc);
  orc.ambientes[0].itens[0].largura_mm = 3000;
  await chamar('PUT', `/orcamentos/${orcamentoAmbientesId}`, orc);
  orc.ambientes[0].itens[0].largura_mm = 3100;
  await chamar('PUT', `/orcamentos/${orcamentoAmbientesId}`, orc);
  const hist = (await chamar('GET', `/orcamentos/${orcamentoAmbientesId}/historico`)).dados;
  assert.equal(hist.length, antes + 1);
  assert.equal(hist.at(-1).evento, 'Condições e observações alteradas; Móveis alterados');
  assert.equal(hist.at(-1).total_cents, 180000 * 3.1 + 160000 + 768000);
});

test('lista de orçamentos: grupo "perdidos", ambientes e WhatsApp do cliente', async () => {
  const r = await chamar('GET', '/orcamentos?status=perdidos');
  assert.ok(r.dados.orcamentos.length >= 1);
  assert.ok(r.dados.orcamentos.every((o) => ['recusado', 'cancelado', 'expirado'].includes(o.status)));
  const todos = (await chamar('GET', '/orcamentos')).dados.orcamentos;
  const comAmbientes = todos.find((o) => o.id === orcamentoAmbientesId);
  assert.equal(comAmbientes.ambientes, 1);
  assert.equal(comAmbientes.cliente_whatsapp, '(11) 98888-7777');
});

test('dashboard compara com o mês anterior e calcula a taxa de aprovação', async () => {
  const d = (await chamar('GET', '/dashboard')).dados;
  assert.equal(d.mes_anterior.quantidade, 0);
  assert.ok(d.mes.validos >= 1);
  assert.ok(d.conversao.enviados >= d.conversao.aprovados && d.conversao.aprovados >= 1);
  assert.ok(d.recentes.length <= 6);
});
