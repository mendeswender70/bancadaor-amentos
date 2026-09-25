// Cena 3D da tela de entrada.
//
// Passeia por três ambientes — quarto, cozinha e sala. Em cada um, o móvel
// chega peça por peça (com um pouco de serragem ao encaixar), a cota e o
// valor aparecem, portas/gavetas se abrem e o móvel se desmonta para dar
// lugar ao próximo. Dá para girar o móvel arrastando.
//
// Tudo em metros e com medidas de marcenaria de verdade: chapas de 18 mm,
// frestas de 3 mm entre portas, dobradiças de caneco, puxadores de perfil.
// As texturas (madeira, quartzo, textura do MDF) são desenhadas uma vez na
// placa de vídeo, sem baixar imagem nenhuma.
//
// Empacotado para public/js/cena-login.js com `npm run build:cena`.

import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DataTexture,
  DirectionalLight,
  Group,
  HemisphereLight,
  LatheGeometry,
  Line,
  LinearFilter,
  LinearMipmapLinearFilter,
  LineBasicMaterial,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  NoColorSpace,
  OrthographicCamera,
  PCFShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  Points,
  PointsMaterial,
  RepeatWrapping,
  Scene,
  ShaderMaterial,
  ShadowMaterial,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const E = 0.018; // espessura da chapa (m)

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

function gerador(semente) {
  let s = semente;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}
const sorte = gerador(20240917);

// ---------------------------------------------------- Texturas na placa
// Ruído periódico (a textura emenda sem costura quando repete).
const GLSL_RUIDO = /* glsl */ `
  varying vec2 vUv;
  uniform int modo;
  const float TAU = 6.2831853;
  float h(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  float rv(vec2 p, vec2 per) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = h(mod(i, per));
    float b = h(mod(i + vec2(1.0, 0.0), per));
    float c = h(mod(i + vec2(0.0, 1.0), per));
    float d = h(mod(i + vec2(1.0, 1.0), per));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }
  float fbm(vec2 p, vec2 per) {
    float s = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      s += a * rv(p, per);
      p *= 2.0;
      per *= 2.0;
      a *= 0.5;
    }
    return s;
  }
`;

// Lâmina de madeira (freijó): u atravessa o veio, v segue o veio.
const GLSL_MADEIRA = /* glsl */ `${GLSL_RUIDO}
  void main() {
    vec2 p = vUv;
    // anéis com espaçamento irregular
    float densidade = fbm(p * vec2(6.0, 1.0), vec2(6.0, 1.0));
    float torto = fbm(p * vec2(4.0, 2.0) + 3.0, vec2(4.0, 2.0));
    // "catedrais": arcos encaixados que aparecem em algumas faixas da lâmina
    float faixaCat = pow(max(0.0, sin(TAU * (p.x * 2.0 + 0.1 + torto * 0.15))), 2.0);
    float arco = pow(0.5 + 0.5 * cos(TAU * (p.y * 2.0 + torto * 0.35)), 3.0);
    float anel = p.x * 44.0 + densidade * 5.0 + torto * 1.2 + faixaCat * arco * 4.0;
    float f = fract(anel);
    float indice = mod(floor(anel), 44.0);
    float forca = 0.35 + 0.65 * h(vec2(indice, 7.0));
    // lenho tardio: linha fina e escura; lenho inicial: degradê suave
    float tardio = (smoothstep(0.62, 0.9, f) * (1.0 - smoothstep(0.93, 1.0, f))) * forca;
    float inicial = f * 0.35;
    float fibra = rv(p * vec2(700.0, 7.0), vec2(700.0, 7.0));
    float fibra2 = rv(p * vec2(160.0, 2.0) + 11.0, vec2(160.0, 2.0));
    float faixas = fbm(p * vec2(12.0, 1.0) + 9.0, vec2(12.0, 1.0));
    float poro = smoothstep(0.88, 0.98, rv(p * vec2(520.0, 300.0), vec2(520.0, 300.0)));
    vec3 claro = vec3(0.84, 0.68, 0.49);
    vec3 base = vec3(0.74, 0.57, 0.38);
    vec3 escuro = vec3(0.50, 0.34, 0.20);
    vec3 cor = mix(base, claro, smoothstep(0.3, 0.72, faixas));
    cor = mix(cor, escuro, tardio * 0.55 + inicial * 0.12);
    cor *= 0.93 + 0.09 * fibra + 0.08 * (fibra2 - 0.5);
    cor = mix(cor, escuro * 0.7, poro * 0.5);
    if (modo == 0) {
      gl_FragColor = vec4(cor, 1.0);
    } else {
      // R = relevo (bumpMap), G = aspereza (roughnessMap)
      float relevo = 0.62 - tardio * 0.25 - poro * 0.45 + fibra * 0.1;
      float aspereza = 0.5 + poro * 0.3 + tardio * 0.12 - fibra * 0.06;
      gl_FragColor = vec4(relevo, aspereza, 0.0, 1.0);
    }
  }
`;

// Quartzo branco com veios suaves.
const GLSL_QUARTZO = /* glsl */ `${GLSL_RUIDO}
  void main() {
    vec2 p = vUv;
    float w = fbm(p * 3.0, vec2(3.0));
    float w2 = fbm(p * 8.0 + 3.0, vec2(8.0));
    float veio = abs(sin(TAU * (p.x + p.y * 2.0 + w * 1.3 + w2 * 0.25) * 0.5));
    float linha = 1.0 - smoothstep(0.0, 0.07, veio);
    float fina = 1.0 - smoothstep(0.0, 0.025, abs(sin(TAU * (p.x * 2.0 - p.y + w2 * 0.9) * 0.5)));
    float nuvem = fbm(p * 5.0 + 9.0, vec2(5.0));
    float grao = rv(p * 700.0, vec2(700.0));
    vec3 cor = vec3(0.945, 0.935, 0.915) - nuvem * 0.05;
    cor = mix(cor, vec3(0.66, 0.64, 0.62), linha * 0.5 + fina * 0.22);
    cor -= grao * 0.03;
    gl_FragColor = vec4(cor, 1.0);
  }
`;

// Textura fina do MDF (casca de laranja da pintura / TX).
const GLSL_FINO = /* glsl */ `${GLSL_RUIDO}
  void main() {
    vec2 p = vUv;
    float n = rv(p * 256.0, vec2(256.0)) * 0.55 + rv(p * 64.0, vec2(64.0)) * 0.3 + rv(p * 16.0, vec2(16.0)) * 0.15;
    gl_FragColor = vec4(n, 0.5 + n * 0.2, 0.0, 1.0);
  }
`;

function texturaGPU(renderizador, fragmentShader, tamanho, { srgb = false, modo = 0 } = {}) {
  const alvo = new WebGLRenderTarget(tamanho, tamanho, { depthBuffer: false });
  const material = new ShaderMaterial({
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader,
    uniforms: { modo: { value: modo } },
    depthTest: false,
    depthWrite: false,
  });
  const tela = new Mesh(new PlaneGeometry(2, 2), material);
  tela.frustumCulled = false;
  const palco = new Scene();
  palco.add(tela);
  const anterior = renderizador.getRenderTarget();
  renderizador.setRenderTarget(alvo);
  renderizador.render(palco, new OrthographicCamera(-1, 1, 1, -1, 0, 1));
  const dados = new Uint8Array(tamanho * tamanho * 4);
  renderizador.readRenderTargetPixels(alvo, 0, 0, tamanho, tamanho, dados);
  renderizador.setRenderTarget(anterior);
  alvo.dispose();
  material.dispose();
  tela.geometry.dispose();
  const textura = new DataTexture(dados, tamanho, tamanho);
  textura.colorSpace = srgb ? SRGBColorSpace : NoColorSpace;
  textura.wrapS = RepeatWrapping;
  textura.wrapT = RepeatWrapping;
  textura.magFilter = LinearFilter;
  textura.minFilter = LinearMipmapLinearFilter;
  textura.generateMipmaps = true;
  textura.anisotropy = Math.min(8, renderizador.capabilities.getMaxAnisotropy());
  textura.needsUpdate = true;
  return textura;
}

function telaCanvas(l, a, desenhar) {
  const tela = document.createElement('canvas');
  tela.width = l;
  tela.height = a;
  desenhar(tela.getContext('2d'), l, a);
  const tex = new CanvasTexture(tela);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

const texturaBrilhoChao = () =>
  telaCanvas(256, 256, (g) => {
    const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    grad.addColorStop(0, 'rgba(255, 196, 140, 0.55)');
    grad.addColorStop(0.45, 'rgba(255, 170, 110, 0.16)');
    grad.addColorStop(1, 'rgba(255, 160, 100, 0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
  });

// Luz de LED lavando a superfície de cima para baixo.
const texturaLavagem = () =>
  telaCanvas(64, 256, (g) => {
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.12, 'rgba(255,255,255,0.55)');
    grad.addColorStop(0.45, 'rgba(255,255,255,0.14)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 256);
    // apaga as pontas para a luz não terminar num corte seco
    g.globalCompositeOperation = 'destination-in';
    const lados = g.createLinearGradient(0, 0, 64, 0);
    lados.addColorStop(0, 'rgba(0,0,0,0)');
    lados.addColorStop(0.08, 'rgba(0,0,0,1)');
    lados.addColorStop(0.92, 'rgba(0,0,0,1)');
    lados.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = lados;
    g.fillRect(0, 0, 64, 256);
  });

// Pôr do sol na TV.
const texturaTela = () =>
  telaCanvas(1024, 576, (g, l, a) => {
    const ceu = g.createLinearGradient(0, 0, 0, a);
    ceu.addColorStop(0, '#1d2c4a');
    ceu.addColorStop(0.42, '#c9785a');
    ceu.addColorStop(0.6, '#f2b27a');
    ceu.addColorStop(0.61, '#6b4a4a');
    ceu.addColorStop(1, '#1a1822');
    g.fillStyle = ceu;
    g.fillRect(0, 0, l, a);
    const sol = g.createRadialGradient(690, 330, 0, 690, 330, 220);
    sol.addColorStop(0, 'rgba(255,236,196,1)');
    sol.addColorStop(0.08, 'rgba(255,214,160,0.95)');
    sol.addColorStop(0.3, 'rgba(255,170,110,0.35)');
    sol.addColorStop(1, 'rgba(255,150,100,0)');
    g.fillStyle = sol;
    g.fillRect(0, 0, l, a);
    const r = gerador(5);
    const serra = (base, amp, cor, passo) => {
      g.fillStyle = cor;
      g.beginPath();
      g.moveTo(0, a);
      for (let x = 0; x <= l; x += passo) g.lineTo(x, base - Math.abs(Math.sin(x * 0.006 + base)) * amp - r() * amp * 0.25);
      g.lineTo(l, a);
      g.fill();
    };
    serra(352, 70, '#6a4d5a', 16);
    serra(362, 42, '#40313f', 12);
    // água refletindo o sol
    g.fillStyle = 'rgba(255,200,150,0.5)';
    for (let i = 0; i < 26; i++) {
      const y = 372 + i * 7.5;
      const w = 90 - i * 2.4 + r() * 20;
      g.globalAlpha = 0.5 - i * 0.017;
      g.fillRect(690 - w / 2 + (r() - 0.5) * 12, y, w, 2);
    }
    g.globalAlpha = 1;
  });

// Vidro do cooktop de indução com as zonas e o painel de toque.
const texturaCooktop = () =>
  telaCanvas(1024, 692, (g, l, a) => {
    g.fillStyle = '#0b0b0d';
    g.fillRect(0, 0, l, a);
    g.strokeStyle = 'rgba(160,160,170,0.55)';
    g.lineWidth = 3;
    const zona = (x, y, r) => {
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.stroke();
      g.save();
      g.lineWidth = 2;
      g.globalAlpha = 0.6;
      for (const k of [-1, 1]) {
        g.beginPath();
        g.moveTo(x + k * (r + 10), y);
        g.lineTo(x + k * (r + 24), y);
        g.stroke();
      }
      g.restore();
    };
    zona(250, 210, 140);
    zona(250, 505, 110);
    zona(740, 210, 110);
    zona(740, 505, 150);
    g.fillStyle = 'rgba(200,200,210,0.6)';
    for (let i = 0; i < 9; i++) g.fillRect(372 + i * 32, 640, 16, 4);
    g.beginPath();
    g.arc(512, 610, 9, 0, Math.PI * 2);
    g.fill();
  });

// Projeta as coordenadas de textura em metros, como a lâmina colada na chapa.
function projetarUV(geo, [eu, ev], veio, d) {
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const uv = geo.attributes.uv;
  if (!uv) return;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + d.x;
    const y = pos.getY(i) + d.y;
    const z = pos.getZ(i) + d.z;
    const ax = Math.abs(nor.getX(i));
    const ay = Math.abs(nor.getY(i));
    const az = Math.abs(nor.getZ(i));
    let a;
    let b;
    if (az >= ax && az >= ay) [a, b] = veio === 'h' ? [y, x] : [x, y];
    else if (ax >= ay) [a, b] = veio === 'h' ? [y, z] : [z, y];
    else [a, b] = veio === 'h' ? [z, x] : [x, z];
    uv.setXY(i, a / eu, b / ev);
  }
  uv.needsUpdate = true;
}

function sombras(objeto) {
  objeto.traverse((o) => {
    if (o.isMesh && !o.userData.semSombra) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return objeto;
}

const em = (objeto, x, y, z) => {
  objeto.position.set(x, y, z);
  return objeto;
};

const torno = (perfil, material, segmentos = 40) =>
  new Mesh(new LatheGeometry(perfil.map(([r, y]) => new Vector2(r, y)), segmentos), material);

// ------------------------------------------------------------ Construção
/** Ajuda a montar um móvel: cada peça guarda a posição final e de onde vem. */
function oficina(mat) {
  const grupo = new Group();
  const pecas = [];
  const moveis = []; // portas/gavetas que se movem depois de montado
  const brilhos = []; // luz de LED pintada nas superfícies

  /** Chapa com cantos levemente arredondados (fita de borda). */
  const caixa = (l, a, p, material, { raio = 0.0015, veio = 'v', em, continuo = false, sombra = true, seg = 2 } = {}) => {
    const r = Math.min(raio, Math.min(l, a, p) * 0.45);
    const geo = r >= 0.0005 ? new RoundedBoxGeometry(l, a, p, seg, r) : new BoxGeometry(l, a, p);
    const mesh = new Mesh(geo, material);
    if (em) mesh.position.set(em[0], em[1], em[2]);
    const escala = material.userData.escala;
    if (escala) {
      const d = continuo ? mesh.position : new Vector3(sorte() * 5, sorte() * 5, sorte() * 5).add(mesh.position);
      projetarUV(geo, escala, veio, d);
    }
    mesh.castShadow = sombra;
    mesh.receiveShadow = true;
    if (!sombra) mesh.userData.semSombra = true;
    return mesh;
  };
  const conjunto = (...filhos) => {
    const g = new Group();
    g.add(...filhos);
    return sombras(g);
  };
  const peca = (objeto, x, y, z, de = {}) => {
    objeto.position.set(x, y, z);
    objeto.userData.final = { pos: objeto.position.clone(), rot: objeto.rotation.clone() };
    objeto.userData.de = de;
    grupo.add(objeto);
    pecas.push(objeto);
    return objeto;
  };
  /** Faixa de luz de LED sobre uma superfície (plano aditivo). */
  const brilho = (largura, altura, x, y, z, { rx = 0 } = {}) => {
    const plano = new Mesh(new PlaneGeometry(largura, altura), mat.brilho);
    plano.position.set(x, y, z);
    plano.rotation.x = rx;
    plano.renderOrder = 2;
    plano.visible = false;
    grupo.add(plano);
    brilhos.push(plano);
    return plano;
  };
  const fitaLed = (comprimento) => caixa(comprimento, 0.005, 0.012, mat.led, { raio: 0, sombra: false });

  /** Puxador de barra com dois pés (vertical; `deitado` para horizontal). */
  const barra = (comprimento, material = mat.pretoFosco, { deitado = false, raio = 0.0065 } = {}) => {
    const g = new Group();
    g.add(new Mesh(new CylinderGeometry(raio, raio, comprimento, 18), material));
    for (const s of [-1, 1]) {
      const pe = new Mesh(new CylinderGeometry(raio * 0.7, raio * 0.7, 0.03, 12), material);
      pe.rotation.x = Math.PI / 2;
      pe.position.set(0, s * (comprimento / 2 - 0.035), -0.015);
      g.add(pe);
    }
    if (deitado) g.rotation.z = Math.PI / 2;
    return sombras(g);
  };
  /** Dobradiça de caneco (só aparece com a porta aberta). */
  const dobradica = (lado) => {
    const g = new Group();
    const caneco = new Mesh(new CylinderGeometry(0.0175, 0.0175, 0.004, 22), mat.inox);
    caneco.rotation.x = Math.PI / 2;
    g.add(caneco);
    // braço entrando no corpo do móvel
    const braco = new Mesh(new BoxGeometry(0.012, 0.013, 0.05), mat.inox);
    braco.position.set(0, 0, -0.027);
    g.add(braco);
    return g;
  };
  const perfilPuxador = (largura, y) => caixa(largura, 0.022, 0.026, mat.aluminio, { raio: 0.002, em: [0, y, 0.004] });

  /**
   * Porta de giro. O grupo fica no eixo da dobradiça: lado -1 = dobradiça à
   * esquerda, 1 = à direita.
   */
  const portaGiro = (largura, altura, material, lado, { puxador, dobradicas = 2, veio = 'v' } = {}) => {
    const g = new Group();
    const cx = -lado * (largura / 2);
    const comPerfil = puxador === 'perfil';
    const altChapa = comPerfil ? altura - 0.022 : altura;
    g.add(caixa(largura, altChapa, E, material, { raio: 0.0012, veio, em: [cx, comPerfil ? -0.011 : 0, 0] }));
    if (comPerfil) {
      const perfil = perfilPuxador(largura, altura / 2 - 0.011);
      perfil.position.x = cx;
      g.add(perfil);
    }
    if (puxador === 'barra') {
      const b = barra(Math.min(0.8, altura * 0.5));
      b.position.set(-lado * (largura - 0.045), -altura * 0.02, E / 2 + 0.03);
      g.add(b);
    }
    for (let k = 0; k < dobradicas; k++) {
      const y = -altura / 2 + 0.1 + (k * (altura - 0.2)) / Math.max(1, dobradicas - 1);
      const d = dobradica(lado);
      d.position.set(-lado * 0.0225, y, -E / 2 - 0.002);
      g.add(d);
    }
    return sombras(g);
  };
  /** Porta basculante: o eixo fica em cima e ela abre para cima. */
  const portaBasculante = (largura, altura, material) => {
    const g = new Group();
    g.add(caixa(largura, altura - 0.02, E, material, { raio: 0.0012, veio: 'h', em: [0, -(altura - 0.02) / 2, 0] }));
    g.add(caixa(largura, 0.02, 0.026, mat.aluminio, { raio: 0.002, em: [0, -altura + 0.01, 0.004] }));
    for (const s of [-1, 1]) {
      const d = dobradica(0);
      d.position.set(s * (largura / 2 - 0.08), -0.05, -E / 2 - 0.002);
      g.add(d);
    }
    return sombras(g);
  };
  /** Gaveta com frente, corrediça metálica e caixa interna. */
  const gaveta = (largura, altura, frente, { profundidade = 0.45, puxador = 'perfil', veio = 'h' } = {}) => {
    const g = new Group();
    const comPerfil = puxador === 'perfil';
    const altChapa = comPerfil ? altura - 0.022 : altura;
    g.add(caixa(largura, altChapa, E, frente, { raio: 0.0012, veio, em: [0, comPerfil ? -0.011 : 0, 0] }));
    if (comPerfil) g.add(perfilPuxador(largura, altura / 2 - 0.011));
    if (puxador === 'cava') g.add(caixa(largura * 0.4, 0.012, 0.006, mat.pretoFosco, { raio: 0.002, em: [0, altura / 2 - 0.02, E / 2] }));
    const hb = Math.max(0.06, altura - 0.08);
    const yb = -altura / 2 + 0.03 + hb / 2;
    const zb = -E / 2 - profundidade / 2;
    for (const s of [-1, 1]) g.add(caixa(0.014, hb, profundidade, mat.gavetaMetal, { raio: 0.003, em: [s * (largura / 2 - 0.035), yb, zb] }));
    g.add(caixa(largura - 0.084, hb * 0.9, 0.014, mat.branco, { em: [0, yb - hb * 0.05, zb - profundidade / 2 + 0.007] }));
    g.add(caixa(largura - 0.084, 0.01, profundidade, mat.branco, { em: [0, yb - hb / 2 + 0.005, zb] }));
    return sombras(g);
  };

  return { grupo, pecas, moveis, brilhos, caixa, conjunto, peca, brilho, fitaLed, barra, portaGiro, portaBasculante, gaveta };
}

// ------------------------------------------------------------- Acessórios
/** Peça de roupa pendurada, vista de lado (ombros caídos, dobras no pano). */
function roupa(esp, alt, prof, s) {
  let geo = new BoxGeometry(esp, alt, prof, 2, 12, 8);
  geo.deleteAttribute('normal');
  geo.deleteAttribute('uv');
  geo = mergeVertices(geo);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i);
    let y = p.getY(i);
    let z = p.getZ(i);
    const yn = (y + alt / 2) / alt;
    const zn = z / (prof / 2);
    y -= zn * zn * 0.055 * Math.pow(yn, 5);
    x *= 0.4 + 0.6 * (1 - Math.pow(yn, 7)) + 0.12 * (1 - yn);
    x += Math.sin(zn * 3.3 + s * 6.28) * 0.006 * (1 - yn) + Math.sin(yn * 9 + s * 20) * 0.002;
    z *= 1 - 0.05 * Math.sin(yn * Math.PI);
    p.setXYZ(i, x, y, z);
  }
  geo.computeVertexNormals();
  return geo;
}

function cabideiro(mat, largura, { quantidade, comprimento, paleta, semente, profundidade = 0.46 }) {
  const r = gerador(semente * 7919 + 13);
  const g = new Group();
  const tubo = new Mesh(new CylinderGeometry(0.0125, 0.0125, largura - 0.004, 20), mat.aluminio);
  tubo.rotation.z = Math.PI / 2;
  g.add(tubo);
  for (const s of [-1, 1]) {
    const suporte = new Mesh(new CylinderGeometry(0.022, 0.022, 0.012, 20), mat.aluminio);
    suporte.rotation.z = Math.PI / 2;
    suporte.position.x = s * (largura / 2 - 0.008);
    g.add(suporte);
  }
  const geoGancho = new TorusGeometry(0.017, 0.0022, 6, 16, Math.PI * 1.25);
  const passo = (largura - 0.12) / (quantidade - 1);
  for (let i = 0; i < quantidade; i++) {
    const x = -largura / 2 + 0.06 + i * passo + (r() - 0.5) * passo * 0.35;
    const comp = comprimento[0] + r() * (comprimento[1] - comprimento[0]);
    const esp = 0.03 + r() * 0.025;
    const peca = new Mesh(roupa(esp, comp, profundidade * (0.9 + r() * 0.1), r()), paleta[Math.floor(r() * paleta.length)]);
    peca.position.set(x, -0.045 - comp / 2, (r() - 0.5) * 0.02);
    peca.rotation.y = (r() - 0.5) * 0.14;
    peca.rotation.z = (r() - 0.5) * 0.03;
    const cabide = new Mesh(new BoxGeometry(0.01, 0.014, profundidade * 0.9), mat.cabide);
    cabide.position.set(x, -0.043, peca.position.z);
    cabide.rotation.y = peca.rotation.y;
    const gancho = new Mesh(geoGancho, mat.aluminio);
    gancho.rotation.set(0, Math.PI / 2, -Math.PI * 0.35);
    gancho.position.set(x, 0.004, 0);
    g.add(peca, cabide, gancho);
  }
  return sombras(g);
}

/** Pilha de roupa dobrada. */
function pilha(mat, n, largura, prof, semente) {
  const r = gerador(semente * 104729 + 7);
  const g = new Group();
  let y = 0;
  for (let i = 0; i < n; i++) {
    const h = 0.032 + r() * 0.02;
    const peca = new Mesh(
      new RoundedBoxGeometry(largura * (0.94 + r() * 0.06), h, prof * (0.94 + r() * 0.06), 3, h * 0.45),
      mat.tecidos[Math.floor(r() * mat.tecidos.length)],
    );
    peca.position.set((r() - 0.5) * 0.02, y + h / 2, (r() - 0.5) * 0.02);
    peca.rotation.y = (r() - 0.5) * 0.06;
    g.add(peca);
    y += h * 0.97;
  }
  return sombras(g);
}

/** Cesto de tecido com alça vazada. */
function cesto(mat, l, a, p) {
  const g = new Group();
  g.add(new Mesh(new RoundedBoxGeometry(l, a, p, 3, 0.02), mat.linho));
  const alca = new Mesh(new RoundedBoxGeometry(0.1, 0.025, 0.01, 2, 0.004), mat.pretoFosco);
  alca.position.set(0, a / 2 - 0.05, p / 2);
  g.add(alca);
  return sombras(g);
}

/** Livro em pé (lombada para frente) ou deitado (miolo aparente). */
function livro(mat, l, a, e, cor, { deitado = false } = {}) {
  const g = new Group();
  if (!deitado) {
    g.add(new Mesh(new RoundedBoxGeometry(e, a, l, 2, 0.0015), cor));
    return sombras(g);
  }
  const capa = 0.003;
  const miolo = new Mesh(new BoxGeometry(l - 0.006, e - capa * 2, a - 0.006), mat.miolo);
  miolo.position.x = 0.003;
  g.add(miolo);
  for (const s of [-1, 1]) {
    const c = new Mesh(new RoundedBoxGeometry(l, capa, a, 2, 0.001), cor);
    c.position.y = s * (e / 2 - capa / 2);
    g.add(c);
  }
  const lombada = new Mesh(new RoundedBoxGeometry(0.004, e, a, 2, 0.0015), cor);
  lombada.position.x = -l / 2 + 0.002;
  g.add(lombada);
  return sombras(g);
}

const perfilVaso = [
  [0.001, 0],
  [0.05, 0],
  [0.068, 0.04],
  [0.078, 0.11],
  [0.07, 0.19],
  [0.045, 0.25],
  [0.03, 0.285],
  [0.032, 0.3],
  [0.026, 0.302],
  [0.022, 0.28],
];

/** Vaso de cerâmica com capim dos pampas. */
function vasoPampas(mat, semente) {
  const r = gerador(semente);
  const g = new Group();
  g.add(torno(perfilVaso, mat.ceramica));
  for (let i = 0; i < 6; i++) {
    const ang = (i / 6) * Math.PI * 2 + r();
    const inclina = 0.05 + r() * 0.12;
    const alt = 0.45 + r() * 0.3;
    const topo = new Vector3(Math.cos(ang) * inclina * alt, 0.3 + alt, Math.sin(ang) * inclina * alt);
    const curva = new CatmullRomCurve3([
      new Vector3(0, 0.25, 0),
      new Vector3(topo.x * 0.4, 0.3 + alt * 0.5, topo.z * 0.4),
      topo,
    ]);
    g.add(new Mesh(new TubeGeometry(curva, 12, 0.0025, 5), mat.caule));
    const pluma = new Mesh(new SphereGeometry(1, 14, 10), mat.pampas);
    const dir = curva.getTangent(1);
    pluma.scale.set(0.032, 0.15 + r() * 0.05, 0.032);
    pluma.position.copy(topo).addScaledVector(dir, 0.12);
    pluma.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), dir);
    g.add(pluma);
  }
  return sombras(g);
}

/** Pote de cerâmica com tampa de madeira. */
function pote(mat, raio, altura, material) {
  const g = new Group();
  g.add(
    torno(
      [
        [0.001, 0],
        [raio * 0.92, 0],
        [raio, raio * 0.15],
        [raio, altura * 0.95],
        [raio * 0.9, altura],
      ],
      material,
    ),
  );
  const tampa = new Mesh(new CylinderGeometry(raio * 0.95, raio * 0.95, 0.018, 28), mat.madeira);
  tampa.position.y = altura + 0.009;
  g.add(tampa);
  const pegador = new Mesh(new SphereGeometry(0.011, 12, 8), mat.madeira);
  pegador.position.y = altura + 0.022;
  g.add(pegador);
  return sombras(g);
}

const perfilPrato = [
  [0.001, 0],
  [0.075, 0],
  [0.105, 0.008],
  [0.128, 0.02],
  [0.125, 0.022],
  [0.102, 0.012],
  [0.074, 0.005],
  [0.001, 0.005],
];
function pratos(mat, n) {
  const g = new Group();
  for (let i = 0; i < n; i++) {
    const p = torno(perfilPrato, mat.ceramica, 36);
    p.position.y = i * 0.012;
    g.add(p);
  }
  return sombras(g);
}

function tigela(raio, material) {
  const k = raio / 0.125;
  return torno(
    [
      [0.001, 0.004],
      [0.055 * k, 0.004],
      [0.095 * k, 0.03 * k],
      [0.125 * k, 0.08 * k],
      [0.12 * k, 0.082 * k],
      [0.09 * k, 0.034 * k],
      [0.05 * k, 0.012 * k],
      [0.001, 0.012 * k],
    ],
    material,
  );
}

function caneca(material) {
  const g = new Group();
  g.add(
    torno(
      [
        [0.001, 0],
        [0.036, 0],
        [0.04, 0.01],
        [0.04, 0.095],
        [0.036, 0.095],
        [0.036, 0.008],
        [0.001, 0.008],
      ],
      material,
      28,
    ),
  );
  const alca = new Mesh(new TorusGeometry(0.024, 0.006, 8, 16, Math.PI), material);
  alca.rotation.z = -Math.PI / 2;
  alca.position.set(0.04, 0.05, 0);
  g.add(alca);
  return sombras(g);
}

// ------------------------------------------------------------------ Móveis
function guardaRoupa(mat) {
  const o = oficina(mat);
  const L = 3.2;
  const A = 2.7;
  const R = 0.1; // rodapé
  const Pc = 0.56; // profundidade do corpo
  const yM = 2.22; // divisória do maleiro
  const zF = Pc / 2;
  const util = L - 2 * E;
  const wm = (util - 2 * E) / 3;
  const xDiv = [-L / 2 + E + wm + E / 2, -L / 2 + E + 2 * wm + 1.5 * E];
  const xMod = [-L / 2 + E + wm / 2, xDiv[0] + E / 2 + wm / 2, xDiv[1] + E / 2 + wm / 2];
  const yBase = R + E;
  const altDiv = yM - E / 2 - yBase;
  const altMaleiro = A - E - (yM + E / 2);

  // Corpo
  o.peca(o.caixa(E, A, Pc, mat.branco), -L / 2 + E / 2, A / 2, 0, { dx: -1.8, dy: 1.4, rz: 0.3 });
  o.peca(o.caixa(E, A, Pc, mat.branco), L / 2 - E / 2, A / 2, 0, { dx: 1.8, dy: 1.4, rz: -0.3 });
  o.peca(o.caixa(util, E, Pc, mat.branco), 0, R + E / 2, 0, { dy: 1.8 });
  o.peca(o.caixa(util, E, Pc, mat.branco), 0, A - E / 2, 0, { dy: 2.8, rx: 0.2 });
  o.peca(o.caixa(util, R, E, mat.grafite), 0, R / 2, zF - 0.05, { dy: 1.4, dz: 0.8 });
  o.peca(o.caixa(util, A - R - 2 * E, 0.006, mat.branco, { raio: 0 }), 0, R + E + (A - R - 2 * E) / 2, -Pc / 2 + 0.012, {
    dz: -1.6,
    dy: 1.8,
  });
  const divisoria = o.caixa(util, E, Pc - 0.015, mat.branco);
  for (const x of xMod) {
    const fita = o.fitaLed(wm - 0.03);
    fita.position.set(x, -E / 2 - 0.0025, zF - 0.045);
    divisoria.add(fita);
  }
  o.peca(divisoria, 0, yM, 0.0075, { dy: 2.2, rx: -0.2 });
  for (const [i, x] of xDiv.entries()) {
    o.peca(o.caixa(E, altDiv, Pc - 0.015, mat.branco), x, yBase + altDiv / 2, 0.0075, { dy: 2.2 + i * 0.2, rz: i ? -0.35 : 0.35 });
    o.peca(o.caixa(E, altMaleiro, Pc - 0.015, mat.branco), x, yM + E / 2 + altMaleiro / 2, 0.0075, { dy: 2.6 });
  }
  // Luz do LED lavando o fundo de cada módulo
  for (const x of xMod) o.brilho(wm - 0.01, 1.4, x, yM - E / 2 - 0.7, -Pc / 2 + 0.017);

  // Módulo da esquerda: camisas em cima, calças embaixo
  const [x0, x1, x2] = xMod;
  o.peca(o.caixa(wm, E, Pc - 0.04, mat.branco), x0, 1.24, -0.005, { dy: 2 });
  o.peca(
    cabideiro(mat, wm, { quantidade: 14, comprimento: [0.68, 0.8], paleta: mat.camisas, semente: 3 }),
    x0,
    yM - E / 2 - 0.07,
    0.01,
    { dy: 2.1 },
  );
  o.peca(cabideiro(mat, wm, { quantidade: 12, comprimento: [0.46, 0.54], paleta: mat.calcas, semente: 5 }), x0, 1.17, 0.01, {
    dy: 1.9,
  });
  o.peca(o.conjunto(...[-1, 1].map((s) => em(cesto(mat, 0.46, 0.26, 0.42), s * 0.245, 0, 0))), x0, yBase + 0.13, 0.02, {
    dy: 1.6,
  });

  // Módulo do meio: gavetas internas, prateleiras e roupa dobrada
  const gavetas = [];
  for (let k = 0; k < 2; k++) {
    const g = o.gaveta(wm - 0.07, 0.2, mat.madeira, { profundidade: 0.46, puxador: 'cava' });
    o.peca(g, x1, yBase + 0.012 + 0.1 + k * 0.215, zF - 0.03, { dy: 2 + k * 0.2, dz: 0.8 });
    gavetas.push({ objeto: g, tipo: 'desliza', distancia: 0.24 - k * 0.04 });
  }
  const prateleiras = [0.62, 1.02, 1.42, 1.82];
  for (const [i, y] of prateleiras.entries()) {
    o.peca(o.caixa(wm, E, Pc - 0.04, mat.branco), x1, y, -0.005, { dy: 1.9 + i * 0.15, ry: 0.4 });
  }
  for (const [i, y] of prateleiras.slice(0, 3).entries()) {
    const pilhas = [-1, 1].map((s, k) => {
      const p = pilha(mat, 4 + ((i + k) % 3), 0.34, 0.3, i * 2 + k + 1);
      p.position.set(s * 0.24, 0, 0.02);
      return p;
    });
    o.peca(o.conjunto(...pilhas), x1, y + E / 2, 0, { dy: 1.6 });
  }
  o.peca(
    o.conjunto(...[-1, 1].map((s) => em(cesto(mat, 0.44, 0.24, 0.4), s * 0.235, 0.12, 0))),
    x1,
    prateleiras[3] + E / 2,
    0.02,
    { dy: 1.5 },
  );

  // Módulo da direita: roupas longas
  o.peca(
    cabideiro(mat, wm, { quantidade: 11, comprimento: [1.0, 1.32], paleta: mat.longas, semente: 8, profundidade: 0.48 }),
    x2,
    yM - E / 2 - 0.07,
    0.01,
    { dy: 2.1 },
  );
  o.peca(o.conjunto(...[-1, 1].map((s) => em(cesto(mat, 0.46, 0.3, 0.42), s * 0.245, 0, 0))), x2, yBase + 0.15, 0.02, {
    dy: 1.6,
  });

  // Portas: seis de giro com puxador de barra e seis no maleiro
  const folga = 0.005;
  const wd = (L - 5 * folga - 0.002) / 6;
  const zPorta = zF + 0.0015 + E / 2;
  const portas = [];
  const y0 = R + 0.002;
  const hd = yM - 0.0015 - y0;
  const hm = A - 0.0015 - (yM + 0.0015);
  for (let i = 0; i < 6; i++) {
    const lado = i % 2 === 0 ? -1 : 1;
    const xEsq = -L / 2 + 0.001 + i * (wd + folga);
    const xDob = lado === -1 ? xEsq : xEsq + wd;
    const porta = o.portaGiro(wd, hd, mat.madeira, lado, { puxador: 'barra', dobradicas: 4 });
    o.peca(porta, xDob, y0 + hd / 2, zPorta, { dy: 2.2, dz: 1.3, ry: lado * 0.6 });
    // as do meio abrem mais para as gavetas passarem
    portas.push({ objeto: porta, tipo: 'giro', eixo: 'y', angulo: lado * (i === 2 || i === 3 ? 1.5 : 1.2) });
  }
  for (let i = 0; i < 6; i++) {
    const lado = i % 2 === 0 ? -1 : 1;
    const xEsq = -L / 2 + 0.001 + i * (wd + folga);
    const porta = o.portaGiro(wd, hm, mat.madeira, lado, { dobradicas: 2 });
    o.peca(porta, lado === -1 ? xEsq : xEsq + wd, yM + 0.0015 + hm / 2, zPorta, { dy: 2.6, dz: 1, rx: -0.3 });
  }
  o.moveis.push(...portas, ...gavetas);
  return { ...o, largura: L, altura: A, profundidade: 0.6, cotaY: A + 0.18, luz: 'aberto' };
}

function cozinha(mat) {
  const o = oficina(mat);
  const L = 4.8;
  const larg = [0.6, 0.9, 0.6, 0.9, 0.6, 1.2];
  const xIni = larg.map((_, i) => -L / 2 + larg.slice(0, i).reduce((a, b) => a + b, 0));
  const xCen = larg.map((w, i) => xIni[i] + w / 2);
  const zFundo = -0.3;
  const zFrente = 0.26;
  const pC = zFrente - zFundo;
  const zC = (zFundo + zFrente) / 2;
  const R = 0.1;
  const yTopo = 0.88; // topo dos armários de baixo
  const yBancada = 0.91; // superfície da bancada
  const yA0 = 1.5;
  const yA1 = 2.2;
  const hA = yA1 - yA0;
  const zAf = 0.05;
  const pA = zAf - zFundo;
  const zAc = (zFundo + zAf) / 2;
  const zPorta = zFrente + 0.0015 + E / 2;
  const zPortaA = zAf + 0.0015 + E / 2;
  const fronteiras = xIni.slice(1);

  // Armários de baixo
  o.peca(o.caixa(L - 2 * E, E, pC, mat.branco), 0, R + E / 2, zC, { dy: 1.8 });
  for (const s of [-1, 1]) o.peca(o.caixa(E, yTopo, pC, mat.branco), s * (L / 2 - E / 2), yTopo / 2, zC, { dx: s * 1.6, dy: 1.3, rz: -s * 0.3 });
  o.peca(o.caixa(L - 2 * E, yTopo - R - E, 0.006, mat.branco, { raio: 0 }), 0, R + E + (yTopo - R - E) / 2, zFundo + 0.004, { dz: -1.4, dy: 1.5 });
  o.peca(
    o.conjunto(...fronteiras.map((x) => o.caixa(E, yTopo - R - E, pC - 0.008, mat.branco, { em: [x, 0, 0] }))),
    0,
    R + E + (yTopo - R - E) / 2,
    zC + 0.004,
    { dy: 2.1 },
  );
  o.peca(
    o.conjunto(...[0, 5].map((i) => o.caixa(larg[i] - E - 0.004, E, pC - 0.03, mat.branco, { em: [xCen[i], 0, 0] }))),
    0,
    0.48,
    zC - 0.01,
    { dy: 1.7 },
  );
  o.peca(o.caixa(L - 2 * E, R, E, mat.grafite), 0, R / 2, zFrente - 0.05, { dy: 1.3, dz: 0.8 });

  // Bancada de quartzo com recorte para a cuba (veios contínuos)
  const xCuba = xCen[1];
  const cuba = { x0: xCuba - 0.35, x1: xCuba + 0.35, z0: -0.21, z1: 0.19 };
  const yB = yTopo + 0.015;
  const eB = 0.03;
  const zBf = 0.32;
  const q = (l, p, x, z) => o.caixa(l, eB, p, mat.quartzo, { raio: 0.002, veio: 'h', em: [x, yB, z], continuo: true });
  o.peca(
    o.conjunto(
      q(cuba.x0 + L / 2, zBf - zFundo, (-L / 2 + cuba.x0) / 2, (zBf + zFundo) / 2),
      q(L / 2 - cuba.x1, zBf - zFundo, (cuba.x1 + L / 2) / 2, (zBf + zFundo) / 2),
      q(0.7, zBf - cuba.z1, xCuba, (zBf + cuba.z1) / 2),
      q(0.7, cuba.z0 - zFundo, xCuba, (cuba.z0 + zFundo) / 2),
    ),
    0,
    0,
    0,
    { dy: 2.6, rx: 0.12 },
  );
  // Frontão
  const frontao = [0, (yA0 + yBancada) / 2, zFundo + 0.006];
  o.peca(o.caixa(L, yA0 - yBancada, 0.012, mat.quartzo, { raio: 0, em: frontao, continuo: true }), ...frontao, { dz: -1.4, dy: 2 });
  // Luz do LED no frontão
  o.brilho(L - 0.06, yA0 - yBancada - 0.01, 0, (yA0 + yBancada) / 2, zFundo + 0.0135);

  // Cuba de inox embutida
  const hCuba = 0.2;
  const yFundoCuba = yTopo - hCuba;
  const zCuba = (cuba.z0 + cuba.z1) / 2;
  const inox = (l, a, p, x, y, z) => o.caixa(l, a, p, mat.inox, { raio: 0.001, em: [x, y, z] });
  const ralo = new Mesh(new CylinderGeometry(0.035, 0.035, 0.004, 28), mat.pretoFosco);
  ralo.position.set(0, yFundoCuba + 0.005, 0);
  o.peca(
    o.conjunto(
      inox(0.7, 0.006, 0.4, 0, yFundoCuba, 0),
      inox(0.006, hCuba, 0.4, -0.347, yFundoCuba + hCuba / 2, 0),
      inox(0.006, hCuba, 0.4, 0.347, yFundoCuba + hCuba / 2, 0),
      inox(0.7, hCuba, 0.006, 0, yFundoCuba + hCuba / 2, -0.197),
      inox(0.7, hCuba, 0.006, 0, yFundoCuba + hCuba / 2, 0.197),
      ralo,
    ),
    xCuba,
    0,
    zCuba,
    { dy: 2.4 },
  );
  // Torneira gourmet preta
  const torneira = new Group();
  const corpo = new Mesh(new CylinderGeometry(0.024, 0.027, 0.06, 28), mat.pretoFosco);
  corpo.position.y = 0.03;
  const curva = new CatmullRomCurve3([
    new Vector3(0, 0.05, 0),
    new Vector3(0, 0.3, 0),
    new Vector3(0, 0.38, 0.04),
    new Vector3(0, 0.385, 0.11),
    new Vector3(0, 0.34, 0.18),
    new Vector3(0, 0.27, 0.205),
  ]);
  const bica = new Mesh(new TubeGeometry(curva, 64, 0.011, 16), mat.pretoFosco);
  const bico = new Mesh(new CylinderGeometry(0.013, 0.013, 0.03, 20), mat.pretoFosco);
  bico.position.set(0, 0.26, 0.207);
  const alavanca = new Mesh(new CylinderGeometry(0.006, 0.006, 0.075, 12), mat.pretoFosco);
  alavanca.rotation.z = Math.PI / 2.4;
  alavanca.position.set(0.045, 0.16, 0);
  const cabeca = new Mesh(new CylinderGeometry(0.016, 0.016, 0.035, 18), mat.pretoFosco);
  cabeca.rotation.z = Math.PI / 2;
  cabeca.position.set(0.02, 0.15, 0);
  torneira.add(corpo, bica, bico, alavanca, cabeca);
  o.peca(sombras(torneira), xCuba, yBancada, zFundo + 0.045, { dy: 2.6 });

  // Cooktop de indução
  const cooktop = new Mesh(new BoxGeometry(0.77, 0.006, 0.52), mat.cooktop);
  cooktop.castShadow = true;
  cooktop.receiveShadow = true;
  o.peca(cooktop, xCen[3], yBancada + 0.003, 0.0, { dy: 2.8 });

  // Portas e gavetas de baixo (com perfil de alumínio no topo)
  const yFrente0 = R + 0.003;
  const hFrente = yTopo - 0.003 - yFrente0;
  const yPorta = yFrente0 + hFrente / 2;
  const moveis = [];
  const giro = (larguraPorta, lado, xDob, abre) => {
    const p = o.portaGiro(larguraPorta, hFrente, mat.grafite, lado, { puxador: 'perfil' });
    o.peca(p, xDob, yPorta, zPorta, { dy: 2.1, dz: 1, ry: lado * 0.5 });
    if (abre) moveis.push({ objeto: p, tipo: 'giro', eixo: 'y', angulo: lado * 1.35 });
  };
  giro(larg[0] - 0.003, -1, xIni[0] + 0.0015, true);
  for (const [i, abre] of [
    [1, false],
    [5, true],
  ]) {
    const lp = (larg[i] - 0.0045) / 2;
    giro(lp, -1, xIni[i] + 0.0015, abre);
    giro(lp, 1, xIni[i] + larg[i] - 0.0015, abre);
  }
  const alturasGaveta = [0.308, 0.26, 0.2];
  for (const i of [2, 4]) {
    let y = yFrente0;
    alturasGaveta.forEach((h, k) => {
      const g = o.gaveta(larg[i] - 0.003, h, mat.grafite, { profundidade: 0.48 });
      if (i === 2 && k === 2) {
        // divisória de talheres na gaveta de cima
        const bandeja = new Group();
        bandeja.add(o.caixa(larg[i] - 0.1, 0.05, 0.42, mat.madeira, { veio: 'h' }));
        for (const x of [-0.12, 0, 0.12]) bandeja.add(o.caixa(0.006, 0.052, 0.4, mat.branco, { raio: 0, em: [x, 0.002, 0] }));
        bandeja.position.set(0, -h / 2 + 0.06, -E / 2 - 0.24);
        g.add(sombras(bandeja));
      }
      o.peca(g, xCen[i], y + h / 2, zPorta, { dy: 2 + k * 0.2, dz: 0.9 });
      if (i === 2) moveis.push({ objeto: g, tipo: 'desliza', distancia: 0.3 + k * 0.05 });
      y += h + 0.003;
    });
  }
  // Forno de embutir e gaveta embaixo
  const hForno = 0.597;
  const yForno = yTopo - 0.003 - hForno / 2;
  const forno = new Group();
  forno.add(o.caixa(0.87, hForno, 0.02, mat.pretoFosco, { raio: 0.002 }));
  forno.add(o.caixa(0.8, 0.38, 0.004, mat.vidroPreto, { raio: 0, em: [0, -0.07, 0.011] }));
  forno.add(o.caixa(0.87, 0.085, 0.004, mat.vidroPreto, { raio: 0, em: [0, hForno / 2 - 0.045, 0.011] }));
  const visor = new Mesh(new BoxGeometry(0.07, 0.018, 0.002), mat.visor);
  visor.position.set(0, hForno / 2 - 0.045, 0.0135);
  forno.add(visor);
  for (const x of [-0.3, 0.3]) {
    const botao = new Mesh(new CylinderGeometry(0.018, 0.018, 0.02, 24), mat.inox);
    botao.rotation.x = Math.PI / 2;
    botao.position.set(x, hForno / 2 - 0.045, 0.02);
    forno.add(botao);
  }
  const alca = o.barra(0.7, mat.inox, { deitado: true, raio: 0.008 });
  alca.position.set(0, hForno / 2 - 0.13, 0.04);
  forno.add(alca);
  o.peca(sombras(forno), xCen[3], yForno, zPorta, { dy: 2.2, dz: 1.2 });
  const hGavetaForno = yForno - hForno / 2 - 0.003 - yFrente0;
  o.peca(o.gaveta(larg[3] - 0.003, hGavetaForno, mat.grafite, { profundidade: 0.48 }), xCen[3], yFrente0 + hGavetaForno / 2, zPorta, { dy: 1.9, dz: 0.9 });

  // Armários aéreos
  o.peca(o.caixa(L, E, pA, mat.branco), 0, yA0 + E / 2, zAc, { dy: 2.4 });
  const topoA = o.caixa(L, E, pA, mat.branco);
  o.peca(topoA, 0, yA1 - E / 2, zAc, { dy: 2.8 });
  for (const s of [-1, 1]) o.peca(o.caixa(E, hA - 2 * E, pA, mat.branco), s * (L / 2 - E / 2), (yA0 + yA1) / 2, zAc, { dx: s * 1.4, dy: 2.2 });
  o.peca(o.caixa(L - 2 * E, hA - 2 * E, 0.006, mat.branco, { raio: 0 }), 0, (yA0 + yA1) / 2, zFundo + 0.003, { dz: -1.2, dy: 2 });
  o.peca(
    o.conjunto(...fronteiras.map((x) => o.caixa(E, hA - 2 * E, pA - 0.006, mat.branco, { em: [x, 0, 0] }))),
    0,
    (yA0 + yA1) / 2,
    zAc + 0.003,
    { dy: 2.4 },
  );
  o.peca(
    o.conjunto(...[0, 1, 2, 4, 5].map((i) => o.caixa(larg[i] - E - 0.004, E, pA - 0.03, mat.branco, { em: [xCen[i], 0, 0] }))),
    0,
    1.85,
    zAc - 0.01,
    { dy: 2.2 },
  );
  // Fita de LED embaixo dos aéreos
  const fitaAerea = o.fitaLed(L - 0.05);
  o.peca(fitaAerea, 0, yA0 - 0.0025, zAf - 0.035, { dy: 2.4 });

  // Nicho de madeira em cima do cooktop
  const wn = larg[3] - E - 0.002;
  const nicho = new Group();
  nicho.add(o.caixa(wn, hA - 2 * E, 0.008, mat.madeira, { em: [0, 0, zFundo + 0.01] }));
  nicho.add(o.caixa(wn, 0.008, pA - 0.012, mat.madeira, { veio: 'h', em: [0, -hA / 2 + E + 0.004, zAc + 0.004] }));
  nicho.add(o.caixa(wn, 0.008, pA - 0.012, mat.madeira, { veio: 'h', em: [0, hA / 2 - E - 0.004, zAc + 0.004] }));
  nicho.add(o.caixa(wn, 0.025, pA - 0.02, mat.madeira, { veio: 'h', em: [0, 1.85 - (yA0 + yA1) / 2, zAc] }));
  const fitaNicho = o.fitaLed(wn - 0.04);
  fitaNicho.position.set(0, hA / 2 - E - 0.011, zAf - 0.04);
  nicho.add(fitaNicho);
  o.peca(sombras(nicho), xCen[3], (yA0 + yA1) / 2, 0, { dy: 2.5, dz: 0.6 });
  o.brilho(wn - 0.02, hA - 2 * E - 0.02, xCen[3], (yA0 + yA1) / 2 - 0.01, zFundo + 0.0155);
  // Potes e livros de receita no nicho
  const potes = new Group();
  [
    [0.05, 0.16],
    [0.045, 0.12],
    [0.04, 0.09],
  ].forEach(([r, h], k) => {
    const p = pote(mat, r, h, k === 1 ? mat.ceramicaEscura : mat.ceramica);
    p.position.set(-0.22 + k * 0.12, 0, (k % 2) * 0.03);
    potes.add(p);
  });
  const receitas = [mat.livros[1], mat.livros[3], mat.livros[0], mat.livros[4]].map((cor, k) => {
    const lv = livro(mat, 0.2, 0.24 - k * 0.012, 0.022 + (k % 2) * 0.01, cor);
    lv.position.set(0.12 + k * 0.034, (0.24 - k * 0.012) / 2, -0.02);
    lv.rotation.z = k === 3 ? -0.2 : 0;
    return lv;
  });
  receitas[3].position.x += 0.02;
  receitas[3].position.y -= 0.01;
  const estante = new Group();
  estante.add(...receitas);
  o.peca(o.conjunto(potes), xCen[3], yA0 + E + 0.008, zAc, { dy: 1.8 });
  o.peca(o.conjunto(estante), xCen[3], 1.8625, zAc, { dy: 1.8 });

  // Louça dentro dos aéreos que abrem
  const loucaEsq = new Group();
  [-0.2, 0.08].forEach((x, k) => {
    const p = pratos(mat, k ? 5 : 7);
    p.position.set(x, 0, 0);
    loucaEsq.add(p);
  });
  [0.28, 0.36].forEach((x) => {
    const c = caneca(mat.ceramica);
    c.position.set(x, 0, -0.04);
    c.rotation.y = -0.6;
    loucaEsq.add(c);
  });
  o.peca(o.conjunto(loucaEsq), xCen[1], yA0 + E + 0.001, zAc, { dy: 1.8 });
  const loucaDir = new Group();
  for (let k = 0; k < 4; k++) {
    const t = tigela(0.1, k % 2 ? mat.ceramicaEscura : mat.ceramica);
    t.position.set(-0.3, k * 0.03, 0);
    loucaDir.add(t);
  }
  [0, 0.14, 0.28].forEach((x, k) => {
    const p = pote(mat, 0.05, 0.14 + (k % 2) * 0.04, mat.ceramica);
    p.position.set(x, 0, 0);
    loucaDir.add(p);
  });
  o.peca(o.conjunto(loucaDir), xCen[5], yA0 + E + 0.001, zAc, { dy: 1.8 });

  // Portas basculantes de madeira
  const wA = (i) => larg[i] - 0.003;
  for (const [i, abre] of [
    [0, false],
    [1, true],
    [2, false],
    [4, false],
    [5, true],
  ]) {
    const b = o.portaBasculante(wA(i), hA - 0.003, mat.madeira);
    o.peca(b, xCen[i], yA1 - 0.0015, zPortaA, { dy: 2.4 + i * 0.05, dz: 0.8, rx: -0.5 });
    if (abre) moveis.push({ objeto: b, tipo: 'giro', eixo: 'x', angulo: -1.15 });
  }

  // Tábua, fruteira e laranjas na bancada
  const tabua = o.caixa(0.42, 0.022, 0.27, mat.madeira, { raio: 0.006, veio: 'h' });
  tabua.rotation.y = 0.12;
  o.peca(tabua, xCen[4] + 0.05, yBancada + 0.011, -0.1, { dy: 1.6 });
  const fruteira = new Group();
  fruteira.add(tigela(0.14, mat.ceramica));
  [
    [0, 0.045, 0],
    [0.055, 0.04, 0.02],
    [-0.04, 0.042, 0.045],
    [0.01, 0.085, 0.02],
  ].forEach(([x, y, z], k) => {
    const fruta = new Mesh(new SphereGeometry(0.037, 22, 16), k === 3 ? mat.limao : mat.laranja);
    fruta.position.set(x, y, z);
    fruteira.add(fruta);
  });
  o.peca(o.conjunto(fruteira), xCen[5] + 0.25, yBancada, -0.05, { dy: 1.7 });

  o.moveis.push(...moveis);
  return { ...o, largura: L, altura: yA1, profundidade: 0.62, cotaY: yA1 + 0.18, luz: 'montado' };
}

function painelTv(mat) {
  const o = oficina(mat);
  const L = 2.5;
  const A = 2.4;
  const zPainel = -0.2;
  const zRipas = zPainel + E; // frente da chapa de fundo
  o.peca(o.caixa(L, A, E, mat.grafite), 0, A / 2, zPainel + E / 2, { dy: 2.8, dz: -1 });
  // Ripado de madeira
  const nRipas = 42;
  const lr = 0.04;
  const vao = (L - nRipas * lr) / (nRipas - 1);
  const hRipa = A - 0.07;
  for (let i = 0; i < nRipas; i++) {
    const ripa = o.caixa(lr, hRipa, 0.025, mat.madeira, { raio: 0.0015 });
    ripa.userData.rapida = true;
    o.peca(ripa, -L / 2 + lr / 2 + i * (lr + vao), hRipa / 2, zRipas + 0.0125, { dy: 2.5 + (i % 6) * 0.12, dz: 0.4 });
  }
  const frentePainel = zRipas + 0.025;
  // Sanca de madeira com LED lavando o ripado
  const sanca = o.caixa(L, 0.07, 0.1, mat.madeira, { veio: 'h' });
  const fitaSanca = o.fitaLed(L - 0.06);
  fitaSanca.position.set(0, -0.035 - 0.0025, 0.02);
  sanca.add(fitaSanca);
  o.peca(sanca, 0, A - 0.035, zPainel + E + 0.05, { dy: 2.9 });
  o.brilho(L, 1.5, 0, A - 0.07 - 0.75, frentePainel + 0.002);

  // TV de 65"
  const tv = new Group();
  tv.add(o.caixa(1.45, 0.835, 0.026, mat.vidroPreto, { raio: 0.003 }));
  const tela = new Mesh(new PlaneGeometry(1.43, 0.815), mat.tela);
  tela.position.z = 0.0132;
  tv.add(tela);
  o.peca(sombras(tv), 0, 1.32, frentePainel + 0.035, { dy: 2.4, dz: 1.4 });

  // Rack suspenso
  const LR = 2.2;
  const hR = 0.4;
  const yR0 = 0.3;
  const pR = 0.44;
  const zR = frentePainel + pR / 2;
  const hCorpo = hR - 0.03;
  o.peca(o.caixa(LR, E, pR, mat.areia), 0, yR0 + E / 2, zR, { dy: 2 });
  for (const s of [-1, 1]) o.peca(o.caixa(E, hCorpo - E, pR, mat.areia), s * (LR / 2 - E / 2), yR0 + E + (hCorpo - E) / 2, zR, { dx: s, dy: 2 });
  o.peca(o.caixa(LR - 2 * E, hCorpo - E, 0.006, mat.areia, { raio: 0 }), 0, yR0 + E + (hCorpo - E) / 2, frentePainel + 0.003, { dz: -1, dy: 2 });
  const xNicho = 0.3;
  o.peca(
    o.conjunto(...[-1, 1].map((s) => o.caixa(E, hCorpo - E, pR - 0.006, mat.areia, { em: [s * xNicho, 0, 0] }))),
    0,
    yR0 + E + (hCorpo - E) / 2,
    zR + 0.003,
    { dy: 2.2 },
  );
  const tampo = o.caixa(LR + 0.02, 0.03, pR + 0.01, mat.madeira, { veio: 'h', raio: 0.002 });
  const fitaRack = o.fitaLed(2 * xNicho - E - 0.04);
  fitaRack.position.set(0, -0.015 - 0.0025, pR / 2 - 0.05);
  tampo.add(fitaRack);
  o.peca(tampo, 0, yR0 + hR - 0.015, zR + 0.005, { dy: 2.6 });
  o.brilho(2 * xNicho - E - 0.01, hCorpo - E - 0.01, 0, yR0 + E + (hCorpo - E) / 2, frentePainel + 0.0075);
  // Gavetas do rack
  const lg = LR / 2 - xNicho - E - 0.004;
  const hg = hCorpo - E - 0.006;
  for (const s of [-1, 1]) {
    const g = o.gaveta(lg, hg, mat.madeira, { profundidade: pR - 0.06, puxador: 'cava' });
    o.peca(g, s * (xNicho + E / 2 + 0.002 + lg / 2), yR0 + E + 0.003 + hg / 2, zR + pR / 2 - E / 2, { dy: 2.2, dz: 1, ry: s * 0.3 });
    o.moveis.push({ objeto: g, tipo: 'desliza', distancia: 0.26 });
  }
  // Livros no nicho
  const estante = new Group();
  const cores = [0, 2, 4, 1, 3, 0, 5];
  let xl = -0.2;
  cores.forEach((c, k) => {
    const a = 0.22 + ((k * 37) % 5) * 0.012;
    const e = 0.022 + ((k * 13) % 3) * 0.008;
    const lv = livro(mat, 0.16, a, e, mat.livros[c]);
    lv.position.set(xl + e / 2, a / 2, 0);
    estante.add(lv);
    xl += e + 0.002;
  });
  const bola = new Mesh(new SphereGeometry(0.055, 28, 20), mat.ceramicaEscura);
  bola.position.set(0.17, 0.055, 0);
  estante.add(bola);
  o.peca(o.conjunto(estante), 0, yR0 + E, zR + 0.02, { dy: 1.6 });

  // Decoração em cima do rack
  const yTampo = yR0 + hR;
  const soundbar = new Group();
  soundbar.add(new Mesh(new RoundedBoxGeometry(0.9, 0.065, 0.095, 3, 0.02), mat.tecidoEscuro));
  for (const s of [-1, 1]) {
    const ponta = new Mesh(new RoundedBoxGeometry(0.012, 0.066, 0.096, 2, 0.005), mat.pretoFosco);
    ponta.position.x = s * 0.448;
    soundbar.add(ponta);
  }
  o.peca(sombras(soundbar), 0, yTampo + 0.0325, zR - 0.04, { dy: 2 });
  o.peca(vasoPampas(mat, 17), -0.82, yTampo, zR - 0.02, { dy: 2.2 });
  const deitados = new Group();
  [
    [0.26, 0.2, 0.04, 2],
    [0.24, 0.18, 0.03, 0],
    [0.22, 0.16, 0.035, 5],
  ].forEach(([l, a, e, c], k) => {
    const lv = livro(mat, l, a, e, mat.livros[c], { deitado: true });
    lv.position.set(0, deitados.children.reduce((s, x) => s + x.userData.e, 0) + e / 2, 0);
    lv.rotation.y = (k - 1) * 0.08;
    lv.userData.e = e;
    deitados.add(lv);
  });
  const escultura = torno(
    [
      [0.001, 0],
      [0.04, 0],
      [0.055, 0.04],
      [0.03, 0.1],
      [0.018, 0.13],
      [0.001, 0.135],
    ],
    mat.ceramica,
  );
  escultura.position.set(0.02, 0.105, 0);
  deitados.add(escultura);
  o.peca(o.conjunto(deitados), 0.78, yTampo, zR, { dy: 1.8 });

  return { ...o, largura: L, altura: A, profundidade: 0.5, cotaY: A + 0.18, luz: 'montado' };
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

function criarMateriais(renderizador) {
  const madeiraCor = texturaGPU(renderizador, GLSL_MADEIRA, 1024, { srgb: true });
  const madeiraDados = texturaGPU(renderizador, GLSL_MADEIRA, 1024, { modo: 1 });
  const quartzoCor = texturaGPU(renderizador, GLSL_QUARTZO, 1024, { srgb: true });
  const fino = texturaGPU(renderizador, GLSL_FINO, 256);

  const escala = (material, e) => {
    material.userData.escala = e;
    return material;
  };
  const pintura = (cor, rugosidade, relevo = 0.35) =>
    escala(new MeshStandardMaterial({ color: cor, roughness: rugosidade, bumpMap: fino, bumpScale: relevo }), [0.25, 0.25]);
  const tecido = (cor) =>
    new MeshPhysicalMaterial({ color: cor, roughness: 0.92, sheen: 0.8, sheenRoughness: 0.55, sheenColor: new Color(cor).lerp(new Color(0xffffff), 0.35) });
  const liso = (cor, op = {}) => new MeshStandardMaterial({ color: cor, roughness: 0.5, ...op });

  const tecidos = [0xf0ece4, 0x2f3a4a, 0xc9b8a3, 0x8a9a8c, 0x6b4f3f, 0xb0624a, 0x55575c, 0xd9c7b8].map(tecido);
  return {
    branco: pintura(0xf1ede6, 0.6),
    grafite: pintura(0x3a3b3e, 0.46, 0.25),
    areia: pintura(0xd6cbbb, 0.55),
    madeira: escala(
      new MeshStandardMaterial({ map: madeiraCor, roughnessMap: madeiraDados, bumpMap: madeiraDados, bumpScale: 1.2, roughness: 1 }),
      [0.9, 2.4],
    ),
    quartzo: escala(
      new MeshPhysicalMaterial({ map: quartzoCor, roughness: 0.2, clearcoat: 0.5, clearcoatRoughness: 0.1 }),
      [1.6, 1.6],
    ),
    aluminio: liso(0xc9cbce, { metalness: 1, roughness: 0.32 }),
    inox: liso(0xd4d5d8, { metalness: 1, roughness: 0.24 }),
    gavetaMetal: liso(0x9ea1a5, { metalness: 0.6, roughness: 0.42 }),
    pretoFosco: liso(0x1c1c1e, { metalness: 0.45, roughness: 0.42 }),
    vidroPreto: new MeshPhysicalMaterial({ color: 0x07080a, roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.03 }),
    cooktop: new MeshPhysicalMaterial({ map: texturaCooktop(), roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.03 }),
    tela: new MeshStandardMaterial({ color: 0x050506, roughness: 0.12, emissive: 0xffffff, emissiveMap: texturaTela(), emissiveIntensity: 0.95 }),
    visor: new MeshBasicMaterial({ color: 0xffa043 }),
    ceramica: liso(0xebe5dc, { roughness: 0.35 }),
    ceramicaEscura: liso(0x4a4038, { roughness: 0.5 }),
    laranja: liso(0xe4801f, { roughness: 0.48, bumpMap: fino, bumpScale: 1 }),
    limao: liso(0xa9b53a, { roughness: 0.45, bumpMap: fino, bumpScale: 1 }),
    pampas: liso(0xe8d9bf, { roughness: 1 }),
    caule: liso(0xb49a72, { roughness: 0.9 }),
    miolo: liso(0xefe7d6, { roughness: 0.9 }),
    cabide: liso(0xd9b98f, { roughness: 0.6 }),
    tecidoEscuro: tecido(0x2a2b2e),
    linho: tecido(0xcfc3b0),
    led: new MeshBasicMaterial({ color: 0xffd9a0 }),
    brilho: new MeshBasicMaterial({
      map: texturaLavagem(),
      color: 0xffc38a,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: AdditiveBlending,
    }),
    tecidos,
    camisas: [tecidos[0], tecidos[1], tecidos[2], tecidos[6], tecido(0xa9bfd6), tecido(0xffffff)],
    calcas: [tecidos[1], tecidos[6], tecido(0x2b2c30), tecido(0xb9a88a)],
    longas: [tecidos[4], tecidos[5], tecido(0x1f2024), tecido(0x5d6b4f), tecido(0x7a2e35), tecidos[0], tecido(0xb58d63)],
    livros: [0x8a3b2e, 0x2f4858, 0xd8cbb3, 0x3f5c4a, 0xc58b4b, 0x1f1f22].map((c) => liso(c, { roughness: 0.7 })),
  };
}

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
  cena.environmentIntensity = 0.6;

  const camera = new PerspectiveCamera(28, 1, 0.1, 120);

  cena.add(new HemisphereLight(0xffeedd, 0x2a1a10, 0.35));
  const sol = new DirectionalLight(0xffd9a8, 2.4);
  sol.position.set(4.5, 8.5, 6);
  sol.castShadow = true;
  sol.shadow.mapSize.set(celularLeve ? 1024 : 2048, celularLeve ? 1024 : 2048);
  Object.assign(sol.shadow.camera, { left: -4.2, right: 4.2, top: 4.2, bottom: -3, near: 1, far: 24 });
  sol.shadow.radius = 4;
  sol.shadow.bias = -0.0004;
  sol.shadow.normalBias = 0.012;
  cena.add(sol);
  const recorte = new DirectionalLight(0xffb27a, 1.4);
  recorte.position.set(-5, 4.5, -4);
  cena.add(recorte);

  // Chão: sombra + um brilho quente embaixo do móvel
  const chao = new Mesh(new PlaneGeometry(50, 50), new ShadowMaterial({ opacity: 0.42 }));
  chao.rotation.x = -Math.PI / 2;
  chao.receiveShadow = true;
  cena.add(chao);
  const brilhoChao = new Mesh(
    new CircleGeometry(4.4, 48),
    new MeshBasicMaterial({ map: texturaBrilhoChao(), transparent: true, depthWrite: false, blending: AdditiveBlending }),
  );
  brilhoChao.rotation.x = -Math.PI / 2;
  brilhoChao.position.y = 0.002;
  cena.add(brilhoChao);

  const mat = criarMateriais(renderizador);
  const corLed = new Color(0xffd9a0);

  // Serragem que sobe quando uma peça encaixa
  const NP = 260;
  const posicoes = new Float32Array(NP * 3).fill(-100);
  const velocidades = new Float32Array(NP * 3);
  const vidas = new Float32Array(NP);
  const geoP = new BufferGeometry();
  geoP.setAttribute('position', new BufferAttribute(posicoes, 3));
  const serragem = new Points(geoP, new PointsMaterial({ color: 0xf2cf9b, size: 0.036, transparent: true, opacity: 0.85, depthWrite: false }));
  serragem.frustumCulled = false;
  cena.add(serragem);
  let proxima = 0;
  const soltarSerragem = (ponto, quantidade) => {
    for (let i = 0; i < quantidade; i++) {
      const k = proxima++ % NP;
      posicoes.set([ponto.x + (Math.random() - 0.5) * 0.4, ponto.y, ponto.z + (Math.random() - 0.5) * 0.26], k * 3);
      velocidades.set([(Math.random() - 0.5) * 1.6, 0.8 + Math.random() * 1.4, (Math.random() - 0.5) * 1.6], k * 3);
      vidas[k] = 0.7 + Math.random() * 0.5;
    }
  };

  // Móveis
  const moveis = MODELOS.map((modelo) => {
    const m = modelo.construir(mat);
    m.grupo.visible = false;
    const normais = m.pecas.filter((p) => !p.userData.rapida).length;
    m.serragem = Math.max(3, Math.round(220 / normais));
    let n = 0;
    m.pecas.forEach((p, i) => {
      const d = p.userData.de;
      const rapida = p.userData.rapida;
      p.userData.inicio = {
        pos: p.userData.final.pos.clone().add(new Vector3(d.dx || 0, (d.dy || 2) + 0.8, d.dz || 0)),
        rot: new Vector3((d.rx || 0) + p.userData.final.rot.x, (d.ry || 0) + p.userData.final.rot.y, (d.rz || 0) + p.userData.final.rot.z),
      };
      p.userData.saida = new Vector3((Math.random() - 0.5) * 2, 4.2 + Math.random() * 1.6, (Math.random() - 0.5) * 2);
      p.userData.atraso = rapida ? 0.9 + (i % 40) * 0.03 : 0.1 + (n++ * (T.montagem - 1.1)) / normais;
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
    const z = m.profundidade / 2 + 0.08;
    const seg = (a, b) => new Line(new BufferGeometry().setFromPoints([a, b]), materialCota);
    g.add(seg(new Vector3(-m.largura / 2, y, z), new Vector3(m.largura / 2, y, z)));
    g.userData.pontas = [
      seg(new Vector3(-m.largura / 2, y - 0.13, z), new Vector3(-m.largura / 2, y + 0.13, z)),
      seg(new Vector3(m.largura / 2, y - 0.13, z), new Vector3(m.largura / 2, y + 0.13, z)),
    ];
    g.add(...g.userData.pontas);
    g.userData.ponto = new Vector3(0, y + 0.03, z);
    g.userData.pontoPreco = new Vector3(m.largura / 2 + 0.13, m.altura * 0.58, m.profundidade / 2);
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
    const tamanho = Math.max(m.largura * 1.1, m.altura * 1.25);
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

    // window.__cenaTempo congela a linha do tempo (usado para tirar fotos da cena)
    const fixo = window.__cenaTempo;
    const total =
      typeof fixo === 'number' ? fixo : semMovimento ? T.montagem + T.cota + 0.1 : Math.max(0, (agora - inicio) / 1000);
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
          tmp.y = Math.max(0.02, tmp.y - 0.4);
          soltarSerragem(tmp, m.serragem);
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

    // Portas e gavetas, uma depois da outra
    let abertura = 0;
    if (!semMovimento) {
      if (t >= tAbre && t < tAberto) abertura = saida(faixa(t, tAbre, tAberto));
      else if (t >= tAberto && t < tFecha) abertura = 1;
      else if (t >= tFecha && t < tFecha + T.fecha) abertura = 1 - saida(faixa(t, tFecha, tFecha + T.fecha));
    }
    const nMoveis = m.moveis.length;
    const passo = nMoveis > 1 ? Math.min(0.12, 0.4 / (nMoveis - 1)) : 0;
    m.moveis.forEach((item, i) => {
      const a = MathUtils.clamp(abertura * (1 + passo * (nMoveis - 1)) - i * passo, 0, 1);
      const final = item.objeto.userData.final;
      if (item.tipo === 'giro') item.objeto.rotation[item.eixo] = final.rot[item.eixo] + item.angulo * a;
      else item.objeto.position.z = final.pos.z + item.distancia * a;
    });

    // LEDs: no guarda-roupa acendem ao abrir; nos outros, quando fica pronto
    const apaga = 1 - faixa(t, tDesmonta - 0.3, tDesmonta);
    const luz = (m.luz === 'aberto' ? abertura : faixa(t, tCota, tCota + 0.8)) * apaga;
    mat.led.color.copy(corLed).multiplyScalar(0.35 + 1.25 * luz);
    mat.brilho.opacity = 0.42 * luz;
    for (const b of m.brilhos) b.visible = luz > 0.01;

    // Serragem
    for (let i = 0; i < NP; i++) {
      if (vidas[i] <= 0) continue;
      vidas[i] -= dt;
      velocidades[i * 3 + 1] -= 3.6 * dt;
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
    m.grupo.position.y = semMovimento ? 0 : Math.sin(total * 0.9) * 0.015;

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
    const altura = cam.alvoY + 1.2 + cam.distancia * 0.12 - ponteiro.y * 1.05;
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
      const texturas = new Set();
      const materiais = new Set(Object.values(mat).flat());
      cena.traverse((o) => {
        o.geometry?.dispose();
        if (o.material) materiais.add(o.material);
      });
      for (const m of materiais) {
        for (const chave of ['map', 'emissiveMap', 'roughnessMap', 'bumpMap']) if (m[chave]) texturas.add(m[chave]);
        m.dispose();
      }
      for (const t of texturas) t.dispose();
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
