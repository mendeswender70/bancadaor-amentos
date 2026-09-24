import { formatarDinheiro } from '/shared/calc.js';
import { api, cache } from '../api.js';
import { h, icone, vazioIlustrado } from '../ui.js';
import { listaOrcamentos } from '../comum.js';
import { usuarioAtual } from '../main.js';

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

function indicador(nomeIcone, cor, rotulo, valor, href, detalhe) {
  return h(
    'a',
    { href, class: 'indicador' },
    h('span', { class: `selo-icone ${cor}` }, icone(nomeIcone)),
    h('div', {}, h('span', { class: 'indicador-rotulo' }, rotulo), h('strong', { class: 'indicador-valor' }, valor)),
    detalhe ? h('span', { class: 'indicador-detalhe' }, detalhe) : null,
  );
}

function atalho(nomeIcone, titulo, texto, href) {
  return h(
    'a',
    { href, class: 'atalho' },
    h('span', { class: 'selo-icone' }, icone(nomeIcone)),
    h('div', {}, h('strong', {}, titulo), h('span', {}, texto)),
    icone('seta', 'icone linha-seta'),
  );
}

function saudacao() {
  const hora = new Date().getHours();
  const nome = (usuarioAtual()?.nome || '').split(/\s+/)[0];
  const periodo = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';
  return nome ? `${periodo}, ${nome}!` : `${periodo}!`;
}

export async function paginaDashboard() {
  const d = await api.get('/dashboard');
  const agora = new Date();
  const mes = MESES[agora.getMonth()];
  const dataHoje = agora.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });

  return h(
    'div',
    { class: 'pagina' },
    h(
      'div',
      { class: 'saudacao' },
      h('h1', {}, saudacao()),
      h('p', {}, `${dataHoje.charAt(0).toUpperCase()}${dataHoje.slice(1)} · ${cache.empresa?.nome || ''}`),
    ),
    h(
      'a',
      { href: '#/orcamentos/novo', class: 'chamada-novo' },
      h('span', { class: 'selo-icone' }, icone('mais', 'icone icone-grande')),
      h('div', {}, h('strong', {}, 'Novo orçamento'), h('span', {}, 'Escolha o cliente, os ambientes e os móveis')),
      icone('seta', 'icone icone-seta'),
    ),
    h(
      'div',
      { class: 'indicadores' },
      indicador('orcamentos', '', `Orçamentos em ${mes}`, String(d.mes.quantidade), '#/orcamentos'),
      indicador('relogio', 'alerta', 'Em aberto', String(d.em_aberto), '#/orcamentos?status=abertos', 'Aguardando o cliente'),
      indicador('aprovado', 'sucesso', `Aprovados em ${mes}`, String(d.mes.aprovados), '#/orcamentos?status=aprovado', formatarDinheiro(d.mes.aprovados_cents)),
      indicador('dinheiro', 'info', `Valor orçado em ${mes}`, formatarDinheiro(d.mes.valor_cents), '#/orcamentos'),
    ),
    h(
      'div',
      { class: 'colunas colunas-2-1' },
      h(
        'section',
        { class: 'cartao' },
        h('div', { class: 'cartao-titulo' }, h('h2', {}, 'Orçamentos recentes'), h('a', { href: '#/orcamentos' }, 'Ver todos')),
        d.recentes.length
          ? listaOrcamentos(d.recentes)
          : vazioIlustrado(
              'orcamentos',
              'Nenhum orçamento ainda',
              'Crie o primeiro: escolha o cliente, adicione os ambientes e informe as medidas.',
              h('a', { href: '#/orcamentos/novo', class: 'botao botao-primario' }, icone('mais'), 'Criar orçamento'),
            ),
      ),
      h(
        'section',
        { class: 'cartao' },
        h('h2', {}, 'Atalhos'),
        h(
          'div',
          { class: 'atalhos' },
          atalho('clientes', 'Clientes', 'Cadastrar e procurar clientes', '#/clientes'),
          atalho('preco', 'Tabela de preços', 'Preço por metro e por m²', '#/config/precos'),
          atalho('caixa', 'Tipos de móveis', 'Guarda-roupa, cozinha, painel…', '#/config/tipos'),
          atalho('empresa', 'Dados da empresa', 'Logo e informações do PDF', '#/config/empresa'),
        ),
      ),
    ),
  );
}
