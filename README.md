# QCY Desktop

Protótipo independente para Linux e Windows: Tauri 2, Rust, React e TypeScript.

## O que está implementado

- Busca de dispositivos Bluetooth LE com filtro por nome QCY.
- Consulta de serviços GATT e leitura do serviço padrão de bateria, quando disponível.
- Estados de busca, seleção, ausência de dispositivos e falhas.
- Consulta RCSP de bateria para MeloBuds N50 vendor 0x477a: bateria por lado e caixa, com indicadores de carga.
- A consulta envia uma solicitação de leitura pelo canal proprietário; não altera configurações.
- Diagnóstico exportável com os pacotes TX/RX e atualização manual da leitura.

ANC e equalizador foram implementados com confirmação por leitura posterior. Gestos ainda não estão implementados. A bateria individual foi validada no N50 conectado pelo Linux. O protocolo do N50 foi identificado no APK QCY 4.0.7; os controles ainda exigem validação. Fones que não anunciam BLE podem não aparecer. O áudio é conectado pelo sistema operacional; este aplicativo consulta a interface BLE de controle.

## Preparar o ambiente

Instale Node.js 22.12+ e Rust estável (incluindo Cargo).

Linux (Debian/Ubuntu):

```sh
sudo apt update
sudo apt install build-essential pkg-config libwebkit2gtk-4.1-dev libgtk-3-dev libdbus-1-dev libayatana-appindicator3-dev librsvg2-dev patchelf bluez
```

O serviço Bluetooth/BlueZ precisa estar ativo e o usuário deve ter acesso ao Bluetooth da sessão. Não execute o aplicativo como root. Outras distribuições usam pacotes equivalentes.

Windows: instale Microsoft C++ Build Tools com a carga de trabalho Desktop development with C++, WebView2 e Rust com toolchain MSVC.

Referência de requisitos: https://v2.tauri.app/start/prerequisites/

## Executar

Na pasta deste projeto:

```sh
npm install
npm run tauri dev
```

Para visualizar apenas a interface no navegador, use `npm run dev`. O Bluetooth só funciona no aplicativo desktop.

## Compilar

```sh
npm run build
cargo check --manifest-path src-tauri/Cargo.toml
npm run tauri build
```

Gere e valide os pacotes separadamente em Linux e Windows. Binários ficam em `src-tauri/target/release/bundle/`. O projeto inclui ícone de distribuição; os instaladores não são assinados.

## Validação pendente

Consulte TESTING.md para a suíte de testes e evidências atuais. A consulta real GetADVInfo ao N50 retornou 100% no esquerdo, 100% no direito e 0 na caixa. Zero é apresentado como “0% / ausente”, pois não comprova a presença da caixa. Os testes cobrem fragmentação, sequência, status, limites de TLV, a resposta real capturada e repetição limitada após timeout. Cada processo inicia com uma sequência variável; o aplicativo tenta outra sequência uma única vez se não receber resposta.

Windows ainda não foi validado em hardware. A leitura RCSP é habilitada apenas para vendor 0x477a e características a002/1/2 compatíveis.

Diagnóstico sem abrir a interface:

```sh
cargo run --manifest-path src-tauri/Cargo.toml -- --diagnose-bluetooth
```

Esse comando procura o N50 e executa uma consulta de bateria; não altera ANC, EQ ou firmware. Acrescente `--diagnose-controls` para consultar ANC e EQ. As opções `--exercise-controls` e `--exercise-eq` são testes de desenvolvimento: alteram configurações temporariamente e tentam restaurar os valores originais; não são necessárias para uso normal.

## Protocolo

Consulte PROTOCOL.md para as evidências de engenharia reversa e validação local de ANC/EQ.


## Controles

Selecione o N50 após buscar dispositivos. Os modos Normal, Cancelamento e Transparência consultam o estado do fone após a alteração. O equalizador mostra os filtros da curva atual (até dez), com ajuste de -12 a +8 dB em passos de 0,5 dB. Presets oficiais têm quatro ou cinco filtros paramétricos; o preset Victor usa dez. Edite a curva e clique em Aplicar equalizador. Os parâmetros de frequência, Q, tipo de filtro e master gain recebidos são preservados; o botão Zerar ganhos zera os ganhos de banda, sem alterar o master gain. Operações sem confirmação retornam erro, preservam a última leitura e permitem conferir o estado explicitamente. Nenhuma atualização de firmware é implementada.

Validado no N50 via Linux: leitura dos três componentes de bateria, ativação de ANC adaptativo, transparência, restauração exata do modo anterior; alteração de 32 Hz em -0,5 dB com confirmação e restauração byte a byte do EQ original. Windows ainda precisa de validação com hardware.


### ANC e presets

ANC: Ambiente ruidoso, Transporte e Interior com níveis Fraco/Médio/Forte; Adaptativo e Antivento sem slider de intensidade. Selecione cena/nível e clique em Aplicar ANC. Envios são espaçados e a leitura confirma modo, cena e intensidade. Esses níveis foram validados no hardware.

Presets: Padrão QCY, Pop, Graves fortes, Rock, Suave, Clássica e Victor · Rap & MPB. Os seis primeiros usam filtros/índices do painel oficial, não curvas inventadas. O painel foi selecionado sem firmware específico (faixa declarada até0.5.2.0); aplicação exige readback exato. Após reconectar o canal N50-APP, os sete presets foram aplicados e confirmados por leitura no hardware; o EQ anterior foi restaurado exatamente. O anterior controle de EQ manual foi validado.

Victor é uma sugestão autoral baseada na amostra pública das playlists fornecidas, com subgrave moderado, redução de médios graves, presença vocal discreta e agudos mais contidos. Não é correção medida do N50 nem análise do histórico privado. Master -5dB. O botão aplica explicitamente; o software não muda presets automaticamente com a música.

## Interface e desempenho

Ao abrir, o aplicativo procura o N50 automaticamente e tenta o último dispositivo selecionado. Se ele já estiver conectado, usa a lista Bluetooth existente para evitar a espera fixa da descoberta; Buscar dispositivos continua fazendo uma busca completa. A bateria aparece antes do restante da leitura.

As abas Ambiente e Equalizador permanecem navegáveis durante operações. A tela mantém a última leitura; só o envio é serializado, e a resposta atualiza o bloco afetado. Alterar ANC não descarta ganhos em edição. Há Desfazer para o rascunho do EQ e feedback de aplicação, confirmação e falha. Layout revisado para desktop/tablet/janelas estreitas, incluindo rolagem interna das bandas.

Medições locais exemplificativas: ANC confirmado1,53→0,67s; controles0,63→0,36s. Abertura com N50 conectado0,56s, versus5,75s do fluxo anterior com descoberta completa. Isso depende do estado do Bluetooth. Uma falha real ainda pode aguardar o timeout; não há confirmação simulada para esconder a espera.

## Aplicativo instalado e atualizações locais (Linux)

Versão0.2.1 inclui instalação por usuário, sem sudo:

```sh
npm run install:linux
```

O instalador compila a interface e o binário release e instala em `$XDG_DATA_HOME/qcy-desktop` (normalmente `~/.local/share/qcy-desktop`). Cria uma entrada QCY Desktop no menu e um atalho na área de trabalho, se a pasta existir. A instalação mantém o executável anterior como `qcy-desktop.previous`; substitui o binário por renomeação atômica. Testes são obrigatórios antes da substituição; não há modo de pular verificações.

No aplicativo, Atualizar software → Atualizar agora executa esse mesmo instalador em segundo plano. Mostra logs limitados e estado de progresso; permite continuar usando o app. Após sucesso, Reiniciar e usar atualização inicia o executável instalado. Há bloqueio contra atualizações simultâneas. Se a compilação falhar, não apaga o executável existente.

Este é um atualizador **local**, para o fluxo de desenvolvimento deste projeto: os arquivos originais, Node/npm e Rust/Cargo precisam continuar disponíveis. A origem é o diretório fixado na compilação, não um caminho/comando enviado pelo frontend. Ele não baixa código, não busca releases remotos e não instala novos pré-requisitos. O runtime do aplicativo não exige Node/Rust; apenas o botão de recompilação local os utiliza.

Distribuição: `npm run tauri -- build --bundles deb` gera o pacote Debian/Ubuntu em `src-tauri/target/release/bundle/deb/`. O pacote depende das bibliotecas nativas do sistema. Um updater remoto para distribuição a terceiros exigirá releases publicadas, endpoint e assinatura de atualização; isso ainda não está configurado. O instalador/atualizador local desta versão é Linux. Windows requer build em Windows e canal de distribuição próprio.

Validação da versão0.2.0:14 testes Rust e build de produção passaram; worker local compilou e instalou até estado ready; atalhos desktop e menu validados com desktop-file-validate; executável instalado respondeu --version; pacote.deb amd64 gerado. Atalho desktop marcado como confiável via metadados do ambiente GNOME, quando suportado.

## Testes e segundo plano

Execute `npm run check` antes de entregar alterações e `npm run check:release` para validar também a interface. O instalador e o botão de atualização exigem a suíte rápida. Consulte [TESTING.md](TESTING.md) para cobertura, desempenho e verificações nativas.

Ao fechar a janela, escolha continuar na bandeja ou encerrar. Marque Lembrar minha escolha ou altere a preferência em Ao fechar a janela. Na bandeja, Abrir QCY Desktop restaura a janela; Encerrar termina o app. Rascunhos são mantidos enquanto o processo continua aberto.

## Feedback visual · 0.2.2

Abas, botões e diálogos têm transições curtas; leituras de bateria mostram carga baixa, carregamento e estado desconhecido. O gráfico do EQ distingue ganhos confirmados e rascunho, com frequência em escala logarítmica e destaque da banda focada. O resumo de ANC sempre usa a última confirmação do fone. Movimento reduzido desliga animações e transições; visibilidade da página pausa animações em segundo plano. Não há nova biblioteca de gráficos/animações nem consultas Bluetooth adicionais para os efeitos. Os 36 testes incluem os novos estados e interações.

## Open source e apoio

Projeto independente, sem afiliação com a QCY. Código e identidade Dueto sob [MIT](LICENSE). Veja [CONTRIBUTING.md](CONTRIBUTING.md) e [avisos de terceiros](THIRD_PARTY_NOTICES.md).

Apoio opcional: [endereços Ethereum e Bitcoin](DONATE.md), também disponíveis em **Apoiar o projeto** no aplicativo. Não há recursos pagos ou obrigatoriedade de doação.

### Correção 0.3.0

O instalador agora embute a interface com `custom-protocol`. Releases sem esse recurso são rejeitadas na compilação, evitando dependência acidental do servidor Vite. A atualização local só fica disponível quando o projeto de origem está presente. Identidade Dueto aplicada aos ícones e à interface.
