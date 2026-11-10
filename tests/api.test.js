import { test, before, after } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import webpush from 'web-push';
import { formatarDinheiro, somarDias } from '../public/shared/calc.js';
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

async function chamar(metodo, caminho, corpo, { semCookie = false, semCabecalho = false, autorizacao, cookieOverride } = {}) {
  const headers = {};
  if (cookieOverride !== undefined) headers.cookie = cookieOverride;
  else if (!semCookie && cookie) headers.cookie = cookie;
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
  // O PGlite por socket não aceita consultas simultâneas em conexões diferentes;
  // com uma conexão só, o postgres.js enfileira as consultas paralelas.
  const conexoes = process.env.TEST_BANCO === 'socket' && !process.env.TEST_POSTGRES_URL ? 1 : undefined;
  app = criarApp({ banco: { url, conexoes }, dataHoje: () => hojeFalso });
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
  const anterior = process.env.INITIAL_ADMIN_SETUP_SECRET;
  delete process.env.INITIAL_ADMIN_SETUP_SECRET;
  try {
    let r = await chamar('GET', '/auth/estado');
    assert.equal(r.dados.precisa_configurar, true);
    assert.equal(r.dados.configuracao_inicial_habilitada, false);
    r = await chamar('GET', '/clientes');
    assert.equal(r.status, 401);
    r = await chamar('POST', '/auth/configurar', { nome: 'Admin', email: 'admin@marcenaria.com', senha: 'segredo123' });
    assert.equal(r.status, 503, 'sem autorização, o primeiro administrador não pode ser criado');

    process.env.INITIAL_ADMIN_SETUP_SECRET = 'chave-inicial-de-teste-comprida';
    r = await chamar('GET', '/auth/estado');
    assert.equal(r.dados.configuracao_inicial_habilitada, true);
    r = await chamar('POST', '/auth/configurar', {
      chave_configuracao: 'chave-errada',
      nome: 'Admin',
      email: 'admin@marcenaria.com',
      senha: 'segredo123',
    });
    assert.equal(r.status, 403, 'a chave incorreta não cria administrador');
    r = await chamar('POST', '/auth/configurar', {
      chave_configuracao: process.env.INITIAL_ADMIN_SETUP_SECRET,
      nome: 'Admin',
      email: 'admin@marcenaria.com',
      senha: 'segredo123',
      empresa: 'Marcenaria Teste',
    });
    assert.equal(r.status, 201);
    r = await chamar('POST', '/auth/configurar', {
      chave_configuracao: process.env.INITIAL_ADMIN_SETUP_SECRET,
      nome: 'Outro',
      email: 'x@y.com',
      senha: 'segredo123',
    });
    assert.equal(r.status, 403, 'não pode configurar duas vezes');
  } finally {
    if (anterior === undefined) delete process.env.INITIAL_ADMIN_SETUP_SECRET;
    else process.env.INITIAL_ADMIN_SETUP_SECRET = anterior;
  }
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

test('trocar a senha encerra outras sessões e preserva a atual', async () => {
  const sessaoAtual = cookie;
  let r = await chamar('POST', '/auth/entrar', { email: 'admin@marcenaria.com', senha: 'segredo123' }, { semCookie: true });
  assert.equal(r.status, 200);
  const sessaoSecundaria = cookie;
  cookie = sessaoAtual;

  r = await chamar('PUT', '/conta/senha', { senha_atual: 'segredo123', nova_senha: 'senha-nova123' });
  assert.equal(r.status, 200);
  assert.equal((await chamar('GET', '/clientes')).status, 200, 'a sessão que alterou a senha continua ativa');
  assert.equal((await chamar('GET', '/clientes', undefined, { cookieOverride: sessaoSecundaria })).status, 401);

  r = await chamar('PUT', '/conta/senha', { senha_atual: 'senha-nova123', nova_senha: 'segredo123' });
  assert.equal(r.status, 200, 'restaura a senha usada pelos testes seguintes');
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
    const db = await app.locals.obterDb();
    await db.run("UPDATE notificacoes_deploy SET iniciado_em = now() - interval '6 minutes' WHERE deployment_id = ?", deploy.deployment_id);
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
  assert.deepEqual(r.dados.clientes.map((c) => c.nome), ['João da Silva']);
  r = await chamar('GET', '/clientes?q=98888');
  assert.deepEqual(r.dados.clientes.map((c) => c.nome), ['João da Silva']);
  r = await chamar('GET', '/clientes?q=2222');
  assert.deepEqual(r.dados.clientes.map((c) => c.nome), ['Maria Souza']);
});

test('clientes são paginados em ordem estável e informam o total', async () => {
  const db = await app.locals.obterDb();
  for (let i = 0; i < 105; i++) {
    const nome = `Paginacao Revisao ${String(i).padStart(3, '0')}`;
    await db.run('INSERT INTO clientes (nome, nome_busca) VALUES (?, ?)', nome, nome.toLowerCase());
  }
  const query = '/clientes?q=paginacao%20revisao';
  const primeira = await chamar('GET', query);
  const segunda = await chamar('GET', `${query}&limite=50&deslocamento=50`);
  const terceira = await chamar('GET', `${query}&limite=50&deslocamento=100`);
  assert.equal(primeira.dados.total, 105);
  assert.equal(primeira.dados.limite, 50);
  assert.equal(primeira.dados.deslocamento, 0);
  assert.equal(primeira.dados.clientes.length, 50);
  assert.equal(primeira.dados.tem_mais, true);
  assert.equal(segunda.dados.clientes.length, 50);
  assert.equal(segunda.dados.tem_mais, true);
  assert.equal(terceira.dados.clientes.length, 5);
  assert.equal(terceira.dados.tem_mais, false);
  const todos = [...primeira.dados.clientes, ...segunda.dados.clientes, ...terceira.dados.clientes];
  assert.equal(new Set(todos.map((c) => c.id)).size, 105, 'não repete clientes entre páginas');
  assert.deepEqual(todos.map((c) => c.nome), [...todos.map((c) => c.nome)].sort((a, b) => a.localeCompare(b)));
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

test('itens "já está incluso": lista da empresa, cópia fixada no orçamento e visão do cliente', async () => {
  let r = await chamar('GET', '/empresa');
  assert.ok(r.dados.inclusos.length >= 6, 'a lista começa com sugestões');
  assert.ok(r.dados.inclusos.every((i) => i.padrao === false), 'nenhum item vem marcado por padrão');
  assert.deepEqual((await chamar('GET', '/orcamentos/modelo')).dados.inclusos, []);

  r = await chamar('PUT', '/empresa/inclusos', {
    inclusos: [
      { titulo: ' Garantia de 3 anos ', descricao: 'Contra defeitos de fabricação.', icone: 'escudo', padrao: true },
      { titulo: 'garantia de 3 anos', descricao: 'repetido' },
      { titulo: 'Limpeza ao final', icone: 'limpeza' },
    ],
  });
  assert.equal(r.status, 200);
  const garantia = { titulo: 'Garantia de 3 anos', descricao: 'Contra defeitos de fabricação.', icone: 'escudo' };
  assert.deepEqual(r.dados.inclusos, [
    { ...garantia, padrao: true },
    { titulo: 'Limpeza ao final', descricao: '', icone: 'limpeza', padrao: false },
  ]);
  assert.deepEqual((await chamar('GET', '/orcamentos/modelo')).dados.inclusos, [garantia], 'os marcados como padrão entram nos novos orçamentos');

  // Salvar os dados da empresa não apaga a lista.
  const { tem_logo, ambientes_sugeridos, inclusos, id: _id, ...dados } = r.dados;
  await chamar('PUT', '/empresa', dados);
  assert.equal((await chamar('GET', '/empresa')).dados.inclusos.length, 2);

  for (const invalida of [
    'Garantia',
    [{ titulo: '' }],
    [{ titulo: 'x'.repeat(61) }],
    [{ titulo: 'Ok', descricao: 'x'.repeat(161) }],
    [{ titulo: 'Ok', icone: 'foguete' }],
    Array.from({ length: 31 }, (_, i) => ({ titulo: `Item ${i}` })),
  ]) {
    assert.equal((await chamar('PUT', '/empresa/inclusos', { inclusos: invalida })).status, 400);
  }

  // No orçamento fica uma cópia, só com o que o cliente vê.
  let orc = (await chamar('GET', `/orcamentos/${orcamentoId}`)).dados;
  assert.deepEqual(orc.inclusos, []);
  const versaoProposta = orc.versao_proposta;
  r = await chamar('PUT', `/orcamentos/${orcamentoId}`, { ...orc, inclusos: [{ ...garantia, padrao: true, interno: 'x' }] });
  assert.equal(r.status, 200);
  assert.deepEqual(r.dados.inclusos, [garantia]);
  assert.equal(r.dados.versao_proposta, versaoProposta + 1, 'mudar os inclusos muda a proposta do cliente');
  const historico = (await chamar('GET', `/orcamentos/${orcamentoId}/historico`)).dados;
  assert.ok(historico.at(-1).evento.includes('Itens inclusos alterados'));

  // Editar a lista da empresa depois não muda o que já está no orçamento.
  await chamar('PUT', '/empresa/inclusos', { inclusos: [{ titulo: 'Garantia de 1 ano', icone: 'escudo' }] });
  orc = (await chamar('GET', `/orcamentos/${orcamentoId}`)).dados;
  assert.deepEqual(orc.inclusos, [garantia]);

  const db = await app.locals.obterDb();
  const empresa = await db.get('SELECT * FROM empresa WHERE id = 1');
  assert.deepEqual(visaoCliente(await carregarOrcamento(db, orcamentoId), empresa).inclusos, [garantia]);

  r = await chamar('PUT', `/orcamentos/${orcamentoId}`, { ...orc, inclusos: Array.from({ length: 13 }, (_, i) => ({ titulo: `Item ${i}` })) });
  assert.equal(r.status, 400);
  r = await chamar('PUT', `/orcamentos/${orcamentoId}`, { ...orc, inclusos: 'tudo' });
  assert.equal(r.status, 400);

  // O PDF aguenta a lista cheia, com títulos e explicações no tamanho máximo.
  const cheios = Array.from({ length: 12 }, (_, i) => ({
    titulo: `${i + 1} ${'título comprido '.repeat(5)}`.slice(0, 60).trim(),
    descricao: 'Explicação comprida do item incluso. '.repeat(6).slice(0, 160).trim(),
    icone: 'check',
  }));
  r = await chamar('PUT', `/orcamentos/${orcamentoId}`, { ...orc, inclusos: cheios });
  assert.equal(r.status, 200);
  assert.equal(r.dados.inclusos.length, 12);
  const pdf = await chamar('GET', `/orcamentos/${orcamentoId}/pdf`);
  assert.equal(pdf.status, 200);
  assert.equal(pdf.dados.subarray(0, 5).toString(), '%PDF-');
  r = await chamar('PUT', `/orcamentos/${orcamentoId}`, { ...r.dados, inclusos: [garantia] });
  assert.deepEqual(r.dados.inclusos, [garantia]);
});

test('meta de vendas: a empresa define o valor do mês e o painel acompanha o ritmo', async () => {
  let painel = (await chamar('GET', '/dashboard')).dados;
  assert.deepEqual(
    { mensal: painel.comercial.meta.mensal_cents, valor: painel.comercial.meta.valor_cents, ritmo: painel.comercial.meta.ritmo },
    { mensal: 0, valor: 0, ritmo: null },
    'sem meta definida',
  );

  for (const invalida of [-1, 1.5, 'muito', 3_000_000_000]) {
    assert.equal((await chamar('PUT', '/empresa/meta', { meta_mensal_cents: invalida })).status, 400);
  }
  const r = await chamar('PUT', '/empresa/meta', { meta_mensal_cents: 9_000_000 });
  assert.equal(r.status, 200, JSON.stringify(r.dados));
  assert.equal(r.dados.meta_mensal_cents, 9_000_000);

  painel = (await chamar('GET', '/dashboard')).dados;
  const meta = painel.comercial.meta;
  assert.equal(meta.valor_cents, 9_000_000);
  assert.equal(meta.aprovados_cents, painel.comercial.atual.aprovados_cents);
  assert.ok(meta.ritmo >= 1 && meta.ritmo <= 100);
  assert.ok(meta.dias_restantes >= 0 && meta.dias_restantes <= 30);
  assert.equal((await chamar('GET', '/dashboard?periodo=trimestre')).dados.comercial.meta.valor_cents, 27_000_000, 'trimestre soma três metas mensais');

  // Salvar os dados da empresa não mexe na meta.
  const { tem_logo, ambientes_sugeridos, inclusos, id: _id, ...dados } = (await chamar('GET', '/empresa')).dados;
  assert.equal((await chamar('PUT', '/empresa', dados)).dados.meta_mensal_cents, 9_000_000);
  assert.equal((await chamar('PUT', '/empresa/meta', { meta_mensal_cents: 0 })).dados.meta_mensal_cents, 0);
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
  assert.deepEqual(r.dados.inclusos.map((i) => i.titulo), ['Garantia de 3 anos'], 'a cópia leva os itens inclusos');

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
  assert.equal(r.dados.soma_cents, r.dados.orcamentos[0].total_cents, 'a soma acompanha o filtro');
  r = await chamar('GET', '/orcamentos?limite=1');
  assert.equal(r.dados.orcamentos.length, 1);
  const todos = (await chamar('GET', '/orcamentos?limite=200')).dados.orcamentos;
  assert.equal(r.dados.soma_cents, todos.reduce((n, o) => n + o.total_cents, 0), 'a soma inclui o que não coube na página');
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
  // O relógio da API é fixo; a aprovação deve pertencer ao mesmo mês do teste.
  await (await app.locals.obterDb()).run('UPDATE orcamentos SET aprovado_em = ? WHERE id = ?', `${hojeFalso}T12:00:00Z`, duplicadoId);
  const r2 = await chamar('GET', '/dashboard');
  assert.equal(r2.dados.mes.aprovados, 1);
  assert.equal(r2.dados.em_aberto, 1);
});

test('orçamento expirado é reaberto ao renovar a validade, inclusive nos links existentes', async () => {
  hojeFalso = '2026-10-05';
  let r = await chamar('GET', `/orcamentos/${orcamentoId}`);
  assert.equal(r.dados.status, 'expirado');
  const aprovado = await chamar('GET', `/orcamentos/${duplicadoId}`);
  assert.equal(aprovado.dados.status, 'aprovado', 'aprovado não expira');

  // Simula um registro já salvo pela versão antiga: datas futuras, status expirado.
  const db = await app.locals.obterDb();
  await db.run(
    'UPDATE orcamentos SET data = ?, validade_dias = ?, data_validade = ? WHERE id = ?',
    '2026-10-20',
    10,
    '2026-10-30',
    orcamentoId,
  );
  hojeFalso = '2026-10-20';
  r = await chamar('GET', `/orcamentos/${orcamentoId}`);
  assert.equal(r.dados.data_validade, '2026-10-30');
  assert.equal(r.dados.status, 'enviado', 'corrige ao abrir um orçamento já afetado');

  const { token: tokenRenovado } = (await chamar('POST', `/orcamentos/${orcamentoId}/link`)).dados;
  let proposta = await semLogin('GET', `/publico/propostas/${tokenRenovado}`);
  assert.equal(proposta.dados.situacao.status, 'enviado');
  assert.equal(proposta.dados.situacao.pode_aprovar, true);

  // Uma edição após outra expiração também recupera o status anterior.
  hojeFalso = '2026-10-31';
  r = await chamar('GET', `/orcamentos/${orcamentoId}`);
  assert.equal(r.dados.status, 'expirado');
  const atual = r.dados;
  r = await chamar('PUT', `/orcamentos/${orcamentoId}`, {
    ...atual,
    data: '2026-11-01',
    validade_dias: 10,
  });
  assert.equal(r.dados.data_validade, '2026-11-11');
  assert.equal(r.dados.status, 'enviado');
  proposta = await semLogin('GET', `/publico/propostas/${tokenRenovado}`);
  assert.equal(proposta.dados.situacao.pode_aprovar, true);

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
  const clientes = (await chamar('GET', '/clientes?q=joao')).dados.clientes;
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
  const { orc } = await novaProposta({ abrir: false });
  assert.equal((await mudarStatus(orc.id, 'recusado')).status, 200);
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

test('início conta aprovações pelo mês do aceite, inclusive propostas antigas e virada do mês no Brasil', async () => {
  const db = await app.locals.obterDb();
  const antes = (await chamar('GET', '/dashboard')).dados;
  const preparar = async (data, aprovadoEm, peloLink = false) => {
    const { orc, token: link } = await novaProposta({ abrir: false });
    const edicao = await chamar('PUT', `/orcamentos/${orc.id}`, { ...orc, data, validade_dias: 365 });
    assert.equal(edicao.status, 200);
    const aprovado = peloLink
      ? await aprovarProposta(link, { nome: 'Cliente do teste', aceite: true })
      : await mudarStatus(orc.id, 'aprovado');
    assert.equal(aprovado.status, 200);
    await db.run('UPDATE orcamentos SET aprovado_em = ? WHERE id = ?', aprovadoEm, orc.id);
    return (await chamar('GET', `/orcamentos/${orc.id}`)).dados;
  };
  const manual = await preparar('2026-08-20', '2026-09-20T15:00:00Z');
  const peloLink = await preparar('2026-08-21', '2026-10-01T02:59:59Z', true); // 30/09, 23h59 no Brasil
  await preparar('2026-09-01', '2026-08-31T15:00:00Z');
  await preparar('2026-08-22', '2026-10-01T03:00:00Z'); // 01/10, 00h no Brasil
  const depois = (await chamar('GET', '/dashboard')).dados;
  assert.equal(depois.mes.aprovados, antes.mes.aprovados + 2);
  assert.equal(depois.mes.aprovados_cents, antes.mes.aprovados_cents + manual.total_cents + peloLink.total_cents);
  const setembro = depois.evolucao.find((p) => p.mes === '2026-09');
  assert.equal(setembro.quantidade, depois.mes.aprovados);
  assert.equal(setembro.valor_cents, depois.mes.aprovados_cents);
  assert.equal(depois.evolucao.length, 12);
  assert.equal(depois.evolucao[0].mes, '2025-10');
  assert.equal(depois.evolucao.at(-1).mes, '2026-09');
  assert.equal(manual.aprovado_pelo_link, 0);
  assert.equal(peloLink.aprovado_pelo_link, 1);
  assert.equal(depois.situacoes.find((s) => s.status === 'aprovado').quantidade, antes.situacoes.find((s) => s.status === 'aprovado').quantidade + 4);
  await mudarStatus(manual.id, 'negociacao');
  const reaberto = (await chamar('GET', '/dashboard')).dados;
  assert.equal(reaberto.mes.aprovados, depois.mes.aprovados - 1);
  assert.equal(reaberto.evolucao.at(-1).quantidade, reaberto.mes.aprovados);
  assert.equal(reaberto.mes.aprovados_cents, depois.mes.aprovados_cents - manual.total_cents);
  assert.equal(reaberto.em_aberto_cents, depois.em_aberto_cents + manual.total_cents);
  // Registros legados sem data de aceite continuam contabilizados pela data da proposta.
  const legado = await preparar('2026-09-02', null);
  assert.equal((await chamar('GET', '/dashboard')).dados.mes.aprovados_cents, reaberto.mes.aprovados_cents + legado.total_cents);
});

test('dashboard retorna clientes, movimentações e somente vencimentos de propostas em aberto', async (t) => {
  const db = await app.locals.obterDb();
  const cliente = (await chamar('POST', '/clientes', { nome: 'Cliente do dashboard', telefone: '11955554444' })).dados;
  t.after(async () => {
    await db.run('DELETE FROM orcamentos WHERE cliente_id = ?', cliente.id);
    await db.run('DELETE FROM clientes WHERE id = ?', cliente.id);
  });
  const preparar = async (data, validade_dias, status) => {
    const { orc } = await novaProposta({ abrir: false });
    const salvo = await chamar('PUT', `/orcamentos/${orc.id}`, { ...orc, cliente_id: cliente.id, data, validade_dias });
    assert.equal(salvo.status, 200);
    assert.equal((await mudarStatus(orc.id, status)).status, 200);
    return orc.id;
  };
  const venceHoje = await preparar(hojeFalso, 0, 'enviado');
  const venceAmanha = await preparar(hojeFalso, 1, 'negociacao');
  const rascunho = await preparar(hojeFalso, 0, 'rascunho');
  const aprovado = await preparar(hojeFalso, 0, 'aprovado');
  const d = (await chamar('GET', '/dashboard')).dados;
  assert.equal(d.data_hoje, hojeFalso);
  assert.equal(d.clientes_total, (await db.get('SELECT COUNT(*) AS n FROM clientes')).n);
  assert.ok(d.vencimentos.some((v) => v.id === venceHoje && v.cliente_nome === cliente.nome));
  assert.ok(d.vencimentos.some((v) => v.id === venceAmanha));
  assert.ok(d.vencimentos.every((v) => ![rascunho, aprovado].includes(v.id) && v.data_validade >= hojeFalso));
  assert.deepEqual(d.vencimentos.map((v) => v.data_validade), d.vencimentos.map((v) => v.data_validade).toSorted());
  assert.ok(d.atividades.length > 0 && d.atividades.length <= 6);
  assert.ok(d.atividades.some((a) => a.orcamento_id === aprovado && a.cliente_nome === cliente.nome));
  assert.deepEqual(d.atividades.map((a) => a.data_hora), d.atividades.map((a) => a.data_hora).toSorted().toReversed());
});

test('painel comercial compara períodos reais, classifica cada orçamento uma vez e abre os alertas correspondentes', async (t) => {
  const db = await app.locals.obterDb();
  const criados = [];
  t.after(async () => { for (const id of criados) await db.run('DELETE FROM orcamentos WHERE id = ?', id); });
  const antes = (await chamar('GET', '/dashboard')).dados.comercial;
  const anterior = (await chamar('GET', '/dashboard?periodo=anterior')).dados.comercial;
  const preparar = async (data, status, nome = 'Cozinha') => {
    const { orc } = await novaProposta({ abrir: false });
    criados.push(orc.id);
    const r = await chamar('PUT', `/orcamentos/${orc.id}`, { ...orc, data, validade_dias: 365,
      ambientes: [{ nome, itens: orc.ambientes[0].itens }, { nome: 'Quarto', itens: [] }] });
    assert.equal(r.status, 200);
    assert.equal((await mudarStatus(orc.id, status)).status, 200);
    return r.dados;
  };
  const atual = await preparar(hojeFalso, 'enviado');
  const outroMes = await preparar('2026-08-20', 'rascunho', 'Sala');
  const cancelado = await preparar(hojeFalso, 'cancelado');
  const aceiteAntigo = await preparar('2026-08-21', 'aprovado', 'Banheiro');
  await db.run('UPDATE orcamentos SET aprovado_em = ? WHERE id = ?', `${hojeFalso}T15:00:00Z`, aceiteAntigo.id);
  await db.run('UPDATE orcamentos SET data_validade = ?, visualizacoes = 2, ultima_visualizacao_em = now(), enviado_em = ? WHERE id = ?', somarDias(hojeFalso, 7), `${somarDias(hojeFalso,-6)}T12:00:00Z`, atual.id);
  const r = await chamar('GET', '/dashboard');
  assert.equal(r.status, 200);
  const c = r.dados.comercial;
  assert.equal(c.periodo.inicio, '2026-09-01');
  assert.equal(c.periodo.ate, '2026-09-30');
  assert.equal(c.atual.valor_cents, antes.atual.valor_cents + atual.total_cents);
  assert.equal(c.atual.validos, antes.atual.validos + 1);
  assert.equal(c.ticket_cents, Math.round(c.atual.aprovados_cents / c.atual.aprovados)); // Ticket de vendas aprovadas.
  assert.equal(c.atual.aprovados_cents, antes.atual.aprovados_cents + aceiteAntigo.total_cents);
  assert.equal(c.serie.at(-1).aprovados_cents, c.atual.aprovados_cents);
  const aprovadosNoMes = (await chamar('GET', '/orcamentos?status=aprovado&aprovados_periodo=mes&limite=200')).dados;
  assert.equal(aprovadosNoMes.total, c.atual.aprovados);
  assert.equal(aprovadosNoMes.orcamentos.reduce((n,o) => n + o.total_cents, 0), c.atual.aprovados_cents);
  assert.ok(aprovadosNoMes.orcamentos.some(o => o.id === aceiteAntigo.id));
  // O link do valor orçado lista exatamente o que o card soma.
  const apresentadas = (await chamar('GET', `/orcamentos?tipo=propostas&status=apresentados&de=${c.periodo.inicio}&ate=${c.periodo.ate}&limite=200`)).dados;
  assert.equal(apresentadas.total, c.atual.validos);
  assert.equal(apresentadas.orcamentos.reduce((n,o) => n + o.total_cents, 0), c.atual.valor_cents);
  assert.ok(apresentadas.orcamentos.some(o => o.id === atual.id));
  assert.ok(!apresentadas.orcamentos.some(o => o.id === cancelado.id));
  assert.equal(c.conversao.enviados, antes.conversao.enviados + 2);
  assert.equal(c.conversao.aprovados, antes.conversao.aprovados + 1);
  assert.equal(c.pendentes, antes.pendentes + 1); // Rascunhos não são propostas pendentes.
  assert.equal(c.atencao.visualizadas, antes.atencao.visualizadas + 1);
  assert.equal(c.atencao.vencimentos, antes.atencao.vencimentos + 1); // Inclui o sétimo dia.
  assert.equal(c.atencao.sem_resposta, antes.atencao.sem_resposta + 1);
  assert.equal(c.atencao.aprovados, antes.atencao.aprovados + 1);
  const qtd = (dados,nome) => dados.ambientes.find(a => a.nome === nome)?.quantidade || 0;
  assert.equal(qtd(c,'Cozinha'), qtd(antes,'Cozinha') + 1); // Dois ambientes não duplicam o orçamento.
  assert.equal(qtd(c,'Quarto'), qtd(antes,'Quarto'));
  assert.equal(qtd(c,'Sala'), qtd(antes,'Sala') + 1);
  const p = (await chamar('GET', '/dashboard?periodo=anterior')).dados.comercial;
  assert.equal(p.atual.valor_cents, anterior.atual.valor_cents + aceiteAntigo.total_cents); // O rascunho de agosto não entra no valor orçado.
  assert.equal(p.serie.at(-1).mes, '2026-08');
  for (const filtro of ['visualizadas','vencimentos','aprovados','sem_resposta']) {
    const lista = await chamar('GET', `/orcamentos?atencao=${filtro}&limite=200`);
    assert.equal(lista.status, 200);
    assert.equal(lista.dados.total, c.atencao[filtro]);
    assert.ok(lista.dados.orcamentos.some(o => o.id === (filtro === 'aprovados' ? aceiteAntigo.id : atual.id)));
  }
  const propostas = (await chamar('GET', '/orcamentos?tipo=propostas&limite=200')).dados.orcamentos;
  assert.ok(propostas.every(o => o.status !== 'rascunho'));
  assert.ok(propostas.some(o => o.id === atual.id && o.ambiente_nome === 'Cozinha'));
  assert.equal((await chamar('GET', '/dashboard?periodo=semestre')).dados.comercial.periodo.inicio, '2026-04-01');
  assert.equal((await chamar('GET', '/dashboard?periodo=inventado')).status, 400);
  assert.equal((await chamar('GET', '/orcamentos?atencao=inventado')).status, 400);
  assert.ok(c.atividades.length <= 5);
  assert.ok(c.atividades.some(a => a.orcamento_id === atual.id && /Cliente abriu/.test(a.evento)));
  assert.ok(!c.atividades.some(a => a.orcamento_id === cancelado.id && /Cliente abriu/.test(a.evento)));
});

test('relatórios conciliam emissão e aceite, respeitam o fuso e mantêm totais, clientes e filtros coerentes', async (t) => {
  const db = await app.locals.obterDb();
  const c1 = (await chamar('POST','/clientes',{nome:'Cliente % relatório'})).dados;
  const c2 = (await chamar('POST','/clientes',{nome:'Cliente legado do relatório'})).dados;
  t.after(async () => {
    for (const c of [c1,c2]) { await db.run('DELETE FROM orcamentos WHERE cliente_id = ?',c.id); await db.run('DELETE FROM clientes WHERE id = ?',c.id); }
  });
  const inserir = async (data,status,total,aprovadoEm,cliente=c1,peloLink=0) => {
    const {n} = await db.get('SELECT COALESCE(MAX(numero),0)+1 AS n FROM orcamentos');
    const r = await db.run(`INSERT INTO orcamentos (numero,cliente_id,data,validade_dias,data_validade,status,total_cents,aprovado_em,aprovado_pelo_link)
      VALUES (?,?,?,365,'2027-01-01',?,?,?,?) RETURNING id`,n,cliente.id,data,status,total,aprovadoEm,peloLink);
    return r.lastInsertRowid;
  };
  const fora = await inserir('2025-04-10','aprovado',10000,'2025-05-01T02:59:59Z'); // 30/04 no Brasil
  const antigo = await inserir('2025-04-11','aprovado',20000,'2025-05-01T03:00:00Z',c1,1);
  await inserir('2025-05-05','aprovado',30000,'2025-06-01T02:59:59Z'); // 31/05 no Brasil
  const junho = await inserir('2025-05-06','aprovado',40000,'2025-06-01T03:00:00Z');
  await inserir('2025-05-10','rascunho',50000,null);
  await inserir('2025-05-12','enviado',60000,null);
  await inserir('2025-05-15','cancelado',70000,null);
  await inserir('2025-05-20','aprovado',80000,null,c2);
  const r = await chamar('GET','/relatorios?de=2025-05-01&ate=2025-05-31');
  assert.equal(r.status,200,JSON.stringify(r.dados));
  const d = r.dados;
  assert.equal(d.periodo.anterior_de,'2025-03-31');
  assert.equal(d.periodo.anterior_ate,'2025-04-30');
  assert.equal(d.atual.orcado_cents,210000); // Emissão de maio, sem rascunhos e cancelados.
  assert.equal(d.atual.orcamentos,4);
  assert.equal(d.atual.aprovado_cents,130000); // 20.000 + 30.000 + 80.000 centavos.
  assert.equal(d.atual.aprovados,3);
  assert.equal(d.atual.ticket_cents,43333);
  assert.equal(d.atual.apresentadas,4);
  assert.equal(d.atual.coorte_aprovados,3);
  assert.equal(d.atual.taxa,75);
  assert.equal(d.atual.clientes_aprovados,2);
  assert.equal(d.atual.pendentes,1);
  assert.equal(d.atual.pendente_cents,60000);
  assert.equal(d.anterior.aprovado_cents,10000);
  assert.equal(d.serie.length,1);
  assert.equal(d.serie[0].aprovado_cents,d.atual.aprovado_cents);
  assert.equal(d.serie[0].orcado_cents,d.atual.orcado_cents);
  assert.equal(d.clientes[0].id,c2.id);
  assert.equal(d.clientes.reduce((n,c)=>n+c.valor_cents,0),d.atual.aprovado_cents);
  assert.equal(d.aprovacoes.quantidade,3);
  assert.equal(d.aprovacoes.valor_cents,d.atual.aprovado_cents);
  assert.ok(d.aprovacoes.linhas.some(o=>o.id===antigo&&o.aprovado_dia==='2025-05-01'&&o.aprovado_pelo_link===1));
  assert.ok(d.aprovacoes.linhas.every(o=>![fora,junho].includes(o.id)));
  const pagina = (await chamar('GET','/relatorios/aprovacoes?de=2025-05-01&ate=2025-05-31&limite=2&deslocamento=2')).dados;
  assert.equal(pagina.quantidade,3);assert.equal(pagina.linhas.length,1);
  assert.equal(pagina.valor_cents,130000); // Subtotal não muda ao trocar a página.
  const busca = (await chamar('GET','/relatorios/aprovacoes?de=2025-05-01&ate=2025-05-31&q=%25')).dados;
  assert.equal(busca.quantidade,2);assert.equal(busca.valor_cents,50000);
  const numero = (await db.get('SELECT numero FROM orcamentos WHERE id = ?',antigo)).numero;
  const porNumero = (await chamar('GET',`/relatorios/aprovacoes?de=2025-05-01&ate=2025-05-31&q=%23${String(numero).padStart(5,'0')}`)).dados;
  assert.equal(porNumero.quantidade,1);assert.equal(porNumero.linhas[0].id,antigo);
});

test('CSV do relatório exporta todas as aprovações filtradas e neutraliza fórmulas em nomes', async (t) => {
  const db = await app.locals.obterDb();
  const nome = '=HYPERLINK("https://example.com";"teste")';
  const c = (await chamar('POST','/clientes',{nome})).dados;
  t.after(async () => { await db.run('DELETE FROM orcamentos WHERE cliente_id = ?',c.id); await db.run('DELETE FROM clientes WHERE id = ?',c.id); });
  const {n} = await db.get('SELECT COALESCE(MAX(numero),0)+1 AS n FROM orcamentos');
  for(let i=0;i<23;i++) await db.run(`INSERT INTO orcamentos (numero,cliente_id,data,validade_dias,data_validade,status,total_cents,aprovado_em)
    VALUES (?,?,'2024-12-01',365,'2027-01-01','aprovado',1000,'2024-12-10T12:00:00Z')`,n+i,c.id);
  const lista = (await chamar('GET','/relatorios/aprovacoes?de=2024-12-01&ate=2024-12-31')).dados;
  assert.equal(lista.linhas.length,20);assert.equal(lista.quantidade,23);
  const r = await chamar('GET','/relatorios/exportar?tipo=aprovacoes&de=2024-12-01&ate=2024-12-31');
  assert.equal(r.status,200);
  assert.ok(r.headers.get('content-type').includes('text/csv'));
  const csv = r.dados.toString('utf8');
  assert.ok(csv.startsWith('\uFEFF'));
  assert.equal(csv.split('\r\n').length,25); // Cabeçalho + 23 propostas + total.
  assert.ok(csv.includes(`"'=HYPERLINK(""https://example.com"";""teste"")"`));
  assert.ok(csv.includes('"230,00"'));
  const mensal = (await chamar('GET','/relatorios/exportar?tipo=mensal&de=2024-12-01&ate=2024-12-31')).dados.toString('utf8');
  assert.equal(mensal.split('\r\n').length,3);
  assert.ok(mensal.includes('"2024-12";"23";"230,00";"23";"230,00";"10,00"'));
});

test('relatórios validam datas, limites e autenticação', async () => {
  for(const qs of ['de=2026-02-30','de=2026-09-24&ate=2026-09-01','ate=2026-09-25','de=2023-01-01&ate=2026-09-24']) {
    assert.equal((await chamar('GET',`/relatorios?${qs}`)).status,400,qs);
  }
  assert.equal((await chamar('GET','/relatorios/aprovacoes?limite=101')).status,400);
  assert.equal((await chamar('GET','/relatorios/aprovacoes?deslocamento=-1')).status,400);
  assert.equal((await chamar('GET','/relatorios/exportar?tipo=sql')).status,400);
  const sessao=cookie;
  try {
    assert.equal((await chamar('GET','/relatorios',undefined,{semCookie:true})).status,401);
    assert.equal((await chamar('GET','/relatorios/exportar?tipo=mensal',undefined,{semCookie:true})).status,401);
  } finally {cookie=sessao;}
});

test('excluir o último móvel persiste sem excluir ambiente, orçamento ou cópia duplicada', async () => {
  const { orc } = await novaProposta({ abrir: false });
  const copia = (await chamar('POST', `/orcamentos/${orc.id}/duplicar`)).dados;
  const quantidadeCopia = copia.ambientes.reduce((soma, a) => soma + a.itens.length, 0);
  const vazio = { ...orc, ambientes: orc.ambientes.map((a) => ({ ...a, itens: [] })), servicos: [] };
  const salvo = await chamar('PUT', `/orcamentos/${orc.id}`, vazio);
  assert.equal(salvo.status, 200);
  const reaberto = (await chamar('GET', `/orcamentos/${orc.id}`)).dados;
  assert.equal(reaberto.total_cents, 0);
  assert.equal(reaberto.ambientes.length, orc.ambientes.length);
  assert.ok(reaberto.ambientes.every((a) => a.itens.length === 0));
  const copiaReaberta = (await chamar('GET', `/orcamentos/${copia.id}`)).dados;
  assert.equal(copiaReaberta.ambientes.reduce((soma, a) => soma + a.itens.length, 0), quantidadeCopia);
  assert.equal(copiaReaberta.total_cents, copia.total_cents);
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

test('a aprovação pelo link registra a forma de pagamento escolhida no simulador', async () => {
  const aprovarCom = async (preferencia) => {
    const { orc } = await novaProposta({ abrir: false });
    orc.pagamento_cartao_metodo = 'link_pagamento';
    orc.pagamento_cartao_parcelas = 6;
    assert.equal((await chamar('PUT', `/orcamentos/${orc.id}`, orc)).status, 200);
    assert.equal((await mudarStatus(orc.id, 'enviado')).status, 200);
    const { token } = (await chamar('POST', `/orcamentos/${orc.id}/link`)).dados;
    const proposta = (await semLogin('GET', `/publico/propostas/${token}`)).dados;
    const r = await semLogin('POST', `/publico/propostas/${token}/aprovar`, { ...aceite(proposta), preferencia_pagamento: preferencia });
    assert.equal(r.status, 200, JSON.stringify(r.dados));
    const hist = (await chamar('GET', `/orcamentos/${orc.id}/historico`)).dados;
    return { proposta, evento: hist.find((h) => h.evento.startsWith('Aprovado pelo cliente')).evento };
  };

  // O cliente manda só a opção; o texto e os valores saem da própria proposta.
  let { proposta, evento } = await aprovarCom({ forma: 'cartao', parcelas: 3, texto: 'desconto de 50% combinado' });
  const opcao = proposta.pagamento.cartao.credito[2];
  assert.equal(
    evento,
    `Aprovado pelo cliente pelo link (João da Silva) · Prefere pagar: cartão em 3x de ${formatarDinheiro(Math.max(...opcao.valores_parcelas_cents))} (total ${formatarDinheiro(opcao.total_cents)})`,
  );
  assert.ok(!evento.includes('desconto'));

  ({ proposta, evento } = await aprovarCom({ forma: 'combinado' }));
  assert.equal(evento, `Aprovado pelo cliente pelo link (João da Silva) · Prefere pagar: ${proposta.pagamento.descricao}`);

  // Opção que a proposta não oferece, ou qualquer outra coisa, é ignorada sem impedir a aprovação.
  for (const invalida of [{ forma: 'cartao', parcelas: 12 }, { forma: 'pix' }, 'cartão em 2x', null]) {
    ({ evento } = await aprovarCom(invalida));
    assert.equal(evento, 'Aprovado pelo cliente pelo link (João da Silva)');
  }
});

test('o orçamento guarda e publica as taxas do canal de cartão escolhido', async () => {
  for (const [metodo, parcelas, nome, debito, primeiraTaxa] of [
    ['tap_to_pay', 6, 'Tap to Pay presencial', 89, 309],
    ['link_pagamento', 12, 'Link de pagamento', null, 399],
  ]) {
    const { orc, token } = await novaProposta({ abrir: false });
    orc.pagamento_cartao_metodo = metodo;
    orc.pagamento_cartao_parcelas = parcelas;
    const salvo = await chamar('PUT', `/orcamentos/${orc.id}`, orc);
    assert.equal(salvo.status, 200, JSON.stringify(salvo.dados));
    assert.equal(salvo.dados.pagamento_cartao_metodo, metodo);
    assert.equal(salvo.dados.pagamento_cartao_parcelas, parcelas);
    assert.equal(JSON.parse(salvo.dados.pagamento_cartao_taxas).debito, debito);

    const proposta = await semLogin('GET', `/publico/propostas/${token}`);
    assert.equal(proposta.status, 200);
    const cartao = proposta.dados.pagamento.cartao;
    assert.equal(cartao.nome, nome);
    assert.equal(cartao.credito.length, parcelas);
    assert.equal(cartao.credito[0].taxa_centesimos_percentual, primeiraTaxa);
    assert.ok(cartao.credito[0].total_cents > proposta.dados.total_cents);
    assert.equal(cartao.credito[0].valores_parcelas_cents.reduce((soma, valor) => soma + valor, 0), cartao.credito[0].total_cents);
    assert.equal(proposta.dados.total_cents, salvo.dados.total_cents, 'a taxa do cartão não altera o valor-base da proposta');

    const pdf = await semLogin('GET', `/publico/propostas/${token}/pdf`);
    assert.equal(pdf.status, 200);
    assert.equal(pdf.dados.subarray(0, 5).toString(), '%PDF-');
  }
});

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

test('lembretes push avisam propostas sem resposta e perto do vencimento uma vez', async () => {
  const anteriores = {
    secret: process.env.DEPLOY_NOTIFICATION_SECRET,
    publicKey: process.env.VAPID_PUBLIC_KEY,
    privateKey: process.env.VAPID_PRIVATE_KEY,
    sendNotification: webpush.sendNotification,
  };
  const chavesVapid = webpush.generateVAPIDKeys();
  process.env.DEPLOY_NOTIFICATION_SECRET = 'segredo-lembrete-teste';
  process.env.VAPID_PUBLIC_KEY = chavesVapid.publicKey;
  process.env.VAPID_PRIVATE_KEY = chavesVapid.privateKey;
  const endpoint = 'https://fcm.googleapis.com/fcm/send/push-reminder-device-1';
  const envios = [];
  webpush.sendNotification = async (_inscricao, payload) => envios.push(JSON.parse(payload));

  try {
    const inscricao = {
      endpoint,
      keys: { p256dh: 'a'.repeat(87), auth: 'b'.repeat(22) },
    };
    assert.equal((await chamar('POST', '/notificacoes/push', { inscricao })).status, 200);

    const { orc: semRetorno } = await novaProposta({ abrir: false });
    assert.equal((await mudarStatus(semRetorno.id, 'enviado')).status, 200);
    const db = await app.locals.obterDb();
    await db.run(
      `UPDATE orcamentos SET enviado_em = now() - interval '6 days', data_validade = ? WHERE id = ?`,
      somarDias(hojeFalso, 10),
      semRetorno.id,
    );
    const { orc: pertoDoVencimento } = await novaProposta({ abrir: false });
    assert.equal((await mudarStatus(pertoDoVencimento.id, 'enviado')).status, 200);
    await db.run(
      `UPDATE orcamentos SET enviado_em = now() - interval '1 day', data_validade = ? WHERE id = ?`,
      somarDias(hojeFalso, 2),
      pertoDoVencimento.id,
    );

    let r = await chamar('POST', '/lembretes/notificar', {}, { semCookie: true });
    assert.equal(r.status, 401, 'exige o segredo do agendamento');
    r = await chamar('POST', '/lembretes/notificar', {}, { semCookie: true, autorizacao: 'incorreto' });
    assert.equal(r.status, 401);
    r = await chamar('POST', '/lembretes/notificar', {}, { semCookie: true, autorizacao: process.env.DEPLOY_NOTIFICATION_SECRET });
    assert.equal(r.status, 200, JSON.stringify(r.dados));
    assert.equal(r.dados.encontrados, 2);
    assert.equal(r.dados.processados, 2);
    assert.equal(envios.length, 2);

    const semResposta = envios.find((aviso) => aviso.titulo === 'Proposta aguardando resposta');
    const vencimento = envios.find((aviso) => aviso.titulo === 'Proposta perto do vencimento');
    assert.match(semResposta.texto, new RegExp(`nº ${semRetorno.numero}`));
    assert.match(vencimento.texto, /vence em 2 dias/);
    assert.equal(semResposta.caminho, `/#/orcamentos/${semRetorno.id}`);
    assert.equal(vencimento.caminho, `/#/orcamentos/${pertoDoVencimento.id}`);

    await db.run("UPDATE notificacoes_lembrete SET estado = 'enviando', iniciado_em = now() - interval '6 minutes', enviado_em = NULL");
    r = await chamar('POST', '/lembretes/notificar', {}, { semCookie: true, autorizacao: process.env.DEPLOY_NOTIFICATION_SECRET });
    assert.equal(r.status, 200);
    assert.equal(r.dados.encontrados, 2);
    assert.equal(r.dados.processados, 0);
    assert.equal(r.dados.duplicados, 2, 'não retoma automaticamente um envio iniciado há mais de cinco minutos');
    assert.equal(envios.length, 2);
    assert.equal((await db.get('SELECT COUNT(*) AS n FROM notificacoes_lembrete')).n, 2);
  } finally {
    await chamar('DELETE', '/notificacoes/push', { endpoint });
    webpush.sendNotification = anteriores.sendNotification;
    for (const [chave, valor] of Object.entries({
      DEPLOY_NOTIFICATION_SECRET: anteriores.secret,
      VAPID_PUBLIC_KEY: anteriores.publicKey,
      VAPID_PRIVATE_KEY: anteriores.privateKey,
    })) {
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
    'forma de pagamento com cartão': (orc) => { orc.pagamento_cartao_metodo = 'link_pagamento'; orc.pagamento_cartao_parcelas = 12; },
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

test('exclui orçamento e os dados relacionados somente com sessão autenticada', async () => {
  const { orc, token } = await novaProposta({ abrir: false });
  const db = await app.locals.obterDb();
  const atualizado = await chamar('PUT', `/orcamentos/${orc.id}`, { ...orc, observacoes_internas: 'Pronto para exclusão' });
  assert.equal(atualizado.status, 200);
  const filha = await chamar('POST', `/orcamentos/${orc.id}/duplicar`);
  assert.equal(filha.status, 201);
  assert.equal(filha.dados.duplicado_de_id, orc.id);
  await db.run(
    "INSERT INTO notificacoes_lembrete (orcamento_id, tipo, referencia) VALUES (?, 'sem_resposta', 'teste-exclusao')",
    orc.id,
  );

  assert.equal((await semLogin('DELETE', `/orcamentos/${orc.id}`)).status, 401);
  assert.ok(await db.get('SELECT id FROM orcamentos WHERE id = ?', orc.id), 'a tentativa sem sessão não remove o orçamento');

  const removido = await chamar('DELETE', `/orcamentos/${orc.id}`);
  assert.equal(removido.status, 200);
  assert.deepEqual(removido.dados, { ok: true });
  assert.equal(await db.get('SELECT id FROM orcamentos WHERE id = ?', orc.id), undefined);
  assert.ok(await db.get('SELECT id FROM orcamentos WHERE id = ?', orcamentoId), 'o orçamento original permanece');
  for (const tabela of ['orcamento_ambientes', 'orcamento_itens', 'orcamento_servicos', 'orcamento_historico', 'notificacoes_lembrete']) {
    assert.equal(await db.get(`SELECT 1 AS existe FROM ${tabela} WHERE orcamento_id = ? LIMIT 1`, orc.id), undefined, `${tabela} foi removida em cascata`);
  }
  const filhaPreservada = await db.get('SELECT id, duplicado_de_id FROM orcamentos WHERE id = ?', filha.dados.id);
  assert.ok(filhaPreservada, 'a cópia feita a partir do orçamento removido permanece');
  assert.equal(filhaPreservada.duplicado_de_id, null);
  assert.equal((await semLogin('GET', `/publico/propostas/${token}`)).status, 404);
  assert.equal((await chamar('DELETE', `/orcamentos/${orc.id}`)).status, 404);

  const excluidaMaisRecente = await chamar('DELETE', `/orcamentos/${filha.dados.id}`);
  assert.equal(excluidaMaisRecente.status, 200);
  const novo = await novaProposta({ abrir: false });
  assert.equal(novo.orc.numero, filha.dados.numero + 1, 'a exclusão do maior número não faz o número ser reutilizado');
});

test('encerrar todas as sessões remove também a sessão atual', async () => {
  const sessaoAtual = cookie;
  const login = await chamar('POST', '/auth/entrar', { email: 'admin@marcenaria.com', senha: 'segredo123' }, { semCookie: true });
  assert.equal(login.status, 200);
  const sessaoSecundaria = cookie;
  cookie = sessaoAtual;

  const resposta = await chamar('POST', '/conta/sessoes/revogar-todas');
  assert.equal(resposta.status, 200);
  cookie = '';
  assert.equal((await chamar('GET', '/clientes', undefined, { cookieOverride: sessaoAtual })).status, 401);
  assert.equal((await chamar('GET', '/clientes', undefined, { cookieOverride: sessaoSecundaria })).status, 401);
});

test('a marca de configuração impede recriar o administrador após apagar usuários', async () => {
  const anterior = process.env.INITIAL_ADMIN_SETUP_SECRET;
  process.env.INITIAL_ADMIN_SETUP_SECRET = 'chave-inicial-de-teste-comprida';
  const db = await app.locals.obterDb();
  await db.run('DELETE FROM usuarios');
  const estado = await chamar('GET', '/auth/estado');
  assert.equal(estado.dados.precisa_configurar, false);
  assert.equal(estado.dados.usuario, null);
  const recriar = await chamar('POST', '/auth/configurar', {
    chave_configuracao: process.env.INITIAL_ADMIN_SETUP_SECRET,
    nome: 'Admin recriado',
    email: 'recriado@marcenaria.com',
    senha: 'segredo123',
  });
  assert.equal(recriar.status, 403, 'apagar a tabela usuarios não reabre o primeiro acesso');
  if (anterior === undefined) delete process.env.INITIAL_ADMIN_SETUP_SECRET;
  else process.env.INITIAL_ADMIN_SETUP_SECRET = anterior;
});
