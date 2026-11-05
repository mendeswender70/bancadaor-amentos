# Protótipo de Liquid Glass

Abra `/laboratorio-vidro.html`. A página é independente do login e dos dados do
aplicativo, tem `noindex` e usa apenas exemplos locais. O restante do site não
carrega seus scripts ou estilos.

## Material

Um canvas WebGL compartilhado desenha a madeira e as lentes. A imagem conhecida
permite sincronizar a amostragem do fundo com a posição de cada componente em
pixels CSS. Um campo de distância de retângulo arredondado determina as normais
e a curvatura da borda; essas normais deslocam a amostragem da madeira. Reflexos,
dispersão leve, sombra e tonalidade completam o material. Texto e controles são
HTML normal sobre a camada gráfica.

O renderer não captura ou refrata HTML arbitrário: o resultado demonstra
refração da imagem de madeira. Não usa APIs nativas de Liquid Glass da Apple.
Uma aplicação futura sobre listas em movimento requer uma solução específica
para o conteúdo real; não basta colocar este canvas sobre qualquer tela.

O loop para quando a luz estabiliza e recomeça com interação, rolagem ou mudança
de geometria. A resolução é limitada a DPR 1,5 e 1,5 milhão de pixels. O canvas
recorta os componentes conforme a área rolável para evitar vazamento óptico
atrás do cabeçalho. No celular, o menu ocupa uma linha própria, fora da área
rolável do conteúdo.

## Interações e alternativas

- A chave no cabeçalho compara vidro e material sólido.
- Toque ou mouse deslocam a luz; o seletor do menu se move com uma mola.
- O botão principal abre detalhes de demonstração; Escape fecha e devolve foco.
- Movimento do aparelho é opcional e solicitado em um gesto explícito. Sem
  permissão ou leituras, o efeito continua disponível pelo toque. Nenhum dado
  de sensor é enviado ao servidor.
- Movimento reduzido desativa elasticidade. Contraste elevado e transparência
  reduzida usam superfícies sólidas.
- Sem WebGL, erro de imagem ou perda de contexto, CSS mantém uma versão
  simplificada legível. A restauração de contexto recria os recursos gráficos.

## Validação

Conferir antes de ampliar para outras telas:

1. No Safari do iPhone, testar toque, rolagem, comparação e abertura dos detalhes.
2. Permitir movimento e verificar leituras; testar também a recusa da permissão.
3. Testar em retrato, paisagem e tela pequena, garantindo que o menu não cubra
   o botão e que o vidro acompanhe o recorte da área rolável.
4. Ativar movimento reduzido, contraste elevado e transparência reduzida.
5. Em desktop, verificar mouse e teclado, inclusive o contorno de foco.
6. Simular perda/restauração de contexto WebGL e ausência de WebGL.

A avaliação no aparelho físico é necessária para julgar aparência e fluidez no
Safari; capturas de Chromium não equivalem a essa validação.
