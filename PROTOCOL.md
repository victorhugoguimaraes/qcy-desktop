# Investigação do MeloBuds N50

## Observações locais — 2026-11-01

Fonte: consulta BlueZ via busctl, não REA. Nenhum comando proprietário foi escrito.

- Serviço 0000a002-0000-1000-8000-00805f9b34fb.
- Característica 00000001-0000-1000-8000-00805f9b34fb: write-without-response.
- Característica 00000002-0000-1000-8000-00805f9b34fb: notify.
- Dados do fabricante 0x521c com 24 bytes.
- Serviço padrão de bateria não apareceu na consulta do usuário.

## Inferências e fontes

Quicky, commit d13c68f08a6c8b031083eede968fb443824c7af0:
https://github.com/hui1601/Quicky/blob/d13c68f08a6c8b031083eede968fb443824c7af0/internal/utils/DeviceType.go

Descreve bytes 5/6/7 do anúncio como bateria L/R/caixa, sete bits inferiores; bit superior indica carga. Esta hipótese foi implementada como experimental, sem substituir a bateria padrão. Os valores devem ser comparados ao app oficial; anúncio pode estar em cache. Zero não comprova bateria esgotada ou presença da peça.

A documentação pública consultada descreve a001/1001/1002; não estabelece equivalência com o a002/1/2 encontrado. Não transportar comandos automaticamente.

## Limites do REA

Ferramentas MCP REA ausentes. CLI rea-agents 6.8.0 doctor executada; Node 22.22.1 abaixo do requisito declarado e registro Codex ausente. Não houve análise REA de APK nem Evidence IDs; as observações acima são de ferramentas comuns. Nenhuma configuração global foi alterada.

## Próxima evidência necessária

APK oficial do QCY ou captura Bluetooth HCI do app Android conectando e alterando uma configuração por vez. Investigar primeiro o enquadramento, inicialização e consultas de estado do canal a002; validar respostas no N50 antes de habilitar ANC/EQ.

## Correção da busca e habilitação REA

O teste local `cargo run -- --diagnose-bluetooth` reproduziu GetAll em três entradas durante a busca. A consulta do N50 terminou com sucesso. A busca agora ignora falhas individuais e informa a quantidade; erros de inspeção indicam a etapa. A falha exata de cada entrada não foi estabelecida: remoção do objeto durante a busca é hipótese, não conclusão.

REA 6.8.0 instalado em work/rea-runtime com Node 24.22.2 separado. Registro Codex criado com backup. Doctor aprovou Node e registro. É necessário reiniciar/reconectar o cliente para disponibilizar as ferramentas à conversa. Motores de análise específicos, como JADX para APK, ainda não foram configurados.

## APK analisado com REA/JADX

Artefato: pacote `com.qcymall.googleearphonesetup`, versão 4.0.7, build 720; SHA-256 `27fe7666a77436ac80ff6ff73bbec315adf20f2eceeeed87672d8b20639765ba`. Análise estática; APK não executado e nenhum pacote proprietário enviado ao fone. JADX headless 0.7.1, JDK Temurin 21.0.13, em `work/android-tools`. O hash do JAR confere com a versão fixada pelo REA: `6e5eacf500b64292bfb73c49797c1958f6ee44646e43e868039ae7feb573ff75`.

### Transporte confirmado no código

`JLDeviceImpl.<clinit>` define serviço a002, escrita 00000001 e notificação 00000002. O construtor assina notificações e encaminha os bytes para `callbackReceiveDeviceData`; `writeData` envia pelo mesmo serviço. A classe herda `BtRcspOpImpl`. Evidências REA:

- UUIDs: `ev_5d79710f5532600b5abc0bc3d76de2f798bd7c196c903599ef9c7d1082e86656` (smali).
- Construtor: `ev_2e04a348f3d1b87476a998109127018cd14900bdb02043d47020f8a5c1c13f40`.
- Escrita: `ev_24e7f89a68a45a5f301bffad2e8df634dd6b09e20cfb3e52aedb3324df3fd91f`.

Isso liga os UUIDs observados no N50 ao transporte JieLi RCSP presente no APK. Não é uma confirmação de execução bem-sucedida no N50.

### Envelope RCSP

`FE DC BA | flags | opcode | comprimento (2 bytes) | corpo | EF`.

Bit 7 das flags identifica comando; bit 6 solicita resposta. O corpo de um comando começa com sequência. O de uma resposta começa com status e sequência. O comprimento inclui esses campos. O empacotador usa `CHexConverter.int2byte2`; confirmar implementação da conversão antes de escrever o codec. Correlacionar opcode/sequência, validar comprimentos e status e acumular fragmentos de notificação.

Evidência: `ev_dde40c6bf6a411ff84a7f78affd07a1a4bfa2f18bc397b0e9be683a179b5fe10` (`ParseHelper.packSendBasePacket`). Não reutilizar o frame FF documentado para a001.

### Bateria

`JLDeviceImpl.updateBattery` escolhe dois caminhos:

- Variante nova: `getCustomCMDInfo(47)`. Essa função encapsula o payload `FE 01 2F` dentro de `CustomCmd`, opcode 255; o payload não deve ser enviado isoladamente.
- Variante antiga: `getAdvInfo(3361)`, opcode 193, cujo retorno é interpretado como `ADVInfoResponse`.

Evidências: `ev_a20b84ffa0bf54672d39c1c2367b2db041c8d34301d2e6842e75c9fcd322e904` e `ev_0d7b33f5b7b84242364def3b229848766a697ab44542fd158d5e78dd8ea151ae`.

A escolha depende de `Devicebind.isNewJLDevice()`, passada pelo callback de conexão ao construtor; a presença de a002 sozinha não define a variante. Referências: `ev_8920f589b5db363d2a0ffa36479f150348378c50681a9bf83990d879bb766c50`; caller: `ev_9aed1912b1f097c4a6ff39e376353e3a6741ee16a1ae3a816b0169699a9603b7`.

### ANC

Há um caminho RCSP genérico: consulta `getAdvInfo(2048)` e alteração de atributo 11 com `NoiseMode`. Há também comando QCY específico: `setANCSenseMode(mode, scene, gain)` gera payload custom `17 03 mode scene gain`. Esse payload também exige o envelope RCSP. Ainda faltam validar limites e semântica dos parâmetros no modelo/firmware conectado.

Evidências: `ev_db7d95f5383a1b91bbd7fb859054319dc2b2ee345e3814111fab35cefd57fc1c`, `ev_2928207227c68f1befc5ea54ff6f9a0f44a8b054c6ddb67281b4ea0f775dc63f`.

### Equalizador

`getEQInfo` chama `getEqInfo`; `setEQ` passa o primeiro byte como tipo e os demais como ganhos. Tipo -1 preserva os ganhos; presets preenchem os ganhos com 127 antes de `configEqInfo`. O código também contém caminhos de EQ paramétrico custom; eles não são intercambiáveis automaticamente.

Evidências: `ev_fee02a7ad93eef3d637d9ed9680b6cce53d340d390f5b29c8f57c9f4869e01f5`, `ev_24da4f98d40347bce80d2bbe602328521b06f3698c21f0fffc8c73bbaaea9b8f`, `ev_d19fcdfff3a14c7ecce16ccf9ba7228540957d33d9afc0878817558d35a2741a`.

### Cobertura e próximos passos

Respondido: identidade do APK, transporte a002 e papéis das características, métodos usados para bateria/ANC/EQ.

Parcial: enquadramento e comandos; a inicialização chama consulta de informações do dispositivo e sincronização de hora no código, mas ainda não foi reproduzida. Não replicar sincronização de hora como parte de uma consulta somente de leitura.

Pendente: resolver seletor da variante para o anúncio real; confirmar conversões e parse de respostas; implementar codec com testes de fragmentação/status/sequência; testar uma consulta de estado no N50; só então habilitar alterações de ANC/EQ.

Assinatura: estrutura APK v2 presente, digest declarado consistente com os bytes. Isso não verifica criptograficamente a assinatura nem comprova origem oficial. Evidência REA `ev_2d8de50fdb5b9f530314acd3094cbaee06d7d27dced65f998e0308acb6c8a546`.

Registros completos das chamadas de análise foram preservados em `../qcy-apk/evidence/`; há resultados Java e smali e as limitações de cada chamada. Código decompilado não equivale a fonte original, e análise estática não comprova aceitação pelo dispositivo.

### Seletor resolvido para o anúncio observado

`Devicebind.isJLDevice`: `(vendorId & 240) == 112 || vendorId == 512`.
`Devicebind.isNewJLDevice`: `(vendorId & 33008) == 32880`.

Aplicando o vendorId observado pelo BlueZ, 18298 (`0x477a`): JL = verdadeiro, newJL = falso. Portanto, nesse APK, esse identificador seleciona o caminho **antigo**: bateria por GetADVInfo opcode 193, máscara 3361; não o payload custom FE 01 2F da variante nova. É uma derivação estática vinculada ao anúncio observado, não uma resposta de hardware.

Evidências: `ev_1a0bb4f1b86531fc5e70e53f5836e4df9de46d614750521dd9762919bca4d332` e `ev_f2f58a5bd66e7750e6f5cf4102617e4fbd357c27116581939d60d79702fef33f`.

Atualização da cobertura: seletor respondido para vendor 18298. Permanecem pendentes inicialização mínima de consulta, implementação do codec/parser e validação no hardware.

## Implementação e validação no hardware

Em 2026-11-01, no Linux, o aplicativo encontrou o vendor 18298 e assinou a característica de notificação a002/00000002. Foi enviado exclusivamente GetADVInfo(mask=3361) pelo canal write-without-response a002/00000001.

TX: `fe dc ba c0 c1 00 05 40 00 00 0d 21 ef`

RX: `fe dc ba 00 c1 00 0d 00 40 02 0a 02 02 05 01 04 00 64 64 00 ef`

Opcode C1, sequência 40 e status 00 conferem. TLV de bateria: `04 00 64 64 00`, com L=100, R=100, caixa=0 e indicadores de carga desativados. A leitura não dependeu de inicialização TargetInfo nem sincronização de hora nessa sessão já pareada. Conexões BLE novas ainda precisam de validação específica; o aplicativo solicita conexão se necessário.

O anúncio disponível na mesma consulta retornava L=0, R=100, caixa=0; a tela agora prioriza a resposta RCSP e mantém o anúncio bruto apenas no diagnóstico quando a leitura RCSP tem sucesso. A resposta real foi adicionada aos testes de regressão. Zero é mostrado como “0% / ausente”; não há inferência de presença da caixa.

Arquitetura: rcsp.rs contém codec/validação de frames e TLVs sem dependência de Bluetooth; qcy_ble.rs coordena assinatura, escrita da consulta, timeout, seleção por opcode/sequência e encerramento da assinatura. O chamador limita a consulta ao vendor 0x477a; nenhum comando de alteração foi implementado. O resultado e os bytes TX/RX acompanham o diagnóstico exportável.

Endianness confirmado por REA no método CHexConverter.int2byte2: `ev_41d392e8474aceec7d195ca0242fb13ae54b0fd173bae81acf3555ea8249b7c8`.

Não validado: Windows, outros firmwares/modelos, controle de ANC/EQ, e leitura da caixa quando presente e anunciando outro valor. A observação de hardware acima veio do aplicativo Rust/BlueZ, não de execução Android nem de REA.

## Correção de timeout após reabrir o processo

Reprodução controlada: uma nova execução com a mesma sequência 0x40 não recebeu RX; alterar apenas a sequência para 0x41 recebeu resposta válida. Repetir 0x41 em outra execução voltou a expirar. A camada exata que suprime a repetição (firmware ou caminho BlueZ/notificações) não foi isolada; a dependência da sequência foi observada com o mesmo comando e conexão.

Correção: contador por processo inicializado com valor variável, evitando o reinício fixo em 0x40. Se houver timeout, repetir a consulta de bateria uma única vez com outra sequência. Respostas são correlacionadas por opcode e sequência; status de erro, TLV inválido e fluxo encerrado não geram repetição. Não há reconexão forçada, alteração de ANC/EQ ou comandos de reset.

Validação: nove testes Rust passaram, incluindo primeiro envio ignorado, resposta atrasada da primeira sequência antes da resposta correta, rejeição RCSP sem retry e limite de duas tentativas. Após a correção, sequência 0xa2 recebeu resposta válida L=100, R=100, caixa=0 no hardware local. O teste unitário usa timeout curto; o aplicativo mantém 5 segundos por tentativa.

## Controles e interface

Consulta ANC custom FF/FE0117 retornou 1703020100. Escrita FF/1703010500 (cancelamento adaptativo) foi confirmada como modo1/cena5/ganho0; FF/1703030104 (transparência) foi confirmada como modo3/cena1/ganho4. O modo original 2/1/0 foi restaurado. Modo normal pode normalizar a cena para1; verificação considera modo e, para ANC adaptativo, cena.

EQ genérico07 respondeu só FF. O N50 disponibiliza EQ paramétrico por FF/FE0122. Retorno 2249... tem índice, master gain i16LE e dez bandas de7 bytes: frequência u16LE, ganho i16LE/100, Q u16LE/100 e tipo. Preservamos a ordem original das bandas, master gain, frequência, Q e tipo; apenas índice customFF e ganhos são alterados. A interface ordena as bandas para apresentação, mas o envio mantém a ordem recebida.

Validação real: banda32Hz de +1dB para +0,5dB; retorno confirmou índiceFF e ganhos corretos. Depois, o payload original foi reenviado e o retorno coincidiu byte a byte, inclusive índice122, master gain -1589 e filtrosFF. Não interpretar índice122 ou filtroFF como enumeração conhecida.

Não há retry automático de setters. Um timeout indica estado desconhecido; frontend consulta de novo. Transações serializadas pelo backend e limitadas por timeout. Modelo aceito para controle: vendor18298. Resta validar conexão/MTU do Windows; a validação Linux usou MTU247. Gestos, ganho master e parâmetros Q não foram expostos na UI.

Interface reorganizada em dispositivos, bateria, ambiente e som; diagnóstico recolhido; estado em edição separado da leitura confirmada. Curva e rótulos são baseados na leitura real, sem estado demonstrativo em produção. Fontes de codec preservadas em work/controles-n50 durante a investigação.

## Níveis ANC e presets paramétricos oficiais

O painel oficial da API QCY `product/findControlPanels` para modelId18298 declara cenas ANC ruidoso1, transporte2 e interior3 com níveis0/1/2; antivento4 e adaptativo5 fixam nível0. Transparência é3/1/4; normal2/0/0, normalizado no retorno para2/1/0. O APK impõe intervalo superior a500ms entre setters; backend agora usa550ms, valida combinações e confirma também o nível manual, não apenas modo/cena. A confirmação consulta até três vezes, sem reenviar setters. Espera180ms entre ACK e consulta ajuda a observar aplicação do DSP; não estabelece causa única para toda instabilidade possível.

Validação hardware concluída:1/1/0,1/1/2,1/2/1,1/3/2,1/4/0,1/5/0 confirmados por retorno. Restaurado estado original1/5/0.

API oficial forneceu seis presets: Default1, Pop2, HeavyBass3, Rock4, Soft5, Classic6. Esses IDs são atribuídos por `analyseEQJSON` como i+1; `setEQWtihQFG2` envia filtros PEQ exatos e master-7.5dB. Presets não são aproximações gráficas de10 bandas. Implementação inclui filtros, Q, tipos e frequências do painel; parser aceita1–10 filtros, apresenta em ordem crescente e preserva ordem original no envio. Fonte foi selecionada sem versão de firmware, faixa declarada0.0.0.0–0.5.2.0; leitura posterior exige payload idêntico antes de declarar sucesso. A seleção do painel para outros firmwares permanece não comprovada.

Preset autoral id20, “Victor · Rap & MPB”: payload custom22/índiceFF, 10 filtros peak(type2), master-5dB, frequências32,64,125,250,500,1000,2000,4000,8000,16000 e ganhos2,1.5,.5,-1,-.5,0,1,.5,-1,-.5. É sugestão de timbre inicial; não resulta de medição acústica, análise de áudio ou histórico privado. Base: playlists públicas rap br e melancolia/mpb do perfil fornecido; primeiros25 títulos visíveis de cada lista e artistas públicos exibidos no perfil. Observados Sain,BK,Racionais,Djonga; Clarice Falcão,Rubel,Djavan,Marisa Monte; perfil também exibiu Pink Floyd,Kendrick,Miguel,A$AP Rocky,Tyler. Não se inferem frequências de reprodução ou favoritos privados.

O teste dos novos presets no hardware foi interrompido antes de qualquer setter: conexão BLE indisponível/le-connection-abort-by-local. ANC níveis tem validação anterior; novos presets oficiais/pessoal passam por testes do codec, mas aguardam validação física nesta etapa. Nenhuma curva foi aplicada permanentemente pelo agente.

## Validação final após reconexão

A conexão de áudio Mel estava ativa; o canal de controle N50-APP apareceu após descoberta LE de12s e conectou com sucesso. Com o canal conectado, o executável testou os presets oficiais IDs1–6 e o preset autoral Victor(id20/índiceFF). Todos retornaram `Ok` após comparação do payload completo recebido. O payload original foi restaurado e o estado final coincidiu exatamente com o EQ capturado antes do teste. Nenhum preset pessoal foi deixado aplicado automaticamente.

Resultados: Padrão QCY1, Pop2, Graves fortes3, Rock4, Suave5, Clássica6 e Victor255 aceitos com frequências/Q/tipos/master e ganhos iguais ao solicitado. Essa validação comprova aplicação e leitura no firmware conectado; a avaliação auditiva de timbre permanece com o usuário. O teste prévio dos níveis de ANC também passou; não houve novos setters ANC nesta validação.

A pendência de validação física dos presets registrada na seção anterior está resolvida para este N50/Linux. Windows continua sem teste físico. Descoberta do canal de controle pode demorar mais que a conexão de áudio.

## Desempenho e sessões de operação

qcy_ble::Session abre uma assinatura de notificações para a operação e executa as requisições serialmente, encerrando-a ao terminar. Leituras podem repetir uma vez após timeout; setters continuam sem repetição automática. Setters retornam somente o bloco confirmado: ANC não consulta EQ e presets não consultam ANC. EQ manual lê a curva atual antes de preservar seus parâmetros, envia e confirma. O frontend combina o patch com a última leitura, preservando a referência do EQ quando chega apenas ANC (evita apagar rascunhos).

Medições locais no mesmo N50/Linux, observações isoladas e sem garantia universal: leitura de controles629→360ms; setter ANC idempotente confirmado1530→673ms. Busca completa+bateria+controles5,75s; caminho rápido com N50 já conectado0,56s. Caminhos de descoberta distintos; a melhora de abertura decorre de evitar a espera fixa de5s quando o dispositivo já está conectado, não de acelerar a descoberta real.

Regressão no hardware após refatorar: sete presets passaram, payload de EQ original restaurado exatamente; seis combinações de cena/nível ANC confirmadas e ANC original restaurado. Medições e logs de desenvolvimento em work/performance. Três testes frontend conferem merge parcial e preservação de estado; doze testes Rust de codec, retries, ANC e presets permanecem passando.

Frontend separado em api.ts, useDevice.ts, state.ts, App.tsx e Controls.tsx. Atualização não esvazia a tela; aba e edições continuam acessíveis enquanto o envio está pendente. Envios continuam serializados e só recebem confirmação visual após resposta real. A prévia de QA usa uma API injetada em pasta work separada, sem caminho de demonstração no entrypoint de produção.

## Empacotamento e atualização local

Versão0.2.0: build otimizado, pacote.deb, instalação por usuário com menu e atalho desktop. O comando start_local_update dispara um worker nativo sem bloquear UI; invoca exclusivamente scripts/install-linux.sh do projeto de origem fixado por CARGO_MANIFEST_DIR. O script compila frontend e release, mantém backup do binário anterior e usa arquivo temporário+rename para a instalação. flock protege contra builders simultâneos. Registros limitados a120 linhas; frontend consulta estado1x/s apenas enquanto o diálogo está aberto. Reinício permitido após fase ready e inicia o caminho de instalação conhecido.

Não há endpoint de atualizações remotas ou execução de código baixado. O botão requer o projeto e ferramentas locais. A instalação final usa diretórios XDG por usuário e não depende de privilégios administrativos. Versão pode ser consultada sem GUI usando --version. --update-installed exercita a mesma implementação do worker para integração.
