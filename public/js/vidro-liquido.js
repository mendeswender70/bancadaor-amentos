const PAINEIS = [
  '.acesso-cartao', '.cartao', '.indicador', '.linha-orcamento-tabela', '.linha-cliente-ui',
  '.ambiente', '.bloco-cliente', '.barra-salvar', '.menu-inferior',
  '.acao-interna-fixa', '.ficha-contato', '.novo-proximo', '.config-empresa-resumo',
  '.config-opcao', '.cartao-aviso-feed', '.novidade', '.avisos-resumo-novidades',
  '.barra-busca', '.entrada-com-unidade', '.preco-com-unidade', '.abas', '.abas-editor',
  '.editor-indice', '.segmentado', '.etapas', '.previa-pagamento', '.previa-cartao',
  '.resultado-item', '.editor-cartao-simulacao', '.tipo', '.seletor-cliente .linha-orcamento',
  '.p-vidro', '.p-ambiente', '.p-condicoes-painel', '.p-barra', '.p-cartao-opcao',
].join(',');
const CONTROLES = [
  'button', 'a[role="button"]', '.botao', '.botao-icone', '.p-botao', '.link-botao', '.chip:not(.chip-editavel)', '.mostrar-senha',
  '.avisos-voltar', '.p-fechar', '.selo-icone', '.config-opcao-icone', '.aviso-feed-icone',
  '.dashboard-atalho-icone', '.editor-cliente-icone', '.avatar', '.cliente-avatar',
  '.botao-novidades-topo', '.lateral .menu-link', '.lateral-novo',
  '.menu-inferior .menu-link > .icone', '.botao-central > span:first-child',
  '.segmentado > button', '.abas > button', '.abas > a', '.abas-editor > button',
  '.editor-indice > button', '.gel-movimento',
].join(',');
const FLUTUANTES = '.modal, .p-modal, .menu-opcoes, .sugestoes, .aviso-versao';
const CAMPOS = 'input:not([type=checkbox]):not([type=radio]):not([type=hidden]):not([type=file]):not([type=range]):not([type=color]), textarea, select';
const TODOS = `${PAINEIS},${CONTROLES},${FLUTUANTES},${CAMPOS}`;
const limitar = (v, a, b) => Math.min(b, Math.max(a, v));
const diferenca = (v, origem) => ((v - origem + 540) % 360 + 360) % 360 - 180;

function criarControle() {
  const botao = document.createElement('button');
  botao.type = 'button';
  botao.className = 'gel-movimento';
  botao.setAttribute('aria-pressed', 'false');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(svg.namespaceURI, 'path');
  path.setAttribute('d', 'm10 3 8 3a2 2 0 0 1 1.2 2.6l-4.1 11a2 2 0 0 1-2.6 1.2l-8-3a2 2 0 0 1-1.2-2.6l4.1-11A2 2 0 0 1 10 3Zm-1 13 3 1M3 4 1 7m20 10 2-3');
  svg.append(path);
  const texto = document.createElement('span');
  texto.className = 'gel-movimento-texto';
  texto.textContent = 'Movimento';
  botao.append(svg, texto);
  return botao;
}

/** Um material para toda a interface; somente as camadas ópticas se deformam. */
export function ativarVidroLiquido(raiz = document.body) {
  const superficies = new Map();
  const campos = new Set();
  const animando = new Set();
  const preferencia = window.matchMedia('(prefers-reduced-motion: reduce)');
  const Sensor = window.DeviceOrientationEvent;
  let quadro = 0;
  let ultimoQuadro = 0;
  let quadroTextura = 0;
  let encerrado = false;
  let sensorLigado = false;
  let leituraRecebida = false;
  let solicitando = false;
  let referencia = null;
  let controle = null;
  let temporizadorSensor = 0;
  let modoControle = 'inativo';
  let luz = { x: -0.55, y: -0.75 };
  const imagem = new Image();

  const visibilidade = typeof IntersectionObserver === 'function' ? new IntersectionObserver((entradas) => {
    for (const entrada of entradas) {
      const estado = superficies.get(entrada.target);
      if (estado) estado.visivel = entrada.isIntersecting;
    }
    agendarTextura();
  }, { rootMargin: '100px' }) : null;

  function limparSuperficie(el, estado) {
    visibilidade?.unobserve(el);
    animando.delete(estado);
    estado.lente.remove();
    el.classList.remove('gel-superficie', 'gel-painel', 'gel-controle', 'gel-flutuante', 'gel-posicionada', 'gel-madeira');
    for (const nome of Array.from(el.style)) if (nome.startsWith('--gel-')) el.style.removeProperty(nome);
    superficies.delete(el);
  }

  function decorar(el) {
    if (!(el instanceof HTMLElement) || !raiz.contains(el)) return;
    if (el.matches(CAMPOS)) {
      el.classList.add('gel-campo');
      campos.add(el);
      return;
    }
    if (superficies.has(el)) {
      const estado = superficies.get(el);
      if (!el.contains(estado.lente)) el.append(estado.lente);
      return;
    }
    const lente = document.createElement('span');
    lente.className = 'gel-lente';
    lente.setAttribute('aria-hidden', 'true');
    const refracao = document.createElement('span');
    refracao.className = 'gel-refracao';
    lente.append(refracao);
    const tipo = el.matches(FLUTUANTES) ? 'gel-flutuante' : el.matches(CONTROLES) ? 'gel-controle' : 'gel-painel';
    el.classList.add('gel-superficie', tipo);
    if (getComputedStyle(el).position === 'static') el.classList.add('gel-posicionada');
    const madeira = el.closest('.acesso, .p-pagina');
    if (madeira) el.classList.add('gel-madeira');
    el.append(lente);
    const estado = { el, lente, madeira, visivel: true, x: luz.x, y: luz.y, p: 0, vx: 0, vy: 0, vp: 0, ax: luz.x, ay: luz.y, ap: 0, ponteiro: false };
    superficies.set(el, estado);
    visibilidade?.observe(el);
  }

  function varrer(no) {
    if (!(no instanceof Element)) return;
    if (no.matches(TODOS)) decorar(no);
    for (const el of no.querySelectorAll(TODOS)) decorar(el);
  }

  function atualizarControle(modo) {
    modoControle = modo;
    if (!controle) return;
    const rotulos = {
      inativo: ['Movimento', 'Ativar movimento do vidro'],
      aguardando: ['Ativando…', 'Aguardando o movimento do aparelho'],
      ativo: ['Movimento ativo', 'Desativar movimento do vidro'],
      toque: ['Ao toque', 'O vidro acompanha o toque. Toque aqui para tentar ativar o movimento do aparelho.'],
    };
    const [texto, descricao] = rotulos[modo];
    controle.querySelector('.gel-movimento-texto').textContent = texto;
    controle.setAttribute('aria-pressed', String(modo === 'ativo'));
    controle.setAttribute('aria-label', descricao);
    controle.title = descricao;
    controle.classList.toggle('gel-movimento-ativo', modo === 'ativo');
  }

  function posicionarControle() {
    if (preferencia.matches || typeof Sensor?.requestPermission !== 'function') return;
    const ancora = raiz.querySelector('.acesso-cartao, .p-capa-resumo, .topo');
    if (!ancora) return;
    if (!controle) {
      controle = criarControle();
      controle.addEventListener('click', solicitarSensor);
      atualizarControle(modoControle);
    }
    if (controle.parentElement !== ancora) {
      ancora.append(controle);
      controle.classList.toggle('gel-movimento-topo', ancora.matches('.topo'));
      decorar(controle);
    }
  }

  function atualizarTextura() {
    quadroTextura = 0;
    if (!imagem.naturalWidth) return;
    for (const [el, estado] of superficies) {
      if (!estado.madeira || !estado.visivel || !el.isConnected) continue;
      const c = el.getBoundingClientRect();
      if (!c.width || !c.height) continue;
      const b = estado.madeira.matches('.acesso') ? estado.madeira.getBoundingClientRect() : { left: 0, top: 0, width: innerWidth, height: innerHeight };
      const escala = Math.max(b.width / imagem.naturalWidth, b.height / imagem.naturalHeight);
      const w = imagem.naturalWidth * escala;
      const h = imagem.naturalHeight * escala;
      // Ampliação suave apenas no menisco: o texto não entra na refração.
      const zoom = 1.07;
      el.style.setProperty('--gel-textura-w', `${(w * zoom).toFixed(1)}px`);
      el.style.setProperty('--gel-textura-h', `${(h * zoom).toFixed(1)}px`);
      el.style.setProperty('--gel-textura-x', `${((b.left + (b.width - w) / 2 - c.left) * zoom - c.width * 0.035).toFixed(1)}px`);
      el.style.setProperty('--gel-textura-y', `${((b.top + (b.height - h) / 2 - c.top) * zoom - c.height * 0.035).toFixed(1)}px`);
    }
  }

  function agendarTextura() {
    if (!encerrado && !quadroTextura) quadroTextura = requestAnimationFrame(atualizarTextura);
  }

  function aplicar(estado) {
    const { el, x, y, p } = estado;
    el.style.setProperty('--gel-luz-x', `${(50 + x * 42).toFixed(2)}%`);
    el.style.setProperty('--gel-luz-y', `${(50 + y * 42).toFixed(2)}%`);
    el.style.setProperty('--gel-oposta-x', `${(50 - x * 42).toFixed(2)}%`);
    el.style.setProperty('--gel-oposta-y', `${(50 - y * 42).toFixed(2)}%`);
    el.style.setProperty('--gel-dx', `${(x * 2).toFixed(3)}px`);
    el.style.setProperty('--gel-dy', `${(y * 1.6).toFixed(3)}px`);
    el.style.setProperty('--gel-sx', (1 + p * 0.024).toFixed(5));
    el.style.setProperty('--gel-sy', (1 - p * 0.02).toFixed(5));
    el.style.setProperty('--gel-energia', (0.7 + Math.abs(p) * 0.24).toFixed(3));
  }

  function desenhar(agora) {
    quadro = 0;
    const dt = limitar((agora - ultimoQuadro) / 1000, 0.001, 0.064);
    ultimoQuadro = agora;
    const passos = Math.ceil(dt / 0.008);
    const t = dt / passos;
    for (const estado of animando) {
      if (!estado.el.isConnected || !estado.visivel) { animando.delete(estado); continue; }
      for (let i = 0; i < passos; i++) {
        estado.vx += ((estado.ax - estado.x) * 105 - estado.vx * 17) * t;
        estado.vy += ((estado.ay - estado.y) * 105 - estado.vy * 17) * t;
        estado.vp += ((estado.ap - estado.p) * 210 - estado.vp * 13) * t;
        estado.x += estado.vx * t; estado.y += estado.vy * t; estado.p += estado.vp * t;
      }
      aplicar(estado);
      if (Math.abs(estado.ax - estado.x) + Math.abs(estado.ay - estado.y) + Math.abs(estado.ap - estado.p) + Math.abs(estado.vx) + Math.abs(estado.vy) + Math.abs(estado.vp) < 0.012) animando.delete(estado);
    }
    if (animando.size) quadro = requestAnimationFrame(desenhar);
  }

  function animar(estado) {
    if (preferencia.matches || !estado.visivel) return;
    animando.add(estado);
    if (!quadro) { ultimoQuadro = performance.now(); quadro = requestAnimationFrame(desenhar); }
  }

  function aoPonteiro(evento) {
    if (preferencia.matches || !(evento.target instanceof Element)) return;
    const el = evento.target.closest('.gel-superficie');
    const estado = superficies.get(el);
    if (!estado || el.matches(':disabled, [aria-disabled=true]')) return;
    const b = el.getBoundingClientRect();
    if (!b.width || !b.height) return;
    estado.ax = limitar((evento.clientX - b.left) / b.width * 2 - 1, -1, 1);
    estado.ay = limitar((evento.clientY - b.top) / b.height * 2 - 1, -1, 1);
    estado.ponteiro = true;
    if (evento.type === 'pointerdown') estado.ap = 1;
    animar(estado);
  }

  function aoSoltar(evento) {
    for (const estado of superficies.values()) {
      if (!estado.ap && !estado.ponteiro) continue;
      estado.ap = 0;
      if (evento.pointerType !== 'mouse' || evento.type === 'pointercancel') {
        estado.ponteiro = false; estado.ax = luz.x; estado.ay = luz.y;
      }
      animar(estado);
    }
  }

  function aoSair(evento) {
    if (!(evento.target instanceof Element)) return;
    const el = evento.target.closest('.gel-superficie');
    if (!el || (evento.relatedTarget instanceof Node && el.contains(evento.relatedTarget))) return;
    const estado = superficies.get(el);
    if (!estado) return;
    estado.ponteiro = false; estado.ap = 0; estado.ax = luz.x; estado.ay = luz.y;
    animar(estado);
  }

  function aoInclinar(evento) {
    if (!sensorLigado || preferencia.matches || !Number.isFinite(evento.beta) || !Number.isFinite(evento.gamma)) return;
    if (!leituraRecebida) { leituraRecebida = true; clearTimeout(temporizadorSensor); atualizarControle('ativo'); }
    referencia ??= { beta: evento.beta, gamma: evento.gamma };
    let x = limitar(diferenca(evento.gamma, referencia.gamma) / 22, -1, 1);
    let y = limitar(diferenca(evento.beta, referencia.beta) / 22, -1, 1);
    const angulo = ((window.screen.orientation?.angle ?? window.orientation ?? 0) + 360) % 360;
    if (angulo === 90) [x, y] = [y, -x];
    else if (angulo === 180) [x, y] = [-x, -y];
    else if (angulo === 270) [x, y] = [-y, x];
    luz = { x: limitar(-0.3 + x * 1.15, -1, 1), y: limitar(-0.5 + y * 1.15, -1, 1) };
    for (const estado of superficies.values()) {
      if (estado.ponteiro) continue;
      estado.ax = luz.x; estado.ay = luz.y; animar(estado);
    }
  }

  function pararSensor() {
    sensorLigado = false;
    clearTimeout(temporizadorSensor);
    window.removeEventListener('deviceorientation', aoInclinar);
    referencia = null;
    atualizarControle('inativo');
  }

  function iniciarSensor() {
    if (sensorLigado || encerrado || preferencia.matches) return;
    sensorLigado = true; leituraRecebida = false; referencia = null;
    window.addEventListener('deviceorientation', aoInclinar, { passive: true });
    atualizarControle('aguardando');
    temporizadorSensor = setTimeout(() => { if (!leituraRecebida && !encerrado) atualizarControle('toque'); }, 3000);
  }

  async function solicitarSensor() {
    if (solicitando) return;
    if (sensorLigado) { pararSensor(); if (leituraRecebida) return; }
    solicitando = true;
    controle.setAttribute('aria-busy', 'true');
    try {
      const permissao = await Sensor.requestPermission();
      if (encerrado) return;
      if (permissao === 'granted') iniciarSensor(); else atualizarControle('toque');
    } catch { if (!encerrado) atualizarControle('toque'); }
    finally { solicitando = false; controle?.removeAttribute('aria-busy'); }
  }

  function aoPreferirMovimento() {
    if (preferencia.matches) {
      pararSensor(); controle?.remove();
      if (quadro) cancelAnimationFrame(quadro);
      quadro = 0; animando.clear();
      for (const estado of superficies.values()) {
        Object.assign(estado, { x: -0.55, y: -0.75, p: 0, vx: 0, vy: 0, vp: 0, ap: 0, ponteiro: false });
        aplicar(estado);
      }
    } else {
      posicionarControle();
      if (Sensor && typeof Sensor.requestPermission !== 'function') iniciarSensor();
    }
  }

  varrer(raiz);
  posicionarControle();
  const observador = new MutationObserver((mutacoes) => {
    for (const m of mutacoes) {
      if (m.target instanceof Element && m.target.matches(TODOS)) decorar(m.target);
      for (const no of m.addedNodes) varrer(no);
    }
    for (const [el, estado] of superficies) if (!raiz.contains(el)) limparSuperficie(el, estado);
    for (const el of campos) if (!raiz.contains(el)) { el.classList.remove('gel-campo'); campos.delete(el); }
    posicionarControle();
    agendarTextura();
  });
  observador.observe(raiz, { childList: true, subtree: true });
  for (const tipo of ['pointermove', 'pointerdown']) raiz.addEventListener(tipo, aoPonteiro, { passive: true });
  for (const tipo of ['pointerup', 'pointercancel']) window.addEventListener(tipo, aoSoltar, { passive: true });
  raiz.addEventListener('pointerout', aoSair, { passive: true });
  window.addEventListener('scroll', agendarTextura, { passive: true, capture: true });
  window.addEventListener('resize', agendarTextura, { passive: true });
  const recalibrar = () => { referencia = null; agendarTextura(); };
  window.addEventListener('orientationchange', recalibrar, { passive: true });
  preferencia.addEventListener('change', aoPreferirMovimento);
  imagem.onload = agendarTextura;
  imagem.src = '/images/figma-madeira-original.jpg';
  if (Sensor && typeof Sensor.requestPermission !== 'function') iniciarSensor();

  return () => {
    encerrado = true;
    observador.disconnect(); visibilidade?.disconnect(); pararSensor();
    if (quadro) cancelAnimationFrame(quadro);
    if (quadroTextura) cancelAnimationFrame(quadroTextura);
    for (const tipo of ['pointermove', 'pointerdown']) raiz.removeEventListener(tipo, aoPonteiro);
    for (const tipo of ['pointerup', 'pointercancel']) window.removeEventListener(tipo, aoSoltar);
    raiz.removeEventListener('pointerout', aoSair);
    window.removeEventListener('scroll', agendarTextura, true);
    window.removeEventListener('resize', agendarTextura);
    window.removeEventListener('orientationchange', recalibrar);
    preferencia.removeEventListener('change', aoPreferirMovimento);
    for (const [el, estado] of superficies) limparSuperficie(el, estado);
    for (const el of campos) el.classList.remove('gel-campo');
    controle?.remove();
    imagem.onload = null;
  };
}
