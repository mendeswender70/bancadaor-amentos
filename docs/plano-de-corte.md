# Plano de corte no esquadro — proposta

Pesquisa e plano feitos em 10/11/2026.

## Situação

**Fase 1 implementada** (10/11/2026). Como a marcenaria corta na própria serra,
o roteiro de cortes (que estava na fase 2) entrou já na fase 1. Diferenças em
relação ao plano original:

- **Modos.** O plano previa "Faixas" (padrão) e "Aproveitamento". No teste com
  um guarda-roupa real, o modo só em faixas gastou 6 chapas onde o mínimo era 5.
  Por isso o padrão virou **Menos chapas**: menor número de chapas e, entre
  planos empatados, o roteiro com menos reposicionamentos na serra. **Só faixas**
  continua como opção para quem prefere simplicidade.
- **Chapa padrão.** Com mais de uma chapa cadastrada, a pessoa escolhe a chapa
  antes de digitar as peças. O app não sugere uma, porque uma chapa errada
  estraga o plano.
- **Validação.** O servidor não calcula de novo: ele confere o desenho recebido,
  incluindo se ele sai só com cortes de ponta a ponta. A mesma função gera o
  roteiro de cortes.
- **Testes.** Otimizador (incluindo 25 listas aleatórias com várias serras,
  refilos e modos), conferência de resultados adulterados, API e garantia de
  que nada vai para o cliente. O critério de aceite com projetos reais
  (comparar com o CutList Optimizer) ainda precisa ser feito pela marcenaria.

Próximo passo sugerido: usar em 2 ou 3 projetos reais antes de começar a fase 2.

## 1. O problema de partida

O esquadro foi feito para **não** calcular peça por peça: o móvel é orçado por
metro linear, m² ou unidade. Um plano de corte só existe com uma **lista de
peças** (comprimento × largura × quantidade × material). Por isso o plano de
corte não deve entrar no fluxo de orçamento. Ele entra **depois**, como etapa de
produção, quando o orçamento já foi aprovado (ou de forma avulsa).

O fluxo de venda continua rápido e o plano de corte fica para a hora de
produzir.

## 2. O que o mercado faz (pesquisa)

| Ferramenta | Tipo | O que vale copiar | Observação |
| --- | --- | --- | --- |
| **HOMAG Cut Rite / intelliDivide** | Indústria (seccionadoras) | Objetivos de otimização (menos perda, menos tempo de corte, menos manuseio); sobras com dimensão mínima definida e reaproveitadas; etiquetas por peça; respeito ao veio | Referência mundial; caro e complexo. HOMAG cita economia média de 11,5% de material (número do próprio fabricante) |
| **Corte Certo** (BR) | Desktop, marcenaria/indústria | Etiquetas com código de barras, separação de lotes por cliente, etiqueta de retalho com local no estoque, exportação para seccionadora | 25+ anos de mercado; licença 2D Standard US$ 1.030 e Plus US$ 2.300 no site |
| **Promob (Plano de Corte)** | Projeto 3D + corte | Parâmetros de serra: espessura da lâmina, refilo, "resto na fase" | Plano sai do projeto 3D |
| **CorteCloud** (BR) | Online, gratuito para o marceneiro | Liga quem projeta à empresa que corta, fita e fura | Modelo de "mandar para a loja cortar" |
| **CutList Optimizer** | Web + app | Veio por peça e por chapa, fita de borda por lado, etiquetas, estoque de chapas, estatísticas (área usada, perda, nº de cortes, metros de corte) | O mais conhecido no navegador; planos pagos baratos |
| **MaxCut / OptiCutter / SketchCut** | Desktop / web / celular | Kerf, margens, sobras, etiquetas, orçamento de material | SketchCut é o exemplo de uso na oficina pelo celular |
| **OpenCutList** | Extensão SketchUp, código aberto | Lista de peças + diagramas + etiquetas com QR a partir do modelo 3D | — |

Não consegui confirmar pelas fontes oficiais o que o **Dinabox** e o **Gabster**
fazem no plano de corte. As únicas menções encontradas foram de terceiros.

**O que todos têm em comum (é o mínimo esperado):**

1. Chapas cadastradas com medida, espessura e veio.
2. Espessura da serra (kerf) e refilo das bordas da chapa.
3. Peças com veio travado (não podem girar).
4. Fita de borda por lado da peça e total em metros.
5. Diagrama por chapa, com cotas, e porcentagem de aproveitamento.
6. Lista de compras: quantas chapas e quantos metros de fita.
7. Etiquetas por peça.
8. Sobras/retalhos reaproveitáveis.

**Algoritmo:** esquadrejadeira e seccionadora só fazem **cortes de ponta a
ponta (guilhotina)**. Algoritmos de "encaixe livre" (MaxRects, nesting) dão
layouts mais densos que **não podem ser cortados na serra**. A referência
clássica é o levantamento de Jukka Jylänki, *A Thousand Ways to Pack the Bin*,
que compara Guillotine, MaxRects, Skyline e Shelf. Para o esquadro, a família
certa é a **guilhotina**. Não achei biblioteca JavaScript madura de código
aberto que trate veio; esse ponto vai ser implementado à mão.

## 3. Onde o esquadro pode ser diferente

Ferramenta grátis de plano de corte já existe. Competir só com o otimizador não
vale o esforço. O diferencial possível é o que nenhuma delas tem:

1. **Ligação com o orçamento.** O plano nasce do orçamento aprovado, com os
   ambientes e o cliente já preenchidos.
2. **Custo de material contra o valor vendido.** Exemplo: "7 chapas de MDF
   branco 18 mm + 64 m de fita = R$ 2.580, ou 21% do valor deste móvel." Isso
   mostra se o preço por metro cobre o material. Fica só na área interna e
   nunca vai para o cliente.
3. **Feito para o celular**, em português de marceneiro (faixa, refilo, fita,
   veio, retalho).

## 4. Plano por fases

### Fase 1: plano de corte que funciona (MVP)

**Cadastro (Ajustes → Chapas e fitas)**
- Chapa: nome, espessura, comprimento × largura (ex.: 2750 × 1850 mm; conferir
  com o fornecedor), tem veio (sim/não), preço da chapa.
- Fita: nome, largura, preço por metro.

**Plano de corte**
- Criado a partir de um orçamento (botão no editor) ou avulso.
- Lista de peças agrupada por ambiente/móvel: descrição, comprimento,
  largura, quantidade, chapa, veio travado, fita em cada lado (C1, C2, L1, L2).
- Entrada rápida pensada no celular: digitar `720 x 550 x 2` e o campo seguinte
  já recebe o foco. Colar várias linhas de uma planilha também funciona.
- Ajustes do corte: espessura da serra (padrão 4 mm), refilo (padrão 10 mm por
  lado), modo **Faixas** (mais fácil de cortar, padrão) ou **Aproveitamento**.

**Otimizador**
- `public/shared/corte.js`, em JavaScript puro e sem dependência, no mesmo
  padrão do `calc.js`.
- Guilhotina com várias ordenações (área, maior lado, perímetro) e várias
  regras de divisão do espaço. Roda dezenas de combinações e fica com a melhor.
  Critério: menos chapas, depois a maior sobra aproveitável.
- O modo Faixas corta primeiro faixas no comprimento e depois as peças em cada
  faixa, que é como o marceneiro corta na esquadrejadeira.
- Roda em um **Web Worker**, para não travar o iPhone.
- O servidor **valida** o layout recebido: peças dentro da chapa, sem
  sobreposição, kerf respeitado, veio respeitado e todas as peças presentes.
  Repetir a otimização no servidor seria caro, e validar segue a regra de não
  confiar no navegador.

**Resultado**
- Resumo: nº de chapas por material, aproveitamento %, metros de fita por tipo,
  custo de material.
- Diagrama SVG por chapa, com cotas e número de cada peça. Tocar na peça mostra
  os detalhes.
- **PDF de produção** em A4 (diagramas + lista de peças) e **CSV** da lista de
  peças, para levar à loja de corte.

**Dados (migração 9)**
- `chapas`, `fitas`, `planos_corte` (com `orcamento_id` opcional, ajustes e
  resultado em JSON) e `plano_pecas`.
- Medidas em milímetros inteiros e dinheiro em centavos, como no resto do
  sistema.

**Testes**
- Unidade do otimizador: peças que não cabem, veio travado, kerf somado,
  refilo, quantidade alta, peça do tamanho exato da chapa útil.
- Validação de layout no servidor (layouts adulterados devem ser recusados).
- Garantia de que nada do plano de corte aparece em `visaoCliente.js`, no PDF
  do cliente ou no link `/p/`.
- **Aceite:** comparar o resultado com o CutList Optimizer em 3 projetos reais.
  O esquadro deve usar no máximo a mesma quantidade de chapas, ou uma a mais.

### Fase 2: produção

- Etiquetas por peça (A4 adesivo ou impressora térmica 100 × 50 mm) com cliente,
  ambiente, peça, medida, fita por lado e QR.
- Sequência de corte numerada (1ª faixa, 2º corte…) para seguir na serra.
- Bloco "Custo de material" no editor do orçamento, visível só para a empresa.
- Marcar chapas como cortadas (andamento da produção).

### Fase 3: só se as fases 1 e 2 forem usadas de verdade

- **Retalhos:** sobra acima de um tamanho mínimo vira estoque, com local
  guardado, e entra antes de chapa nova no próximo plano.
- **Módulos prontos:** gaveteiro, armário, nicho. Basta informar largura,
  altura e profundidade para gerar as peças. É o que liga o "metro linear" do
  orçamento ao plano de corte automaticamente, mas é a parte mais cara: é o
  território do Promob, do Dinabox e do Gabster.
- **Exportação para lojas de corte** (CorteCloud e outras), só depois de
  confirmar o formato que a loja aceita. Não encontrei documentação pública
  desses formatos.

### Fora do escopo

Nesting de peças curvas, CNC/G-code, projeto 3D e furação.

## 5. Riscos

- **Escopo:** o plano de corte pode virar um segundo produto. As fases existem
  para parar onde o uso real parar.
- **Peças erradas custam chapa.** Se o otimizador ou a lista tiverem erro, o
  prejuízo é material cortado errado. São necessários testes fortes e um aviso
  claro: "confira as medidas antes de cortar".
- **Fluxo real do usuário:** se o corte é feito na loja (Leo, GMad, CorteCloud),
  a loja já otimiza. Nesse caso o valor está na **lista de peças + estimativa
  de chapas/custo**, e o diagrama perde importância. Isso muda a prioridade da
  fase 1.

## Fontes

- HOMAG — Cut Rite: <https://www.homag.com/en/product-detail/software/work-preparation/cut-rite-cutting-optimization-software>
- HOMAG — intelliDivide Cutting: <https://homag.com/en/product-detail/software/work-preparation/intellidivide-cutting>
- HOMAG — Cutting Production Set: <https://www.homag.com/fileadmin/software/brochures/cutting-production-set/onepager-cutting-production-set-pt.pdf>
- Corte Certo: <https://cortecerto.com/software-de-plano-de-corte-para-mdf/>
- Promob — plano de corte: <https://suporte.promob.com/hc/articles/31119991354129>
- CorteCloud (conteúdo patrocinado): <https://www.tribunapr.com.br/conteudo-publicitario/mara-central-de-servicos/descubra-a-plataforma-cortecloud/>
- CutList Optimizer: <https://www.cutlistoptimizer.com/>
- Lista de 15 programas de plano de corte: <https://audiokit.com.br/artigos/programas-para-gerenciamento-de-planos-de-cortes.html>
- Jylänki, *A Thousand Ways to Pack the Bin* (repositório): <https://github.com/juj/RectangleBinPack>
- Fraunhofer AutoPanelSizer (guilhotina + veio): <https://scai.fraunhofer.de/en/products/software-autopanelsizer.html>
- OpenCutList (fórum SketchUp): <https://forums.sketchup.com/t/opencutlist-exporting-cut-lists-diagrams/177120>
