import { WoodGlassRenderer } from './liquid-glass.js';

const root = document.documentElement;
const renderer = new WoodGlassRenderer(document.getElementById('material'), {
  imageURL: '/images/figma-madeira-original.jpg',
  elements: document.querySelectorAll('[data-glass]'),
});
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const status = document.getElementById('status');
const compare = document.getElementById('compare');
const motion = document.getElementById('motion');
const detail = document.getElementById('detail');
const explore = document.getElementById('explore');
const selection = document.querySelector('.dock-selection');
const tabs = [...document.querySelectorAll('[data-tab]')];
document.getElementById('material').addEventListener('glassfallback', () => {
  status.textContent = 'Seu navegador está exibindo a versão simplificada do vidro.';
});
let selected = tabs[0];
let selectionFrame;
let selectionX = 0, selectionTarget = 0, selectionVelocity = 0, selectionTime = 0;

compare.addEventListener('click', () => {
  renderer.enabled = !renderer.enabled;
  root.dataset.material = renderer.enabled ? 'glass' : 'solid';
  compare.setAttribute('aria-checked', String(renderer.enabled));
  document.getElementById('compare-label').textContent = renderer.enabled ? 'Vidro' : 'Sólido';
  renderer.requestRender();
});

document.addEventListener('pointermove', event => {
  if (!reducedMotion.matches) renderer.setLight(event.clientX, event.clientY);
}, { passive: true });
document.addEventListener('pointerdown', event => {
  if (!reducedMotion.matches) renderer.setLight(event.clientX, event.clientY);
  renderer.requestRender(550);
}, { passive: true });
document.addEventListener('pointerup', () => renderer.requestRender(550), { passive: true });
document.addEventListener('pointercancel', () => renderer.requestRender(550), { passive: true });

explore.addEventListener('click', () => {
  detail.hidden = !detail.hidden;
  explore.setAttribute('aria-expanded', String(!detail.hidden));
  renderer.requestRender(600);
  if (!detail.hidden) {
    document.getElementById('close-detail').focus({ preventScroll: true });
    detail.scrollIntoView({ behavior: reducedMotion.matches ? 'instant' : 'smooth', block: 'nearest' });
  }
});
function closeDetail() {
  detail.hidden = true; explore.setAttribute('aria-expanded', 'false');
  renderer.requestRender(); explore.focus({ preventScroll: true });
}
document.getElementById('close-detail').addEventListener('click', closeDetail);
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !detail.hidden) closeDetail();
});

function animateSelection(time) {
  const delta = Math.min((time - (selectionTime || time - 16)) / 1000, .032);
  selectionTime = time;
  const gap = selectionTarget - selectionX;
  selectionVelocity += (gap * 210 - selectionVelocity * 26) * delta;
  selectionX += selectionVelocity * delta;
  const done = Math.abs(gap) < .05 && Math.abs(selectionVelocity) < .05;
  if (done || reducedMotion.matches) { selectionX = selectionTarget; selectionVelocity = 0; }
  selection.style.transform = `translateX(${selectionX}px)`;
  renderer.requestRender();
  selectionFrame = done || reducedMotion.matches ? 0 : requestAnimationFrame(animateSelection);
}
function positionSelection(immediate = false) {
  selectionTarget = selected.offsetLeft - 7;
  if (immediate || reducedMotion.matches) {
    selectionX = selectionTarget; selectionVelocity = 0;
    selection.style.transform = `translateX(${selectionX}px)`;
    renderer.requestRender();
  } else if (!selectionFrame) { selectionTime = 0; selectionFrame = requestAnimationFrame(animateSelection); }
}
const samples = {
  home: ['SEU PRÓXIMO PROJETO', ['Cada detalhe,', 'no seu lugar.'], 'Cozinha planejada', '2 ambientes · 4 móveis', 'R$ 22.191,29'],
  budgets: ['SUAS PROPOSTAS', ['Ideias que ganham', 'forma e valor.'], 'Sala e cozinha', '3 ambientes · 6 móveis', 'R$ 32.840,00'],
  new: ['DO PRIMEIRO TRAÇO', ['Um novo espaço.', 'Uma nova história.'], 'Seu próximo projeto', 'Cada medida faz a diferença', 'Vamos criar.'],
  clients: ['FEITO PARA PESSOAS', ['Boas relações.', 'Belos projetos.'], 'Mariana Costa', 'Um projeto para chamar de seu', 'Sob medida.'],
  settings: ['A ESSÊNCIA DA SUA MARCA', ['Sua marcenaria.', 'Do seu jeito.'], 'Identidade Esquadro', 'Precisão em cada escolha', 'Seu espaço.'],
};
for (const tab of tabs) tab.addEventListener('click', () => {
  tabs.forEach(button => button.removeAttribute('aria-current'));
  selected = tab; selected.setAttribute('aria-current', 'page');
  const [category, title, name, meta, total] = samples[tab.dataset.tab];
  document.getElementById('card-category').textContent = category;
  document.getElementById('card-title').replaceChildren(title[0], document.createElement('br'), title[1]);
  document.getElementById('project-name').textContent = name;
  document.getElementById('project-meta').textContent = meta;
  document.getElementById('project-total').textContent = total;
  status.textContent = `${tab.textContent.trim()} · demonstração visual`;
  positionSelection(); renderer.requestRender(600);
});
addEventListener('resize', () => positionSelection(true));
document.fonts.ready.then(() => positionSelection(true));

// Device orientation is optional. Touch/mouse and the optical material work without it.
let listening = false, permissionTimer;
const orientation = event => {
  if (!Number.isFinite(event.gamma) || !Number.isFinite(event.beta) || reducedMotion.matches) return;
  clearTimeout(permissionTimer);
  renderer.setLight(innerWidth * (.5 + Math.max(-35, Math.min(35, event.gamma)) / 90), innerHeight * (.3 + Math.max(-45, Math.min(45, event.beta - 45)) / 120));
  if (listening === 'waiting') { status.textContent = 'O reflexo acompanha o movimento do celular.'; listening = true; }
};
const updateMotionAvailability = () => {
  motion.hidden = !('DeviceOrientationEvent' in window && isSecureContext && !reducedMotion.matches);
  if (reducedMotion.matches) {
    clearTimeout(permissionTimer);
    removeEventListener('deviceorientation', orientation);
    if (listening) status.textContent = '';
    listening = false;
  }
};
updateMotionAvailability();
reducedMotion.addEventListener('change', updateMotionAvailability);
motion.addEventListener('click', async () => {
  clearTimeout(permissionTimer);
  motion.disabled = true;
  try {
    if (typeof DeviceOrientationEvent.requestPermission === 'function' && await DeviceOrientationEvent.requestPermission() !== 'granted') {
      status.textContent = 'Você pode mover o reflexo com o toque.'; return;
    }
    if (!listening) addEventListener('deviceorientation', orientation, { passive: true });
    listening = 'waiting';
    status.textContent = 'Incline suavemente o celular.';
    permissionTimer = setTimeout(() => { status.textContent = 'Sem leitura de movimento. Mova o reflexo com o toque.'; }, 4000);
  } catch { status.textContent = 'Movimento indisponível. Mova o reflexo com o toque.'; }
  finally { motion.disabled = false; }
});
addEventListener('pagehide', event => {
  cancelAnimationFrame(selectionFrame); selectionFrame = 0; clearTimeout(permissionTimer);
  if (!event.persisted) { renderer.dispose(); removeEventListener('deviceorientation', orientation); }
});
addEventListener('pageshow', () => { positionSelection(true); renderer.requestRender(); });
