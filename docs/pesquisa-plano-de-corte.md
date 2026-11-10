# Pesquisa: plano de corte para marcenaria (nov/2026)

Pesquisa feita em 10/11/2026, em 8 frentes: sites do Brasil e de fora, YouTube do
Brasil e de fora, telas de programas, apps de celular, técnica na serra e
projeto → medidas. Tudo aqui vem dessas frentes, com link. O que elas não
conseguiram confirmar está marcado como **(não confirmado)**.

## 1. Resumo

- O "cortar passo a passo" do esquadro faz o que Altendorf (MAGIS Navi) e HOMAG (productionAssist) fazem na serra manual. Nenhum app de chapa para celular encontrado diz qual guia usar nem quando girar.
- Centímetro com vírgula é uma lacuna real: nenhum dos apps de chapa mais baixados diz trabalhar em cm (o SketchCut só tem mm e polegada).
- Anexar o projeto ao pedido é padrão na indústria (HOMAG, Cabinet Vision), mas quase nenhum app de celular faz. Ligar a peça à página do projeto é diferencial.
- A chapa padrão é 275 × 185 cm, mas a norma aceita ±5 mm e 2 mm/m fora de esquadro. Refilar e medir a chapa é obrigatório.
- IA lendo o PDF do arquiteto ainda erra (falta peça, inventa item). Só vale como rascunho revisado, e por último.
- Próximos passos: conferir "pedido × encaixado", unidade e versão em cada anexo, medida conferida na obra e ordem dos cortes pela guia.

## 2. O que a indústria e os melhores apps fazem

| Ferramenta | O que faz de relevante | Fonte |
| --- | --- | --- |
| Altendorf MAGIS Navi (tablet na esquadrejadeira) | Guia corte a corte, mostra a medida de cada corte manual, leva em conta o equipamento da máquina e pode mostrar o plano numa 2ª tela para o ajudante | [Altendorf](https://www.altendorf.com/en/altendorf-magis/magis-navi/) |
| HOMAG Cutting Production Set + app productionAssist | Serve para qualquer serra manual. Peças serradas ficam em cor, o app sugere a próxima e deixa retomar depois de parar | [HOMAG](https://homag.com/en/product-detail/software/production-management/cutting-production-set-the-cutting-assistant) |
| HOMAG (corte em tiras) | Cada tira tem um ID para retomar. Retalho acima do mínimo volta ao estoque; o material é reservado ao enviar o plano | [HOMAG 2021](https://www.homag.com/en/news-events/news/article/digital-tools-for-panel-dividing-updates-for-cutting-using-saws-nesting-machines) |
| HOMAG intelliDivide | Calcula várias soluções para escolher (menor desperdício ou manuseio mais simples) | [HOMAG](https://www.homag.com/en/product-detail/software/work-preparation/intellidivide-cutting) |
| HOMAG productionManager | Anexa desenhos e imagens a qualquer pedido. Retrabalho é registrado com imagens e comentários | [pasta digital](https://www.homag.com/en/news-events/news/article/the-digital-job-folder-brings-transparency-to-the-workshop), [LIGNA 2025](https://www.homag.com/en/company/news/news/article/apps-software-solutions-for-every-size-of-business) |
| Cabinet Vision Paperless Traveller | Pasta digital no celular: lista de corte, imagens, instruções de recorte e desenho atualizado sem reimprimir | [Hexagon](https://blog.manufacturing.hexagon.com/digital-transformation-in-manufacturing/connected-worker-solutions/ditch-the-paper-how-nexus-connected-worker-is-transforming-cabinet-shops/) |
| Felder F4Guide | Cada peça é ligada ao desenho 3D de onde saiu | [Felder](https://www.felder-group.com/en-us/products/f4solutions-software-c596305/software-f4guide-p596328) |
| Promob Cut Pro | Refilo por máquina ou por material (set/2026). O plano sai junto com a pasta "Desenhos" do projeto | [notas](https://suporte.promob.com/hc/pt-br/articles/31113167346321), [plano](https://suporte.promob.com/hc/articles/31119991354129) |
| Corte Certo | Estoque de chapas e retalhos. "Minipeças" em escala para pegar erro de digitação | [site](https://www.cortecerto.com), [minipeças](https://cortecerto.com/glossary/minipecas) |
| Cortecloud (centrais de corte) | Lista em mm, fita por lado (c1, c2, l1, l2) e validações antes de cortar | [API](https://apis.cortecloud.com.br/docs/guias/importacao-json/), [validações](https://ajuda.cortecloud.com.br/help/entendendo-e-resolvendo-problemas-de-validacao-de-pecas) |
| Calcme meX | Lê o PDF do arquiteto prancha por prancha. Cada item aponta para o módulo e a prancha de origem | [Calcme](https://www.calcme.com.br/mex) |
| Rogue Engineer (web, grátis) | Ordena os cortes pela posição da guia paralela, para mexer nela o mínimo | [site](https://rogueengineer.com/cut-list-optimizer/) |
| CutList Optimizer (iPhone) | Em 2026 ganhou imagens do projeto, acompanhamento do corte e número da peça no PDF | [App Store](https://apps.apple.com/br/app/cutlist-optimizer/id6465744401) |
| Cutrix e MDF Cut (Android) | Cutrix: 3 opções de plano e fita por lado. MDF Cut: estoque de retalhos com baixa automática | [Cutrix](https://play.google.com/store/apps/details?id=com.cutrix.cutrix&hl=pt_BR), [MDF Cut](https://play.google.com/store/apps/details?id=com.convickto.mdfcutpro&hl=pt_BR) |
| Módulo Odoo e servidos.ar | Odoo: tela em cm, cálculo em mm inteiros. servidos.ar: peças em cm, disco e fita em mm | [Odoo](https://apps.odoo.com/apps/modules/19.0/mierp_cutting_optimizer), [servidos.ar](https://servidos.ar/optimizador-corte-placas) |

**No Brasil:** 62% de 73 fábricas de móveis usam software de corte; nas micro,
46%. A maior dificuldade é falta de mão de obra qualificada (31,5% nas micro e
pequenas). Sem software, micro e pequenas perdem mais de 10% da chapa
([DYNA 2025](https://revistas.unal.edu.co/index.php/dyna/article/download/119380/95571/740222)).

**Preço na loja em nov/2026:** SketchCut PRO R$ 38,99 (Android) e R$ 49,90
(iPhone); CutList Optimizer (iPhone) R$ 24,90 por mês; Offcut US$ 6,99 uma vez;
CutList: Plywood Optimizer US$ 9,99 por mês ou US$ 49,99 por ano. Links na seção 10.

## 3. Vídeos recomendados no YouTube

> Os vídeos foram conferidos só por título, canal e descrição. O YouTube
> bloqueou a abertura das páginas, então **nenhum foi assistido**. Vale
> assistir antes de indicar para a equipe.

### Brasil

| Título | Canal | Link | Por que assistir |
| --- | --- | --- | --- |
| Cortes na esquadrejadeira: das tiras até as peças esquadrejadas | Marcos Felipe Moraes | [link](https://www.youtube.com/watch?v=s70ZezHVo8o) | Mesma lógica do passo a passo: tiras primeiro, depois peças |
| Cortando chapa sozinho na esquadrejadeira | Marcos Felipe Moraes | [link](https://www.youtube.com/watch?v=nzEFvGZDta8) | Chapa inteira sem ajudante, em marcenaria pequena |
| CORTES EM ESQUADREJADEIRA, REFINAMENTO DOS MDF | Marcenaria Fino Acabamento | [link](https://www.youtube.com/watch?v=w_FfIXALRxU) | Refilo de MDF 18 mm como etapa própria |
| Como cortar uma chapa irregular de maneira a coloca la no esquadro | feitodemadeira | [link](https://www.youtube.com/watch?v=LhaFLKFxvI0) | Primeiro corte de refilo em chapa ou retalho torto |
| Como Colocar o Esquadro Perfeito em Qualquer Serra Esquadrejadeira | ADANS SANTOS - Marcenaria de Sucesso | [link](https://www.youtube.com/watch?v=B9vNHck5si4) | Regular o esquadro da máquina |
| Como ajustar o Riscador da Esquadrejadeira FF 325 Inmes | Inmes Industrial Ltda | [link](https://www.youtube.com/watch?v=zQC73jbosz0) | Regulagem do riscador (outra marca, mesmo conceito) |
| Serra Esquadrejadeira de Precisão SE-3200/38 | Baldan Maquinas | [link](https://www.youtube.com/watch?v=jGZvIkwk5Ss) | Vídeo oficial do mesmo modelo da marcenaria |
| Esquadrejadeira de Precisão com Braço Articulável Baldan SE-3200/38 (MONTAGEM) | Elias Maquinas | [link](https://www.youtube.com/watch?v=a2HxSF7BsUY) | Montagem do modelo; os números técnicos citados não foram confirmados |
| COMO FAZER PLANO DE CORTE EM MDF - TUTORIAL COMPLETO... | KCF MÓVEIS PLANEJADOS | [link](https://www.youtube.com/watch?v=RNijdfNG4Fw) | Plano de corte feito por marcenaria de planejados |
| Como fazer PLANO DE CORTE de GRAÇA no CELULAR ou PC sem instalar nada | Canal da Poeira - Felipe Miranda | [link](https://www.youtube.com/watch?v=oU1EyU1C2os) | Mostra que o marceneiro já usa o celular para isso |
| Faça fácil plano de corte gratuito de chapa MDF com SketchCut aplicativo celular | ROMEO MARCENEIRO PRÁTICA NA MADEIRA | [link](https://www.youtube.com/watch?v=k_rawrUgCgI) | Um dos apps de plano de corte mais baixados no celular |
| COMO TIRAR MEDIDA DO PROJETO GUARDA ROUPA CASAL... | EU MARCENEIRO | [link](https://www.youtube.com/watch?v=fCZFHGn_QvY) | Tirar medidas do projeto para o plano: o caso do "Medir no projeto" |
| Como Calcular Medidas de Gavetas e Portas de MDF | DICAS DE MARCENEIRO + é FÉ | [link](https://www.youtube.com/watch?v=KswOSQfMnvU) | Porta e gaveta a partir do vão |
| Planilha para plano de corte de móveis | Marcenaria de Hoje | [link](https://www.youtube.com/watch?v=kaeaDErmY1E) | Descrição clara de cada peça ao pedir corte |
| CORTE CERTO 2025 - PLANO DE CORTE MDF | Cantinho do Profissa | [link](https://www.youtube.com/watch?v=bX-v82t-92M) | Como é o concorrente brasileiro pago |
| PLANO DE CORTE - COMO FIZ MINHA PRÓPRIA COZINHA? COM CORTECLOUD | Arq Francine Rocha | [link](https://www.youtube.com/watch?v=--ZZQ1xZQ0Q) | Como a lista vai para a central de corte |

### Internacionais

| Título | Canal | Link | Por que assistir |
| --- | --- | --- | --- |
| Software for EVERY sliding table saw - functions of Altendorf Magis | Altendorf GmbH | [link](https://www.youtube.com/watch?v=9OrbDOhiFAc) | Guia "corte a corte" na esquadrejadeira |
| Altendorf MAGIS - the digital saw guide | Daltons Machines | [link](https://www.youtube.com/watch?v=dKK-LRDmM1g) | Demonstração do MAGIS por revenda |
| 6. How do I create a layout plan in Magis Opti? | Altendorf GmbH | [link](https://www.youtube.com/watch?v=58NYSmgw5xI) | Como o MAGIS monta o plano |
| Cutting Production Set - The Cutting Assistant | HOMAG India | [link](https://www.youtube.com/watch?v=36zWcaUZjDc) | Andamento do corte no tablet (41 s) |
| Tutorial productionAssist Cutting (DE) - Erste Schritte | HOMAG | [link](https://www.youtube.com/watch?v=hJNkf1ATjE8) | Plano do escritório indo para o tablet (em alemão) |
| intelliDivide Cutting - Optimization software for cutting processes on saws | HOMAG India | [link](https://www.youtube.com/watch?v=EnQBvPG35ZU) | Vários planos para escolher |
| Order of operations for our Felder sliding table saw | Contemporary Woods | [link](https://www.youtube.com/watch?v=RDYxuLlUBEE) | Ordem das operações (sequência exata não confirmada) |
| Sliding table saw superiority: Straight line cutting into parallel ripping. | Sam Blasco | [link](https://www.youtube.com/watch?v=9AHMTuw_Ghg) | Refilo no carro e logo depois corte na guia paralela |
| Sliding table saw. How to set up and make crosscuts and rip cuts on sheet goods. | Bryce Comer Woodworks | [link](https://www.youtube.com/watch?v=mp4Ye93UcHg) | Ajuste, precisão e segurança |
| Handling and cutting sheet goods on sliding tablesaw | ExtremeWoodworker | [link](https://www.youtube.com/watch?v=cT6MejJihwU) | Manuseio de chapa BP; bom para treinar funcionário novo |
| Find an offcut before cutting new stock | SmartFACT | [link](https://www.youtube.com/watch?v=MSacT4l8_gU) | Procurar retalho antes de abrir chapa nova |
| PDF ➜ Cutlist in Seconds! - AI Tool for Interior Designers & Factories | ThinkMaya AI | [link](https://www.youtube.com/watch?v=XOGdG6xF80g) | IA do PDF para a lista (precisão não confirmada) |
| PDF Cutting List to Priced Quote with AI - AnyCutlist | AnyCutlist | [link](https://www.youtube.com/watch?v=2PPxWZNnULo) | Revisão das peças lidas antes do orçamento |

## 4. Convenções visuais dos diagramas de corte

Referência: capturas de tela do CutList Optimizer, optiCutter, MaxCut, Corte
Certo e SmartCut, feitas em nov/2026.

| Item | Como os programas fazem | Esquadro hoje |
| --- | --- | --- |
| Medidas | Comprimento na horizontal (em cima ou embaixo), largura girada 90° na esquerda, medida total da chapa na borda (CutList Optimizer, MaxCut, Corte Certo) | Número e "C×L" no centro da peça; cotas das faixas na lateral |
| Identificação | Corte Certo: número no canto. MaxCut: letra no centro. CutList Optimizer: nada. optiCutter: só cor e legenda | "#n" no centro, igual à lista |
| Cor | Peças iguais com a mesma cor | Cor por móvel |
| Sobra | Cinza-claro (CutList Optimizer), amarelo (MaxCut, Corte Certo) ou hachura diagonal (Corte Certo) | Hachura com a medida da sobra |
| Veio | Listras finas paralelas (CutList Optimizer); selo "No Grain" (MaxCut) | Listras na chapa com veio |
| Fita | Linha tracejada com legenda (MaxCut); no CutList Optimizer não foi visto (não confirmado) | Traço na borda que leva fita |
| Ordem dos cortes | Tabela numerada de cortes (CutList Optimizer); números junto às linhas no Corte Certo (não confirmado) | Corte da vez destacado no passo a passo |
| Unidade | Todos em mm; só o MaxCut escreve "mm" em cada peça | cm, sem unidade em cada peça |
| Chapas iguais | "x1" e "Layout 1 of 2" (MaxCut); "Repetition 1x" (optiCutter) | "×N iguais" |
| Digitar no celular | Nenhum tem tela própria: planilha espremida em 390 px | Formulário próprio do celular |

O esquadro já segue o principal: peça numerada, sobra separada da peça,
veio desenhado, fita na borda e chapas iguais agrupadas
([Corte Certo](https://cortecerto.com/suporte/telas/),
[MaxCut](https://maxcutsoftware.com/optimal-cutting-layouts/),
[CutList Optimizer](https://www.cutlistoptimizer.com/)).

**O que dá para melhorar:**

1. Números pequenos em círculo nas linhas de corte, na ordem do passo a passo, e no PDF uma lista como "3. Corte a 70 cm → sai a peça 4". Usuário do SketchCut diz que a sequência de cortes é "o mais importante para o marceneiro" ([Play Store](https://play.google.com/store/apps/details?id=com.fortali.mapcut&hl=pt_BR)).
2. Selo "sem veio" quando a chapa não tem veio, como o MaxCut.
3. Destacar com contorno a sobra que vai virar retalho no estoque.
4. No PDF, uma legenda com nº, nome, medida e quantidade na cor da peça, como o optiCutter ([imagem](https://www.opticutter.com/images/public/app-detail-2d.png)). Número e medida garantem a leitura em preto e branco.
5. Resumo no topo com número grande: chapas, aproveitamento em % e número de cortes.
6. No PDF, testar a medida na borda (comprimento na horizontal, largura girada à esquerda), que é o padrão das três referências, mantendo o número no centro.
7. Não escrever "cm" em cada peça; só no cabeçalho. No MaxCut isso polui o desenho.

## 5. Técnica na esquadrejadeira

Tipos de fonte: **Norma** = NR-12 e NBR ISO 19085-5, pela fiscalização do
trabalho. **Fabricante** = fabricante de chapa, disco ou máquina. **Fórum** =
prática de oficina e artigos. Fórum não é norma.

### O que o passo a passo orienta

| Orientação | Tipo | Fonte |
| --- | --- | --- |
| Refilar a borda de fábrica no carro, girar a chapa, esquadrejar a 2ª borda contra o esquadro e só então cortar as medidas. Não confiar na borda de fábrica | Fórum | [WOODWEB](https://www.woodweb.com/knowledge_base/Sliding_Table_Saw_Tips_and_Tricks.html), [dust cut](https://woodweb.com/knowledge_base/Dust_Cut_Procedures.html) |
| A chapa fica parada no carro; quem anda é o carro. Empurrar a chapa contra o disco dá corte torto | Fórum | [WOODWEB](https://www.woodweb.com/knowledge_base/Sliding_Table_Saw_Tips_and_Tricks.html) |
| Larguras grandes no carro, com esquadro e batente. Tiras estreitas (menos de uns 20 cm) na guia paralela, com o carro travado | Fórum | [WOODWEB](https://www.woodweb.com/knowledge_base/Sliding_Table_Saw_Tips_and_Tricks.html) |
| Primeiro as tiras (corte longo), depois as peças (corte transversal) | Vídeo de marceneiro | [Marcos Felipe Moraes](https://www.youtube.com/watch?v=s70ZezHVo8o) |
| Face boa para cima: o disco desce cortando a face de cima e o riscador protege a de baixo | Fórum (não confirmado) | [WOODWEB](https://woodweb.com/knowledge_base/Eliminating_Melamine_ChipOut.html) |
| Fazer croqui antes de marcar, começar pela medida que mais se repete e lembrar da espessura da serra | Fabricante | [Arauco](https://arauco.com/brasil/wp-content/uploads/sites/17/2018/06/miolo_guia_marceneiros-2.pdf) |
| Baldan SE-3200/38: 90 cm na guia paralela e curso de 320 cm | Dado da marcenaria; ficha oficial não achada (não confirmado) | [revenda](https://www.lojadomecanico.com.br/buscar/maquinas-baldan) |

### Alertas de segurança

A fiscalização do trabalho (MTE, setor moveleiro de SP) cobra da
esquadrejadeira, com base na NR-12 e na NBR ISO 19085-5:2020
([NES do MTE](https://www.gov.br/trabalho-e-emprego/pt-br/assuntos/inspecao-do-trabalho/aesmoveis/nes-aesmoveis.pdf)) — **Norma**:

- coifa (proteção) ajustável acima da mesa;
- faca ou cutelo divisor contra retrocesso (item 6.9.3);
- guia de corte reto ajustável e travável sem ferramenta (item 6.10);
- nada de aparas acumuladas embaixo da máquina (item 7.3).

Outros alertas:

- **Empurrador em peça estreita:** vem de fontes secundárias, como a [CBIC](https://cbic.org.br/maquinas-e-equipamentos-na-construcao-o-uso-da-serra-circular-de-bancada/). O texto da ISO 19085-5 sobre empurrador não foi lido (não confirmado). O limite em cm é regra da casa.
- **Altura do disco:** 10 a 15 mm acima da chapa, no máximo 15 mm, e máquina fixada ao chão — **Fabricante** ([Duratex](https://duratex-site-strapi.prd.cloud.dex.co/assets/cartilha_mdf_eucalipto_duratex_cc52fff71b.pdf)).

### Disco e riscador

- **Fabricante (Duratex):** dente reto-trapezoidal ou alternado, 48 dentes ou mais; 250 mm com 72 dentes ou 300 mm com 96 dentes; avanço de 25 a 30 m/min ([cartilha](https://duratex-site-strapi.prd.cloud.dex.co/assets/cartilha_mdf_eucalipto_duratex_cc52fff71b.pdf)).
- **Fabricante (Freud):** disco de 300 mm com 72 dentes corta 3,2 mm, para uso com riscador ([ficha](https://www.burnstools.com/lu3d21-300mm-x-3-2-x-30mm-x-72t-tcg)). Outros Freud de 300 e 250 mm também aparecem com 3,2 mm, mas só na busca (não confirmado).
- **Fabricante (manual de esquadrejadeira):** o riscador deve cortar na mesma largura do disco e alinhado com ele ([Grizzly G0820](https://www.manualslib.com/manual/1308557/Grizzly-G0820.html?page=50)).
- **Fórum:** lasca mesmo com riscador vem de riscador cego (cerca de 20 chapas de melamínico antes de afiar), chapa empenada levantando, folga no eixo e pressão lateral ([WOODWEB](https://woodweb.com/knowledge_base/Melamine_Chipping_on_a_Sliding_Table_Saw.html)).
- **Baldan SE-3200/38:** ficha oficial não achada. Disco de 300 mm e riscador de 125 mm aparecem só no resumo de um vídeo de montagem (não confirmado). Não dá para afirmar que a máquina da marcenaria tem riscador.

### Conferir o esquadro da máquina

- **Fórum/artigo:** método dos 5 cortes. Corta os 4 lados girando a peça 90°; no 5º corte tira uma tira estreita e mede nas duas pontas. A diferença é cerca de 4 vezes o erro de um corte ([The Wood Whisperer](https://thewoodwhisperer.com/articles/how-much-error-is-too-much/), [KM Tools](https://kmtools.com/pages/five-cut-method-calculator)). Algumas fontes dizem 5 vezes; a fórmula não foi confirmada em fonte oficial.
- Não existe tolerância oficial de corte (± mm) para esquadrejadeira em móveis planejados. Qualquer número no sistema é regra da casa.

## 6. Projeto do arquiteto → medidas

### Como a produção deve ler o projeto

- As cotas do projeto são **medidas totais** do móvel. A medida de corte sai delas pelas regras da oficina. Exemplos de um autor, que não são norma: interno da caixa de 18 mm = total − 2 × 1,8 cm; porta com 2 mm de folga por lado = vão − 0,4 cm ([artigo](https://sagnikbhattacharya.com/blog/joinery-ai-cutting-list-material-order)).
- Folga de porta e de gaveta: não há valor padrão confiável. Vale a tabela da dobradiça ou da corrediça usada (não confirmado). Um curso cita 12,7 mm por lado para corrediça telescópica (não confirmado) ([Cursa](https://cursa.app/pt/exercicios/marcenaria/instalacao-e-regulagem-de-ferragens-para-moveis)).
- Um bom detalhamento traz elevação, corte lateral, vista explodida, cotas por peça, material, fita, veio, ferragens, furação e lista de peças ([Cursa](https://cursa.app/pt/exercicios/designer-de-interiores/detalhamento-tecnico-de-marcenaria-planejada-residencial)).
- Desenhos costumam omitir fundo, fita e caixa de gaveta ([Cutlistor](https://www.cutlistor.com/blog/how-to-create-cabinet-cut-list-from-pdf)).
- Medida que passa de um programa para outro pode chegar arredondada: 1198 mm vira 1200 mm do SketchUp para o Promob ([Promob](https://suporte.promob.com/hc/pt-br/articles/36813691121553-Novo-Promob-Importar-SKP-Convers%C3%A3o-de-projetos-SKP-para-Promob)).

### O que anexar

- **PDF aprovado do arquiteto, com data.** Quando chegar um novo, o antigo deve ficar marcado como substituído. O Cabinet Vision entrega desenho atualizado sem reimprimir ([Hexagon](https://blog.manufacturing.hexagon.com/digital-transformation-in-manufacturing/connected-worker-solutions/ditch-the-paper-how-nexus-connected-worker-is-transforming-cabinet-shops/)). Registrar as versões aprovadas também aparece numa matéria de 2026 (não confirmado) ([Monitor do Mercado](https://monitordomercado.com.br/economia-2/415344-designer-de-marcenaria-transforma-centimetros-em-moveis-planejados-e-um-erro-no-projeto-pode-chegar-pronto-da-fabrica/)).
- **Página de interesse e uma descrição curta** (ex.: "pág. 4: elevação do armário da cozinha"). A prancha inteira fica ilegível no celular. Recortar o trecho é o conselho dado para a IA ([artigo](https://sagnikbhattacharya.com/blog/joinery-ai-cutting-list-material-order)) e vale também para quem lê na tela pequena.
- **Fotos da medição na obra** (trena, croqui anotado), separadas do projeto.
- O Promob já entrega o plano de corte junto com a pasta "Desenhos" ([Promob](https://suporte.promob.com/hc/articles/31119991354129)).

### Unidades: cm × mm

| Quem | Unidade | Fonte |
| --- | --- | --- |
| Fabricantes de chapa | mm | [Arauco](https://arauco-qas.arauco.com/brasil/wp-content/uploads/sites/17/2024/05/FICHA-TECNICA-MDF-TRUPAN-ARAUCO-2024.pdf) |
| Lojas de chapa | mm ("2750x1850mm") | [Leo Madeiras](https://www.leomadeiras.com.br/) |
| Centrais de corte | mm ("Todas as medidas são em milímetros") | [Cortecloud](https://apis.cortecloud.com.br/docs/guias/importacao-json/) |
| Promob | configurável na exportação | [Promob](https://suporte.promob.com/hc/en-us/articles/31121765519889-Builder-Cutting-Plans-Unit-of-Measure) |
| Desenho técnico de peça | mm (não confirmado) | [IFSC](https://wiki.ifsc.edu.br/images/c/c6/13-ARU_DEB_Escalas_e_Dimensionamento.pdf) |
| Arquitetura (NBR 6492) | m e cm (não confirmado) | [IFSC](https://wiki.ifsc.edu.br/images/c/c6/13-ARU_DEB_Escalas_e_Dimensionamento.pdf) |
| Marcenaria (conversa e obra) | cm | [Calcme](https://www.calcme.com.br/blog/como-fazer-plano-de-corte-mdf/) |
| Apps de celular mais baixados | nenhum diz trabalhar em cm (SketchCut: mm e polegada) | [SketchCut PRO](https://play.google.com/store/apps/details?id=com.fortali.sketchcutpro&hl=pt_BR) |

**O que o esquadro faz:** mostra e recebe em cm com vírgula, guarda em mm
inteiros e deixa disco e fita em mm. É o mesmo que o módulo Odoo ("para evitar
errores de punto flotante") e o servidos.ar fazem. **Feito agora:** aceita
"455 mm" e ponto de milhar, e avisa quando o número parece estar em mm também
nos retalhos e na edição de peça.

**Falta:** um campo "unidade das cotas" (cm / mm / não sei) em cada anexo. O PDF
pode vir em cm (planta) ou em mm (detalhamento), e 60 mm lido como 60 cm estraga
chapa.

### Conferência na obra

- Conferir no local (prumo, esquadro, nível, instalações) antes do corte definitivo; não cortar só pelo desenho 2D ([Olhar Digital](https://olhardigital.com.br/curiosidades/2026/09/27/marceneiro-revela-segredo-por-que-um-erro-de-apenas-2-na-medida-pode-impedir-uma-prateleira-de-encaixar/)).
- A Calcme põe "conferir as medidas na obra" como passo 1 do plano ([Calcme](https://www.calcme.com.br/blog/como-fazer-plano-de-corte-mdf/)).
- Reclamações de corte errado giram em torno de quem errou: medição, projeto ou corte. Só os títulos e resumos foram vistos (não confirmado) ([Reclame Aqui](https://www.reclameaqui.com.br/giacomo-casa-do-marceneiro/paguei-pelo-servico-de-corte-e-as-medidas-vieram-todas-erradas_Of56mxibbH5MQexV/)).

### IA lendo o PDF: estado real

- **No Brasil:** o Calcme meX lê o PDF "do jeito que chegou no seu WhatsApp" e liga cada item à prancha. A página diz que ele "não fecha negócio nem decide preço sozinho" ([Calcme](https://www.calcme.com.br/mex)). Promob, DinaBox e Gabster não anunciam leitura de PDF de terceiros ([DinaBox](https://dinabox.net), [Gabster](https://www.gabster.com.br)).
- **Fora:** o Cutlistor importa PDF e foto como rascunho, com 3 leituras grátis por mês ([Cutlistor](https://www.cutlistor.com/)). O MillworkSuite lê o conjunto de PDFs e tira as medidas pela escala, sem taxa de acerto publicada ([PR Newswire](https://www.prnewswire.com/news-releases/millworksuite-launches-ai-estimating-and-direct-to-cad-platform-that-cuts-drafting-time-in-half-302857729.html)). ThinkMaya e AnyCutlist mostram isso em vídeo (precisão não confirmada).
- **Grandes fornecedores:** a HOMAG usa IA para prever o tempo de corte, não para ler planta ([LIGNA 2025](https://www.homag.com/en/company/news/news/article/apps-software-solutions-for-every-size-of-business)). A Mozaik usa IA só para render (não confirmado) ([Mozaik](https://www.mozaiksoftware.com/resources/v15)).

**Riscos:**

- O melhor número publicado é 94,21% de acerto, em desenho **elétrico**, com recorte manual e ajuste por especialista; 4 páginas levaram cerca de 62 minutos. Lendo a página inteira, a IA omite, inventa ou troca itens ([Microsoft](https://techcommunity.microsoft.com/t5/microsoft-foundry-blog/extracting-boms-from-electrical-drawings-with-ai-azure-openai/ba-p/4506891)).
- Em marcenaria, a primeira lista da IA parecia profissional, mas faltou peça, faltaram folgas e a profundidade veio errada. Foto de prancha A1 inteira perde cotas pequenas ([artigo](https://sagnikbhattacharya.com/blog/joinery-ai-cutting-list-material-order)).
- Um chat de IA pode gerar "a plausible list that needs more sheets than it claims" ([artigo](https://sagnikbhattacharya.com/blog/carpenter-cutting-list-software-vs-ai)).
- Não há métrica publicada de acerto em desenho de armário.

**Quando valeria:**

- Só depois que os anexos tiverem unidade e versão, e o "Medir no projeto" estiver em uso. Cada peça já guarda o anexo e a página, a mesma ligação que o Calcme meX faz.
- Só como rascunho, revisado peça a peça, com "não consta" no lugar de chute.
- Com checagens automáticas: soma das peças = medida total, cada peça cabe na chapa, contagem de portas e gavetas, veio.
- A IA nunca monta o layout. O otimizador do esquadro continua responsável.

## 7. Tamanhos de chapa e tolerâncias no Brasil

| Fabricante | Formato principal | Outros formatos | Fonte |
| --- | --- | --- | --- |
| Arauco (MDF Trupan, 2024) | 275 × 185 cm (6 a 30 mm) | 244 × 185; 275 × 183 e 275 × 193 (18 mm); 275 × 210, 220, 240 e 244 | [ficha técnica](https://arauco-qas.arauco.com/brasil/wp-content/uploads/sites/17/2024/05/FICHA-TECNICA-MDF-TRUPAN-ARAUCO-2024.pdf) |
| Guararapes (Freijó) | 275 × 185 cm (6 a 25 mm) | — | [produto](https://www.guararapes.com.br/en/produto/freijo/) |
| Eucatex (Eucafibra BP) | 275 × 185 cm (6, 15 e 18 mm) | — | [AECweb](https://www.aecweb.com.br/produto/mdf-eucafibra-bp-raizes/50887) (fonte secundária) |
| Duratex/Dexco (catálogo 2023) | 275 × 185 cm | 244 × 185; 244 × 215; cru 244 × 122 | [catálogo](https://duratex-site-strapi.prd.cloud.dex.co/assets/Catalogo_Exportacion_54f1ac5313.pdf) |
| Duratex (cartilha 2017) | 275 × 184 cm | — | [cartilha](https://duratex-site-strapi.prd.cloud.dex.co/assets/cartilha_mdf_eucalipto_duratex_cc52fff71b.pdf) |
| Berneck | 275 cm × 185 a 220 cm (9 a 25 mm) (não confirmado) | — | [página](https://www.berneck.com.br/en/products/mdf-berneck) (deu erro 403) |

**Tolerâncias** (NBR 15.316-2:2024, na [ficha Berneck 2025](https://www.berneck.com.br/uploads/Ficha_Tecnica_HDF_e_MDF_Portugues_2025_3fc54fffed.pdf); a ficha Arauco 2024 traz os mesmos limites de comprimento, largura, esquadro e retilineidade):

| Item | Limite |
| --- | --- |
| Comprimento e largura | ±5,0 mm |
| Esquadro | até 2,0 mm por metro (cerca de 5,5 mm em 2,75 m) |
| Retilineidade | até 1,5 mm por metro |
| Espessura | ±0,2 a ±0,3 mm |

**O que isso quer dizer:**

- A borda de fábrica não serve de referência de esquadro. O refilo fica ligado por padrão (a Calcme usa 1 cm por lado no exemplo; o esquadro também usa 1 cm).
- A chapa deve ser medida com trena antes do 1º corte. Já existiu chapa de 184 cm de largura.
- Disco: o esquadro usa 4 mm como padrão. Discos Freud de 300 mm cortam 3,2 mm; a Calcme usa 4 mm no exemplo e o servidos.ar, 3 mm. Medir o disco real.
- Exemplo da Calcme: 1.830 mm divididos em 4 dão 457,5 mm, mas com 3 cortes de 4 mm o certo é 454,5 mm ([Calcme](https://www.calcme.com.br/blog/como-fazer-plano-de-corte-mdf/)).

## 8. O que o esquadro já tem × mercado

| Recurso | Esquadro | Quem mais tem |
| --- | --- | --- |
| Passo a passo corte a corte, medida grande | Sim | MAGIS Navi, HOMAG. No celular, só o Cutter (barras) e o CutList iPhone (acompanhamento) |
| Dizer a guia (paralela até 90 cm ou carro) e quando girar | Sim | Nenhum app de chapa no celular encontrado |
| Peças feitas em cor e retomada | Sim | HOMAG productionAssist |
| Até 3 soluções | Sim | intelliDivide, Cutrix, SketchCut PRO |
| Retalhos sem refilo, reservados e baixados | Sim | Estoque de retalhos: Corte Certo, Cortecloud, MDF Cut (baixa automática), HOMAG (reserva) |
| Chapas iguais e PDF por arranjo | Sim | MaxCut e optiCutter (chapas iguais); Offcut (PDF de uma página por chapa) |
| Peça estragada vira recorte | Sim | DinaBox ("Avarias e Reposições"), HOMAG, Cabinet Vision |
| Medidas em cm | Sim | Quase ninguém (módulo Odoo, servidos.ar) |
| Anexos (PDF e fotos) com zoom | Sim | HOMAG, Cabinet Vision. No celular, só o CutList iPhone (imagens) |
| Peça ligada ao anexo e à página | Sim (feito agora) | Calcme meX, Felder F4Guide |
| Conferir que todas as peças entraram | Parcial: o servidor confere e a tela lista as que não cabem | Cortecloud (validações) |
| Foto e motivo da peça estragada | Não | HOMAG productionManager |
| Etiquetas | Não usa (decisão da marcenaria) | HOMAG, MAGIS, PolyBoard |

**Feito agora, neste ciclo:**

- Checklist de segurança e "face boa para cima" no início do passo a passo ([NES do MTE](https://www.gov.br/trabalho-e-emprego/pt-br/assuntos/inspecao-do-trabalho/aesmoveis/nes-aesmoveis.pdf); face boa: fórum, não confirmado).
- Texto do refilo na ordem certa: lado comprido no carro, girar, esquadrejar o lado curto ([WOODWEB](https://www.woodweb.com/knowledge_base/Sliding_Table_Saw_Tips_and_Tricks.html)).
- Alerta de empurrador em tira estreita na guia paralela ([CBIC](https://cbic.org.br/maquinas-e-equipamentos-na-construcao-o-uso-da-serra-circular-de-bancada/); limite não confirmado em norma).
- Leitura de medida aceitando "455 mm" e ponto de milhar.
- Aviso de milímetro também em retalhos e na edição de peça.
- No "Medir no projeto", cada peça guarda de qual anexo e página veio a medida, com botão para abrir o projeto naquela página (como o [Calcme meX](https://www.calcme.com.br/mex)).
- Data do envio em cada anexo.
- Compartilhar o PDF do plano pelo celular (WhatsApp), como o [CorteFacil](https://play.google.com/store/apps/details?id=com.cortefacil.cortefacil_flutter&hl=pt_BR).
- Aviso "medida de corte = medida final, fita não descontada". Programas de fora costumam descontar a fita; no OptiCut é configurável, medida net × overall ([OptiCut](https://wooddesigner.org/help-centre/opticut-net-versus-overall-dimensions/)).
- Prancha grande (A1/A0) legível no celular: ao parar o zoom, o trecho visível é redesenhado na resolução da tela, para as cotas pequenas não borrarem. O zoom mínimo mostra a prancha inteira.
- Da revisão do código: PDF escaneado (imagens JPEG 2000 e JBIG2) abre; o PDF abre em iPhone com iOS 16.4 a 17.3; foto entra no iOS 15; planta em PNG com fundo transparente não fica preta; o envio tenta de novo quando o sinal cai e não deixa lixo no banco.

## 9. Próximos passos recomendados

Em ordem de prioridade.

1. **Usar em 2 ou 3 trabalhos reais e medir o disco.** Por quê: o padrão é 4 mm e discos Freud de 300 mm cortam 3,2 mm; a espessura do disco muda a medida das peças da tira (no exemplo da Calcme, 457,5 mm viram 454,5 mm). Fonte: [Freud](https://www.burnstools.com/lu3d21-300mm-x-3-2-x-30mm-x-72t-tcg), [Calcme](https://www.calcme.com.br/blog/como-fazer-plano-de-corte-mdf/).
2. **Mostrar "pedido × encaixado" em destaque antes de liberar para a serra.** Por quê: peça faltando é uma queixa grave em concorrentes (mais de 40 peças fora num plano do CutList iPhone). Fonte: [App Store](https://apps.apple.com/br/app/cutlist-optimizer/id6465744401); [Reclame Aqui](https://www.reclameaqui.com.br/serrabits-desenvolvimento-de-software/sistema-do-cortecloud-nao-sinalizou-conflito-de-medidas-e-gerou-impossibilidade-de-utilizacao-do-movel_9_Vnhg2oNsNqS8kF/) (não confirmado).
3. **Validações no estilo Cortecloud:** peça maior que a área útil, peça pequena demais, fita em lado menor que 10 cm ou com lado perpendicular menor que 8 cm, fita em chapa de 6 mm. Por quê: pegam erro antes de cortar. Fonte: [Cortecloud](https://ajuda.cortecloud.com.br/help/entendendo-e-resolvendo-problemas-de-validacao-de-pecas).
4. **Unidade e versão em cada anexo:** "unidade das cotas" (cm / mm / não sei) e selo "aprovado" ou "substituído". Por quê: o PDF pode vir em cm ou mm, e ninguém deve cortar por desenho velho. Fonte: [IFSC](https://wiki.ifsc.edu.br/images/c/c6/13-ARU_DEB_Escalas_e_Dimensionamento.pdf) (não confirmado), [Hexagon](https://blog.manufacturing.hexagon.com/digital-transformation-in-manufacturing/connected-worker-solutions/ditch-the-paper-how-nexus-connected-worker-is-transforming-cabinet-shops/).
5. **Marcar a medida como "do projeto" ou "conferida na obra"**, com quem e quando, e um tipo de anexo "medição na obra". Por quê: as fontes mandam conferir no local antes do corte. Fonte: [Olhar Digital](https://olhardigital.com.br/curiosidades/2026/09/27/marceneiro-revela-segredo-por-que-um-erro-de-apenas-2-na-medida-pode-impedir-uma-prateleira-de-encaixar/), [Calcme](https://www.calcme.com.br/blog/como-fazer-plano-de-corte-mdf/).
6. **Ordem dos cortes pela posição da guia** (se ainda não fizer) e números da sequência no desenho e no PDF. Por quê: mexer menos na guia e seguir a ordem sem pensar. Fonte: [Rogue Engineer](https://rogueengineer.com/cut-list-optimizer/), [CutList Optimizer](https://www.cutlistoptimizer.com/).
7. **Texto para escrever a lápis**, já que não há etiqueta: código curto na peça (ex.: "M3-L2") e, no retalho, material, espessura, medida e data. Por quê: "Retalho sem etiqueta vira lenha". Fonte: [Calcme](https://www.calcme.com.br/blog/como-fazer-plano-de-corte-mdf/).
8. **Peça estragada com motivo e foto**, e as causas prováveis de lasca na tela. Por quê: cria histórico de onde mais se erra. Fonte: [HOMAG](https://www.homag.com/en/company/news/news/article/apps-software-solutions-for-every-size-of-business), [DinaBox](https://www.dinabox.net/pcp-dinabox), [WOODWEB](https://woodweb.com/knowledge_base/Melamine_Chipping_on_a_Sliding_Table_Saw.html).
9. **Aviso "meça a chapa com trena antes do 1º corte".** Por quê: ±5 mm de tolerância e já houve chapa de 184 cm. Fonte: [Berneck](https://www.berneck.com.br/uploads/Ficha_Tecnica_HDF_e_MDF_Portugues_2025_3fc54fffed.pdf), [Duratex](https://duratex-site-strapi.prd.cloud.dex.co/assets/cartilha_mdf_eucalipto_duratex_cc52fff71b.pdf).
10. **Juntar trabalhos da mesma chapa num plano.** Por quê: no exemplo da Calcme, 3 chapas viraram 2. Fonte: [Calcme](https://www.calcme.com.br/blog/como-fazer-plano-de-corte-mdf/).
11. **Testar com sinal fraco:** guardar o plano aberto e sincronizar depois. Por quê: apps de oficina destacam que funcionam offline. Fonte: [Offcut](https://play.google.com/store/apps/details?id=br.com.lardev.offcut&hl=pt_BR), [MaxCut](https://play.google.com/store/apps/details?id=app.maxcut&hl=pt_BR).
12. **Botão "Conferir esquadro" (5 cortes)**, sem prometer tolerância oficial. Fonte: [The Wood Whisperer](https://thewoodwhisperer.com/articles/how-much-error-is-too-much/).
13. **Gerador de peças por módulo** com a regra visível ("travessa = largura − 2 × 1,8 cm") e folga por ferragem configurável. Fonte: [artigo](https://sagnikbhattacharya.com/blog/joinery-ai-cutting-list-material-order), [Cursa](https://cursa.app/pt/exercicios/designer-de-interiores/detalhamento-tecnico-de-marcenaria-planejada-residencial).
14. **2ª tela para o ajudante** (opcional): um celular com o plano todo, outro com o passo da vez. Fonte: [MAGIS Navi](https://www.altendorf.com/en/altendorf-magis/magis-navi/).
15. **IA lendo o PDF, por último:** só rascunho, com revisão peça a peça. Fonte: [Microsoft](https://techcommunity.microsoft.com/t5/microsoft-foundry-blog/extracting-boms-from-electrical-drawings-with-ai-azure-openai/ba-p/4506891), [Cutlistor](https://www.cutlistor.com/blog/how-to-create-cabinet-cut-list-from-pdf).

**O que evitar:**

- Descontar a fita por padrão. A marcenaria corta na medida final ([Cutrix](https://play.google.com/store/apps/details?id=com.cutrix.cutrix&hl=pt_BR) tem essa opção).
- Descontar o refilo de novo em retalho ou duplicar sobra, bug relatado no [MaxCut](https://play.google.com/store/apps/details?id=app.maxcut&hl=pt_BR).
- Tabela de muitas colunas no celular, o ponto fraco do [optiCutter](https://www.opticutter.com/cut-list-optimizer) e do CutList Optimizer em 390 px.
- Escrever a unidade em cada peça do desenho.
- Confiar na borda de fábrica da chapa.
- Afirmar que a Baldan tem riscador sem confirmar com o dono.
- Pôr folga de porta ou gaveta fixa como "padrão do mercado". Não há fonte.
- Depender de app de loja: o app iPhone do Cortecloud tem nota 1,0 (2 avaliações) e está parado desde 2024 ([App Store](https://apps.apple.com/app/apple-store/id1489807401)).
- Deixar a IA gerar a lista sem revisão ou montar o layout.

## 10. Fontes

### Fabricantes, normas e lojas de material

- Arauco: [ficha MDF Trupan 2024](https://arauco-qas.arauco.com/brasil/wp-content/uploads/sites/17/2024/05/FICHA-TECNICA-MDF-TRUPAN-ARAUCO-2024.pdf) · [guia "O dia a dia da marcenaria"](https://arauco.com/brasil/wp-content/uploads/sites/17/2018/06/miolo_guia_marceneiros-2.pdf)
- Berneck: [ficha HDF e MDF 2025](https://www.berneck.com.br/uploads/Ficha_Tecnica_HDF_e_MDF_Portugues_2025_3fc54fffed.pdf) · [página do MDF](https://www.berneck.com.br/en/products/mdf-berneck) (não aberta)
- Duratex/Dexco: [cartilha MDF Eucalipto](https://duratex-site-strapi.prd.cloud.dex.co/assets/cartilha_mdf_eucalipto_duratex_cc52fff71b.pdf) · [catálogo de exportação](https://duratex-site-strapi.prd.cloud.dex.co/assets/Catalogo_Exportacion_54f1ac5313.pdf)
- [Guararapes Freijó](https://www.guararapes.com.br/en/produto/freijo/) · [Eucatex no AECweb](https://www.aecweb.com.br/produto/mdf-eucafibra-bp-raizes/50887)
- Norma e fiscalização: [NES Setor Móveis, MTE](https://www.gov.br/trabalho-e-emprego/pt-br/assuntos/inspecao-do-trabalho/aesmoveis/nes-aesmoveis.pdf) · [IFSC, escalas e cotas](https://wiki.ifsc.edu.br/images/c/c6/13-ARU_DEB_Escalas_e_Dimensionamento.pdf)
- Disco e máquina: [Freud LU3D21](https://www.burnstools.com/lu3d21-300mm-x-3-2-x-30mm-x-72t-tcg) · [Freud LU3A03](https://thepowertoolstore.com/products/freud-lu3a03) · [Freud 250 mm](https://www.lojadomecanico.com.br/produto/123476/37/431/disco-de-serra-250mm-x-32mm-x-30mm-10-pol-80-dentes-alternado-para-mdf-lu3a0200-freud-f03fs05061-000) · [manual Grizzly G0820](https://www.manualslib.com/manual/1308557/Grizzly-G0820.html?page=50) · [Baldan na Loja do Mecânico](https://www.lojadomecanico.com.br/buscar/maquinas-baldan)
- Lojas de chapa: [Leo Madeiras](https://www.leomadeiras.com.br/) · [Madeiras Gasômetro](https://www.madeirasgasometro.com.br/)

### Software e apps (sites)

- Altendorf: [MAGIS](https://www.altendorf.com/en/altendorf-magis/) · [MAGIS Navi](https://www.altendorf.com/en/altendorf-magis/magis-navi/) · [MAGIS Opti](https://www.altendorf.com/en/altendorf-magis/magis-opti/)
- HOMAG: [Cutting Production Set](https://homag.com/en/product-detail/software/production-management/cutting-production-set-the-cutting-assistant) · [intelliDivide](https://www.homag.com/en/product-detail/software/work-preparation/intellidivide-cutting) · [tapio productionManager](https://www.tapio.one/en/productionManager)
- [Microvellum](https://community.microvellum.com/portal/en/kb/articles/creating-paperless-shop-floors) · [Felder F4Guide](https://www.felder-group.com/en-us/products/f4solutions-software-c596305/software-f4guide-p596328) · [Mozaik V15](https://www.mozaiksoftware.com/resources/v15)
- Wood Designer: [OptiCut net × overall](https://wooddesigner.org/help-centre/opticut-net-versus-overall-dimensions/) · [PolyBoard](https://wooddesigner.org/help-centre/polyboard-manufacturing-output/)
- Promob: [Cut Pro, notas 2026](https://suporte.promob.com/hc/pt-br/articles/31113167346321) · [gerar plano](https://suporte.promob.com/hc/articles/31119991354129) · [unidade](https://suporte.promob.com/hc/en-us/articles/31121765519889-Builder-Cutting-Plans-Unit-of-Measure) · [importar SKP](https://suporte.promob.com/hc/pt-br/articles/36813691121553-Novo-Promob-Importar-SKP-Convers%C3%A3o-de-projetos-SKP-para-Promob)
- Cortecloud: [importação JSON](https://apis.cortecloud.com.br/docs/guias/importacao-json/) · [validações](https://ajuda.cortecloud.com.br/help/entendendo-e-resolvendo-problemas-de-validacao-de-pecas) · [sobras](https://ajuda.cortecloud.com.br/help/aba-de-configuracao-de-sobras)
- Corte Certo: [site](https://www.cortecerto.com) · [telas](https://cortecerto.com/suporte/telas/) · [minipeças](https://cortecerto.com/glossary/minipecas) · [fases de corte](https://cortecerto.com/glossary/fases-de-corte)
- Brasil: [Calcme meX](https://www.calcme.com.br/mex) · [LeoPlan](https://www.leosobmedida.com.br/) · [Gasômetro plano de corte](https://planodecorte.madeirasgasometro.com.br/login/?next=/) · [DinaBox](https://dinabox.net) · [DinaBox PCP](https://www.dinabox.net/pcp-dinabox) · [Gabster](https://www.gabster.com.br)
- Otimizadores web: [CutList Optimizer](https://www.cutlistoptimizer.com/) · [optiCutter](https://www.opticutter.com/cut-list-optimizer) · [imagem optiCutter](https://www.opticutter.com/images/public/app-detail-2d.png) · [MaxCut](https://maxcutsoftware.com/optimal-cutting-layouts/) · [SmartCut](https://smartcut.dev/algorithms) · [Rogue Engineer](https://rogueengineer.com/cut-list-optimizer/) · [Odoo](https://apps.odoo.com/apps/modules/19.0/mierp_cutting_optimizer) · [servidos.ar](https://servidos.ar/optimizador-corte-placas)
- IA: [Cutlistor](https://www.cutlistor.com/) · [RailChop](https://railchop.pages.dev/features/ai-scan/)

### Artigos e fóruns

- Brasil: [Calcme, plano de corte](https://www.calcme.com.br/blog/como-fazer-plano-de-corte-mdf/) · [Gabster, projeto e produção](https://www.gabster.com.br/blog/integração-projeto-produção-em-marcenarias) · [Olhar Digital](https://olhardigital.com.br/curiosidades/2026/09/27/marceneiro-revela-segredo-por-que-um-erro-de-apenas-2-na-medida-pode-impedir-uma-prateleira-de-encaixar/) · [Monitor do Mercado](https://monitordomercado.com.br/economia-2/415344-designer-de-marcenaria-transforma-centimetros-em-moveis-planejados-e-um-erro-no-projeto-pode-chegar-pronto-da-fabrica/) · [CBIC](https://cbic.org.br/maquinas-e-equipamentos-na-construcao-o-uso-da-serra-circular-de-bancada/)
- Cursa: [detalhamento técnico](https://cursa.app/pt/exercicios/designer-de-interiores/detalhamento-tecnico-de-marcenaria-planejada-residencial) · [ferragens](https://cursa.app/pt/exercicios/marcenaria/instalacao-e-regulagem-de-ferragens-para-moveis)
- HOMAG: [tiras e retalhos, 2021](https://www.homag.com/en/news-events/news/article/digital-tools-for-panel-dividing-updates-for-cutting-using-saws-nesting-machines) · [pasta digital, 2023](https://www.homag.com/en/news-events/news/article/the-digital-job-folder-brings-transparency-to-the-workshop) · [LIGNA 2025](https://www.homag.com/en/company/news/news/article/apps-software-solutions-for-every-size-of-business)
- [Hexagon, Paperless Traveller](https://blog.manufacturing.hexagon.com/digital-transformation-in-manufacturing/connected-worker-solutions/ditch-the-paper-how-nexus-connected-worker-is-transforming-cabinet-shops/) · [DYNA 2025](https://revistas.unal.edu.co/index.php/dyna/article/download/119380/95571/740222)
- IA: [Cutlistor, lista a partir do PDF](https://www.cutlistor.com/blog/how-to-create-cabinet-cut-list-from-pdf) · [MillworkSuite](https://www.prnewswire.com/news-releases/millworksuite-launches-ai-estimating-and-direct-to-cad-platform-that-cuts-drafting-time-in-half-302857729.html) · [software × IA](https://sagnikbhattacharya.com/blog/carpenter-cutting-list-software-vs-ai) · [IA e lista de peças](https://sagnikbhattacharya.com/blog/joinery-ai-cutting-list-material-order) · [Microsoft, desenho elétrico](https://techcommunity.microsoft.com/t5/microsoft-foundry-blog/extracting-boms-from-electrical-drawings-with-ai-azure-openai/ba-p/4506891)
- Técnica: [WOODWEB, dicas](https://www.woodweb.com/knowledge_base/Sliding_Table_Saw_Tips_and_Tricks.html) · [WOODWEB, dust cut](https://woodweb.com/knowledge_base/Dust_Cut_Procedures.html) · [WOODWEB, lascas](https://woodweb.com/knowledge_base/Melamine_Chipping_on_a_Sliding_Table_Saw.html) · [WOODWEB, chip-out](https://woodweb.com/knowledge_base/Eliminating_Melamine_ChipOut.html) · [The Wood Whisperer](https://thewoodwhisperer.com/articles/how-much-error-is-too-much/) · [KM Tools](https://kmtools.com/pages/five-cut-method-calculator)
- Reclame Aqui (só títulos e resumos, não confirmado): [medidas erradas](https://www.reclameaqui.com.br/giacomo-casa-do-marceneiro/paguei-pelo-servico-de-corte-e-as-medidas-vieram-todas-erradas_Of56mxibbH5MQexV/) · [Cortecloud sem aviso](https://www.reclameaqui.com.br/serrabits-desenvolvimento-de-software/sistema-do-cortecloud-nao-sinalizou-conflito-de-medidas-e-gerou-impossibilidade-de-utilizacao-do-movel_9_Vnhg2oNsNqS8kF/) · [pedidos errados](https://www.reclameaqui.com.br/giacomo-casa-do-marceneiro/dois-pedidos-enviados-errados-dos-projetos-criados-no-cortecloud-alerta_ARh4H3XSSlJT04sf/)

### Lojas de apps

- Google Play: [CutList Optimizer](https://play.google.com/store/apps/details?id=com.cutlistoptimizer&hl=pt_BR) · [SketchCut](https://play.google.com/store/apps/details?id=com.fortali.mapcut&hl=pt_BR) · [SketchCut PRO](https://play.google.com/store/apps/details?id=com.fortali.sketchcutpro&hl=pt_BR) · [MaxCut](https://play.google.com/store/apps/details?id=app.maxcut&hl=pt_BR) · [Cortecloud](https://play.google.com/store/apps/details?id=br.com.cortecloud.app&hl=pt_BR) · [MDF Cut](https://play.google.com/store/apps/details?id=com.convickto.mdfcutpro&hl=pt_BR) · [Offcut](https://play.google.com/store/apps/details?id=br.com.lardev.offcut&hl=pt_BR) · [Cutrix](https://play.google.com/store/apps/details?id=com.cutrix.cutrix&hl=pt_BR) · [Cutter](https://play.google.com/store/apps/details?id=com.embarcadero.OptimizaCorte&hl=pt_BR) · [CorteFacil](https://play.google.com/store/apps/details?id=com.cortefacil.cortefacil_flutter&hl=pt_BR) · [CabinetPro](https://play.google.com/store/apps/details?id=com.cabinetpro.cutlist&hl=pt_BR)
- App Store: [CutList Optimizer](https://apps.apple.com/br/app/cutlist-optimizer/id6465744401) · [SketchCut PRO](https://apps.apple.com/br/app/sketchcut-pro/id1119117405) · [Cortecloud](https://apps.apple.com/app/apple-store/id1489807401) · [HOMAG productionAssist](https://apps.apple.com/us/app/id1491213597) · [CutList: Plywood Optimizer](https://apps.apple.com/us/app/id6768171871) · [Boardcut](https://apps.apple.com/app/id6787905177)

### Vídeos

Conferidos por título, canal e descrição; nenhum foi assistido. Detalhes na seção 3.

- Esquadrejadeira (BR): [tiras até as peças](https://www.youtube.com/watch?v=s70ZezHVo8o) · [chapa sozinho](https://www.youtube.com/watch?v=nzEFvGZDta8) · [refilamento do MDF](https://www.youtube.com/watch?v=w_FfIXALRxU) · [chapa irregular no esquadro](https://www.youtube.com/watch?v=LhaFLKFxvI0) · [esquadro da máquina](https://www.youtube.com/watch?v=B9vNHck5si4) · [riscador Inmes](https://www.youtube.com/watch?v=zQC73jbosz0)
- Baldan: [SE-3200/38 oficial](https://www.youtube.com/watch?v=jGZvIkwk5Ss) · [SE-3200/38 montagem](https://www.youtube.com/watch?v=a2HxSF7BsUY)
- Plano e medidas (BR): [KCF](https://www.youtube.com/watch?v=RNijdfNG4Fw) · [Canal da Poeira](https://www.youtube.com/watch?v=oU1EyU1C2os) · [SketchCut](https://www.youtube.com/watch?v=k_rawrUgCgI) · [EU MARCENEIRO](https://www.youtube.com/watch?v=fCZFHGn_QvY) · [portas e gavetas](https://www.youtube.com/watch?v=KswOSQfMnvU) · [planilha](https://www.youtube.com/watch?v=kaeaDErmY1E) · [Corte Certo 2025](https://www.youtube.com/watch?v=bX-v82t-92M) · [Cortecloud](https://www.youtube.com/watch?v=--ZZQ1xZQ0Q)
- Altendorf e HOMAG: [MAGIS, Altendorf](https://www.youtube.com/watch?v=9OrbDOhiFAc) · [MAGIS, Daltons](https://www.youtube.com/watch?v=dKK-LRDmM1g) · [Magis Opti](https://www.youtube.com/watch?v=58NYSmgw5xI) · [Cutting Assistant](https://www.youtube.com/watch?v=36zWcaUZjDc) · [productionAssist (DE)](https://www.youtube.com/watch?v=hJNkf1ATjE8) · [intelliDivide](https://www.youtube.com/watch?v=EnQBvPG35ZU)
- Técnica (fora): [Contemporary Woods](https://www.youtube.com/watch?v=RDYxuLlUBEE) · [Sam Blasco](https://www.youtube.com/watch?v=9AHMTuw_Ghg) · [Bryce Comer](https://www.youtube.com/watch?v=mp4Ye93UcHg) · [ExtremeWoodworker](https://www.youtube.com/watch?v=cT6MejJihwU) · [SmartFACT](https://www.youtube.com/watch?v=MSacT4l8_gU)
- IA: [ThinkMaya AI](https://www.youtube.com/watch?v=XOGdG6xF80g) · [AnyCutlist](https://www.youtube.com/watch?v=2PPxWZNnULo)
