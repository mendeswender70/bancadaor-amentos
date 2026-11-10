# Plano de corte e área da produção

Pesquisa, decisões e o que foi feito. Atualizado em 10/11/2026 (segunda rodada: cm, projeto anexado e revisão).

## Decisões da marcenaria

| Pergunta | Resposta |
| --- | --- |
| Onde fica o plano de corte | Fora do esquadro: área própria da produção (`/producao/`), mesmo sistema e mesmo banco |
| Como o trabalho chega | Os dois jeitos: o escritório manda o orçamento aprovado e o funcionário também cria planos próprios |
| Acesso | Login próprio por funcionário. Cada um vê só os seus; o escritório vê todos |
| Valores | Funcionário não vê preço nem custo |
| Serra | Esquadrejadeira Baldan SE-3200/38 |
| Aparelho | Celular |
| Prioridades | Cortar passo a passo na tela; estoque de retalhos |
| Fita de borda | Corta na medida final (sem descontar a fita) |
| Etiquetas | Não usam |

Ficha da Baldan SE-3200/38 (revendas): curso do carro de 3.200 mm, **900 mm de
largura de corte na guia paralela**, disco de 300 mm e riscador de 125 mm. A
espessura do disco não aparece nas fichas: o padrão do sistema é 4 mm (mais
largo que o real só gasta um pouco mais de chapa; mais estreito erra a última
peça da faixa). Vale medir o dente do disco e ajustar em Ajustes da produção.

## O que a indústria faz (pesquisa)

A pesquisa completa de nov/2026 (sites do Brasil e de fora, YouTube, telas de
programas, apps de celular, técnica na esquadrejadeira e projeto → medidas),
com links, está em [pesquisa-plano-de-corte.md](pesquisa-plano-de-corte.md).
Resumo do que entrou na primeira versão:

| Fonte | O que entrou no esquadro |
| --- | --- |
| HOMAG productionAssist Cutting (tablet na serra, para qualquer serra) | Passo a passo na serra: o sistema mostra o que já foi cortado e sugere a próxima peça; a chapa é dividida primeiro em faixas; sobras são registradas para a próxima otimização |
| HOMAG intelliDivide | Refilo e acerto de borda; sobras com medida mínima; objetivos diferentes (menos perda, menos tempo, menos manuseio) |
| Altendorf MAGIS Navi / MAGIS Opti | Guia "como um GPS", corte a corte, com a medida da guia; o otimizador escolhe em qual guia a peça pode ser cortada; otimização por tempo ou por material |
| Ardis (usado pela Felder) | Sobras reaproveitadas na próxima otimização; direção das faixas; respeito ao veio |
| MaxCut | Número de giros (estágios) e direção do 1º corte; prioridade material × tempo; várias opções de desenho para escolher |
| Opticut | Agrupar desenhos de chapa iguais para facilitar o corte manual; usar sobras antes de chapa nova |
| Corte Certo | Multissoluções; gestão de retalhos; testar formatos de chapa |
| Promob / VDMax | Desconto da fita (não se aplica aqui: o corte é na medida final) |
| Calcme (blog) | Juntar módulos num mesmo plano aumentou o aproveitamento de 51% para 78% no exemplo deles |

Fontes:
[HOMAG Cutting Production Set](https://www.homag.com/en/product-detail/software/production-management/cutting-production-set-the-cutting-assistant) ·
[HOMAG — trim cuts](https://docs.homag.cloud/en/intellidivide/processing-parameters/trim-cuts) ·
[Altendorf MAGIS Navi](https://www.altendorf.com/en-us/altendorf-magis/magis-navi/) ·
[Altendorf MAGIS Opti](https://www.altendorf.com/en/altendorf-magis/magis-opti/) ·
[Altendorf — software para esquadrejadeiras (PDF)](https://mb.cision.com/Public/9543/2828081/843d5eadc6211202.pdf) ·
[Ardis Optimizer](https://wtp.hoechsmann.com/en/lexikon/19042/ardis_cutting_optimizer) ·
[MaxCut](https://maxcutsoftware.com/features/cutting-optimization/) ·
[Opticut — parâmetros](https://wooddesigner.org/help-centre/opticut-optimization-parameters/) ·
[Corte Certo — 5 dicas](https://blog.cortecerto.com/como-fazer-um-plano-de-corte/) ·
[Desconto de fita (VDMax)](https://vdmax.zendesk.com/hc/pt-br/articles/219461028-Descontar-espessura-fita-de-borda) ·
[Calcme — plano de corte](https://www.calcme.com.br/blog/como-fazer-plano-de-corte-mdf/) ·
[Baldan SE-3200/38 (ficha)](https://www.madeirasgasometro.com.br/serra-esquadrejadeira-3200mm-baldan-se-3200-38-motor-5-cv-trifasico/p) ·
Jylänki, *A Thousand Ways to Pack the Bin* ([repositório](https://github.com/juj/RectangleBinPack)).

## O que foi feito

**Área da produção (`/producao/`)**, com visual próprio para o celular:
Trabalhos, Retalhos e Ajustes. Login por funcionário; o escritório cria os
acessos em Ajustes → Equipe e manda trabalhos pelo orçamento.

**Cálculo** (`public/shared/corte.js`):
- Só cortes de ponta a ponta (guilhotina), com disco, refilo e veio.
- Duas famílias de busca (faixas e espaços livres), centenas de combinações e
  ajuste fino, em Web Worker.
- Até três soluções: **menos chapas**, **corte simples** (menos giros e
  cortes; aceita no máximo uma chapa a mais, e só se simplificar bastante) e
  **maior sobra** inteira.
- Retalhos do estoque entram sem refilo e só quando economizam chapa nova; a
  solução "maior sobra" pode usá-los para deixar uma sobra grande inteira.
- Chapas com o mesmo desenho saem juntas ("×3 iguais").
- O servidor confere cada solução (peças, medidas, veio, área útil, serra entre
  peças, cortes de ponta a ponta, retalhos permitidos) e reserva os retalhos da
  solução escolhida.

**Modo serra:** passo a passo com a medida grande, a guia (paralela até 900 mm,
senão no carro), o aviso de girar a peça, o que cada corte separa e o que fica
do outro lado. Peça estragada vira plano de recorte. No fim de cada chapa, as
sobras boas vão para o estoque. O andamento fica salvo a cada passo e a tela
fica acesa.

**Testes:** otimizador (incluindo listas aleatórias com retalhos), conferência
de resultados adulterados, passo a passo entregando cada peça uma vez,
permissões (funcionário fora do escritório, sem preço, só os próprios planos),
reserva e uso de retalhos, andamento e conclusão. O fluxo foi usado no
navegador em tamanho de iPhone, nos temas claro e escuro.

**Medidas em cm e projeto anexado** (segunda rodada): tudo em centímetros na
produção; o escritório e o funcionário anexam o PDF do arquiteto e fotos; o
modo **Medir no projeto** deixa o desenho em cima e a digitação embaixo, e
cada peça guarda de qual anexo e página veio a medida. O passo a passo ganhou
o lembrete de segurança antes do primeiro corte (NR-12), "face boa para cima",
a ordem do refilo (lado comprido no carro, girar, lado curto) e o alerta de
empurrador em tira estreita na guia paralela. Uma revisão do código em quatro
frentes (segurança, centímetros, envio dos arquivos e iPhone) encontrou e
corrigiu, entre outros: retalho digitado em mm gravado 10 vezes maior, cache
que pulava a checagem de permissão, PDF que não abria em iPhone com iOS 16 e
página do PDF trocada ao virar rápido.

## Próximos passos sugeridos

A lista completa, com o porquê e a fonte de cada item, está na seção 9 da
[pesquisa](pesquisa-plano-de-corte.md#9-próximos-passos-recomendados).

1. **Usar em 2 ou 3 trabalhos reais** e comparar o número de chapas com o que a
   oficina faria à mão (ou com o CutList Optimizer).
2. **Medir o disco** e ajustar a espessura em Ajustes da produção.
3. **Juntar trabalhos num plano** (vários orçamentos da mesma chapa). A
   pesquisa mostra ganho grande de aproveitamento; ficou fora desta versão.
4. **Gerador de peças por módulo** (caixa, gaveteiro, porta) com o padrão
   construtivo da marcenaria. Precisa definir as regras com a oficina (fundo,
   folgas, corrediças).
5. **Endereço próprio** (ex.: `producao.esquadro.site`): basta apontar o
   domínio na Vercel para `/producao/`. Hoje funciona em `esquadro.site/producao`.
