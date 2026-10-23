const SELETORES = '.acesso-cartao, .p-vidro, .p-ambiente, .p-condicoes-painel, .p-barra';
const CLASSE_ATIVA = 'reflexo-vidro';
const ANGULO_INICIAL = -35;
const BRILHO_REPOUSO = 0.72;

const limitar = (valor, minimo, maximo) => Math.min(maximo, Math.max(minimo, valor));
const diferencaAngular = (angulo, referencia) => ((angulo - referencia + 540) % 360 + 360) % 360 - 180;

function criarBotaoMovimento() {
  const botao = document.createElement('button');
  botao.type = 'button';
  botao.className = 'reflexo-permissao';
  botao.setAttribute('aria-label', 'Ativar reflexo pelo movimento do aparelho');
  botao.setAttribute('aria-pressed', 'false');
  botao.title = 'Ativar reflexo pelo movimento do aparelho';

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('aria-hidden', 'true');
  const mira = document.createElementNS(svg.namespaceURI, 'circle');
  mira.setAttribute('cx', '12');
  mira.setAttribute('cy', '12');
  mira.setAttribute('r', '7.5');
  const centro = document.createElementNS(svg.namespaceURI, 'circle');
  centro.setAttribute('cx', '12');
  centro.setAttribute('cy', '12');
  centro.setAttribute('r', '2');
  const eixos = document.createElementNS(svg.namespaceURI, 'path');
  eixos.setAttribute('d', 'M12 2v3m0 14v3M2 12h3m14 0h3');
  svg.append(mira, centro, eixos);
  const texto = document.createElement('span');
  texto.className = 'reflexo-permissao-texto';
  texto.textContent = 'Ativar reflexo';
  botao.append(svg, texto);
  return botao;
}

/** Reflexo de borda via inclinação, com ponteiro como alternativa universal. */
export function ativarReflexoVidro(raiz = document) {
  const cartoes = [];
  if (raiz.matches?.(SELETORES)) cartoes.push(raiz);
  cartoes.push(...raiz.querySelectorAll(SELETORES));
  if (!cartoes.length) return () => {};

  const bordas = new Map(cartoes.map((cartao) => {
    cartao.classList.add(CLASSE_ATIVA);
    const borda = document.createElement('span');
    borda.className = 'reflexo-borda';
    borda.setAttribute('aria-hidden', 'true');
    cartao.append(borda);
    return [cartao, borda];
  }));
  function removerBordas() {
    for (const cartao of cartoes) {
      cartao.classList.remove(CLASSE_ATIVA);
      cartao.style.removeProperty('--reflexo-angulo');
      cartao.style.removeProperty('--reflexo-brilho');
      bordas.get(cartao).remove();
    }
  }
  // Preserva o acabamento estático quando a pessoa prefere reduzir movimento.
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return removerBordas;

  const estados = new Map(cartoes.map((cartao) => [cartao, {
    angulo: ANGULO_INICIAL, brilho: BRILHO_REPOUSO,
    alvoAngulo: ANGULO_INICIAL, alvoBrilho: BRILHO_REPOUSO,
  }]));
  let quadro = 0;
  let ultimoQuadro = 0;
  let temporizadorPonteiro = 0;
  let temporizadorSensor = 0;
  let movimentoAtivo = false;
  let leituraRecebida = false;
  let solicitando = false;
  let referenciaInclinacao = null;
  let ultimoPonteiro = -Infinity;
  let luzSensor = { angulo: ANGULO_INICIAL, brilho: BRILHO_REPOUSO };
  let botao = null;
  let encerrado = false;

  function desenhar(agora) {
    quadro = 0;
    const intervalo = limitar(agora - ultimoQuadro, 0, 100);
    ultimoQuadro = agora;
    // A mesma resposta em telas de 30, 60 ou 120 Hz.
    const progresso = 1 - Math.exp(-intervalo / 85);
    let continua = false;
    for (const [cartao, estado] of estados) {
      estado.angulo += (estado.alvoAngulo - estado.angulo) * progresso;
      estado.brilho += (estado.alvoBrilho - estado.brilho) * progresso;
      cartao.style.setProperty('--reflexo-angulo', `${estado.angulo.toFixed(2)}deg`);
      cartao.style.setProperty('--reflexo-brilho', estado.brilho.toFixed(3));
      if (
        Math.abs(estado.alvoAngulo - estado.angulo) > 0.08 ||
        Math.abs(estado.alvoBrilho - estado.brilho) > 0.01
      ) continua = true;
    }
    if (continua) quadro = requestAnimationFrame(desenhar);
  }

  function animar() {
    if (!quadro) {
      ultimoQuadro = performance.now();
      quadro = requestAnimationFrame(desenhar);
    }
  }

  function direcionar(estado, angulo, brilho) {
    estado.alvoAngulo = estado.angulo + diferencaAngular(angulo, estado.angulo);
    estado.alvoBrilho = brilho;
  }

  function refletirEmTodos(angulo, brilho) {
    for (const estado of estados.values()) {
      direcionar(estado, angulo, brilho);
    }
    animar();
  }

  function aoMoverPonteiro(evento, cartao) {
    const limite = cartao.getBoundingClientRect();
    if (!limite.width || !limite.height) return;
    ultimoPonteiro = performance.now();
    clearTimeout(temporizadorPonteiro);
    const x = (evento.clientX - limite.left) / limite.width - 0.5;
    const y = (evento.clientY - limite.top) / limite.height - 0.5;
    const angulo = Math.hypot(x, y) < 0.04 ? ANGULO_INICIAL : Math.atan2(y, x) * 180 / Math.PI + 90;
    for (const [alvo, estado] of estados) {
      if (alvo === cartao) direcionar(estado, angulo, 1);
    }
    animar();
    temporizadorPonteiro = setTimeout(() => {
      ultimoPonteiro = -Infinity;
      refletirEmTodos(luzSensor.angulo, luzSensor.brilho);
    }, 700);
  }

  function aoSairDoCartao(evento, cartao) {
    if (evento.pointerType !== 'mouse') return;
    const estado = estados.get(cartao);
    if (estado) direcionar(estado, luzSensor.angulo, luzSensor.brilho);
    ultimoPonteiro = -Infinity;
    animar();
  }

  function aoInclinar(evento) {
    if (!movimentoAtivo || !Number.isFinite(evento.beta) || !Number.isFinite(evento.gamma)) return;
    if (!leituraRecebida) {
      leituraRecebida = true;
      clearTimeout(temporizadorSensor);
      atualizarBotao('ativo');
    }
    if (!referenciaInclinacao) referenciaInclinacao = { beta: evento.beta, gamma: evento.gamma };

    let horizontal = limitar(diferencaAngular(evento.gamma, referenciaInclinacao.gamma) / 18, -1, 1);
    let vertical = limitar(diferencaAngular(evento.beta, referenciaInclinacao.beta) / 18, -1, 1);
    const angulo = ((window.screen.orientation?.angle ?? window.orientation ?? 0) + 360) % 360;
    if (angulo === 90) [horizontal, vertical] = [vertical, -horizontal];
    else if (angulo === 180) [horizontal, vertical] = [-horizontal, -vertical];
    else if (angulo === 270) [horizontal, vertical] = [-vertical, horizontal];

    luzSensor = {
      angulo: ANGULO_INICIAL + horizontal * 90 + vertical * 65,
      brilho: BRILHO_REPOUSO + Math.min(0.28, Math.hypot(horizontal, vertical) * 0.24),
    };
    if (performance.now() - ultimoPonteiro >= 700) refletirEmTodos(luzSensor.angulo, luzSensor.brilho);
  }

  function atualizarBotao(modo) {
    if (!botao) return;
    const ativo = modo === 'ativo';
    const negado = modo === 'negado' || modo === 'indisponivel';
    botao.classList.toggle('ativo', ativo);
    botao.classList.toggle('negado', negado);
    botao.setAttribute('aria-pressed', String(ativo));
    const rotulos = {
      inativo: ['Ativar reflexo', 'Ativar reflexo pelo movimento do aparelho'],
      aguardando: ['Ativando…', 'Aguardando o movimento do aparelho'],
      ativo: ['Reflexo ativo', 'Desativar reflexo pelo movimento do aparelho'],
      negado: ['Reflexo ao toque', 'Movimento não autorizado. O reflexo acompanha o toque. Toque aqui para tentar ativar o movimento novamente.'],
      indisponivel: ['Reflexo ao toque', 'Este navegador não enviou movimentos. O reflexo acompanha o toque. Toque aqui para tentar novamente.'],
    };
    const [rotulo, texto] = rotulos[modo];
    botao.querySelector('.reflexo-permissao-texto').textContent = rotulo;
    botao.setAttribute('aria-label', texto);
    botao.title = texto;
  }

  function iniciarMovimento() {
    if (movimentoAtivo || encerrado) return;
    movimentoAtivo = true;
    leituraRecebida = false;
    referenciaInclinacao = null;
    window.addEventListener('deviceorientation', aoInclinar, { passive: true });
    atualizarBotao('aguardando');
    temporizadorSensor = setTimeout(() => {
      if (leituraRecebida || encerrado) return;
      atualizarBotao('indisponivel');
    }, 3000);
  }

  function pararMovimento() {
    if (!movimentoAtivo) return;
    movimentoAtivo = false;
    clearTimeout(temporizadorSensor);
    window.removeEventListener('deviceorientation', aoInclinar);
    referenciaInclinacao = null;
    luzSensor = { angulo: ANGULO_INICIAL, brilho: BRILHO_REPOUSO };
    atualizarBotao('inativo');
    refletirEmTodos(luzSensor.angulo, luzSensor.brilho);
  }

  const eventosPonteiro = new Map(cartoes.map((cartao) => {
    const mover = (evento) => aoMoverPonteiro(evento, cartao);
    const sair = (evento) => aoSairDoCartao(evento, cartao);
    cartao.addEventListener('pointermove', mover, { passive: true });
    cartao.addEventListener('pointerdown', mover, { passive: true });
    cartao.addEventListener('pointerleave', sair, { passive: true });
    return [cartao, { mover, sair }];
  }));

  const Sensor = window.DeviceOrientationEvent;
  if (typeof Sensor?.requestPermission === 'function') {
    const cartaoControle = cartoes.find((cartao) => cartao.matches('.acesso-cartao, .p-capa-resumo')) || cartoes[0];
    botao = criarBotaoMovimento();
    cartaoControle.append(botao);
    botao.addEventListener('click', async () => {
      if (solicitando) return;
      if (movimentoAtivo) {
        pararMovimento();
        if (leituraRecebida) return;
      }
      solicitando = true;
      botao.setAttribute('aria-busy', 'true');
      atualizarBotao('aguardando');
      try {
        const permissao = await Sensor.requestPermission();
        if (encerrado) return;
        if (permissao === 'granted') iniciarMovimento();
        else atualizarBotao('negado');
      } catch {
        if (encerrado) return;
        atualizarBotao('negado');
      } finally {
        solicitando = false;
        botao.removeAttribute('aria-busy');
      }
    });
  } else if (Sensor) {
    iniciarMovimento();
  }

  const recalibrar = () => { referenciaInclinacao = null; };
  window.addEventListener('orientationchange', recalibrar, { passive: true });

  return () => {
    encerrado = true;
    clearTimeout(temporizadorPonteiro);
    clearTimeout(temporizadorSensor);
    if (quadro) cancelAnimationFrame(quadro);
    window.removeEventListener('deviceorientation', aoInclinar);
    window.removeEventListener('orientationchange', recalibrar);
    for (const cartao of cartoes) {
      const eventos = eventosPonteiro.get(cartao);
      cartao.removeEventListener('pointermove', eventos.mover);
      cartao.removeEventListener('pointerdown', eventos.mover);
      cartao.removeEventListener('pointerleave', eventos.sair);
    }
    removerBordas();
    botao?.remove();
  };
}
