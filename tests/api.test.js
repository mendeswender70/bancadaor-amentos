import { test, before, after } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import webpush from 'web-push';
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

async function chamar(metodo, caminho, corpo, { semCookie = false, semCabecalho = false, autorizacao } = {}) {
  const headers = {};
  if (!semCookie && cookie) headers.cookie = cookie;
  if (!semCabecalho) headers['X-Requested-With'] = 'fetch';
  if (autorizacao) headers.authorization = `Bearer ${autorizacao}`;
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
  if (process.env.TEST_BANCO === 'socket' && process.env.TEST_POSTGRES_URL) {
    url = process.env.TEST_POSTGRES_URL;
    if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname)) {
      throw new Error('TEST_POSTGRES_URL deve apontar para um banco local exclusivo para testes.');
    }
  } else if (process.env.TEST_BANCO === 'socket') {
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

test('detecta nova versão para a aba autenticada e mostra configuração do push', async () => {
  const versao = await chamar('GET', '/versao');
  assert.equal(versao.status, 200);
  assert.equal(typeof versao.dados.versao, 'string');
  const push = await chamar('GET', '/notificacoes/config');
  assert.equal(push.status, 200);
  assert.equal(typeof push.dados.configurada, 'boolean');
});

test('inscrição push fica vinculada ao usuário e pode ser removida', async () => {
  const chaves = ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY'];
  const anteriores = Object.fromEntries(chaves.map((chave) => [chave, process.env[chave]]));
  process.env.VAPID_PUBLIC_KEY = 'chave-publica-de-teste';
  process.env.VAPID_PRIVATE_KEY = 'chave-privada-de-teste';
  const inscricao = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/subscription-device-1',
    keys: { p256dh: 'a'.repeat(87), auth: 'b'.repeat(22) },
  };
  try {
    let r = await chamar('POST', '/notificacoes/push', { inscricao: { ...inscricao, endpoint: 'https://example.test/ssrf' } });
    assert.equal(r.status, 400, 'recusa endpoints fora dos serviços de push conhecidos');
    r = await chamar('POST', '/notificacoes/push', { inscricao });
    assert.equal(r.status, 200);
    const db = await app.locals.obterDb();
    assert.equal((await db.get('SELECT usuario_id FROM inscricoes_push WHERE endpoint = ?', inscricao.endpoint)).usuario_id, 1);
    r = await chamar('DELETE', '/notificacoes/push', { endpoint: inscricao.endpoint });
    assert.equal(r.status, 200);
    assert.equal(await db.get('SELECT endpoint FROM inscricoes_push WHERE endpoint = ?', inscricao.endpoint), undefined);
  } finally {
    for (const chave of chaves) {
      if (anteriores[chave] === undefined) delete process.env[chave];
      else process.env[chave] = anteriores[chave];
    }
  }
});

test('endpoint de deploy exige segredo e ignora eventos repetidos', async () => {
  const anterior = process.env.DEPLOY_NOTIFICATION_SECRET;
  process.env.DEPLOY_NOTIFICATION_SECRET = 'segredo-de-deploy-de-teste';
  const deploy = { deployment_id: 'deploy-teste-1', commit: 'abc123' };
  try {
    let r = await chamar('POST', '/deploy/notificar', deploy, { semCookie: true, autorizacao: 'incorreto' });
    assert.equal(r.status, 401);
    r = await chamar('POST', '/deploy/notificar', deploy, { semCookie: true, autorizacao: process.env.DEPLOY_NOTIFICATION_SECRET });
    assert.equal(r.status, 200);
    assert.equal(r.dados.enviadas, 0);
    r = await chamar('POST', '/deploy/notificar', deploy, { semCookie: true, autorizacao: process.env.DEPLOY_NOTIFICATION_SECRET });
    assert.equal(r.status, 200);
    assert.equal(r.dados.duplicado, true);
  } finally {
    if (anterior === undefined) delete process.env.DEPLOY_NOTIFICATION_SECRET;
    else process.env.DEPLOY_NOTIFICATION_SECRET = anterior;
  }
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

test('sugestões de ambiente começam com as padrão e ficam salvas', async () => {
  let r = await chamar('GET', '/empresa');
  assert.ok(r.dados.ambientes_sugeridos.includes('Quarto do casal'));

  r = await chamar('PUT', '/empresa/ambientes-sugeridos', { ambientes: ['Cozinha', ' Home office ', 'home office', '', 'Adega'] });
  assert.equal(r.status, 200);
  assert.deepEqual(r.dados.ambientes_sugeridos, ['Cozinha', 'Home office', 'Adega']);

  // Salvar os dados da empresa não apaga as sugestões.
  const { tem_logo, ambientes_sugeridos, id: _id, ...dados } = r.dados;
  await chamar('PUT', '/empresa', dados);
  r = await chamar('GET', '/empresa');
  assert.deepEqual(r.dados.ambientes_sugeridos, ['Cozinha', 'Home office', 'Adega']);

  r = await chamar('PUT', '/empresa/ambientes-sugeridos', { ambientes: 'Cozinha' });
  assert.equal(r.status, 400);
  r = await chamar('PUT', '/empresa/ambientes-sugeridos', { ambientes: ['x'.repeat(101)] });
  assert.equal(r.status, 400);
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
  await mudarStatus(duplicadoId, 'aprovado');
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
  await mudarStatus(orcamentoAmbientesId, 'enviado');

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
  let r = await aprovarProposta(token, { nome: 'João da Silva', aceite: true }, { semCabecalho: true });
  assert.equal(r.status, 403, 'exige o cabeçalho anti-CSRF');
  r = await aprovarProposta(token, { nome: 'João da Silva' });
  assert.equal(r.status, 400);
  r = await aprovarProposta(token, { nome: 'Jo', aceite: true });
  assert.equal(r.status, 400);
  r = await aprovarProposta(token, { nome: 'João da Silva', aceite: true });
  assert.equal(r.status, 200, JSON.stringify(r.dados));
  assert.equal(r.dados.situacao.status, 'aprovado');
  assert.equal(r.dados.situacao.aprovado_por, 'João da Silva');
  assert.equal(r.dados.situacao.pode_aprovar, false);
  // aprovar de novo não dá erro nem duplica o histórico
  r = await aprovarProposta(token, { nome: 'João da Silva', aceite: true });
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
  await mudarStatus(duplicadoId, 'recusado');
  let r = await aprovarProposta(t, { nome: 'João da Silva', aceite: true });
  assert.equal(r.status, 409);
  await mudarStatus(duplicadoId, 'enviado');
  hojeFalso = '2026-12-01';
  r = await semLogin('GET', `/publico/propostas/${t}`);
  assert.equal(r.dados.situacao.status, 'expirado');
  assert.equal(r.dados.situacao.pode_aprovar, false);
  r = await aprovarProposta(t, { nome: 'João da Silva', aceite: true });
  assert.equal(r.status, 409);
  assert.match(r.dados.erro, /validade/);
  hojeFalso = '2026-09-24';
});

test('edições seguidas (salvamento automático) viram um só registro no histórico', async () => {
  await mudarStatus(orcamentoAmbientesId, 'negociacao');
  const antes = (await chamar('GET', `/orcamentos/${orcamentoAmbientesId}/historico`)).dados.length;
  const orc = (await chamar('GET', `/orcamentos/${orcamentoAmbientesId}`)).dados;
  orc.prazo_entrega = '45 dias úteis';
  Object.assign(orc, (await chamar('PUT', `/orcamentos/${orcamentoAmbientesId}`, orc)).dados);
  orc.ambientes[0].itens[0].largura_mm = 3000;
  Object.assign(orc, (await chamar('PUT', `/orcamentos/${orcamentoAmbientesId}`, orc)).dados);
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
  assert.equal((await aprovarProposta(token, { nome: 'João da Silva', aceite: true })).status, 200);
  const d = (await chamar('GET', '/dashboard')).dados;
  assert.equal(d.mes_anterior.quantidade, 0);
  assert.ok(d.mes.validos >= 1);
  assert.ok(d.conversao.enviados >= d.conversao.aprovados && d.conversao.aprovados >= 1);
  assert.ok(d.recentes.length <= 6);
});

// As ações usam a versão que foi lida, como o editor e a página pública.
async function mudarStatus(orcId, status) {
  const atual = (await chamar('GET', `/orcamentos/${orcId}`)).dados;
  return chamar('PATCH', `/orcamentos/${orcId}/status`, { status, versao: atual.versao });
}

async function aprovarProposta(token, corpo, opcoes) {
  const proposta = (await semLogin('GET', `/publico/propostas/${token}`)).dados;
  return semLogin('POST', `/publico/propostas/${token}/aprovar`, { ...corpo, versao_proposta: proposta.versao_proposta }, opcoes);
}

async function novaProposta({ abrir = true } = {}) {
  const r = await chamar('POST', `/orcamentos/${orcamentoId}/duplicar`);
  assert.equal(r.status, 201);
  const orc = r.dados;
  const { token } = (await chamar('POST', `/orcamentos/${orc.id}/link`)).dados;
  const proposta = abrir ? (await semLogin('GET', `/publico/propostas/${token}`)).dados : null;
  return { orc, token, proposta };
}

const aceite = (proposta) => ({ nome: 'João da Silva', aceite: true, versao_proposta: proposta.versao_proposta });

test('push avisa na primeira visita e aprovação sem duplicar e sem bloquear a proposta', async () => {
  const anterior = {
    publicKey: process.env.VAPID_PUBLIC_KEY,
    privateKey: process.env.VAPID_PRIVATE_KEY,
    sendNotification: webpush.sendNotification,
  };
  const chavesVapid = webpush.generateVAPIDKeys();
  process.env.VAPID_PUBLIC_KEY = chavesVapid.publicKey;
  process.env.VAPID_PRIVATE_KEY = chavesVapid.privateKey;
  const endpoint = 'https://fcm.googleapis.com/fcm/send/push-event-device-1';
  const envios = [];
  webpush.sendNotification = async (_inscricao, payload) => envios.push(JSON.parse(payload));

  try {
    const inscricao = {
      endpoint,
      keys: { p256dh: 'a'.repeat(87), auth: 'b'.repeat(22) },
    };
    assert.equal((await chamar('POST', '/notificacoes/push', { inscricao })).status, 200);

    const { orc, token } = await novaProposta({ abrir: false });
    const primeiraVisita = await semLogin('GET', `/publico/propostas/${token}`);
    assert.equal(primeiraVisita.status, 200);
    assert.equal(envios.length, 1);
    assert.equal(envios[0].titulo, 'Proposta visualizada');
    assert.match(envios[0].texto, new RegExp(primeiraVisita.dados.numero));
    assert.equal(envios[0].caminho, `/#/orcamentos/${orc.id}`);
    assert.equal(envios[0].tag, `esquadro-proposta-${orc.id}-visualizada`);

    await semLogin('GET', `/publico/propostas/${token}`);
    assert.equal(envios.length, 1, 'visitas seguintes não repetem o aviso');

    const aprovada = await aprovarProposta(token, { nome: 'João da Silva', aceite: true });
    assert.equal(aprovada.status, 200);
    assert.equal(envios.length, 2);
    assert.equal(envios[1].titulo, 'Proposta aprovada');
    assert.match(envios[1].texto, new RegExp(aprovada.dados.numero));
    assert.equal(envios[1].caminho, `/#/orcamentos/${orc.id}`);
    assert.equal(envios[1].tag, `esquadro-proposta-${orc.id}-aprovada`);

    await aprovarProposta(token, { nome: 'João da Silva', aceite: true });
    assert.equal(envios.length, 2, 'aprovações repetidas não repetem o aviso');

    const outra = await novaProposta({ abrir: false });
    webpush.sendNotification = async () => {
      throw Object.assign(new Error('inscrição expirada'), { statusCode: 410 });
    };
    const visitaComInscricaoExpirada = await semLogin('GET', `/publico/propostas/${outra.token}`);
    assert.equal(visitaComInscricaoExpirada.status, 200, 'a falha push não impede o cliente de abrir a proposta');
    assert.equal(await (await app.locals.obterDb()).get('SELECT endpoint FROM inscricoes_push WHERE endpoint = ?', endpoint), undefined);
  } finally {
    await chamar('DELETE', '/notificacoes/push', { endpoint });
    webpush.sendNotification = anterior.sendNotification;
    for (const [chave, valor] of Object.entries({ VAPID_PUBLIC_KEY: anterior.publicKey, VAPID_PRIVATE_KEY: anterior.privateKey })) {
      if (valor === undefined) delete process.env[chave];
      else process.env[chave] = valor;
    }
  }
});

test('uma tela antiga não desfaz o aceite nem sobrescreve os valores', async () => {
  const { orc, token, proposta } = await novaProposta();
  const aprovado = await semLogin('POST', `/publico/propostas/${token}/aprovar`, aceite(proposta));
  assert.equal(aprovado.status, 200);
  const antes = (await chamar('GET', `/orcamentos/${orc.id}`)).dados;
  const historico = (await chamar('GET', `/orcamentos/${orc.id}/historico`)).dados;
  const r = await chamar('PUT', `/orcamentos/${orc.id}`, { ...orc, prazo_entrega: '99 dias' });
  assert.equal(r.status, 409);
  assert.match(r.dados.erro, /outra tela ou pelo cliente/);
  const status = await chamar('PATCH', `/orcamentos/${orc.id}/status`, { status: 'enviado', versao: orc.versao });
  assert.equal(status.status, 409);
  assert.deepEqual((await chamar('GET', `/orcamentos/${orc.id}`)).dados, antes);
  assert.deepEqual((await chamar('GET', `/orcamentos/${orc.id}/historico`)).dados, historico);
});

test('salvamento e alteração de status exigem a versão lida', async () => {
  const { orc } = await novaProposta();
  const semVersao = { ...orc };
  delete semVersao.versao;
  assert.equal((await chamar('PUT', `/orcamentos/${orc.id}`, semVersao)).status, 409);
  assert.equal((await chamar('PATCH', `/orcamentos/${orc.id}/status`, { status: 'enviado' })).status, 409);
  const primeira = await chamar('PUT', `/orcamentos/${orc.id}`, { ...orc, observacoes_internas: 'Primeira tela' });
  assert.equal(primeira.status, 200);
  const segunda = await chamar('PUT', `/orcamentos/${orc.id}`, { ...orc, observacoes_internas: 'Segunda tela' });
  assert.equal(segunda.status, 409);
  assert.equal((await chamar('GET', `/orcamentos/${orc.id}`)).dados.observacoes_internas, 'Primeira tela');
});

test('alterações comerciais retiram o aceite e exigem nova aprovação', async (t) => {
  const alteracoes = {
    'preço do móvel': (orc) => { orc.ambientes[0].itens[0].preco_unitario_interno_cents += 10000; },
    'descrição sem mudar total': (orc) => { orc.ambientes[0].itens[0].descricao += ' com acabamento novo'; },
    'condição de pagamento': (orc) => { orc.pagamento_descricao = 'Pagamento somente à vista'; },
    'entrada': (orc) => { orc.pagamento_entrada_tipo = 'percentual'; orc.pagamento_entrada_valor = 3000; },
    'prazo': (orc) => { orc.prazo_entrega = '60 dias úteis'; },
    'validade': (orc) => { orc.validade_dias += 5; },
    'observações para o cliente': (orc) => { orc.observacoes += '\nMaterial alterado.'; },
  };
  for (const [nome, alterar] of Object.entries(alteracoes)) await t.test(nome, async () => {
    const { orc, token, proposta } = await novaProposta();
    assert.equal((await semLogin('POST', `/publico/propostas/${token}/aprovar`, aceite(proposta))).status, 200);
    const atual = (await chamar('GET', `/orcamentos/${orc.id}`)).dados;
    alterar(atual);
    const r = await chamar('PUT', `/orcamentos/${orc.id}`, atual);
    assert.equal(r.status, 200, JSON.stringify(r.dados));
    assert.equal(r.dados.status, 'negociacao');
    assert.equal(r.dados.aprovado_em, null);
    assert.equal(r.dados.aprovado_por, '');
    assert.equal(r.dados.aprovado_pelo_link, 0);
    assert.equal(r.dados.versao_proposta, proposta.versao_proposta + 1);
    const antiga = await semLogin('POST', `/publico/propostas/${token}/aprovar`, aceite(proposta));
    assert.equal(antiga.status, 409);
    const nova = (await semLogin('GET', `/publico/propostas/${token}`)).dados;
    assert.equal(nova.situacao.pode_aprovar, true);
    assert.equal((await semLogin('POST', `/publico/propostas/${token}/aprovar`, aceite(nova))).status, 200);
    const hist = (await chamar('GET', `/orcamentos/${orc.id}/historico`)).dados;
    assert.equal(hist.filter((h) => h.evento === 'Proposta alterada — nova aprovação necessária').length, 1);
    assert.equal(hist.filter((h) => h.evento.startsWith('Aprovado pelo cliente')).length, 2);
  });
});

test('notas internas e salvamento sem mudanças preservam a aprovação', async () => {
  const { orc, token, proposta } = await novaProposta();
  await semLogin('POST', `/publico/propostas/${token}/aprovar`, aceite(proposta));
  const aprovado = (await chamar('GET', `/orcamentos/${orc.id}`)).dados;
  for (const notas of [aprovado.observacoes_internas, 'Anotação só da empresa']) {
    const atual = (await chamar('GET', `/orcamentos/${orc.id}`)).dados;
    const r = await chamar('PUT', `/orcamentos/${orc.id}`, { ...atual, observacoes_internas: notas });
    assert.equal(r.status, 200);
    assert.equal(r.dados.status, 'aprovado');
    assert.equal(r.dados.aprovado_em, aprovado.aprovado_em);
    assert.equal(r.dados.aprovado_por, aprovado.aprovado_por);
    assert.equal(r.dados.versao_proposta, proposta.versao_proposta);
  }
});

test('cliente com uma proposta aberta antes da edição precisa ler a versão nova', async () => {
  const { orc, token, proposta } = await novaProposta();
  const r = await chamar('PUT', `/orcamentos/${orc.id}`, { ...orc, prazo_entrega: '90 dias' });
  assert.equal(r.status, 200);
  const antiga = await semLogin('POST', `/publico/propostas/${token}/aprovar`, aceite(proposta));
  assert.equal(antiga.status, 409);
  assert.match(antiga.dados.erro, /confira os valores/);
  assert.equal((await semLogin('POST', `/publico/propostas/${token}/aprovar`, { nome: 'João da Silva', aceite: true })).status, 409);
  const atual = (await semLogin('GET', `/publico/propostas/${token}`)).dados;
  assert.equal((await semLogin('POST', `/publico/propostas/${token}/aprovar`, aceite(atual))).status, 200);
});

// O multiplexador do PGlite Socket não isola sessões Postgres concorrentes.
// Estes casos rodam no PGlite direto e também em um Postgres local real quando
// TEST_POSTGRES_URL é informado (ver README).
const concorrencia = { skip: process.env.TEST_BANCO === 'socket' && !process.env.TEST_POSTGRES_URL
  ? 'Requer Postgres real para concorrência entre conexões; use TEST_POSTGRES_URL.' : false };

test('aceites simultâneos registram uma única aprovação', concorrencia, async () => {
  const { orc, token, proposta } = await novaProposta();
  const respostas = await Promise.all([
    semLogin('POST', `/publico/propostas/${token}/aprovar`, aceite(proposta)),
    semLogin('POST', `/publico/propostas/${token}/aprovar`, { ...aceite(proposta), nome: 'Outra pessoa' }),
  ]);
  assert.deepEqual(respostas.map((r) => r.status), [200, 200]);
  const hist = (await chamar('GET', `/orcamentos/${orc.id}/historico`)).dados;
  assert.equal(hist.filter((h) => h.evento.startsWith('Aprovado pelo cliente')).length, 1);
  assert.equal(respostas[0].dados.situacao.aprovado_por, respostas[1].dados.situacao.aprovado_por);
});

test('edição e aprovação simultâneas nunca aprovam conteúdo diferente do lido', concorrencia, async () => {
  const { orc, token, proposta } = await novaProposta();
  const [edicao, aprovacao] = await Promise.all([
    chamar('PUT', `/orcamentos/${orc.id}`, { ...orc, prazo_entrega: 'Prazo novo' }),
    semLogin('POST', `/publico/propostas/${token}/aprovar`, aceite(proposta)),
  ]);
  assert.deepEqual([edicao.status, aprovacao.status].sort(), [200, 409]);
  const atual = (await chamar('GET', `/orcamentos/${orc.id}`)).dados;
  if (atual.status === 'aprovado') assert.equal(atual.prazo_entrega, orc.prazo_entrega);
  else assert.equal(atual.prazo_entrega, 'Prazo novo');
});
