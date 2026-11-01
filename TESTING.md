# Testes e critérios de manutenção

As cinco interfaces foram aprovadas: comandos Bluetooth; estado/configurações; janela/segundo plano; interação visual; atualização/instalação. Os testes abaixo são complementares. Um teste de componente não mede RAM nem comprova o funcionamento do rádio Bluetooth.

## Antes de entregar qualquer alteração

```sh
npm ci
npm run check
```

`check` executa Vitest, os testes Rust e o build TypeScript/Vite. Instalação e atualização local executam esse comando antes de substituir o executável. Se falhar, a versão anterior permanece instalada. O instalador não tem mais um modo que pule verificações. A suíte rápida funciona sem fone e não envia comandos Bluetooth.

Para alterações de interface e antes de publicar uma versão:

```sh
npx playwright install chromium   # uma vez por ambiente
npm run check:release
```

A geração de pacotes Tauri também exige `check:release` pelo `beforeBuildCommand`.

`npm run test:watch` acompanha os testes durante o desenvolvimento. `npm run test:ui` executa só os testes de navegador. Não há retries de teste que escondam flutuações. Artefatos e screenshots ficam em `test-results/`; dados simulados ficam apenas em `tests/browser/`, fora da entrada de produção.

## Cobertura automatizada atual

- Comandos: operações rápidas concorrentes não atravessam uma alteração pendente; nova operação funciona após conclusão. Erro mantém a última leitura confirmada e não provoca uma repetição automática escondida. Rust cobre enquadramento RCSP, fragmentação, correlação de sequência/status, timeout limitado, rejeição e limites de payload.
- Estado: mudança parcial de ANC preserva o EQ em edição, inclusive ao navegar entre abas. Preferência da janela sobrevive a recarregamento do armazenamento; arquivo inválido volta para perguntar. Falha ao salvar aparece para o usuário sem fingir sucesso.
- Segundo plano: inicialização ocorre uma vez em StrictMode; dez minutos de relógio simulado sem operação não geram consultas Bluetooth. Consulta periódica do atualizador existe somente enquanto compila e é removida ao fechar o diálogo.
- Interação: feedback de operação pendente, bloqueio de novo envio, abas navegáveis e foco por teclado, rascunho de EQ preservado. Navegador verifica larguras de 390, 640, 768, 1000 e 1440 px, ausência de overflow da página, separação mínima de 8 px entre os blocos principais, ajuste do slider por teclado e respeito a movimento reduzido. Rolagem horizontal interna do EQ é intencional.
- Atualização: operação em andamento impede novo pedido, estado de falha é apresentado, logs Rust são limitados e início duplicado não cria outra compilação. Um teste executa o instalador em diretório temporário com verificação reprovada e comprova que o binário antigo permanece intacto.

Layout humano, clareza dos textos, conforto e qualidade das microinterações ainda exigem revisão visual; os testes geométricos não substituem essa avaliação. Chromium não substitui o WebKit nativo do Linux.

## Janela e bandeja — verificação no desktop real

O padrão é perguntar ao clicar no X. O usuário pode escolher continuar na bandeja ou encerrar, marcar Lembrar minha escolha, ou mudar depois no seletor Ao fechar a janela. O menu da bandeja contém Abrir QCY Desktop e Encerrar.

Verificar no desktop Linux e repetir em Windows quando houver build nativo:

1. Editar um ganho sem aplicar, minimizar e restaurar: rascunho continua na tela e nenhum comando deve ser enviado.
2. X → Cancelar mantém janela. X → Continuar na bandeja oculta a janela; Abrir na bandeja restaura o rascunho e a última leitura.
3. Escolher Lembrar, sair pelo menu da bandeja e abrir novamente: preferência é mantida. Trocar para Encerrar e clicar X termina o processo.
4. Encerrar não aplica rascunhos. Ao abrir de novo, estado de ANC/EQ deve ser consultado no fone, sem reaplicar configuração antiga automaticamente. Rascunhos não aplicados só são mantidos enquanto o processo continua aberto.
5. Atualizar: um teste reprovado deve impedir instalação; sucesso deve permitir Reiniciar e usar atualização. Verificar atalho do menu/área de trabalho.

Essas operações nativas não são declaradas aprovadas pelos mocks da suíte rápida.

## Memória e desempenho

Meça o executável release, sem servidor Vite, compilação ou DevTools em paralelo. Aguarde a leitura inicial terminar. Use o PID do processo principal:

```sh
npm run test:memory -- --pid PID --seconds 60 --output test-results/memory-visible.json
```

Repita em repouso visível, minimizado e na bandeja. Para investigar vazamento, faça dez ciclos de abrir/ocultar e uma amostragem de 10 minutos. O script soma PSS do app e de todos os descendentes WebKit, grava amostras JSON e falha se não puder medir um processo, evitando subestimar RAM. PSS evita a contagem integral repetida das páginas compartilhadas. O script mede; não minimiza a janela nem altera o fone.

Após estabelecer uma referência no mesmo computador, os limites podem bloquear uma regressão:

```sh
npm run test:memory -- --pid PID --seconds 60 --max-pss-mib LIMITE --max-growth-mib LIMITE
```

Não fixamos um número universal de RAM sem medir os ambientes suportados. Crescimento durante carregamento não prova vazamento; compare períodos já estabilizados. Registre distro, compositor, versão WebKit, RAM, modo de janela e estado da conexão. O teste em repouso com relógio simulado verifica ausência de polling; não mede consumo real.

Para latência Bluetooth, com o N50 conectado, use o release:

```sh
src-tauri/target/release/qcy-desktop --diagnose-bluetooth --diagnose-controls --benchmark-controls --quick-scan
```

Esse benchmark consulta o estado e reenvia o ANC atual para medir confirmação; exige fone disponível. Para validar níveis e presets, use respectivamente `--exercise-anc-levels` e `--exercise-presets` junto ao diagnóstico. Eles alteram ajustes temporariamente e tentam restaurar os originais; registre o estado antes e confira a restauração. Não fazem parte da instalação automática.

Critérios: feedback visual antes de terminar a operação; nenhum envio paralelo nem sucesso mostrado antes de confirmação; interação entre abas disponível durante espera; comparação de p50/p95 de pelo menos 20 operações por cenário, separando primeira conexão e sessão aquecida. A meta de feedback de 100 ms exige medição de interação real, não um timeout de teste no CI. Latências e memória devem ser comparadas à referência no mesmo ambiente.

## Evidências desta mudança

A suíte rápida passou com 12 testes Vitest e 15 testes Rust. Os seis casos Playwright passaram em Chromium. Os casos de janela nativa, ciclo longo de memória, Bluetooth real e Windows são verificações separadas e precisam de evidência própria para cada plataforma/release.

Referência inicial de memória: QCY Desktop 0.2.1 release no Ubuntu 26.04.1 LTS, janela visível, 20 segundos de amostragem, incluindo processo principal, WebKitNetworkProcess e WebKitWebProcess. Pico PSS de 225,35 MiB e variação final de -5,23 MiB. É uma medição curta de referência, sem limite de aprovação configurado; não comprova ausência de vazamentos nem mede o modo bandeja.

## Microinterações · 0.2.2

Novos testes verificam bateria baixa/carregando/zero ambíguo, gráfico com ganhos editados e confirmados, foco da banda e Desfazer. O navegador verifica a preservação do rascunho durante comando lento, indicador de espera, intensidade confirmada sem atualização otimista e reduced-motion durante a operação. A suíte passa a 14 casos Vitest, 15 Rust e 7 Playwright (36 no total). As leituras de QA continuam simuladas e identificadas; não substituem testes do hardware.
