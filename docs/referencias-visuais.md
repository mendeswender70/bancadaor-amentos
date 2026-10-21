# Referências do redesign

Arquivo: [Esquadro no Figma](https://www.figma.com/design/4dG7c23I15PfkGhqT3TZwR).

| Área | Frame mobile | Frame desktop |
| --- | --- | --- |
| Login | `3:22` | `3:48` |
| Primeiro acesso | `163:3049` | `163:3082` |
| Painel | `8:15` | `10:51` |
| Orçamentos | `151:2623` | `151:2841` |
| Editor | `8:104`, `64:855`, `213:3134` | `64:946`, `213:3258` |
| Clientes | `8:137` | `206:3102` |
| Ficha e edição de cliente | `112:2318`, `112:2381` | `113:2330` |
| Novo orçamento | `112:2160` | `113:2227` |
| Ajustes | `8:179` | `95:1616` |
| Empresa e padrões | `94:1327`, `94:1572` | `95:1616` |
| Móveis e preços | `94:1398`, `94:1613` | `95:1753` |
| Pagamento | `94:1473`, `94:1669` | `95:1911` |
| Conta e senha | `94:1529`, `94:1723` | `95:2011` |
| Avisos e novidades | `124:2416`, `124:2470` | `124:2544` |
| Proposta em PDF | `77:970` (capa), `77:1002` (detalhes) | A4 |

O link público de aprovação segue a apresentação do PDF: mesma madeira,
capa, identificação, ambientes, investimento e condições, adaptados à tela.
A aprovação, o WhatsApp e o download continuam disponíveis na barra de ações.

## Assets e materiais

- `public/images/figma-madeira-original.jpg`: imagem original do arquivo, 520 × 924 px;
  hash do asset no Figma `52a267eb8247010b46a2cd77a994439717a337b5`.
- `public/images/figma-madeira-vidro.jpg`: camada de desfoque para a impressão em PDF.
- `public/icons/figma/`: exportações SVG dos componentes vetoriais, com a grade original.
- `public/css/icones.css`: máscaras com cores herdadas dos controles, compatíveis com a CSP.
- `public/css/figma.css` e `public/css/internas.css`: tipografia, composição e materiais
  de vidro, com os estados de foco, seleção e ação principal.

## Conferência

As referências foram comparadas com capturas do navegador em 390 × 844 e
1440 × 900 px. A conferência de layout também cobre 320, 430, 768 e 1024 px,
incluindo descrições extensas, listas grandes, formulários e barras fixas.

O cenário extenso do PDF contém seis ambientes, 48 itens e condições longas.
Os textos e o encerramento foram extraídos do PDF para conferir a presença
dos itens e os limites da página. Os dados de exemplo ficam fora do aplicativo.
