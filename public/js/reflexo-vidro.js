const SELETORES = '.acesso-cartao, .p-vidro, .p-barra';
const CLASSE_ATIVA = 'reflexo-vidro';

const limitar = (valor, minimo, maximo) => Math.min(maximo, Math.max(minimo, valor));

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
  botao.append(svg);
  return botao;
}

/** Reflexo de borda via inclinação, com ponteiro como alternativa universal. */
export function ativarReflexoVidro(raiz = document) {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return () => {};

  const cartoes = [];
  if (raiz.matches?.(SELETORES)) cartoes.push(raiz);
  cartoes.push(...raiz.querySelectorAll(SELETORES));
  if (!cartoes.length) return () => {};

  const estados = new Map(cartoes.map((cartao) => {
    cartao.classList.add(CLASSE_ATIVA);
    return [cartao, { x: 50, y: 50, brilho: 0, alvoX: 50, alvoY: 50, alvoBrilho: 0 }];
  }));
  const bordas = new Map(cartoes.map((cartao) => {
    const borda = document.createElement('span');
    borda.className = 'reflexo-borda';
    borda.setAttribute('aria-hidden', 'true');
    cartao.append(borda);
    return [cartao, borda];
  }));
  let quadro = 0;
  let temporizadorPonteiro = 0;
  let movimentoAtivo = false;
  let referenciaInclinacao = null;
  let ultimoPonteiro = 0;
  let botao = null;
  let encerrado = false;

  function desenhar() {
    quadro = 0;
    let continua = false;
    for (const [cartao, estado] of estados) {
      estado.x += (estado.alvoX - estado.x) * 0.18;
      estado.y += (estado.alvoY - estado.y) * 0.18;
      estado.brilho += (estado.alvoBrilho - estado.brilho) * 0.2;
      cartao.style.setProperty('--reflexo-x', `${estado.x.toFixed(2)}%`);
      cartao.style.setProperty('--reflexo-y', `${estado.y.toFixed(2)}%`);
      cartao.style.setProperty('--reflexo-brilho', estado.brilho.toFixed(3));
      if (
        Math.abs(estado.alvoX - estado.x) > 0.08 ||
        Math.abs(estado.alvoY - estado.y) > 0.08 ||
        Math.abs(estado.alvoBrilho - estado.brilho) > 0.01
      ) continua = true;
    }
    if (continua) quadro = requestAnimationFrame(desenhar);
  }

  function animar() {
    if (!quadro) quadro = requestAnimationFrame(desenhar);
  }

  function refletirEmTodos(x, y, brilho) {
    for (const estado of estados.values()) {
      estado.alvoX = x;
      estado.alvoY = y;
      estado.alvoBrilho = brilho;
    }
    animar();
  }

  function aoMoverPonteiro(evento, cartao) {
    const limite = cartao.getBoundingClientRect();
    if (!limite.width || !limite.height) return;
    ultimoPonteiro = performance.now();
    clearTimeout(temporizadorPonteiro);
    for (const [alvo, estado] of estados) {
      estado.alvoBrilho = alvo === cartao ? 0.86 : 0;
      if (alvo === cartao) {
        estado.alvoX = limitar(((evento.clientX - limite.left) / limite.width) * 100, 4, 96);
        estado.alvoY = limitar(((evento.clientY - limite.top) / limite.height) * 100, 4, 96);
      }
    }
    animar();
    temporizadorPonteiro = setTimeout(() => {
      ultimoPonteiro = 0;
      if (movimentoAtivo && referenciaInclinacao) refletirEmTodos(50, 50, 0.22);
      else refletirEmTodos(50, 50, 0);
    }, 1400);
  }

  function aoSairDoCartao(evento, cartao) {
    if (evento.pointerType !== 'mouse') return;
    const estado = estados.get(cartao);
    if (estado) estado.alvoBrilho = 0;
    ultimoPonteiro = 0;
    animar();
  }

  function aoInclinar(evento) {
    if (!movimentoAtivo || !Number.isFinite(evento.beta) || !Number.isFinite(evento.gamma)) return;
    if (performance.now() - ultimoPonteiro < 1400) return;
    if (!referenciaInclinacao) referenciaInclinacao = { beta: evento.beta, gamma: evento.gamma };

    let horizontal = limitar((evento.gamma - referenciaInclinacao.gamma) / 36, -1, 1);
    let vertical = limitar((evento.beta - referenciaInclinacao.beta) / 36, -1, 1);
    const angulo = ((window.screen.orientation?.angle ?? window.orientation ?? 0) + 360) % 360;
    if (angulo === 90) [horizontal, vertical] = [vertical, -horizontal];
    else if (angulo === 180) [horizontal, vertical] = [-horizontal, -vertical];
    else if (angulo === 270) [horizontal, vertical] = [-vertical, horizontal];

    const intensidade = 0.28 + Math.min(0.58, Math.hypot(horizontal, vertical) * 0.42);
    refletirEmTodos(50 + horizontal * 37, 50 + vertical * 37, intensidade);
  }

  function atualizarBotao(ativo, negado = false) {
    if (!botao) return;
    botao.classList.toggle('ativo', ativo);
    botao.classList.toggle('negado', negado);
    botao.setAttribute('aria-pressed', String(ativo));
    const texto = ativo
      ? 'Desativar reflexo pelo movimento do aparelho'
      : negado
        ? 'Permissão não concedida. Mova o dedo sobre o vidro para deslocar o reflexo.'
        : 'Ativar reflexo pelo movimento do aparelho';
    botao.setAttribute('aria-label', texto);
    botao.title = texto;
  }

  function iniciarMovimento() {
    if (movimentoAtivo || encerrado) return;
    movimentoAtivo = true;
    referenciaInclinacao = null;
    window.addEventListener('deviceorientation', aoInclinar, { passive: true });
    atualizarBotao(true);
  }

  function pararMovimento() {
    if (!movimentoAtivo) return;
    movimentoAtivo = false;
    window.removeEventListener('deviceorientation', aoInclinar);
    referenciaInclinacao = null;
    atualizarBotao(false);
    refletirEmTodos(50, 50, 0);
  }

  const eventosPonteiro = new Map(cartoes.map((cartao) => {
    const mover = (evento) => aoMoverPonteiro(evento, cartao);
    const sair = (evento) => aoSairDoCartao(evento, cartao);
    cartao.addEventListener('pointermove', mover, { passive: true });
    cartao.addEventListener('pointerleave', sair, { passive: true });
    return [cartao, { mover, sair }];
  }));

  const Sensor = window.DeviceOrientationEvent;
  if (typeof Sensor?.requestPermission === 'function') {
    const cartaoControle = cartoes.find((cartao) => cartao.matches('.acesso-cartao, .p-capa-resumo')) || cartoes[0];
    botao = criarBotaoMovimento();
    cartaoControle.append(botao);
    botao.addEventListener('click', async () => {
      if (movimentoAtivo) {
        pararMovimento();
        return;
      }
      try {
        const permissao = await Sensor.requestPermission();
        if (encerrado) return;
        if (permissao === 'granted') iniciarMovimento();
        else atualizarBotao(false, true);
      } catch {
        if (encerrado) return;
        atualizarBotao(false, true);
      }
    });
  } else if (Sensor) {
    iniciarMovimento();
  }

  return () => {
    encerrado = true;
    clearTimeout(temporizadorPonteiro);
    if (quadro) cancelAnimationFrame(quadro);
    window.removeEventListener('deviceorientation', aoInclinar);
    for (const cartao of cartoes) {
      const eventos = eventosPonteiro.get(cartao);
      cartao.removeEventListener('pointermove', eventos.mover);
      cartao.removeEventListener('pointerleave', eventos.sair);
      cartao.classList.remove(CLASSE_ATIVA);
      cartao.style.removeProperty('--reflexo-x');
      cartao.style.removeProperty('--reflexo-y');
      cartao.style.removeProperty('--reflexo-brilho');
      bordas.get(cartao).remove();
    }
    botao?.remove();
  };
}
