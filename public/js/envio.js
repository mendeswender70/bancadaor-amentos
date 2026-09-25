// Envio da proposta ao cliente: link para ver e aprovar online (principal)
// ou o PDF. Usado no editor e na lista de orçamentos.

import { formatarNumero } from '/shared/calc.js';
import { api, cache } from './api.js';
import { h, icone, campo, abrirModal, aviso, avisoErro, copiarTexto } from './ui.js';
import { numeroWhatsApp } from './comum.js';

export const MENSAGEM_PADRAO =
  'Olá, {cliente}! Segue a proposta dos móveis planejados conforme conversamos. Qualquer dúvida estou à disposição.';

/** Endereço completo da proposta (cria o link na primeira vez). */
export async function linkDaProposta(orcamentoId) {
  const { caminho } = await api.post(`/orcamentos/${orcamentoId}/link`);
  return `${location.origin}${caminho}`;
}

/** Mensagem da empresa com o nome do cliente e o link da proposta. */
export function montarMensagem(modelo, { cliente, link }) {
  const primeiroNome = String(cliente || '').trim().split(/\s+/)[0] || '';
  let texto = (modelo || MENSAGEM_PADRAO).replaceAll('{cliente}', primeiroNome).trim();
  if (link) {
    texto = texto.includes('{link}') ? texto.replaceAll('{link}', link) : `${texto}\n\nVeja e aprove a proposta por aqui: ${link}`;
  } else {
    texto = texto.replaceAll('{link}', '').trim();
  }
  return texto;
}

/**
 * Abre o diálogo de envio. Devolve true se o usuário quis marcar o orçamento
 * como "Enviado".
 * @param {{ id: number, numero: number, status: string, cliente: {nome?: string, whatsapp?: string, telefone?: string} }} orc
 * @param {{ avisos?: string[], prepararPdf?: () => Promise<File|null> }} [opcoes]
 */
export async function abrirEnvio(orc, { avisos = [], prepararPdf } = {}) {
  let link;
  try {
    link = await linkDaProposta(orc.id);
  } catch (erro) {
    avisoErro(erro);
    return false;
  }
  const empresa = await cache.carregarEmpresa();
  const numero = numeroWhatsApp(orc.cliente?.whatsapp || orc.cliente?.telefone);
  const titulo = `Proposta nº ${formatarNumero(orc.numero)}`;

  return abrirModal('Enviar ao cliente', (fechar) => {
    const texto = h('textarea', { rows: '6', value: montarMensagem(empresa.mensagem_whatsapp, { cliente: orc.cliente?.nome, link }) });
    const marcar = h('input', { type: 'checkbox', checked: ['rascunho', 'expirado'].includes(orc.status) });
    const concluir = () => fechar(marcar.checked);
    const podeCompartilhar = Boolean(navigator.share);

    const botaoPdf = prepararPdf
      ? h(
          'button',
          {
            type: 'button',
            class: 'botao botao-bloco',
            onclick: async () => {
              aviso('Gerando o PDF…');
              const pdf = await prepararPdf();
              if (!pdf) return;
              if (navigator.canShare?.({ files: [pdf] })) {
                try {
                  await navigator.share({ files: [pdf], text: texto.value, title: titulo });
                  concluir();
                } catch (erro) {
                  if (erro.name !== 'AbortError') avisoErro(erro);
                }
                return;
              }
              const url = URL.createObjectURL(pdf);
              const a = h('a', { href: url, download: pdf.name });
              document.body.append(a);
              a.click();
              a.remove();
              setTimeout(() => URL.revokeObjectURL(url), 60_000);
              aviso('PDF baixado. Anexe na conversa com o cliente.');
            },
          },
          icone('pdf'),
          'Enviar o PDF em vez do link',
        )
      : null;

    return h(
      'div',
      { class: 'envio' },
      avisos.length
        ? h(
            'div',
            { class: 'aviso-caixa aviso-atencao', role: 'note' },
            icone('alerta', 'icone icone-mini'),
            h('div', {}, h('strong', {}, 'Antes de enviar, confira:'), h('ul', {}, avisos.map((a) => h('li', {}, a)))),
          )
        : null,
      h(
        'div',
        { class: 'link-proposta' },
        icone('link'),
        h('div', {}, h('strong', {}, 'Link da proposta'), h('span', {}, 'O cliente vê os ambientes e valores e aprova por ali — sem preço por metro.')),
        h(
          'div',
          { class: 'link-proposta-acoes' },
          h(
            'button',
            {
              type: 'button',
              class: 'botao botao-pequeno',
              onclick: async () => aviso((await copiarTexto(link)) ? 'Link copiado.' : 'Não foi possível copiar.', 'sucesso'),
            },
            icone('copiar'),
            'Copiar',
          ),
          h('a', { class: 'botao botao-pequeno', href: link, target: '_blank', rel: 'noopener' }, icone('externo'), 'Ver'),
        ),
      ),
      campo('Mensagem', texto),
      h(
        'div',
        { class: 'envio-passos' },
        h(
          'button',
          {
            type: 'button',
            class: 'botao botao-whatsapp botao-grande botao-bloco',
            onclick: () => {
              window.open(`https://wa.me/${numero}?text=${encodeURIComponent(texto.value)}`, '_blank', 'noopener');
              concluir();
            },
          },
          icone('whatsapp'),
          numero ? 'Enviar pelo WhatsApp' : 'Abrir o WhatsApp com a mensagem',
        ),
        podeCompartilhar
          ? h(
              'button',
              {
                type: 'button',
                class: 'botao botao-bloco',
                onclick: async () => {
                  try {
                    await navigator.share({ text: texto.value, title: titulo });
                    concluir();
                  } catch (erro) {
                    if (erro.name !== 'AbortError') avisoErro(erro);
                  }
                },
              },
              icone('compartilhar'),
              'Compartilhar por outro app',
            )
          : null,
        botaoPdf,
      ),
      h('label', { class: 'caixa-marcar' }, marcar, ' Marcar orçamento como “Enviado”'),
    );
  }).then(Boolean);
}
