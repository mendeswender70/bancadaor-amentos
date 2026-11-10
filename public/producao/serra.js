// Modo serra: o plano corte a corte, em tela cheia, para seguir no celular ao
// lado da esquadrejadeira. Mostra a medida da guia em letra grande, quando
// girar a peça e a parte da vez no desenho. O andamento é salvo a cada passo.
import { detalharSolucao, expandirPecas, formatarCm, formatarMm, passosDaSerra, sobraAproveitavel } from '/shared/corte.js';
import { api } from '/js/api.js';
import { h, icone, substituir, aviso, avisoErro, abrirModal, confirmar } from '/js/ui.js';
import { aoSairDaPagina, irPara, manterTelaLigada, nomeChapa, plural, progresso as barraProgresso, ultimoLocal, guardarLocal } from './nucleo.js';
import { abrirVisualizador, coresDosMoveis, corDaPeca, desenharFolha } from './desenho.js';

// Abaixo disto (12 cm) o corte na guia paralela pede empurrador.
const TIRA_ESTREITA_MM = 120;

export async function abrirSerra(planoId) {
  const plano = await api.get(`/producao/planos/${planoId}`);
  if (!plano.resultado) {
    aviso('Calcule o plano antes de começar a cortar.', 'erro');
    irPara(`#/plano/${planoId}?aba=plano`);
    return;
  }
  const solucao = plano.resultado.solucoes[plano.resultado.escolhida];
  const vista = { pecas: plano.pecas, chapas: plano.chapas, fitas: plano.fitas, ajustes: plano.ajustes, retalhos: plano.retalhos, config: plano.config };
  const detalhes = detalharSolucao(vista, solucao);
  const passos = passosDaSerra(detalhes, { guiaParalelaMm: plano.config.guia_paralela_mm });
  const instancias = new Map(expandirPecas(plano.pecas).map((i) => [i.numero, i]));
  const cores = coresDosMoveis(plano.pecas);
  const somenteLeitura = Boolean(plano.concluido_em);
  let indice = Math.min(plano.progresso?.passo ?? 0, passos.length - 1);
  const estragadas = new Set(plano.progresso?.estragadas || []);
  const retalhosUsados = new Set();
  const sobrasMarcadas = new Map(); // folha -> Set de índices de sobra marcados para guardar
  let salvando = Promise.resolve();

  const k = plano.ajustes.serra_decimos_mm / 10;
  const linhaPeca = (numero) => {
    const inst = instancias.get(numero);
    const p = plano.pecas[inst.indice];
    const cor = h('span', { class: 'p-cor' });
    cor.style.setProperty('--cor', corDaPeca(cores, p));
    return { cor, texto: `#${inst.indice + 1} ${p.descricao || 'Peça'}`, medida: `${formatarCm(p.comprimento_mm)} × ${formatarCm(p.largura_mm)} cm`, grupo: p.grupo };
  };

  // ------------------------------------------------------------- Salvar
  function salvar(extra = {}) {
    if (somenteLeitura) return Promise.resolve();
    const corpo = { passo: indice, total: passos.length, estragadas: [...estragadas], retalhos_usados: [...retalhosUsados], escolhida: plano.resultado.escolhida, ...extra };
    salvando = salvando
      .catch(() => {})
      .then(() => api.put(`/producao/planos/${planoId}/progresso`, corpo))
      .catch((erro) => {
        aviso(erro.status ? erro.message : 'Sem conexão: o andamento será salvo no próximo passo.', 'erro');
        throw erro;
      });
    return salvando;
  }

  // ------------------------------------------------------------- Tela
  const corpoEl = h('div', { class: 'serra-corpo' });
  const acoesEl = h('div', { class: 'serra-acoes' });
  const tituloEl = h('strong', {});
  const contadorEl = h('span', {});
  const barra = h('div', { class: 'p-progresso', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(passos.length) });
  const fechar = () => irPara(`#/plano/${planoId}?aba=plano`);
  const tela = h(
    'div',
    { class: 'serra', role: 'dialog', 'aria-modal': 'true', 'aria-label': `Cortando ${plano.nome}` },
    h('div', { class: 'serra-topo' }, h('div', { class: 'serra-topo-texto' }, tituloEl, contadorEl), h('button', { type: 'button', class: 'botao-icone', 'aria-label': 'Sair do modo serra', onclick: fechar }, icone('mais', 'icone girar45'))),
    barra,
    corpoEl,
    acoesEl,
  );
  document.body.append(tela);
  document.body.classList.add('serra-aberta');
  manterTelaLigada(true);
  const religar = () => document.visibilityState === 'visible' && manterTelaLigada(true);
  document.addEventListener('visibilitychange', religar);
  const teclas = (e) => {
    if (document.querySelector('dialog[open]')) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      acoesEl.querySelector('.botao-primario')?.click();
    } else if (e.key === 'ArrowLeft' || e.key === 'Backspace') {
      e.preventDefault();
      voltar();
    }
  };
  document.addEventListener('keydown', teclas);
  const encerrar = () => {
    tela.remove();
    document.body.classList.remove('serra-aberta');
    document.removeEventListener('visibilitychange', religar);
    document.removeEventListener('keydown', teclas);
    manterTelaLigada(false);
  };
  const verificar = async () => {
    await salvando.catch(() => {});
    encerrar();
    return true;
  };
  verificar.sincrono = () => true;
  aoSairDaPagina(verificar);

  const feitasAte = (limite) => new Set(passos.slice(0, limite).flatMap((p) => p.produz));

  function mapa(passo) {
    const d = detalhes[passo.folha];
    // Na serra a fita não importa: sem ela, as únicas linhas fortes são os cortes.
    const opcoes = { pecas: plano.pecas, cores, feitas: feitasAte(indice), estragadas, cotas: false, fita: false };
    if (passo.tipo === 'corte') {
      opcoes.regiao = passo.regiao;
      if (passo.parte) opcoes.parte = passo.parte.regiao;
      const r = passo.regiao;
      const fimParte = passo.parte ? (passo.eixo === 'y' ? passo.parte.regiao.y + passo.parte.regiao.h : passo.parte.regiao.x + passo.parte.regiao.w) : (passo.eixo === 'y' ? r.y : r.x);
      opcoes.corte = { eixo: passo.eixo, pos: fimParte + (passo.parte ? k / 2 : 0), de: passo.eixo === 'y' ? r.x : r.y, ate: passo.eixo === 'y' ? r.x + r.w : r.y + r.h };
    }
    const desenho = desenharFolha(d, opcoes);
    return h(
      'button',
      {
        type: 'button',
        class: 'serra-mapa p-desenho-botao',
        'aria-label': 'Ver a chapa inteira',
        onclick: () => abrirVisualizador(`Chapa ${d.ordem} · ${nomeChapa(d.chapa)}`, (aoTocar) => desenharFolha(d, { ...opcoes, aoTocar })),
      },
      desenho,
    );
  }

  const descreverParte = (parte) => {
    if (!parte) return null;
    if (parte.tipo === 'peca') {
      const l = linhaPeca(parte.numero);
      return h('span', {}, l.cor, ' ', h('strong', {}, l.texto), ` · ${l.medida}${l.grupo ? ` · ${l.grupo}` : ''}`);
    }
    if (parte.tipo === 'parte') return h('span', {}, h('strong', {}, `Faixa ${parte.rotulo}`), ` · vira ${plural(parte.pecas.length, 'peça', 'peças')}`);
    const r = parte.regiao;
    return h('span', {}, h('strong', {}, 'Sobra'), sobraAproveitavel(r.w, r.h, plano.config) ? ' · boa para guardar no fim da chapa' : ' · pode descartar');
  };

  // Lembrete antes do primeiro corte (NR-12 / ISO 19085-5: proteção sobre o
  // disco, cutelo divisor contra o retrocesso, empurrador para peça estreita).
  const antesDeLigar = () =>
    h(
      'section',
      { class: 'serra-checklist' },
      h('strong', {}, icone('alerta', 'icone icone-mini'), 'Antes de ligar a serra'),
      h(
        'ul',
        {},
        h('li', {}, 'Coifa (proteção sobre o disco) e cutelo divisor no lugar'),
        h('li', {}, 'Disco de 1 a 1,5 cm acima da chapa'),
        h('li', {}, 'Riscador alinhado com o disco, se a serra tiver'),
        h('li', {}, 'Empurrador à mão e nada acumulado embaixo da máquina'),
      ),
    );

  function telaPasso(passo) {
    const d = detalhes[passo.folha];
    if (passo.tipo === 'chapa') {
      const fonte = d.retalho_id ? `Retalho R${d.retalho_id}` : 'Chapa nova';
      return [
        h(
          'section',
          { class: 'serra-instrucao' },
          h('span', { class: 'serra-rotulo' }, d.retalho_id ? 'Pegue o retalho' : 'Pegue a chapa'),
          h('p', { class: 'serra-titulo' }, nomeChapa(d.chapa)),
          h('p', { class: 'serra-texto' }, `${fonte} · ${formatarCm(d.medidas.comprimento_mm)} × ${formatarCm(d.medidas.largura_mm)} cm${d.chapa.veio ? ' · veio no comprimento' : ''}`),
          d.retalho ? h('p', { class: 'serra-resto' }, `Está em: ${d.retalho.local || 'local não informado'}`) : null,
          d.iguais > 1 ? h('p', { class: 'serra-resto' }, `Chapa ${d.posicaoIgual} de ${d.iguais} iguais: os cortes se repetem.`) : null,
          h('p', { class: 'serra-texto' }, `Nesta chapa: ${plural(d.colocadas.length, 'peça', 'peças')}.`),
          h('p', { class: 'serra-dica' }, icone('olho', 'icone icone-mini'), 'Face boa para cima: o disco desce cortando por cima.'),
        ),
        passo.folha === 0 ? antesDeLigar() : null,
        mapa(passo),
      ];
    }
    if (passo.tipo === 'refilo') {
      return [
        h(
          'section',
          { class: 'serra-instrucao' },
          h('span', { class: 'serra-rotulo' }, 'Esquadrejar a chapa'),
          h('div', { class: 'serra-medida' }, h('strong', {}, formatarCm(passo.refilo)), h('span', {}, 'cm')),
          h(
            'ol',
            { class: 'serra-ordem' },
            h('li', {}, 'No carro, refile um lado comprido: a borda de fábrica não serve de referência.'),
            h('li', {}, 'Gire a chapa, encoste a borda refilada no esquadro do carro e refile um lado curto.'),
          ),
          h('p', { class: 'serra-texto' }, 'As próximas medidas partem dessas duas bordas retas. Deixe a chapa parada no carro e empurre o carro, sem forçar a chapa contra o disco.'),
        ),
        mapa(passo),
      ];
    }
    if (passo.tipo === 'corte') {
      const comprido = passo.eixo === 'y' ? passo.regiao.w >= passo.regiao.h : passo.regiao.h >= passo.regiao.w;
      const guia =
        passo.guia === 'paralela'
          ? h('span', { class: 'serra-guia' }, icone('regua'), `Guia paralela em ${formatarCm(passo.medida)} cm`)
          : h('span', { class: 'serra-guia carro' }, icone('serra'), passo.acerto ? 'No carro, rente à borda' : `No carro: ${formatarCm(passo.medida)} cm no esquadro`);
      const resto = passo.resto
        ? passo.resto.tipo === 'peca'
          ? h('p', { class: 'serra-resto' }, 'Do outro lado fica ', descreverParte(passo.resto), `. Confira: ${formatarCm(passo.resto.medida)} cm.`)
          : passo.resto.tipo === 'parte'
            ? h('p', { class: 'serra-resto' }, 'Do outro lado fica a ', descreverParte(passo.resto), '.')
            : h('p', { class: 'serra-resto' }, 'Do outro lado fica ', descreverParte(passo.resto), '.')
        : null;
      // Tira estreita na guia paralela: a mão passa perto do disco.
      const estreita = passo.guia === 'paralela' && !passo.acerto && passo.medida < TIRA_ESTREITA_MM;
      return [
        passo.girar ? h('div', { class: 'serra-girar' }, icone('historico'), 'Gire a peça 90° antes deste corte') : null,
        estreita ? h('div', { class: 'serra-girar serra-perigo' }, icone('alerta'), 'Tira estreita: use o empurrador e mantenha a mão longe do disco') : null,
        h(
          'section',
          { class: 'serra-instrucao' },
          h('span', { class: 'serra-rotulo' }, passo.acerto ? 'Acerto da borda' : comprido ? 'Corte no comprimento' : 'Corte atravessado'),
          passo.acerto
            ? h('div', { class: 'serra-medida' }, h('strong', {}, formatarMm(passo.medida)), h('span', {}, 'mm'))
            : h('div', { class: 'serra-medida' }, h('strong', {}, formatarCm(passo.medida)), h('span', {}, 'cm')),
          guia,
          passo.acerto
            ? h('p', { class: 'serra-texto' }, 'Tire só uma tira fina para deixar a borda reta. A medida mostra a tira com o disco.')
            : h('p', { class: 'serra-separa' }, 'Separa: ', descreverParte(passo.parte)),
          resto,
        ),
        mapa(passo),
      ];
    }
    if (passo.tipo === 'fim_chapa') {
      const produzidas = new Map();
      for (const p of d.colocadas) {
        const chave = p.indice;
        produzidas.set(chave, (produzidas.get(chave) || 0) + 1);
      }
      // Vêm marcadas só as sobras grandes (0,15 m² ou mais); tiras pequenas, se quiser, a pessoa marca.
      if (!sobrasMarcadas.has(passo.folha)) sobrasMarcadas.set(passo.folha, new Set(passo.sobras.flatMap((sb, i) => (sb.w * sb.h >= 150_000 ? [i] : []))));
      const marcadas = sobrasMarcadas.get(passo.folha);
      const local = h('input', { type: 'text', maxlength: '80', value: ultimoLocal(), placeholder: 'Onde vai guardar? Ex.: prateleira A', 'aria-label': 'Local das sobras' });
      local.addEventListener('change', () => guardarLocal(local.value));
      tela.dataset.localSobras = '';
      local.addEventListener('input', () => {
        tela.dataset.localSobras = local.value;
      });
      tela.dataset.localSobras = local.value;
      return [
        h(
          'section',
          { class: 'serra-instrucao' },
          h('span', { class: 'serra-rotulo' }, d.retalho_id ? 'Retalho cortado' : `Chapa ${d.ordem} cortada`),
          h('p', { class: 'serra-titulo' }, `${plural(d.colocadas.length, 'peça pronta', 'peças prontas')}`),
          h(
            'ul',
            { class: 'serra-lista' },
            [...produzidas].map(([ind, n]) => {
              const p = plano.pecas[ind];
              const cor = h('span', { class: 'p-cor' });
              cor.style.setProperty('--cor', corDaPeca(cores, p));
              return h('li', {}, cor, h('span', {}, `#${ind + 1} ${p.descricao || 'Peça'}${p.grupo ? ` · ${p.grupo}` : ''}`), h('span', { class: 'num' }, `×${n}`));
            }),
          ),
        ),
        passo.sobras.length && !somenteLeitura
          ? h(
              'section',
              { class: 'serra-instrucao' },
              h('span', { class: 'serra-rotulo' }, 'Sobras boas desta chapa'),
              h('p', { class: 'serra-texto' }, 'Marque as que vai guardar. Elas entram no estoque de retalhos.'),
              passo.sobras.map((sb, i) => {
                const caixa = h('input', { type: 'checkbox', checked: marcadas.has(i), onchange: (e) => (e.target.checked ? marcadas.add(i) : marcadas.delete(i)) });
                return h('label', { class: 'caixa-marcar' }, caixa, h('span', { class: 'num' }, h('strong', {}, `${formatarCm(sb.w)} × ${formatarCm(sb.h)} cm`)));
              }),
              local,
            )
          : null,
      ];
    }
    // fim
    const lista = [...estragadas].map(linhaPeca);
    return [
      h(
        'section',
        { class: 'serra-instrucao' },
        h('span', { class: 'serra-rotulo' }, somenteLeitura ? 'Plano concluído' : 'Último passo'),
        h('p', { class: 'serra-titulo' }, 'Tudo cortado'),
        h('p', { class: 'serra-texto' }, `${plural(instancias.size - solucao.nao_cabem.length, 'peça', 'peças')} em ${plural(detalhes.length, 'folha', 'folhas')}.`),
        lista.length
          ? h(
              'div',
              {},
              h('p', { class: 'serra-separa' }, h('strong', {}, `${plural(lista.length, 'peça estragou', 'peças estragaram')}:`)),
              h('ul', { class: 'serra-lista' }, lista.map((l) => h('li', {}, l.cor, h('span', {}, l.texto), h('span', { class: 'num' }, l.medida)))),
              h('button', { type: 'button', class: 'botao botao-largo', onclick: criarRecorte }, icone('mais'), 'Criar plano de recorte'),
            )
          : null,
      ),
    ];
  }

  function desenhar() {
    const passo = passos[indice];
    const d = passo.folha !== undefined ? detalhes[passo.folha] : null;
    tituloEl.textContent = d ? `${d.retalho_id ? `Retalho R${d.retalho_id}` : `Chapa ${d.ordem} de ${detalhes.length}`} · ${nomeChapa(d.chapa)}` : plano.nome;
    const cortes = passos.filter((p) => p.tipo === 'corte');
    const feitos = passos.slice(0, indice).filter((p) => p.tipo === 'corte').length;
    contadorEl.textContent = `Passo ${indice + 1} de ${passos.length} · ${feitos} de ${cortes.length} cortes`;
    substituir(barra, barraProgresso(indice / Math.max(1, passos.length - 1)));
    barra.setAttribute('aria-valuenow', String(indice));
    substituir(corpoEl, telaPasso(passo));
    corpoEl.scrollTop = 0;
    const principal = {
      chapa: 'Peguei',
      refilo: 'Refilei',
      corte: 'Cortei',
      fim_chapa: passo.tipo === 'fim_chapa' && passo.sobras.length && !somenteLeitura ? 'Guardar sobras e seguir' : 'Seguir',
      fim: somenteLeitura ? 'Voltar ao plano' : 'Concluir o plano',
    }[passo.tipo];
    substituir(
      acoesEl,
      h('button', { type: 'button', class: 'botao botao-primario', onclick: avancar }, passo.tipo === 'corte' ? icone('check') : null, principal),
      h('button', { type: 'button', class: `botao${passo.produz.length && !somenteLeitura ? '' : ' unico'}`, onclick: voltar, disabled: indice === 0 }, icone('voltar'), 'Voltar'),
      passo.produz.length && !somenteLeitura ? h('button', { type: 'button', class: 'botao botao-perigo-texto', onclick: () => marcarEstrago(passo) }, icone('alerta'), 'Estragou') : null,
    );
  }

  async function marcarEstrago(passo) {
    const numeros = passo.produz;
    const escolhidas =
      numeros.length === 1
        ? numeros
        : await abrirModal('Qual peça estragou?', (fecharModal) =>
            h(
              'div',
              { class: 'formulario' },
              numeros.map((n) => {
                const l = linhaPeca(n);
                return h('button', { type: 'button', class: 'botao botao-largo', onclick: () => fecharModal([n]) }, l.cor, `${l.texto} · ${l.medida}`);
              }),
            ),
          );
    if (!escolhidas?.length) return;
    for (const n of escolhidas) {
      if (estragadas.has(n)) estragadas.delete(n);
      else estragadas.add(n);
    }
    const marcou = escolhidas.some((n) => estragadas.has(n));
    aviso(marcou ? 'Anotado. No fim, você cria o plano de recorte.' : 'Peça desmarcada.');
    salvar().catch(() => {});
    desenhar();
  }

  async function guardarSobras(passo) {
    const marcadas = [...(sobrasMarcadas.get(passo.folha) || [])];
    if (!marcadas.length) return;
    const d = detalhes[passo.folha];
    const local = tela.dataset.localSobras || '';
    guardarLocal(local);
    await api.post('/producao/retalhos', {
      origem_plano_id: plano.id,
      retalhos: marcadas.map((i) => ({ chapa_id: d.chapa.id, comprimento_mm: Math.floor(passo.sobras[i].w), largura_mm: Math.floor(passo.sobras[i].h), local })),
    });
    aviso(`${plural(marcadas.length, 'retalho guardado', 'retalhos guardados')} no estoque.`);
    sobrasMarcadas.set(passo.folha, new Set());
  }

  async function avancar() {
    const passo = passos[indice];
    if (somenteLeitura) {
      if (passo.tipo === 'fim') return fechar();
      indice++;
      return desenhar();
    }
    if (passo.tipo === 'fim_chapa') {
      try {
        await guardarSobras(passo);
      } catch (erro) {
        avisoErro(erro);
        return;
      }
      const d = detalhes[passo.folha];
      if (d.retalho_id) retalhosUsados.add(d.retalho_id);
    }
    if (passo.tipo === 'fim') {
      if (estragadas.size && !(await confirmar('Concluir sem criar o plano de recorte das peças estragadas?', { sim: 'Concluir mesmo assim' }))) return;
      indice = passos.length;
      try {
        await salvar({ passo: passos.length, concluido: true });
        aviso('Plano concluído. Bom trabalho!');
        fechar();
      } catch {
        indice = passos.length - 1;
      }
      return;
    }
    indice++;
    if (navigator.vibrate) navigator.vibrate(12);
    salvar().catch(() => {});
    desenhar();
  }

  function voltar() {
    if (indice === 0) return;
    indice--;
    if (!somenteLeitura) salvar().catch(() => {});
    desenhar();
  }

  async function criarRecorte() {
    const porLinha = new Map();
    for (const n of estragadas) {
      const inst = instancias.get(n);
      porLinha.set(inst.indice, (porLinha.get(inst.indice) || 0) + 1);
    }
    const pecas = [...porLinha].map(([ind, quantidade]) => ({ ...plano.pecas[ind], quantidade }));
    try {
      await salvar({ passo: passos.length, concluido: true });
      const novo = await api.post('/producao/planos', { recorte_de: plano.id, pecas });
      aviso('Plano de recorte criado com as peças estragadas.');
      irPara(`#/plano/${novo.id}?aba=plano`);
    } catch (erro) {
      avisoErro(erro);
    }
  }

  desenhar();
}
