# QCY Desktop — manutenção

Estas regras valem para todo este projeto.

- Antes de concluir manutenção, correção, feature ou upgrade, execute `npm run check`. Corrija qualquer falha antes de instalar ou entregar.
- Para mudanças visuais/interativas, execute também `npm run test:ui`. Não enfraqueça asserções para esconder regressões.
- Para novas funcionalidades ou bugs, adicione testes de comportamento nas interfaces aprovadas: Bluetooth/comandos, estado/configurações, janela/segundo plano, interação visual e atualização/instalação.
- Simule apenas fronteiras externas (Bluetooth, IPC, relógio, sistema operacional). Não envie comandos reais ao fone na suíte rápida.
- Não instale nem atualize ignorando verificações. `scripts/install-linux.sh` executa a suíte rápida antes de substituir o binário.
- Não repita escritas Bluetooth automaticamente. Preserve a última leitura confirmada quando um comando falhar; não execute operações concorrentes no mesmo dispositivo.
- Para regressões de desempenho, compare builds release no mesmo computador. Meça PSS do app e dos processos WebKit, além de latência de confirmação. Registre condições e limites usados.
- Testes com o fone real, bandeja nativa e medições longas são verificações separadas; não declare esses casos aprovados com base em mocks ou Chromium.
- Consulte `TESTING.md` para comandos, critérios e limitações.
