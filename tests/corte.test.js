import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  arvoreDeCortes,
  assinaturaPlano,
  detalharChapas,
  expandirPecas,
  lerLinhasPecas,
  metrosDeFita,
  otimizarPlano,
  resumirPlano,
  roteiroDeCorte,
  validarResultado,
} from '../public/shared/corte.js';

const BRANCO = { id: 1, nome: 'MDF Branco', espessura_mm: 18, comprimento_mm: 2750, largura_mm: 1840, veio: 0, preco_cents: 30000 };
const CARVALHO = { id: 2, nome: 'MDF Carvalho', espessura_mm: 18, comprimento_mm: 2750, largura_mm: 1840, veio: 1, preco_cents: 45000 };
const CHAPAS = [BRANCO, CARVALHO];
const AJUSTES = { serra_decimos_mm: 40, refilo_mm: 10, modo: 'aproveitamento', margem_fita_pct: 10 };

const peca = (comprimento_mm, largura_mm, quantidade = 1, extra = {}) => ({
  grupo: '',
  descricao: '',
  chapa_id: 1,
  comprimento_mm,
  largura_mm,
  quantidade,
  veio: 0,
  fita_id: null,
  fita_c1: 0,
  fita_c2: 0,
  fita_l1: 0,
  fita_l2: 0,
  ...extra,
});

const GUARDA_ROUPA = [
  peca(2400, 550, 4),
  peca(1800, 550, 2),
  peca(2364, 550, 2),
  peca(1764, 530, 8),
  peca(880, 160, 6),
  peca(800, 450, 12),
  peca(1800, 100, 4),
];

const calcular = (pecas, ajustes = AJUSTES, opcoes = {}) => otimizarPlano({ pecas, chapas: CHAPAS, ajustes, tempoMaximoMs: 5000, ...opcoes });

test('lê a entrada rápida com x, ×, colunas de planilha e descrição', () => {
  const { pecas, erros } = lerLinhasPecas('720 x 550 x 2 Lateral\n600×400 Prateleira\nBase\t1000\t500\t3\n\nsó texto');
  assert.deepEqual(
    pecas.map((p) => [p.comprimento_mm, p.largura_mm, p.quantidade, p.descricao]),
    [
      [720, 550, 2, 'Lateral'],
      [600, 400, 1, 'Prateleira'],
      [1000, 500, 3, 'Base'],
    ],
  );
  assert.deepEqual(erros, [{ linha: 5, texto: 'só texto' }]);
});

test('o resultado passa na conferência do servidor e cada peça aparece uma vez', () => {
  const resultado = calcular(GUARDA_ROUPA);
  const conferido = validarResultado(JSON.parse(JSON.stringify(resultado)), { pecas: GUARDA_ROUPA, chapas: CHAPAS, ajustes: AJUSTES });
  const total = GUARDA_ROUPA.reduce((s, p) => s + p.quantidade, 0);
  assert.equal(conferido.chapas.reduce((s, c) => s + c.pecas.length, 0), total);
  assert.equal(conferido.nao_cabem.length, 0);
  assert.equal(conferido.assinatura, assinaturaPlano(GUARDA_ROUPA, CHAPAS, AJUSTES));
});

test('o guarda-roupa de exemplo usa o mínimo de chapas (área pede 4,6)', () => {
  const resultado = calcular(GUARDA_ROUPA);
  assert.equal(resultado.chapas.length, 5);
  const resumo = resumirPlano({ pecas: GUARDA_ROUPA, chapas: CHAPAS, fitas: [], ajustes: AJUSTES, resultado });
  assert.ok(resumo.aproveitamento > 90, `aproveitamento ${resumo.aproveitamento}%`);
  assert.equal(resumo.custo_chapas_cents, 5 * 30000);
});

test('o modo só faixas começa com faixas no comprimento e nunca usa menos chapas que o padrão', () => {
  const faixas = calcular(GUARDA_ROUPA, { ...AJUSTES, modo: 'faixas' });
  const padrao = calcular(GUARDA_ROUPA);
  assert.ok(faixas.chapas.length >= padrao.chapas.length);
  validarResultado(faixas, { pecas: GUARDA_ROUPA, chapas: CHAPAS, ajustes: { ...AJUSTES, modo: 'faixas' } });
});

test('peças com veio em chapa com veio nunca giram; sem veio podem girar', () => {
  const pecas = [peca(400, 1700, 3, { chapa_id: 2, veio: 1 }), peca(400, 2000, 1, { chapa_id: 1 })];
  const resultado = calcular(pecas);
  for (const folha of resultado.chapas) {
    for (const p of folha.pecas) if (pecas[p.indice].chapa_id === 2) assert.equal(p.girada, false);
  }
  // Os 2000 mm só cabem deitados no comprimento da chapa (1820 úteis na largura).
  assert.ok(resultado.chapas.some((f) => f.pecas.some((p) => p.indice === 1 && p.girada)));
  validarResultado(resultado, { pecas, chapas: CHAPAS, ajustes: AJUSTES });
});

test('peça maior que a chapa vai para "não cabem"; a que cabe girada não', () => {
  const pecas = [peca(3000, 500), peca(1800, 2000), peca(1800, 2000, 1, { chapa_id: 2, veio: 1 })];
  const resultado = calcular(pecas);
  assert.deepEqual(resultado.nao_cabem.map((p) => p.indice).sort(), [0, 2]);
  validarResultado(resultado, { pecas, chapas: CHAPAS, ajustes: AJUSTES });
});

test('a serra e o refilo entram na conta: peças que só cabem sem eles vão para a outra chapa', () => {
  // Duas peças de 1365 cabem em 2730 úteis, mas não com 4 mm de serra entre elas.
  const pecas = [peca(1365, 1820, 2, { chapa_id: 2, veio: 1 })];
  assert.equal(calcular(pecas).chapas.length, 2);
  assert.equal(calcular(pecas, { ...AJUSTES, serra_decimos_mm: 0 }).chapas.length, 1);
  // A peça do tamanho exato da área útil cabe.
  assert.equal(calcular([peca(2730, 1820, 1, { chapa_id: 2, veio: 1 })]).nao_cabem.length, 0);
  assert.equal(calcular([peca(2731, 1820, 1, { chapa_id: 2, veio: 1 })]).nao_cabem.length, 1);
});

test('a conferência recusa resultados adulterados', () => {
  const pecas = [peca(1000, 500, 3), peca(600, 400, 2, { chapa_id: 2, veio: 1 })];
  const bom = calcular(pecas);
  const conferir = (r) => validarResultado(r, { pecas, chapas: CHAPAS, ajustes: AJUSTES });
  const copia = () => JSON.parse(JSON.stringify(bom));

  let r = copia();
  r.chapas[0].pecas[1].x = r.chapas[0].pecas[0].x; // sobreposição
  r.chapas[0].pecas[1].y = r.chapas[0].pecas[0].y;
  assert.throws(() => conferir(r), /sobrepõem/);

  r = copia();
  r.chapas[0].pecas.pop(); // falta peça
  assert.throws(() => conferir(r), /Faltam peças/);

  r = copia();
  r.chapas[0].pecas.push({ ...r.chapas[0].pecas[0] }); // repetida
  assert.throws(() => conferir(r), /mais de uma vez/);

  r = copia();
  const carvalho = r.chapas.find((c) => c.chapa_id === 2);
  carvalho.pecas[0].girada = true; // contra o veio
  assert.throws(() => conferir(r), /contra o veio/);

  r = copia();
  r.chapas[0].pecas[0].x = 2; // dentro do refilo
  assert.throws(() => conferir(r), /área útil|sobrepõem/);

  r = copia();
  r.nao_cabem.push({ indice: 0, copia: 1 });
  r.chapas.forEach((c) => (c.pecas = c.pecas.filter((p) => !(p.indice === 0 && p.copia === 1))));
  assert.throws(() => conferir(r), /cabe na chapa/);
});

test('padrão que não sai só com cortes de ponta a ponta é recusado', () => {
  // Cata-vento: quatro peças em volta de um quadrado, sem corte que atravesse a chapa.
  const chapa = { id: 9, comprimento_mm: 300, largura_mm: 300, veio: 0 };
  const ajustes = { serra_decimos_mm: 0, refilo_mm: 0 };
  const cataVento = [
    { numero: 1, x: 0, y: 0, w: 200, h: 100 },
    { numero: 2, x: 200, y: 0, w: 100, h: 200 },
    { numero: 3, x: 100, y: 200, w: 200, h: 100 },
    { numero: 4, x: 0, y: 100, w: 100, h: 200 },
  ];
  assert.equal(arvoreDeCortes(cataVento, chapa, ajustes), null);
  const grade = [
    { numero: 1, x: 0, y: 0, w: 150, h: 150 },
    { numero: 2, x: 150, y: 0, w: 150, h: 150 },
    { numero: 3, x: 0, y: 150, w: 300, h: 150 },
  ];
  assert.ok(arvoreDeCortes(grade, chapa, ajustes));
});

test('o roteiro começa com as faixas no comprimento e traz a medida da guia', () => {
  const chapa = { id: 9, comprimento_mm: 1000, largura_mm: 600, veio: 0 };
  const ajustes = { serra_decimos_mm: 40, refilo_mm: 0 };
  const colocadas = [
    { numero: 1, x: 0, y: 0, w: 500, h: 300 },
    { numero: 2, x: 504, y: 0, w: 300, h: 300 },
    { numero: 3, x: 0, y: 304, w: 1000, h: 200 },
  ];
  const passos = roteiroDeCorte(arvoreDeCortes(colocadas, chapa, ajustes));
  assert.equal(passos[0].eixo, 'y');
  assert.deepEqual(passos[0].partes.map((p) => [p.tipo, p.medida]), [['parte', 300], ['peca', 200], ['sobra', 92]]);
  assert.equal(passos[1].rotulo, 'A');
  assert.deepEqual(passos[1].partes.map((p) => [p.tipo, p.medida, p.numero]), [['peca', 500, 1], ['peca', 300, 2], ['sobra', 192, undefined]]);
});

test('metros de fita somam só os lados marcados, por tipo, com a margem', () => {
  const pecas = [
    peca(1000, 500, 2, { fita_id: 7, fita_c1: 1, fita_c2: 1 }),
    peca(400, 300, 1, { fita_id: 7, fita_l1: 1 }),
    peca(400, 300, 1, { fita_c1: 1 }), // sem fita escolhida: não conta
  ];
  const [fita] = metrosDeFita(pecas, [{ id: 7, nome: 'Branca 22', preco_metro_cents: 200 }], 10);
  assert.equal(fita.metros, 4.3);
  assert.equal(fita.metros_com_margem, 4.8);
  assert.equal(fita.custo_cents, 946);
});

test('a assinatura muda quando muda o que importa para o corte', () => {
  const base = assinaturaPlano(GUARDA_ROUPA, CHAPAS, AJUSTES);
  const descricao = GUARDA_ROUPA.map((p, i) => (i ? p : { ...p, descricao: 'outra', fita_c1: 1 }));
  assert.equal(assinaturaPlano(descricao, CHAPAS, AJUSTES), base);
  const medida = GUARDA_ROUPA.map((p, i) => (i ? p : { ...p, largura_mm: 551 }));
  assert.notEqual(assinaturaPlano(medida, CHAPAS, AJUSTES), base);
  assert.notEqual(assinaturaPlano(GUARDA_ROUPA, CHAPAS, { ...AJUSTES, serra_decimos_mm: 32 }), base);
  const chapaMaior = [{ ...BRANCO, comprimento_mm: 2770 }, CARVALHO];
  assert.notEqual(assinaturaPlano(GUARDA_ROUPA, chapaMaior, AJUSTES), base);
});

test('lista grande calcula dentro do tempo e com bom aproveitamento', () => {
  let s = 11;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const pecas = Array.from({ length: 150 }, () =>
    peca(100 + Math.round(rnd() * 1500), 60 + Math.round(rnd() * 600), 1 + Math.floor(rnd() * 3), { chapa_id: 2, veio: rnd() < 0.5 ? 1 : 0 }),
  );
  const inicio = Date.now();
  const resultado = otimizarPlano({ pecas, chapas: CHAPAS, ajustes: AJUSTES, tempoMaximoMs: 2500 });
  assert.ok(Date.now() - inicio < 8000);
  const conferido = validarResultado(resultado, { pecas, chapas: CHAPAS, ajustes: AJUSTES });
  const resumo = resumirPlano({ pecas, chapas: CHAPAS, fitas: [], ajustes: AJUSTES, resultado: conferido });
  assert.ok(resumo.aproveitamento > 80, `aproveitamento ${resumo.aproveitamento}%`);
  assert.equal(expandirPecas(pecas).length, conferido.chapas.reduce((t, c) => t + c.pecas.length, 0));
  const detalhes = detalharChapas({ pecas, chapas: CHAPAS, ajustes: AJUSTES, resultado: conferido });
  assert.ok(detalhes.every((d) => d.roteiro.length > 0));
});

test('listas aleatórias, com várias serras, refilos e modos, sempre passam na conferência', () => {
  for (let semente = 1; semente <= 25; semente++) {
    let s = semente * 7919;
    const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const chapas = [CARVALHO, { ...BRANCO, comprimento_mm: 2440 + Math.round(rnd() * 300), largura_mm: 1220 + Math.round(rnd() * 600) }];
    const pecas = Array.from({ length: 2 + Math.floor(rnd() * 40) }, () =>
      peca(30 + Math.round(rnd() * 2400), 30 + Math.round(rnd() * 1300), 1 + Math.floor(rnd() * 4), { chapa_id: rnd() < 0.5 ? 1 : 2, veio: rnd() < 0.5 ? 1 : 0 }),
    );
    const ajustes = { serra_decimos_mm: [0, 25, 32, 40, 48][Math.floor(rnd() * 5)], refilo_mm: [0, 5, 10, 15][Math.floor(rnd() * 4)], modo: rnd() < 0.5 ? 'faixas' : 'aproveitamento' };
    const resultado = otimizarPlano({ pecas, chapas, ajustes, tempoMaximoMs: 300, iteracoes: 200, semente });
    assert.doesNotThrow(() => validarResultado(JSON.parse(JSON.stringify(resultado)), { pecas, chapas, ajustes }), `semente ${semente}`);
  }
});
