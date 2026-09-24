# Bancada Orçamentos

Programa para orçamento de **móveis planejados**. Tem dois jeitos de orçar, que podem ser usados juntos no mesmo orçamento:

- **Móveis por medida (rápido):** informe só largura × altura do móvel em metros. Ex.: balcão de 1,58 × 1,30 = 2,054 m² × preço do m². Painel de 1,50 m × preço do metro linear. O valor já cai na proposta.
- **Peças (detalhado):** lance cada peça, ou gere o módulo pronto, e veja quantas chapas, quanta fita e quais ferragens o móvel gasta.

Calcula:

- **Metros quadrados (m²)** de cada peça e do projeto inteiro
- **Chapas** necessárias por material (com perda de corte e aproveitamento)
- **Metros lineares de fita de borda**, com perda
- **Metro linear do móvel**, com preço final por metro linear
- **Custo de material**: chapas, fita de borda e ferragens
- **Mão de obra**: por m², por metro linear, por hora, % sobre materiais ou valor fixo (pode combinar várias)
- **Fechamento**: outros custos, margem, desconto, lucro e preço final (também por m² e por metro linear)

Roda direto no navegador, sem instalação e sem internet (só as fontes vêm do Google Fonts). Os dados ficam salvos no próprio navegador.

## Como usar

1. Abra o arquivo `index.html` no navegador (Chrome, Edge, Firefox ou Safari, no computador ou no celular).
2. Em **Materiais e preços**, preencha a **tabela de preços por medida** (preço de venda por m² ou por metro linear de cada tipo de móvel: guarda-roupa, balcão, aéreo, painel…).
3. Para o orçamento rápido, vá em **Móveis por medida**, clique em **+ Móvel**, escolha o tipo e informe largura e altura. Pronto: o preço aparece na hora.

Para o orçamento detalhado:

1. Em **Materiais e preços**, cadastre suas chapas (medida e preço da chapa), fitas de borda (R$/m), ferragens e as perdas. Os preços que vêm preenchidos são só exemplos.
2. Em **Peças**, lance as peças com medidas em milímetros, ou use **+ Módulo rápido** para gerar uma caixa completa (laterais, base, tampo, prateleiras, fundo, portas e gavetas) a partir de largura × altura × profundidade. O módulo rápido também soma as dobradiças e as corrediças nas ferragens.
3. Em **Ferragens**, informe quantidades. Em **Mão de obra**, escolha a forma de cobrança.
4. Informe o **comprimento linear do móvel** (ex.: 2,40 m de cozinha) para ver o preço por metro linear.
5. No resumo, ajuste **margem**, **desconto** e **outros custos**.
6. **Copiar orçamento** gera um texto pronto para WhatsApp/e-mail. **Imprimir / PDF** gera o orçamento para o cliente e, na página seguinte, a lista de peças para a produção.

Vários orçamentos podem ser salvos (seletor no topo: Novo, Duplicar, Excluir). **Exportar** salva um arquivo `.json` com o orçamento e o catálogo, e **Importar** abre esse arquivo em outro computador.

## Como os cálculos são feitos

| Item | Fórmula |
| --- | --- |
| Móvel por m² | largura × altura × quantidade × preço do m² |
| Móvel por metro linear | largura × quantidade × preço do metro linear |
| Área da peça | comprimento × largura × quantidade ÷ 1.000.000 (m²) |
| Chapas | área das peças do material × (1 + perda %) ÷ área da chapa, arredondado para cima quando "Cobrar chapas inteiras" está marcado |
| Custo das chapas | chapas inteiras × preço da chapa, ou área com perda × preço do m² |
| Fita de borda | (comprimento × lados C + largura × lados L) × quantidade ÷ 1000 × (1 + perda %) |
| Mão de obra por m² | valor × área total das peças |
| Mão de obra por metro linear | valor × comprimento linear do móvel |
| Mão de obra % | percentual × (chapas + fita + ferragens) |
| Custo total | materiais + mão de obra + outros custos |
| Preço de venda | custo total das peças detalhadas × (1 + margem %) + móveis por medida |
| Preço final | preço de venda − desconto % |
| Preço por m² | preço final ÷ m² dos móveis por medida (ou ÷ m² de peças, se não houver) |
| Preço por metro linear | preço final ÷ comprimento linear informado (ou ÷ soma das larguras dos móveis por medida) |

O preço da tabela por medida já é preço de venda, por isso a margem não é aplicada de novo sobre ele. O desconto vale para o orçamento inteiro.

O módulo rápido usa: laterais A × P; base e tampo (L − 2 × espessura) × P; prateleiras recuadas 20 mm; fundo sobreposto (A − 4) × (L − 4); portas sobrepostas com folga de 3 mm; e 2 a 5 dobradiças por porta conforme a altura. Gavetas: sem portas, as frentes dividem a altura toda; com portas, cada frente tem 180 mm e as gavetas ficam embaixo. Cada gaveta gera frente, 2 laterais, frente e traseira internas, fundo e 1 par de corrediças (13 mm de folga por lado).

## Para desenvolvedores

```
js/calc.js      motor de cálculo (funções puras, sem DOM)
js/app.js       interface
css/style.css   estilos (tema claro e escuro, layout para celular, impressão)
tests/          testes do motor de cálculo
```

```bash
npm test     # roda os testes (Node 18+)
npm start    # serve a pasta em http://localhost:3000
```
