// Cena 3D da tela de entrada: um guarda-roupa que se monta peça por peça,
// mostra a medida e o valor calculado, e abre as portas de vez em quando.
//
// Este arquivo é empacotado para public/js/cena-login.js com
// `npm run build:cena` (só as partes do three.js usadas entram no pacote).

import {
  ACESFilmicToneMapping,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  Line,
  LineBasicMaterial,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  PCFShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  RepeatWrapping,
  Scene,
  ShadowMaterial,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';

// Medidas do móvel (unidades da cena) e o que a etiqueta mostra.
const L = 2.4; // largura
const A = 2.5; // altura
const P = 0.62; // profundidade
const E = 0.05; // espessura das chapas
const RODAPE = 0.09;
const MEDIDA_TEXTO = '3,20 m';
const VALOR_CENTAVOS = 576000;

const suavizar = (t) => 1 - Math.pow(1 - t, 3);
const voltarSuave = (t) => {
  const c1 = 1.4;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

function texturaMadeira(base, veio, { vertical = true, escuro = 0.12 } = {}) {
  const tela = document.createElement('canvas');
  tela.width = 512;
  tela.height = 512;
  const g = tela.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 512, 512);
  let semente = 7;
  const aleatorio = () => {
    semente = (semente * 16807) % 2147483647;
    return semente / 2147483647;
  };
  // Veios: linhas onduladas com espessura e transparência variadas.
  for (let i = 0; i < 90; i++) {
    const x0 = aleatorio() * 512;
    const amplitude = 3 + aleatorio() * 10;
    const frequencia = 0.006 + aleatorio() * 0.012;
    const fase = aleatorio() * Math.PI * 2;
    g.strokeStyle = veio;
    g.globalAlpha = 0.05 + aleatorio() * escuro;
    g.lineWidth = 0.6 + aleatorio() * 2.6;
    g.beginPath();
    for (let y = 0; y <= 512; y += 8) {
      const x = x0 + Math.sin(y * frequencia + fase) * amplitude + Math.sin(y * 0.03 + i) * 1.2;
      if (y === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
  }
  g.globalAlpha = 1;
  const textura = new CanvasTexture(tela);
  textura.colorSpace = SRGBColorSpace;
  textura.wrapS = RepeatWrapping;
  textura.wrapT = RepeatWrapping;
  textura.anisotropy = 4;
  if (!vertical) {
    textura.center.set(0.5, 0.5);
    textura.rotation = Math.PI / 2;
  }
  return textura;
}

/**
 * Monta a cena dentro de `container`. Devolve { parar } para liberar a
 * placa de vídeo quando a tela de entrada sai.
 * @param {HTMLElement} container
 * @param {{ aoMontar?: () => void }} [opcoes]
 */
export function montarCena(container, { aoMontar } = {}) {
  const semMovimento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const renderizador = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  renderizador.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderizador.shadowMap.enabled = true;
  renderizador.shadowMap.type = PCFShadowMap;
  renderizador.toneMapping = ACESFilmicToneMapping;
  renderizador.toneMappingExposure = 1.05;
  renderizador.outputColorSpace = SRGBColorSpace;
  renderizador.domElement.className = 'cena-canvas';
  renderizador.domElement.setAttribute('aria-hidden', 'true');
  container.append(renderizador.domElement);

  const cena = new Scene();
  const camera = new PerspectiveCamera(30, 1, 0.1, 100);
  const alvo = new Vector3(0, 1.2, 0);

  // Luzes: sol quente, preenchimento frio e um brilho por trás.
  cena.add(new HemisphereLight(0xfff1de, 0x3b2616, 1.1));
  const sol = new DirectionalLight(0xffdfb3, 2.6);
  sol.position.set(4.5, 7, 5);
  sol.castShadow = true;
  sol.shadow.mapSize.set(1024, 1024);
  sol.shadow.camera.left = -4;
  sol.shadow.camera.right = 4;
  sol.shadow.camera.top = 4;
  sol.shadow.camera.bottom = -2;
  sol.shadow.radius = 6;
  sol.shadow.bias = -0.0008;
  cena.add(sol);
  const preenchimento = new DirectionalLight(0xbcd3ff, 0.45);
  preenchimento.position.set(-5, 3, -2);
  cena.add(preenchimento);
  const brilho = new PointLight(0xffb070, 6, 12, 2);
  brilho.position.set(-2.5, 2.8, -2);
  cena.add(brilho);

  const chao = new Mesh(new PlaneGeometry(40, 40), new ShadowMaterial({ opacity: 0.32 }));
  chao.rotation.x = -Math.PI / 2;
  chao.receiveShadow = true;
  cena.add(chao);

  // Materiais
  const madeiraPortas = texturaMadeira('#b98655', '#5a3416', { escuro: 0.16 });
  const madeiraCorpo = texturaMadeira('#d2ae84', '#7a5230', { escuro: 0.1 });
  const madeiraCorpoH = texturaMadeira('#d2ae84', '#7a5230', { vertical: false, escuro: 0.1 });
  const mat = {
    porta: new MeshStandardMaterial({ map: madeiraPortas, roughness: 0.55, metalness: 0.02 }),
    corpo: new MeshStandardMaterial({ map: madeiraCorpo, roughness: 0.65 }),
    corpoH: new MeshStandardMaterial({ map: madeiraCorpoH, roughness: 0.65 }),
    fundo: new MeshStandardMaterial({ color: 0xeee2d2, roughness: 0.85 }),
    metal: new MeshStandardMaterial({ color: 0x2a2521, roughness: 0.28, metalness: 0.85 }),
    gaveta: new MeshStandardMaterial({ map: madeiraPortas, roughness: 0.55 }),
  };

  const movel = new Group();
  cena.add(movel);
  const pecas = [];
  const caixa = (l, a, p, material) => {
    const m = new Mesh(new BoxGeometry(l, a, p), material);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  };
  // Cada peça guarda a posição final e de onde ela "voa" na montagem.
  const peca = (objeto, x, y, z, de) => {
    objeto.position.set(x, y, z);
    objeto.userData.final = { pos: objeto.position.clone(), rot: objeto.rotation.clone() };
    objeto.userData.de = de;
    movel.add(objeto);
    pecas.push(objeto);
    return objeto;
  };

  const meio = 0.25; // divisória vertical (x)
  const altInterna = A - RODAPE - E * 2;
  peca(caixa(E, A, P, mat.corpo), -L / 2 + E / 2, A / 2, 0, { dx: -2.2, dy: 0.4, rz: 0.5 });
  peca(caixa(E, A, P, mat.corpo), L / 2 - E / 2, A / 2, 0, { dx: 2.2, dy: 0.4, rz: -0.5 });
  peca(caixa(L, E, P, mat.corpoH), 0, A - E / 2, 0, { dy: 2.4, rx: 0.3 });
  peca(caixa(L - E * 2, E, P, mat.corpoH), 0, RODAPE + E / 2, 0, { dy: -1.4, rx: -0.3 });
  peca(caixa(L - E * 2, RODAPE, E, mat.corpo), 0, RODAPE / 2, P / 2 - E, { dz: 2, dy: -0.4 });
  peca(caixa(L - E * 2, A - RODAPE - E, 0.015, mat.fundo), 0, RODAPE + (A - RODAPE - E) / 2, -P / 2 + 0.01, { dz: -2.5 });
  peca(caixa(E, altInterna, P - 0.03, mat.corpo), meio, RODAPE + E + altInterna / 2, -0.015, { dy: 2.6, rz: 0.6 });
  // Prateleiras à direita e cabideiro à esquerda
  for (const [i, y] of [0.72, 1.3, 1.88].entries()) {
    peca(caixa(L / 2 - meio - E * 1.5, E * 0.8, P - 0.05, mat.corpoH), (meio + L / 2 - E) / 2 + E / 4, y, -0.02, {
      dx: 2 + i * 0.3,
      dy: 0.5,
      ry: 0.6,
    });
  }
  const cabideiro = new Mesh(new CylinderGeometry(0.018, 0.018, L / 2 + meio - E * 2, 16), mat.metal);
  cabideiro.rotation.z = Math.PI / 2;
  cabideiro.castShadow = true;
  peca(cabideiro, (-L / 2 + meio) / 2, A - 0.42, 0, { dy: 1.8, dx: -1 });
  // Gavetas internas (lado do cabideiro)
  for (const [i, y] of [0.3, 0.56].entries()) {
    const gaveta = caixa(L / 2 + meio - E * 2.4, 0.22, 0.03, mat.gaveta);
    peca(gaveta, (-L / 2 + meio) / 2, y, P / 2 - 0.09, { dz: 2.4, dy: -0.3 - i * 0.2 });
    const puxador = caixa(0.26, 0.018, 0.02, mat.metal);
    peca(puxador, (-L / 2 + meio) / 2, y + 0.06, P / 2 - 0.065, { dz: 2.6, dy: -0.3 - i * 0.2 });
  }

  // Portas com dobradiça na lateral (o grupo gira em volta da dobradiça).
  const larguraPorta = L / 2 - 0.006;
  const alturaPorta = A - RODAPE - 0.012;
  const portas = [-1, 1].map((lado) => {
    const dobradica = new Group();
    const porta = caixa(larguraPorta, alturaPorta, 0.035, mat.porta);
    porta.position.x = -lado * (larguraPorta / 2);
    dobradica.add(porta);
    const puxador = caixa(0.022, 0.62, 0.028, mat.metal);
    puxador.position.set(-lado * (larguraPorta - 0.07), 0.05, 0.03);
    dobradica.add(puxador);
    peca(dobradica, lado * (L / 2), RODAPE + alturaPorta / 2 + 0.006, P / 2 + 0.018, { dz: 3.2, dx: lado * 0.8, ry: lado * 0.9 });
    dobradica.userData.lado = lado;
    return dobradica;
  });

  // Linha de cota com as pontas (medida da largura).
  const cota = new Group();
  const materialCota = new LineBasicMaterial({ color: 0xf1d9b5, transparent: true, opacity: 0.95 });
  const linha = (a, b) => new Line(new BufferGeometry().setFromPoints([a, b]), materialCota);
  const yCota = A + 0.28;
  const zCota = P / 2 + 0.05;
  const traco = linha(new Vector3(-L / 2, yCota, zCota), new Vector3(L / 2, yCota, zCota));
  cota.add(traco);
  cota.add(linha(new Vector3(-L / 2, yCota - 0.12, zCota), new Vector3(-L / 2, yCota + 0.12, zCota)));
  cota.add(linha(new Vector3(L / 2, yCota - 0.12, zCota), new Vector3(L / 2, yCota + 0.12, zCota)));
  cota.visible = false;
  movel.add(cota);

  // Etiquetas em HTML, posicionadas sobre pontos 3D a cada quadro.
  const etiquetaMedida = document.createElement('div');
  etiquetaMedida.className = 'cena-etiqueta cena-medida';
  etiquetaMedida.textContent = MEDIDA_TEXTO;
  const etiquetaPreco = document.createElement('div');
  etiquetaPreco.className = 'cena-etiqueta cena-preco';
  etiquetaPreco.innerHTML = '<small>Guarda-roupa · 3,20 m</small><strong>R$ 0,00</strong>';
  container.append(etiquetaMedida, etiquetaPreco);
  const valorPreco = etiquetaPreco.querySelector('strong');
  const pontoMedida = new Vector3(0, yCota + 0.02, zCota);
  const pontoPreco = new Vector3(L / 2 + 0.12, A * 0.6, P / 2);
  const formatar = (c) =>
    `R$ ${Math.floor(c / 100)
      .toString()
      .replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${String(c % 100).padStart(2, '0')}`;

  // Posição inicial "desmontada" de cada peça.
  pecas.forEach((p, i) => {
    const d = p.userData.de;
    p.userData.inicio = {
      pos: p.userData.final.pos.clone().add(new Vector3(d.dx || 0, (d.dy || 0) + 0.8, d.dz || 0)),
      rot: new Vector3((d.rx || 0) + p.userData.final.rot.x, (d.ry || 0) + p.userData.final.rot.y, (d.rz || 0) + p.userData.final.rot.z),
    };
    p.userData.atraso = 0.25 + i * 0.09;
  });
  const FIM_MONTAGEM = 0.25 + pecas.length * 0.09 + 0.9;

  const cor = new Color();
  let largura = 0;
  let alturaTela = 0;
  const redimensionar = () => {
    largura = container.clientWidth;
    alturaTela = container.clientHeight;
    if (!largura || !alturaTela) return;
    renderizador.setSize(largura, alturaTela, false);
    camera.aspect = largura / alturaTela;
    // Computador (painel alto ao lado do texto): móvel à direita e um pouco
    // acima. Celular (faixa no topo): móvel menor e mais para baixo, longe do logo.
    const celular = largura < 700;
    camera.userData.distancia = celular ? 11.8 : camera.aspect < 0.9 ? 13 : 12;
    camera.setViewOffset(
      largura,
      alturaTela,
      celular ? 0 : -largura * 0.27,
      celular ? -alturaTela * 0.07 : alturaTela * 0.06,
      largura,
      alturaTela,
    );
    camera.updateProjectionMatrix();
  };
  const observador = new ResizeObserver(redimensionar);
  observador.observe(container);
  redimensionar();

  // Movimento do mouse/toque inclina a câmera levemente.
  const ponteiro = { x: 0, y: 0, alvoX: 0, alvoY: 0 };
  const aoMover = (e) => {
    const r = container.getBoundingClientRect();
    const px = (e.touches ? e.touches[0].clientX : e.clientX) - r.left;
    const py = (e.touches ? e.touches[0].clientY : e.clientY) - r.top;
    ponteiro.alvoX = MathUtils.clamp(px / r.width - 0.5, -0.5, 0.5);
    ponteiro.alvoY = MathUtils.clamp(py / r.height - 0.5, -0.5, 0.5);
  };
  window.addEventListener('pointermove', aoMover, { passive: true });

  const inicio = performance.now();
  let quadro = 0;
  let montado = false;
  let ativo = true;

  // Leva a etiqueta até o ponto 3D, sem deixar sair da área visível.
  const posicionarEtiqueta = (el, ponto, { centralizar = true } = {}) => {
    const v = ponto.clone();
    movel.localToWorld(v);
    v.project(camera);
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    let x = ((v.x + 1) / 2) * largura - (centralizar ? w / 2 : 0);
    let y = ((1 - v.y) / 2) * alturaTela - h / 2;
    x = MathUtils.clamp(x, 12, largura - w - 12);
    y = MathUtils.clamp(y, 12, alturaTela - h - 12);
    el.style.transform = `translate(${x}px, ${y}px)`;
  };

  const desenhar = () => {
    if (!ativo) return;
    quadro = requestAnimationFrame(desenhar);
    if (document.hidden) return;
    const t = semMovimento ? 99 : (performance.now() - inicio) / 1000;

    // Montagem
    for (const p of pecas) {
      const k = MathUtils.clamp((t - p.userData.atraso) / 0.85, 0, 1);
      const e = voltarSuave(k);
      const { inicio, final } = p.userData;
      p.position.lerpVectors(inicio.pos, final.pos, e);
      p.rotation.set(
        MathUtils.lerp(inicio.rot.x, final.rot.x, suavizar(k)),
        MathUtils.lerp(inicio.rot.y, final.rot.y, suavizar(k)),
        MathUtils.lerp(inicio.rot.z, final.rot.z, suavizar(k)),
      );
      p.visible = k > 0;
    }

    // Depois de montado: cota, preço e portas abrindo de tempos em tempos.
    const depois = t - FIM_MONTAGEM;
    if (depois > 0 && !montado) {
      montado = true;
      aoMontar?.();
    }
    const kCota = MathUtils.clamp(depois / 0.7, 0, 1);
    cota.visible = kCota > 0;
    cota.scale.x = Math.max(0.001, suavizar(kCota));
    etiquetaMedida.style.opacity = String(MathUtils.clamp((depois - 0.4) / 0.4, 0, 1));
    const kPreco = MathUtils.clamp((depois - 0.9) / 1.2, 0, 1);
    etiquetaPreco.style.opacity = String(MathUtils.clamp((depois - 0.8) / 0.4, 0, 1));
    valorPreco.textContent = formatar(Math.round((VALOR_CENTAVOS * suavizar(kPreco)) / 100) * 100);

    const ciclo = depois > 2.5 ? (depois - 2.5) % 9 : -1;
    let abertura = 0;
    if (ciclo >= 0) {
      if (ciclo < 1.2) abertura = suavizar(ciclo / 1.2);
      else if (ciclo < 3.6) abertura = 1;
      else if (ciclo < 4.8) abertura = 1 - suavizar((ciclo - 3.6) / 1.2);
    }
    if (semMovimento) abertura = 0;
    for (const porta of portas) {
      // Porta esquerda gira para -y e a direita para +y: as duas abrem para fora.
      porta.rotation.y = porta.userData.lado * 1.15 * abertura;
    }

    // Câmera: órbita lenta + inclinação pelo ponteiro.
    ponteiro.x += (ponteiro.alvoX - ponteiro.x) * 0.05;
    ponteiro.y += (ponteiro.alvoY - ponteiro.y) * 0.05;
    const angulo = (semMovimento ? 0.35 : 0.35 + Math.sin(t * 0.18) * 0.22) + ponteiro.x * 0.5;
    const d = camera.userData.distancia || 8.2;
    camera.position.set(Math.sin(angulo) * d, 2.6 + ponteiro.y * -1.2, Math.cos(angulo) * d);
    camera.lookAt(alvo);
    movel.position.y = semMovimento ? 0 : Math.sin(t * 0.8) * 0.015;

    brilho.intensity = 6 + Math.sin(t * 0.7) * 1.2;
    brilho.color = cor.setHSL(0.08, 0.9, 0.62);

    renderizador.render(cena, camera);
    if (depois > 0) {
      posicionarEtiqueta(etiquetaMedida, pontoMedida);
      posicionarEtiqueta(etiquetaPreco, pontoPreco, { centralizar: false });
    }
  };
  desenhar();

  return {
    parar() {
      ativo = false;
      cancelAnimationFrame(quadro);
      observador.disconnect();
      window.removeEventListener('pointermove', aoMover);
      cena.traverse((o) => {
        o.geometry?.dispose();
      });
      for (const m of Object.values(mat)) {
        m.map?.dispose();
        m.dispose();
      }
      renderizador.dispose();
      renderizador.forceContextLoss?.();
      renderizador.domElement.remove();
      etiquetaMedida.remove();
      etiquetaPreco.remove();
    },
  };
}
