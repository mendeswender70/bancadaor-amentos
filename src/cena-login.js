// Cena 3D da tela de entrada.
//
// Passeia por três ambientes — quarto, cozinha e sala. Em cada um, o móvel
// chega peça por peça (com um pouco de serragem ao encaixar), a cota e o
// valor aparecem, portas/gavetas se abrem e o móvel se desmonta para dar
// lugar ao próximo. Dá para girar o móvel arrastando.
//
// Empacotado para public/js/cena-login.js com `npm run build:cena`.

import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  CylinderGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  Line,
  LineBasicMaterial,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PCFShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  Points,
  PointsMaterial,
  RepeatWrapping,
  Scene,
  ShadowMaterial,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const M = 0.75; // unidades da cena por metro

// ------------------------------------------------------------------ Curvas
const saida = (t) => 1 - Math.pow(1 - t, 3);
const entrada = (t) => t * t * t;
const quique = (t) => {
  // chega, passa um tiquinho e assenta
  const c1 = 1.25;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
const faixa = (t, a, b) => MathUtils.clamp((t - a) / (b - a), 0, 1);

// ---------------------------------------------------------------- Texturas
function gerador(semente) {
  let s = semente;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

function texturaMadeira({ base, clara, escura, semente = 11, horizontal = false }) {
  const t = 1024;
  const tela = document.createElement('canvas');
  tela.width = t;
  tela.height = t;
  const g = tela.getContext('2d');
  const r = gerador(semente);
  g.fillStyle = base;
  g.fillRect(0, 0, t, t);
  // faixas largas de tom (lâminas de madeira)
  for (let x = 0; x < t; ) {
    const w = 40 + r() * 120;
    g.fillStyle = r() > 0.5 ? clara : escura;
    g.globalAlpha = 0.08 + r() * 0.12;
    g.fillRect(x, 0, w, t);
    x += w;
  }
  // veios finos e ondulados
  for (let i = 0; i < 260; i++) {
    const x0 = r() * t;
    const amp = 2 + r() * 14;
    const freq = 0.003 + r() * 0.01;
    const fase = r() * Math.PI * 2;
    g.strokeStyle = r() > 0.25 ? escura : clara;
    g.globalAlpha = 0.04 + r() * 0.16;
    g.lineWidth = 0.4 + r() * 2.2;
    g.beginPath();
    for (let y = -10; y <= t + 10; y += 6) {
      const x = x0 + Math.sin(y * freq + fase) * amp + Math.sin(y * 0.021 + i) * 1.5;
      if (y < 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
  }
  // poros
  g.globalAlpha = 0.06;
  g.fillStyle = escura;
  for (let i = 0; i < 2500; i++) g.fillRect(r() * t, r() * t, 1, 2 + r() * 5);
  g.globalAlpha = 1;
  const textura = new CanvasTexture(tela);
  textura.colorSpace = SRGBColorSpace;
  textura.wrapS = RepeatWrapping;
  textura.wrapT = RepeatWrapping;
  textura.anisotropy = 8;
  if (horizontal) {
    textura.center.set(0.5, 0.5);
    textura.rotation = Math.PI / 2;
  }
  return textura;
}

function texturaBrilhoChao() {
  const tela = document.createElement('canvas');
  tela.width = 256;
  tela.height = 256;
  const g = tela.getContext('2d');
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, 'rgba(255, 196, 140, 0.55)');
  grad.addColorStop(0.45, 'rgba(255, 170, 110, 0.16)');
  grad.addColorStop(1, 'rgba(255, 160, 100, 0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  const tex = new CanvasTexture(tela);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

function texturaTela() {
  const tela = document.createElement('canvas');
  tela.width = 512;
  tela.height = 288;
  const g = tela.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 512, 288);
  grad.addColorStop(0, '#1b2433');
  grad.addColorStop(0.55, '#0c1018');
  grad.addColorStop(1, '#2a1c14');
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 288);
  const brilho = g.createRadialGradient(360, 90, 0, 360, 90, 260);
  brilho.addColorStop(0, 'rgba(255, 190, 120, 0.35)');
  brilho.addColorStop(1, 'rgba(255, 190, 120, 0)');
  g.fillStyle = brilho;
  g.fillRect(0, 0, 512, 288);
  const tex = new CanvasTexture(tela);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

// ------------------------------------------------------------ Construção
/** Ajuda a montar um móvel: cada peça guarda a posição final e de onde vem. */
function oficina(materiais) {
  const grupo = new Group();
  const pecas = [];
  const moveis = []; // portas/gavetas que se movem depois de montado
  const caixa = (l, a, p, material, raio = 0.008) => {
    const menor = Math.min(l, a, p);
    const geo = raio > 0 && menor > raio * 2.2 ? new RoundedBoxGeometry(l, a, p, 2, raio) : new BoxGeometry(l, a, p);
    const m = new Mesh(geo, material);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  };
  const peca = (objeto, x, y, z, de = {}) => {
    objeto.position.set(x, y, z);
    objeto.userData.final = { pos: objeto.position.clone(), rot: objeto.rotation.clone() };
    objeto.userData.de = de;
    grupo.add(objeto);
    pecas.push(objeto);
    return objeto;
  };
  const puxadorVertical = (altura) => caixa(0.02, altura, 0.022, materiais.metal, 0.006);
  const puxadorHorizontal = (largura) => caixa(largura, 0.02, 0.022, materiais.metal, 0.006);
  return { grupo, pecas, moveis, caixa, peca, puxadorVertical, puxadorHorizontal };
}

function guardaRoupa(mat) {
  const o = oficina(mat);
  const L = 3.2 * M;
  const A = 2.7 * M;
  const P = 0.6 * M;
  const E = 0.04;
  const rodape = 0.1 * M;
  const meio = 0.18;
  const altInterna = A - rodape - E * 2;

  o.peca(o.caixa(E, A, P, mat.laca), -L / 2 + E / 2, A / 2, 0, { dx: -1.6, dy: 1.2, rz: 0.35 });
  o.peca(o.caixa(E, A, P, mat.laca), L / 2 - E / 2, A / 2, 0, { dx: 1.6, dy: 1.2, rz: -0.35 });
  o.peca(o.caixa(L - E * 2, E, P, mat.laca), 0, rodape + E / 2, 0, { dy: 1.6 });
  o.peca(o.caixa(L, E, P, mat.laca), 0, A - E / 2, 0, { dy: 2.6, rx: 0.25 });
  o.peca(o.caixa(L - E * 2, rodape, E, mat.laca), 0, rodape / 2, P / 2 - E * 1.5, { dy: 1.4, dz: 0.6 });
  o.peca(o.caixa(L - E * 2, A - rodape - E, 0.012, mat.fundo, 0), 0, rodape + (A - rodape - E) / 2, -P / 2 + 0.012, {
    dz: -1.4,
    dy: 1.6,
  });
  o.peca(o.caixa(E, altInterna, P - 0.03, mat.laca), meio, rodape + E + altInterna / 2, -0.012, { dy: 2.2, rz: 0.4 });
  const xPrat = (meio + L / 2 - E) / 2 + E / 4;
  for (const [i, y] of [0.42, 0.78, 1.14, 1.5].entries()) {
    o.peca(o.caixa(L / 2 - meio - E * 1.5, E * 0.8, P - 0.05, mat.madeiraH), xPrat, y, -0.02, { dy: 1.8 + i * 0.25, ry: 0.5 });
  }
  const barra = new Mesh(new CylinderGeometry(0.014, 0.014, L / 2 + meio - E * 2, 20), mat.metal);
  barra.rotation.z = Math.PI / 2;
  barra.castShadow = true;
  o.peca(barra, (-L / 2 + meio) / 2, A - 0.32, 0, { dy: 1.6 });
  for (const [i, y] of [0.22, 0.42].entries()) {
    o.peca(o.caixa(L / 2 + meio - E * 2.4, 0.17, 0.028, mat.madeira), (-L / 2 + meio) / 2, y, P / 2 - 0.07, { dy: 1.8 + i * 0.2, dz: 0.4 });
    o.peca(o.puxadorHorizontal(0.22), (-L / 2 + meio) / 2, y + 0.05, P / 2 - 0.045, { dy: 1.9 + i * 0.2, dz: 0.4 });
  }
  const lp = L / 2 - 0.004;
  const ap = A - rodape - 0.01;
  for (const lado of [-1, 1]) {
    const dobradica = new Group();
    const porta = o.caixa(lp, ap, 0.028, mat.madeira, 0.01);
    porta.position.x = -lado * (lp / 2);
    dobradica.add(porta);
    const puxador = o.puxadorVertical(0.6);
    puxador.position.set(-lado * (lp - 0.06), 0.02, 0.024);
    dobradica.add(puxador);
    o.peca(dobradica, lado * (L / 2), rodape + ap / 2 + 0.005, P / 2 + 0.015, { dy: 2.2, dz: 1.2, ry: lado * 0.7 });
    o.moveis.push({ objeto: dobradica, tipo: 'giro', eixo: 'y', angulo: lado * 1.2 });
  }
  return { ...o, largura: L, altura: A, profundidade: P, cotaY: A + 0.2 };
}

function cozinha(mat) {
  const o = oficina(mat);
  const L = 4.8 * M;
  const hBaixo = 0.86 * M;
  const pBaixo = 0.6 * M;
  const yAlto = 1.55 * M;
  const hAlto = 0.72 * M;
  const pAlto = 0.35 * M;
  const nModulos = 4;
  const lm = L / nModulos;
  const rodape = 0.1 * M;

  // Corpos inferiores e superiores, rodapé, bancada e frontão
  o.peca(o.caixa(L, hBaixo - rodape, pBaixo - 0.03, mat.laca), 0, rodape + (hBaixo - rodape) / 2, -0.015, { dy: 1.4 });
  o.peca(o.caixa(L - 0.1, rodape, 0.02, mat.metal, 0.004), 0, rodape / 2, pBaixo / 2 - 0.08, { dy: 1.2, dz: 0.5 });
  o.peca(o.caixa(L + 0.04, 0.045, pBaixo + 0.03, mat.pedra, 0.012), 0, hBaixo + 0.022, 0.005, { dy: 2.4, rx: 0.2 });
  o.peca(o.caixa(L, yAlto - hBaixo - 0.05, 0.015, mat.pedra, 0), 0, hBaixo + 0.045 + (yAlto - hBaixo - 0.05) / 2, -pBaixo / 2 + 0.01, {
    dz: -1.2,
    dy: 1.8,
  });
  o.peca(o.caixa(L, hAlto, pAlto - 0.02, mat.laca), 0, yAlto + hAlto / 2, -pBaixo / 2 + pAlto / 2, { dy: 2.6 });
  o.peca(o.caixa(0.52, 0.012, 0.36, mat.vidroPreto, 0.004), lm * 0.5, hBaixo + 0.05, 0.02, { dy: 2.9 });
  // Portas inferiores (giram) e gaveteiro (desliza)
  for (let i = 0; i < nModulos; i++) {
    const x0 = -L / 2 + i * lm;
    if (i === 1) {
      for (const [k, h] of [0.2, 0.2, 0.26].entries()) {
        const yG = rodape + 0.005 + [0, 0.205, 0.41][k] + h / 2;
        const gaveta = new Group();
        gaveta.add(o.caixa(lm - 0.008, h - 0.006, 0.024, mat.grafite, 0.006));
        const pux = o.puxadorHorizontal(lm * 0.5);
        pux.position.set(0, h / 2 - 0.035, 0.02);
        gaveta.add(pux);
        o.peca(gaveta, x0 + lm / 2, yG, pBaixo / 2 - 0.005, { dy: 2 + k * 0.2, dz: 0.8 });
        o.moveis.push({ objeto: gaveta, tipo: 'desliza', distancia: 0.18 + k * 0.04 });
      }
      continue;
    }
    const lado = i % 2 === 0 ? -1 : 1;
    const dobradica = new Group();
    const porta = o.caixa(lm - 0.008, hBaixo - rodape - 0.01, 0.024, mat.grafite, 0.006);
    porta.position.x = -lado * ((lm - 0.008) / 2);
    dobradica.add(porta);
    const pux = o.puxadorHorizontal(lm * 0.45);
    pux.position.set(-lado * ((lm - 0.008) / 2), (hBaixo - rodape) / 2 - 0.05, 0.02);
    dobradica.add(pux);
    const xDob = lado === -1 ? x0 + 0.004 : x0 + lm - 0.004;
    o.peca(dobradica, xDob, rodape + (hBaixo - rodape) / 2, pBaixo / 2 - 0.005, { dy: 1.9, dz: 0.9, ry: lado * 0.5 });
    if (i === 0 || i === 3) o.moveis.push({ objeto: dobradica, tipo: 'giro', eixo: 'y', angulo: lado * 1.25 });
  }
  // Portas superiores basculantes (abrem para cima)
  for (let i = 0; i < nModulos; i++) {
    const basculante = new Group();
    const porta = o.caixa(lm - 0.008, hAlto - 0.01, 0.022, mat.madeira, 0.006);
    porta.position.y = -(hAlto - 0.01) / 2;
    basculante.add(porta);
    const pux = o.puxadorHorizontal(lm * 0.5);
    pux.position.set(0, -(hAlto - 0.01) + 0.04, 0.018);
    basculante.add(pux);
    o.peca(basculante, -L / 2 + i * lm + lm / 2, yAlto + hAlto - 0.005, -pBaixo / 2 + pAlto + 0.004, {
      dy: 2.4 + i * 0.1,
      dz: 0.7,
      rx: -0.5,
    });
    if (i % 2 === 0) o.moveis.push({ objeto: basculante, tipo: 'giro', eixo: 'x', angulo: -1.1 });
  }
  return { ...o, largura: L, altura: yAlto + hAlto, profundidade: pBaixo, cotaY: yAlto + hAlto + 0.2 };
}

function painelTv(mat) {
  const o = oficina(mat);
  const L = 2.5 * M;
  const A = 2.3 * M;
  const esp = 0.03 * M;
  o.peca(o.caixa(L, A, esp, mat.laca, 0.006), 0, A / 2, -0.12, { dy: 2.6, dz: -0.8 });
  // Ripado vertical
  const nRipas = 22;
  const lr = (L - 0.02) / nRipas;
  for (let i = 0; i < nRipas; i++) {
    const ripa = o.caixa(lr * 0.62, A - 0.02, 0.03, mat.madeira, 0.004);
    ripa.userData.rapida = true;
    o.peca(ripa, -L / 2 + 0.01 + lr * (i + 0.5), A / 2, -0.12 + esp / 2 + 0.015, { dy: 2.4 + (i % 5) * 0.12, dz: 0.3 });
  }
  o.peca(o.caixa(1.25, 0.72, 0.03, mat.tv, 0.01), 0, 1.2, -0.06, { dy: 2.2, dz: 1.4 });
  // Rack suspenso
  const lRack = 2.2 * M;
  const hRack = 0.42 * M;
  const pRack = 0.45 * M;
  const yRack = 0.28 * M + hRack / 2;
  const zRack = -0.12 + pRack / 2 + esp / 2;
  o.peca(o.caixa(lRack, hRack, pRack, mat.laca), 0, yRack, zRack, { dy: 2, dz: 0.6 });
  o.peca(o.caixa(lRack + 0.02, 0.03, pRack + 0.01, mat.madeiraH, 0.006), 0, yRack + hRack / 2 + 0.015, zRack, { dy: 2.5 });
  for (const lado of [-1, 1]) {
    const gaveta = new Group();
    gaveta.add(o.caixa(lRack / 2 - 0.012, hRack - 0.012, 0.022, mat.madeira, 0.006));
    const pux = o.puxadorHorizontal(0.28);
    pux.position.set(0, hRack / 2 - 0.04, 0.018);
    gaveta.add(pux);
    o.peca(gaveta, lado * (lRack / 4), yRack, zRack + pRack / 2 + 0.012, { dy: 2.1, dz: 1, ry: lado * 0.3 });
    o.moveis.push({ objeto: gaveta, tipo: 'desliza', distancia: 0.2 });
  }
  return { ...o, largura: L, altura: A, profundidade: pRack, cotaY: A + 0.18 };
}

const MODELOS = [
  { ambiente: 'Quarto do casal', nome: 'Guarda-roupa', medida: '3,20 m', valor: 576000, construir: guardaRoupa },
  { ambiente: 'Cozinha', nome: 'Cozinha planejada', medida: '4,80 m', valor: 768000, construir: cozinha },
  { ambiente: 'Sala de estar', nome: 'Painel de TV e rack', medida: '2,50 m', valor: 412000, construir: painelTv },
];

// Linha do tempo de cada móvel (segundos)
const T = { montagem: 2.9, cota: 0.8, pausa: 0.6, abre: 1.1, aberto: 1.8, fecha: 1.0, espera: 0.8, desmonta: 0.9 };
const DURACAO = Object.values(T).reduce((a, b) => a + b, 0);

const formatar = (c) =>
  `R$ ${Math.floor(c / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${String(c % 100).padStart(2, '0')}`;

/**
 * Monta a cena dentro de `container`. Devolve { parar } para liberar a placa
 * de vídeo quando a tela de entrada sai.
 * @param {HTMLElement} container
 * @param {{ aoMontar?: () => void }} [opcoes]
 */
export function montarCena(container, { aoMontar } = {}) {
  const semMovimento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const celularLeve = Math.min(window.innerWidth, window.innerHeight) < 600;

  const renderizador = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderizador.setPixelRatio(Math.min(window.devicePixelRatio || 1, celularLeve ? 1.5 : 1.75));
  renderizador.shadowMap.enabled = true;
  renderizador.shadowMap.type = PCFShadowMap;
  renderizador.toneMapping = ACESFilmicToneMapping;
  renderizador.toneMappingExposure = 1.0;
  renderizador.outputColorSpace = SRGBColorSpace;
  renderizador.domElement.className = 'cena-canvas';
  renderizador.domElement.setAttribute('aria-hidden', 'true');
  container.append(renderizador.domElement);

  const cena = new Scene();
  // Iluminação de estúdio para reflexos realistas na laca, pedra e metal.
  const pmrem = new PMREMGenerator(renderizador);
  const ambiente = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  cena.environment = ambiente;
  cena.environmentIntensity = 0.55;

  const camera = new PerspectiveCamera(28, 1, 0.1, 100);

  cena.add(new HemisphereLight(0xffeedd, 0x2a1a10, 0.35));
  const sol = new DirectionalLight(0xffd9a8, 2.4);
  sol.position.set(3.5, 6.5, 4.5);
  sol.castShadow = true;
  sol.shadow.mapSize.set(celularLeve ? 1024 : 2048, celularLeve ? 1024 : 2048);
  Object.assign(sol.shadow.camera, { left: -4, right: 4, top: 4, bottom: -2, near: 1, far: 20 });
  sol.shadow.radius = 4;
  sol.shadow.bias = -0.0006;
  sol.shadow.normalBias = 0.02;
  cena.add(sol);
  const recorte = new DirectionalLight(0xffb27a, 1.4);
  recorte.position.set(-4, 3.5, -3);
  cena.add(recorte);

  // Chão: sombra + um brilho quente embaixo do móvel
  const chao = new Mesh(new PlaneGeometry(40, 40), new ShadowMaterial({ opacity: 0.42 }));
  chao.rotation.x = -Math.PI / 2;
  chao.receiveShadow = true;
  cena.add(chao);
  const brilhoChao = new Mesh(
    new CircleGeometry(3.4, 48),
    new MeshBasicMaterial({ map: texturaBrilhoChao(), transparent: true, depthWrite: false, blending: AdditiveBlending }),
  );
  brilhoChao.rotation.x = -Math.PI / 2;
  brilhoChao.position.y = 0.002;
  cena.add(brilhoChao);

  const mat = {
    laca: new MeshStandardMaterial({ color: 0xece6dc, roughness: 0.42, metalness: 0 }),
    fundo: new MeshStandardMaterial({ color: 0xdcd2c4, roughness: 0.8 }),
    madeira: new MeshStandardMaterial({
      map: texturaMadeira({ base: '#a8723f', clara: '#d09a62', escura: '#5b3417', semente: 11 }),
      roughness: 0.5,
    }),
    madeiraH: new MeshStandardMaterial({
      map: texturaMadeira({ base: '#a8723f', clara: '#d09a62', escura: '#5b3417', semente: 29, horizontal: true }),
      roughness: 0.5,
    }),
    grafite: new MeshStandardMaterial({ color: 0x3a3b3e, roughness: 0.55, metalness: 0.05 }),
    pedra: new MeshStandardMaterial({ color: 0xe9e6e0, roughness: 0.22, metalness: 0 }),
    vidroPreto: new MeshStandardMaterial({ color: 0x0c0c0d, roughness: 0.08, metalness: 0.4 }),
    metal: new MeshStandardMaterial({ color: 0x161412, roughness: 0.32, metalness: 0.7 }),
    tv: new MeshStandardMaterial({ color: 0x0a0b0d, roughness: 0.12, metalness: 0.3, emissive: 0xffffff, emissiveIntensity: 0.28 }),
  };
  mat.tv.emissiveMap = texturaTela();

  // Serragem que sobe quando uma peça encaixa
  const NP = 240;
  const posicoes = new Float32Array(NP * 3).fill(-100);
  const velocidades = new Float32Array(NP * 3);
  const vidas = new Float32Array(NP);
  const geoP = new BufferGeometry();
  geoP.setAttribute('position', new BufferAttribute(posicoes, 3));
  const serragem = new Points(geoP, new PointsMaterial({ color: 0xf2cf9b, size: 0.028, transparent: true, opacity: 0.85, depthWrite: false }));
  serragem.frustumCulled = false;
  cena.add(serragem);
  let proxima = 0;
  const soltarSerragem = (ponto, quantidade = 10) => {
    for (let i = 0; i < quantidade; i++) {
      const k = proxima++ % NP;
      posicoes.set([ponto.x + (Math.random() - 0.5) * 0.3, ponto.y, ponto.z + (Math.random() - 0.5) * 0.2], k * 3);
      velocidades.set([(Math.random() - 0.5) * 1.2, 0.6 + Math.random() * 1.1, (Math.random() - 0.5) * 1.2], k * 3);
      vidas[k] = 0.7 + Math.random() * 0.5;
    }
  };

  // Móveis
  const moveis = MODELOS.map((modelo) => {
    const m = modelo.construir(mat);
    m.grupo.visible = false;
    const normais = m.pecas.filter((p) => !p.userData.rapida).length;
    let n = 0;
    m.pecas.forEach((p, i) => {
      const d = p.userData.de;
      const rapida = p.userData.rapida;
      p.userData.inicio = {
        pos: p.userData.final.pos.clone().add(new Vector3(d.dx || 0, (d.dy || 2) + 0.6, d.dz || 0)),
        rot: new Vector3((d.rx || 0) + p.userData.final.rot.x, (d.ry || 0) + p.userData.final.rot.y, (d.rz || 0) + p.userData.final.rot.z),
      };
      p.userData.saida = new Vector3((Math.random() - 0.5) * 1.5, 3.2 + Math.random() * 1.2, (Math.random() - 0.5) * 1.5);
      p.userData.atraso = rapida ? 0.9 + (i % 30) * 0.035 : 0.1 + (n++ * (T.montagem - 1.1)) / normais;
      p.userData.pousou = false;
    });
    cena.add(m.grupo);
    return { ...modelo, ...m };
  });

  // Cota (linha da largura) de cada móvel
  const materialCota = new LineBasicMaterial({ color: 0xf3dcb8, transparent: true, opacity: 0.95 });
  const criarCota = (m) => {
    const g = new Group();
    const y = m.cotaY;
    const z = m.profundidade / 2 + 0.06;
    const seg = (a, b) => new Line(new BufferGeometry().setFromPoints([a, b]), materialCota);
    g.add(seg(new Vector3(-m.largura / 2, y, z), new Vector3(m.largura / 2, y, z)));
    g.userData.pontas = [
      seg(new Vector3(-m.largura / 2, y - 0.1, z), new Vector3(-m.largura / 2, y + 0.1, z)),
      seg(new Vector3(m.largura / 2, y - 0.1, z), new Vector3(m.largura / 2, y + 0.1, z)),
    ];
    g.add(...g.userData.pontas);
    g.userData.ponto = new Vector3(0, y + 0.02, z);
    g.userData.pontoPreco = new Vector3(m.largura / 2 + 0.1, m.altura * 0.58, m.profundidade / 2);
    g.visible = false;
    m.grupo.add(g);
    return g;
  };
  for (const m of moveis) m.cota = criarCota(m);

  // Etiquetas HTML (medida, preço e a trilha dos ambientes)
  const etiquetaMedida = document.createElement('div');
  etiquetaMedida.className = 'cena-etiqueta cena-medida';
  const etiquetaPreco = document.createElement('div');
  etiquetaPreco.className = 'cena-etiqueta cena-preco';
  const linhaAmbiente = document.createElement('span');
  linhaAmbiente.className = 'cena-ambiente';
  const linhaMovel = document.createElement('small');
  const linhaValor = document.createElement('strong');
  etiquetaPreco.append(linhaAmbiente, linhaMovel, linhaValor);
  const trilha = document.createElement('div');
  trilha.className = 'cena-trilha';
  trilha.setAttribute('aria-hidden', 'true');
  const passos = MODELOS.map((m) => {
    const s = document.createElement('span');
    s.textContent = m.ambiente.split(' ')[0];
    trilha.append(s);
    return s;
  });
  container.append(etiquetaMedida, etiquetaPreco, trilha);

  // Tela e câmera
  let largura = 0;
  let alturaTela = 0;
  let celular = false;
  const redimensionar = () => {
    largura = container.clientWidth;
    alturaTela = container.clientHeight;
    if (!largura || !alturaTela) return;
    celular = largura < 700;
    renderizador.setSize(largura, alturaTela, false);
    camera.aspect = largura / alturaTela;
    // Computador: móvel à direita do texto. Celular: centralizado e mais baixo.
    camera.setViewOffset(
      largura,
      alturaTela,
      celular ? 0 : -largura * 0.25,
      celular ? -alturaTela * 0.06 : alturaTela * 0.05,
      largura,
      alturaTela,
    );
    camera.updateProjectionMatrix();
  };
  const observador = new ResizeObserver(redimensionar);
  observador.observe(container);
  redimensionar();
  const distanciaPara = (m) => {
    const tamanho = Math.max(m.largura * 1.05, m.altura * 1.25);
    const base = tamanho * 3.35;
    // No computador o móvel ocupa só a metade direita do painel.
    return celular ? base * 1.18 : base * (camera.aspect < 0.95 ? 1.45 : 1.3);
  };

  // Arrastar para girar (mouse e dedo), com inércia
  const area = container.parentElement || container;
  const giro = { valor: 0, velocidade: 0, arrastando: false, ultimoX: 0, parado: 0 };
  const ponteiro = { x: 0, y: 0, alvoX: 0, alvoY: 0 };
  const aoDescer = (e) => {
    if (e.target.closest('a, button, input')) return;
    giro.arrastando = true;
    giro.ultimoX = e.clientX;
    giro.velocidade = 0;
  };
  const aoMover = (e) => {
    const r = container.getBoundingClientRect();
    ponteiro.alvoX = MathUtils.clamp((e.clientX - r.left) / r.width - 0.5, -0.5, 0.5);
    ponteiro.alvoY = MathUtils.clamp((e.clientY - r.top) / r.height - 0.5, -0.5, 0.5);
    if (!giro.arrastando) return;
    const dx = e.clientX - giro.ultimoX;
    giro.ultimoX = e.clientX;
    giro.valor += dx * 0.009;
    giro.velocidade = dx * 0.009;
    giro.parado = 0;
  };
  const aoSubir = () => {
    giro.arrastando = false;
  };
  area.addEventListener('pointerdown', aoDescer);
  window.addEventListener('pointermove', aoMover, { passive: true });
  window.addEventListener('pointerup', aoSubir);
  window.addEventListener('pointercancel', aoSubir);

  const cam = { distancia: distanciaPara(moveis[0]), alvoY: moveis[0].altura * 0.48 };
  const alvo = new Vector3();
  const tmp = new Vector3();
  const inicio = performance.now();
  let anterior = inicio;
  let quadro = 0;
  let ativo = true;
  let avisou = false;
  let indiceAtual = -1;

  // Leva a etiqueta até o ponto 3D, sem deixar sair da área visível.
  const posicionarEtiqueta = (el, ponto, grupo, { centralizar = true } = {}) => {
    tmp.copy(ponto);
    grupo.localToWorld(tmp);
    tmp.project(camera);
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    let x = ((tmp.x + 1) / 2) * largura - (centralizar ? w / 2 : 0);
    let y = ((1 - tmp.y) / 2) * alturaTela - h / 2;
    x = MathUtils.clamp(x, 12, largura - w - 12);
    y = MathUtils.clamp(y, 12, alturaTela - h - 12);
    el.style.transform = `translate(${x}px, ${y}px)`;
  };

  const desenhar = () => {
    if (!ativo) return;
    quadro = requestAnimationFrame(desenhar);
    const agora = performance.now();
    // Tempo nunca negativo, mesmo se o relógio do navegador voltar.
    const dt = MathUtils.clamp((agora - anterior) / 1000, 0, 0.05);
    anterior = agora;
    if (document.hidden) return;

    const total = semMovimento ? T.montagem + T.cota + 0.1 : Math.max(0, (agora - inicio) / 1000);
    const indice = semMovimento ? 0 : Math.floor(total / DURACAO) % moveis.length;
    const t = semMovimento ? total : total % DURACAO;
    const m = moveis[indice];

    if (indice !== indiceAtual) {
      moveis.forEach((x, i) => {
        x.grupo.visible = i === indice;
      });
      for (const p of m.pecas) p.userData.pousou = false;
      linhaAmbiente.textContent = m.ambiente;
      linhaMovel.textContent = `${m.nome} · ${m.medida}`;
      etiquetaMedida.textContent = m.medida;
      passos.forEach((s, i) => s.classList.toggle('ativo', i === indice));
      indiceAtual = indice;
    }

    // Marcos da linha do tempo
    const tCota = T.montagem;
    const tAbre = tCota + T.cota + T.pausa;
    const tAberto = tAbre + T.abre;
    const tFecha = tAberto + T.aberto;
    const tDesmonta = tFecha + T.fecha + T.espera;

    // Montagem e desmontagem
    const kDesm = semMovimento ? 0 : faixa(t, tDesmonta, tDesmonta + T.desmonta);
    m.pecas.forEach((p, i) => {
      const { inicio: ini, final, saida: s } = p.userData;
      const k = faixa(t, p.userData.atraso, p.userData.atraso + (p.userData.rapida ? 0.55 : 0.8));
      p.position.lerpVectors(ini.pos, final.pos, quique(k));
      const r = saida(k);
      p.rotation.set(
        MathUtils.lerp(ini.rot.x, final.rot.x, r),
        MathUtils.lerp(ini.rot.y, final.rot.y, r),
        MathUtils.lerp(ini.rot.z, final.rot.z, r),
      );
      if (k >= 0.62 && !p.userData.pousou) {
        p.userData.pousou = true;
        if (!semMovimento && !p.userData.rapida) {
          p.getWorldPosition(tmp);
          tmp.y = Math.max(0.02, tmp.y - 0.3);
          soltarSerragem(tmp, 9);
        }
      }
      if (kDesm > 0) {
        const ordem = i / m.pecas.length;
        const ed = entrada(faixa(kDesm, ordem * 0.5, ordem * 0.5 + 0.5));
        p.position.addScaledVector(s, ed);
        p.rotation.x += ed * 0.6;
        p.rotation.z += ed * 0.4 * (i % 2 ? 1 : -1);
      }
      p.visible = k > 0 && kDesm < 0.999;
    });

    if (t >= tCota && !avisou) {
      avisou = true;
      aoMontar?.();
    }

    // Cota, medida e preço
    const kCota = faixa(t, tCota, tCota + T.cota) * (1 - faixa(t, tDesmonta - 0.2, tDesmonta + 0.2));
    m.cota.visible = kCota > 0;
    m.cota.scale.x = Math.max(0.001, saida(kCota));
    for (const ponta of m.cota.userData.pontas) ponta.visible = kCota > 0.85;
    const opMedida = faixa(t, tCota + 0.4, tCota + 0.8) * (1 - faixa(t, tDesmonta - 0.4, tDesmonta));
    const opPreco = faixa(t, tCota + 0.5, tCota + 0.9) * (1 - faixa(t, tDesmonta - 0.4, tDesmonta));
    etiquetaMedida.style.opacity = String(opMedida);
    etiquetaPreco.style.opacity = String(opPreco);
    etiquetaPreco.classList.toggle('visivel', opPreco > 0.5);
    const kValor = saida(faixa(t, tCota + 0.6, tCota + 1.9));
    linhaValor.textContent = formatar(Math.round((m.valor * kValor) / 100) * 100);

    // Portas e gavetas
    let abertura = 0;
    if (!semMovimento) {
      if (t >= tAbre && t < tAberto) abertura = saida(faixa(t, tAbre, tAberto));
      else if (t >= tAberto && t < tFecha) abertura = 1;
      else if (t >= tFecha && t < tFecha + T.fecha) abertura = 1 - saida(faixa(t, tFecha, tFecha + T.fecha));
    }
    m.moveis.forEach((item, i) => {
      const a = MathUtils.clamp(abertura * 1.25 - i * 0.12, 0, 1);
      const final = item.objeto.userData.final;
      if (item.tipo === 'giro') item.objeto.rotation[item.eixo] = final.rot[item.eixo] + item.angulo * a;
      else item.objeto.position.z = final.pos.z + item.distancia * a;
    });

    // Serragem
    for (let i = 0; i < NP; i++) {
      if (vidas[i] <= 0) continue;
      vidas[i] -= dt;
      velocidades[i * 3 + 1] -= 3.2 * dt;
      posicoes[i * 3] += velocidades[i * 3] * dt;
      posicoes[i * 3 + 1] += velocidades[i * 3 + 1] * dt;
      posicoes[i * 3 + 2] += velocidades[i * 3 + 2] * dt;
      if (vidas[i] <= 0 || posicoes[i * 3 + 1] < 0) {
        vidas[i] = 0;
        posicoes[i * 3 + 1] = -100;
      }
    }
    geoP.attributes.position.needsUpdate = true;

    // Giro: arrasto com inércia; parado, volta devagar para a posição inicial
    if (!giro.arrastando) {
      giro.valor += giro.velocidade;
      giro.velocidade *= 0.93;
      giro.parado += dt;
      if (giro.parado > 2.5) giro.valor *= 0.985;
    }
    m.grupo.rotation.y = giro.valor;
    m.grupo.position.y = semMovimento ? 0 : Math.sin(total * 0.9) * 0.012;

    // Câmera: aproxima durante a montagem e passeia devagar
    const aproximar = semMovimento ? 1 : MathUtils.lerp(0.86, 1, saida(faixa(t, 0, T.montagem + 0.6)));
    const distAlvo = distanciaPara(m) * aproximar;
    cam.distancia += (distAlvo - cam.distancia) * Math.min(1, dt * 2.2);
    cam.alvoY += (m.altura * 0.48 - cam.alvoY) * Math.min(1, dt * 2.2);
    ponteiro.x += (ponteiro.alvoX - ponteiro.x) * 0.05;
    ponteiro.y += (ponteiro.alvoY - ponteiro.y) * 0.05;
    const balanco = semMovimento ? 0 : Math.sin(total * 0.16) * 0.2;
    const entradaCamera = semMovimento ? 0 : MathUtils.lerp(0.35, 0, saida(faixa(t, 0, T.montagem)));
    const angulo = 0.38 + balanco + ponteiro.x * 0.25 + entradaCamera;
    const altura = cam.alvoY + 0.9 + cam.distancia * 0.12 - ponteiro.y * 0.8;
    camera.position.set(Math.sin(angulo) * cam.distancia, altura, Math.cos(angulo) * cam.distancia);
    alvo.set(0, cam.alvoY, 0);
    camera.lookAt(alvo);

    renderizador.render(cena, camera);
    if (opMedida > 0) posicionarEtiqueta(etiquetaMedida, m.cota.userData.ponto, m.grupo);
    if (opPreco > 0) posicionarEtiqueta(etiquetaPreco, m.cota.userData.pontoPreco, m.grupo, { centralizar: false });
  };
  desenhar();

  return {
    parar() {
      ativo = false;
      cancelAnimationFrame(quadro);
      observador.disconnect();
      area.removeEventListener('pointerdown', aoDescer);
      window.removeEventListener('pointermove', aoMover);
      window.removeEventListener('pointerup', aoSubir);
      window.removeEventListener('pointercancel', aoSubir);
      const compartilhados = new Set(Object.values(mat));
      cena.traverse((o) => {
        o.geometry?.dispose();
        if (o.material && !compartilhados.has(o.material)) {
          o.material.map?.dispose();
          o.material.dispose();
        }
      });
      for (const m of compartilhados) {
        m.map?.dispose();
        m.emissiveMap?.dispose();
        m.dispose();
      }
      ambiente.dispose();
      pmrem.dispose();
      renderizador.dispose();
      renderizador.forceContextLoss?.();
      renderizador.domElement.remove();
      etiquetaMedida.remove();
      etiquetaPreco.remove();
      trilha.remove();
    },
  };
}
