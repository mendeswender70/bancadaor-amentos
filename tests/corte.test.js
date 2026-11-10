import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  arvoreDeCortes,
  assinaturaPlano,
  detalharSolucao,
  expandirPecas,
  formatarCm,
  lerCm,
  lerLinhasPecas,
  metrosDeFita,
  otimizarPlano,
  passosDaSerra,
  resumirSolucao,
  retalhosDaSolucao,
  roteiroDeCorte,
  sobraAproveitavel,
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
const primeira = (resultado) => resultado.solucoes[0];
const novas = (solucao) => solucao.chapas.filter((f) => !f.retalho_id).length;
const conferir = (resultado, pecas, ajustes = AJUSTES, retalhos = []) =>
  validarResultado(JSON.parse(JSON.stringify(resultado)), { pecas, chapas: CHAPAS, ajustes, retalhos });

test('lê a entrada rápida em cm com x, ×, vírgula, colunas de planilha e descrição', () => {
  const { pecas, erros } = lerLinhasPecas('72 x 55 x 2 Lateral\n60×40,5 Prateleira\nBase\t100\t50\t3\n\nsó texto');
  assert.deepEqual(
    pecas.map((p) => [p.comprimento_mm, p.largura_mm, p.quantidade, p.descricao]),
    [
      [720, 550, 2, 'Lateral'],
      [600, 405, 1, 'Prateleira'],
      [1000, 500, 3, 'Base'],
    ],
  );
  assert.deepEqual(erros, [{ linha: 5, texto: 'só texto' }]);
});

test('centímetros: mostra até uma casa e lê vírgula ou ponto', () => {
  assert.equal(formatarCm(725), '72,5');
  assert.equal(formatarCm(2750), '275');
  assert.equal(formatarCm(12000), '1.200');
  assert.equal(lerCm('72,5'), 725);
  assert.equal(lerCm('72.5'), 725);
  assert.equal(lerCm(' 55 '), 550);
  assert.equal(lerCm('0'), null);
  assert.equal(lerCm('5 5'), null);
  assert.equal(lerCm('-3'), null);
});

test('centímetros: aceita a unidade escrita e o ponto de milhar', () => {
  assert.equal(lerCm('72,5 cm'), 725);
  assert.equal(lerCm('455 mm'), 455, 'quem vem do milímetro pode escrever mm');
  assert.equal(lerCm('455mm'), 455);
  // "1.200" é mil e duzentos (como o próprio sistema mostra), não 1,2 cm.
  assert.equal(lerCm('1.200'), 12000);
  assert.equal(lerCm(formatarCm(12000)), 12000, 'o que é mostrado é lido de volta igual');
  assert.equal(lerCm('2.75'), 28, 'ponto com menos de 3 casas continua decimal');
  assert.equal(lerCm('0,0'), null);
  assert.equal(lerCm('90 cm cm'), null);
  const { pecas, erros } = lerLinhasPecas('Frente 455 mm x 200 mm 4\nLateral 254,5 x 55 2\n0 x 50');
  assert.deepEqual(
    pecas.map((p) => [p.descricao, p.comprimento_mm, p.largura_mm, p.quantidade]),
    [
      ['Frente', 455, 200, 4],
      ['Lateral', 2545, 550, 2],
    ],
  );
  assert.deepEqual(erros, [{ linha: 3, texto: '0 x 50' }]);
});

test('cada solução passa na conferência e tem cada peça uma vez', () => {
  const resultado = calcular(GUARDA_ROUPA);
  const conferido = conferir(resultado, GUARDA_ROUPA);
  const total = GUARDA_ROUPA.reduce((s, p) => s + p.quantidade, 0);
  assert.ok(conferido.solucoes.length >= 1 && conferido.solucoes.length <= 3);
  assert.equal(conferido.solucoes[0].tipo, 'menos_chapas');
  for (const s of conferido.solucoes) assert.equal(s.chapas.reduce((t, c) => t + c.pecas.length, 0), total);
  assert.equal(conferido.assinatura, assinaturaPlano(GUARDA_ROUPA, CHAPAS, AJUSTES));
  assert.equal(new Set(conferido.solucoes.map((s) => JSON.stringify(s.chapas))).size, conferido.solucoes.length, 'sem soluções repetidas');
});

test('o guarda-roupa de exemplo usa o mínimo de chapas (área pede 4,6)', () => {
  const solucao = primeira(calcular(GUARDA_ROUPA));
  assert.equal(novas(solucao), 5);
  const plano = { pecas: GUARDA_ROUPA, chapas: CHAPAS, fitas: [], ajustes: AJUSTES };
  const resumo = resumirSolucao(plano, solucao);
  assert.ok(resumo.aproveitamento > 90, `aproveitamento ${resumo.aproveitamento}%`);
  assert.equal(resumo.custo_chapas_cents, 5 * 30000);
  assert.ok(resumo.cortes > 0 && resumo.giros > 0);
});

test('sem preço nas chapas, o resumo não traz custo', () => {
  const semPreco = CHAPAS.map(({ preco_cents: _p, ...c }) => c);
  const resultado = otimizarPlano({ pecas: GUARDA_ROUPA, chapas: semPreco, ajustes: AJUSTES, tempoMaximoMs: 500 });
  const resumo = resumirSolucao({ pecas: GUARDA_ROUPA, chapas: semPreco, fitas: [{ id: 3, nome: 'Fita' }], ajustes: AJUSTES }, primeira(resultado));
  assert.equal(resumo.custo_chapas_cents, undefined);
  assert.ok(resumo.materiais.every((m) => m.custo_cents === undefined));
});

test('a solução de corte simples nunca tem mais giros e cortes que a de menos chapas', () => {
  const ajustes = { ...AJUSTES, serra_decimos_mm: 32 };
  const resultado = calcular(GUARDA_ROUPA, ajustes);
  const plano = { pecas: GUARDA_ROUPA, chapas: CHAPAS, ajustes };
  const trabalho = (s) => {
    const r = resumirSolucao(plano, s);
    return r.giros * 1000 + r.cortes;
  };
  const simples = resultado.solucoes.find((s) => s.tipo === 'corte_simples') || primeira(resultado);
  assert.ok(trabalho(simples) <= trabalho(primeira(resultado)));
});

test('o modo só faixas nunca usa menos chapas que o livre', () => {
  const faixas = calcular(GUARDA_ROUPA, { ...AJUSTES, modo: 'faixas' });
  assert.ok(novas(primeira(faixas)) >= novas(primeira(calcular(GUARDA_ROUPA))));
  conferir(faixas, GUARDA_ROUPA, { ...AJUSTES, modo: 'faixas' });
});

test('peças com veio em chapa com veio nunca giram; sem veio podem girar', () => {
  const pecas = [peca(400, 1700, 3, { chapa_id: 2, veio: 1 }), peca(400, 2000, 1, { chapa_id: 1 })];
  const solucao = primeira(calcular(pecas));
  for (const folha of solucao.chapas) {
    for (const p of folha.pecas) if (pecas[p.indice].chapa_id === 2) assert.equal(p.girada, false);
  }
  // Os 2000 mm só cabem deitados no comprimento da chapa (1820 úteis na largura).
  assert.ok(solucao.chapas.some((f) => f.pecas.some((p) => p.indice === 1 && p.girada)));
  conferir(calcular(pecas), pecas);
});

test('peça maior que a chapa vai para "não cabem"; a que cabe girada não', () => {
  const pecas = [peca(3000, 500), peca(1800, 2000), peca(1800, 2000, 1, { chapa_id: 2, veio: 1 })];
  const resultado = calcular(pecas);
  assert.deepEqual(primeira(resultado).nao_cabem.map((p) => p.indice).sort(), [0, 2]);
  conferir(resultado, pecas);
});

test('a serra e o refilo entram na conta', () => {
  // Duas peças de 1365 cabem em 2730 úteis, mas não com 4 mm de serra entre elas.
  const pecas = [peca(1365, 1820, 2, { chapa_id: 2, veio: 1 })];
  assert.equal(novas(primeira(calcular(pecas))), 2);
  assert.equal(novas(primeira(calcular(pecas, { ...AJUSTES, serra_decimos_mm: 0 }))), 1);
  assert.equal(primeira(calcular([peca(2730, 1820, 1, { chapa_id: 2, veio: 1 })])).nao_cabem.length, 0);
  assert.equal(primeira(calcular([peca(2731, 1820, 1, { chapa_id: 2, veio: 1 })])).nao_cabem.length, 1);
});

test('retalho entra quando economiza chapa nova, sem refilo', () => {
  const recorte = [peca(700, 400, 2), peca(500, 300)];
  const retalhos = [
    { id: 11, chapa_id: 1, comprimento_mm: 1500, largura_mm: 800 },
    { id: 12, chapa_id: 2, comprimento_mm: 2000, largura_mm: 1000 }, // outra chapa: não serve
  ];
  const resultado = calcular(recorte, AJUSTES, { retalhos });
  const solucao = primeira(resultado);
  assert.equal(novas(solucao), 0, 'cabe no retalho, não abre chapa');
  assert.deepEqual(retalhosDaSolucao(solucao), [11]);
  // 700 + 4 + 700 = 1404 cabe nos 1500 do retalho porque retalho não leva refilo.
  const conferido = conferir(resultado, recorte, AJUSTES, retalhos);
  assert.equal(conferido.solucoes[0].chapas[0].retalho_id, 11);
});

test('retalho não é gasto à toa: com as mesmas chapas novas, a solução principal não usa', () => {
  const retalhos = [
    { id: 7, chapa_id: 1, comprimento_mm: 1900, largura_mm: 1200 },
    { id: 8, chapa_id: 1, comprimento_mm: 900, largura_mm: 500 },
  ];
  const resultado = calcular(GUARDA_ROUPA, AJUSTES, { retalhos });
  assert.equal(novas(primeira(resultado)), 5);
  assert.deepEqual(retalhosDaSolucao(primeira(resultado)), []);
  conferir(resultado, GUARDA_ROUPA, AJUSTES, retalhos);
});

test('a conferência recusa retalho desconhecido, de outra chapa ou repetido', () => {
  const recorte = [peca(700, 400, 2)];
  const retalhos = [{ id: 11, chapa_id: 1, comprimento_mm: 1500, largura_mm: 420 }];
  const resultado = calcular(recorte, AJUSTES, { retalhos });
  assert.throws(() => conferir(resultado, recorte, AJUSTES, []), /não está mais disponível/);
  assert.throws(() => conferir(resultado, recorte, AJUSTES, [{ ...retalhos[0], chapa_id: 2 }]), /não está mais disponível/);
  const dobrado = JSON.parse(JSON.stringify(resultado));
  const folha = dobrado.solucoes[0].chapas[0];
  dobrado.solucoes[0].chapas = [
    { ...folha, pecas: [folha.pecas[0]] },
    { ...folha, pecas: [folha.pecas[1]] },
  ];
  assert.throws(() => conferir(dobrado, recorte, AJUSTES, retalhos), /duas vezes/);
});

test('a conferência recusa resultados adulterados', () => {
  const pecas = [peca(1000, 500, 3), peca(600, 400, 2, { chapa_id: 2, veio: 1 })];
  const bom = calcular(pecas);
  const copia = () => JSON.parse(JSON.stringify(bom));
  const ver = (r) => validarResultado(r, { pecas, chapas: CHAPAS, ajustes: AJUSTES });

  let r = copia();
  r.solucoes[0].chapas[0].pecas[1].x = r.solucoes[0].chapas[0].pecas[0].x;
  r.solucoes[0].chapas[0].pecas[1].y = r.solucoes[0].chapas[0].pecas[0].y;
  assert.throws(() => ver(r), /sobrepõem/);

  r = copia();
  r.solucoes[0].chapas[0].pecas.pop();
  assert.throws(() => ver(r), /Faltam peças/);

  r = copia();
  r.solucoes[0].chapas[0].pecas.push({ ...r.solucoes[0].chapas[0].pecas[0] });
  assert.throws(() => ver(r), /mais de uma vez/);

  r = copia();
  r.solucoes[0].chapas.find((c) => c.chapa_id === 2).pecas[0].girada = true;
  assert.throws(() => ver(r), /contra o veio/);

  r = copia();
  r.solucoes[0].chapas[0].pecas[0].x = 2;
  assert.throws(() => ver(r), /área útil|sobrepõem/);

  r = copia();
  r.solucoes[0].nao_cabem.push({ indice: 0, copia: 1 });
  r.solucoes[0].chapas.forEach((c) => (c.pecas = c.pecas.filter((p) => !(p.indice === 0 && p.copia === 1))));
  assert.throws(() => ver(r), /cabe na chapa/);

  r = copia();
  r.solucoes[0].tipo = 'outra';
  assert.throws(() => ver(r), /Tipo de solução/);
});

test('padrão que não sai só com cortes de ponta a ponta é recusado', () => {
  const medidas = { comprimento_mm: 300, largura_mm: 300, serra_decimos_mm: 0, refilo_mm: 0 };
  const cataVento = [
    { numero: 1, x: 0, y: 0, w: 200, h: 100 },
    { numero: 2, x: 200, y: 0, w: 100, h: 200 },
    { numero: 3, x: 100, y: 200, w: 200, h: 100 },
    { numero: 4, x: 0, y: 100, w: 100, h: 200 },
  ];
  assert.equal(arvoreDeCortes(cataVento, medidas), null);
  const grade = [
    { numero: 1, x: 0, y: 0, w: 150, h: 150 },
    { numero: 2, x: 150, y: 0, w: 150, h: 150 },
    { numero: 3, x: 0, y: 150, w: 300, h: 150 },
  ];
  assert.ok(arvoreDeCortes(grade, medidas));
});

test('o roteiro começa com as faixas no comprimento e marca quando girar', () => {
  const medidas = { comprimento_mm: 1000, largura_mm: 600, serra_decimos_mm: 40, refilo_mm: 0 };
  const colocadas = [
    { numero: 1, x: 0, y: 0, w: 500, h: 300 },
    { numero: 2, x: 504, y: 0, w: 300, h: 300 },
    { numero: 3, x: 0, y: 304, w: 1000, h: 200 },
  ];
  const passos = roteiroDeCorte(arvoreDeCortes(colocadas, medidas));
  assert.equal(passos[0].eixo, 'y');
  assert.equal(passos[0].girar, false);
  assert.deepEqual(passos[0].partes.map((p) => [p.tipo, p.medida]), [['parte', 300], ['peca', 200], ['sobra', 92]]);
  assert.equal(passos[1].rotulo, 'A');
  assert.equal(passos[1].girar, true);
  assert.deepEqual(passos[1].partes.map((p) => [p.tipo, p.medida, p.numero]), [['peca', 500, 1], ['peca', 300, 2], ['sobra', 192, undefined]]);
});

test('o passo a passo da serra entrega cada peça uma vez e indica a guia', () => {
  const solucao = primeira(calcular(GUARDA_ROUPA));
  const plano = { pecas: GUARDA_ROUPA, chapas: CHAPAS, ajustes: AJUSTES };
  const detalhes = detalharSolucao(plano, solucao);
  const passos = passosDaSerra(detalhes, { guiaParalelaMm: 900 });
  const produzidas = passos.flatMap((p) => p.produz);
  assert.equal(produzidas.length, expandirPecas(GUARDA_ROUPA).length);
  assert.equal(new Set(produzidas).size, produzidas.length);
  assert.equal(passos.at(-1).tipo, 'fim');
  assert.equal(passos.filter((p) => p.tipo === 'chapa').length, solucao.chapas.length);
  assert.equal(passos.filter((p) => p.tipo === 'refilo').length, solucao.chapas.length);
  const cortes = passos.filter((p) => p.tipo === 'corte');
  assert.equal(cortes.length, resumirSolucao(plano, solucao, detalhes).cortes);
  for (const c of cortes) {
    if (c.guia === 'paralela') assert.ok(c.medida <= 900, `guia paralela com ${c.medida} mm`);
    assert.ok(c.medida > 0);
  }
  assert.ok(cortes.some((c) => c.girar), 'alguma faixa precisa girar para os cortes na largura');
});

test('cada corte diz o que separa: faixa (com as peças), peça ou sobra', () => {
  const pecas = [peca(1764, 530)];
  const retalhos = [{ id: 10, chapa_id: 1, comprimento_mm: 1822, largura_mm: 800 }];
  const solucao = primeira(calcular(pecas, AJUSTES, { retalhos }));
  const passos = passosDaSerra(detalharSolucao({ pecas, chapas: CHAPAS, ajustes: AJUSTES, retalhos }, solucao));
  const cortes = passos.filter((p) => p.tipo === 'corte');
  assert.equal(cortes[0].parte.tipo, 'parte', 'a faixa com a peça não é sobra');
  assert.deepEqual(cortes[0].parte.pecas, [1]);
  assert.equal(cortes[0].resto.tipo, 'sobra');
  const tipos = new Set(passos.flatMap((p) => [p.parte?.tipo, p.resto?.tipo]).filter(Boolean));
  for (const tipo of tipos) assert.ok(['parte', 'peca', 'sobra'].includes(tipo), tipo);
});

test('chapas com o mesmo desenho ficam juntas e contadas', () => {
  const pecas = [peca(2730, 450, 16)];
  const detalhes = detalharSolucao({ pecas, chapas: CHAPAS, ajustes: AJUSTES }, primeira(calcular(pecas)));
  assert.equal(detalhes.length, 4);
  assert.ok(detalhes.every((d) => d.iguais === 4));
  assert.deepEqual(detalhes.map((d) => d.posicaoIgual), [1, 2, 3, 4]);
});

test('sobra só vale guardar quando passa do mínimo nos dois lados', () => {
  const minimo = { sobra_min_largura_mm: 100, sobra_min_comprimento_mm: 300 };
  assert.equal(sobraAproveitavel(1200, 350, minimo), true);
  assert.equal(sobraAproveitavel(1200, 90, minimo), false);
  assert.equal(sobraAproveitavel(250, 200, minimo), false);
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
  const [semPreco] = metrosDeFita(pecas, [{ id: 7, nome: 'Branca 22' }], 10);
  assert.equal(semPreco.custo_cents, undefined);
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
  assert.ok(Date.now() - inicio < 10000);
  const conferido = validarResultado(resultado, { pecas, chapas: CHAPAS, ajustes: AJUSTES });
  const plano = { pecas, chapas: CHAPAS, ajustes: AJUSTES };
  const resumo = resumirSolucao(plano, conferido.solucoes[0]);
  assert.ok(resumo.aproveitamento > 80, `aproveitamento ${resumo.aproveitamento}%`);
  const detalhes = detalharSolucao(plano, conferido.solucoes[0]);
  assert.ok(detalhes.every((d) => d.roteiro.length > 0));
});

test('listas aleatórias, com retalhos, várias serras, refilos e modos, sempre passam na conferência', () => {
  for (let semente = 1; semente <= 25; semente++) {
    let s = semente * 7919;
    const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const chapas = [CARVALHO, { ...BRANCO, comprimento_mm: 2440 + Math.round(rnd() * 300), largura_mm: 1220 + Math.round(rnd() * 600) }];
    const pecas = Array.from({ length: 2 + Math.floor(rnd() * 40) }, () =>
      peca(30 + Math.round(rnd() * 2400), 30 + Math.round(rnd() * 1300), 1 + Math.floor(rnd() * 4), { chapa_id: rnd() < 0.5 ? 1 : 2, veio: rnd() < 0.5 ? 1 : 0 }),
    );
    const retalhos = Array.from({ length: Math.floor(rnd() * 4) }, (_, i) => ({
      id: 100 + i,
      chapa_id: rnd() < 0.5 ? 1 : 2,
      comprimento_mm: 300 + Math.round(rnd() * 1500),
      largura_mm: 100 + Math.round(rnd() * 800),
    }));
    const ajustes = { serra_decimos_mm: [0, 25, 32, 40, 48][Math.floor(rnd() * 5)], refilo_mm: [0, 5, 10, 15][Math.floor(rnd() * 4)], modo: rnd() < 0.5 ? 'faixas' : 'aproveitamento' };
    const resultado = otimizarPlano({ pecas, chapas, ajustes, retalhos, tempoMaximoMs: 300, iteracoes: 200, semente });
    assert.doesNotThrow(() => validarResultado(JSON.parse(JSON.stringify(resultado)), { pecas, chapas, ajustes, retalhos }), `semente ${semente}`);
    for (const solucao of resultado.solucoes) {
      const passos = passosDaSerra(detalharSolucao({ pecas, chapas, ajustes, retalhos }, solucao));
      const produzidas = passos.flatMap((p) => p.produz);
      const esperadas = expandirPecas(pecas).length - solucao.nao_cabem.length;
      assert.equal(produzidas.length, esperadas, `semente ${semente}: peças no passo a passo`);
    }
  }
});
