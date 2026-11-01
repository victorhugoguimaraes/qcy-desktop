# QCY Desktop

Utilitário para encontrar e inspecionar fones QCY no Linux e Windows. Intenção: operar; variação baixa, movimento mínimo e densidade média. A primeira leitura deve ser “encontrar meu fone e consultar sua conexão”.

Rascunho: cabeçalho com nome e busca; coluna de dispositivos; painel com nome, estado, bateria e serviços disponíveis. Sem dados simulados. Controles proprietários só aparecem quando houver implementação validada.

Tokens: fundo #eef1f4; superfície #ffffff; texto #1d2935; secundário #526171; acento #1766a5; borda #cbd3dc. Fonte do sistema para integração ao desktop. Tamanhos 14/16/22/30px, espaçamento 4/8/12/16/24/32px, raio 6px. Foco de teclado azul, sem animação decorativa. Referência funcional: utilitários Bluetooth do sistema; prioridade para lista, seleção e detalhes.

## Evolução para painel de áudio

O painel passa a operar o N50, não apenas inspecioná-lo. Organizar em lista de dispositivos, resumo de bateria, modos de ruído e equalizador. Diagnóstico recolhido. Superfície prata #f1f2f3, painel branco #ffffff, tinta #20242a, texto secundário #5b626c, azul de ação #1766a5. Fonte do sistema; números tabulares e curvas desenhadas com SVG para representar o som. Sem dados simulados. Leitura corrente e valores em edição separados; confirmação por resposta e leitura posterior. Variação baixa, movimento mínimo, densidade média.

## Revisão de interação e desempenho

Painel de escuta com superfícies claras, azul funcional e tipografia do sistema. Lista de dispositivos vira faixa superior em janela estreita. Bateria permanece visível e as abas Ambiente/Equalizador preservam rascunhos; navegação funciona durante respostas lentas. Indicadores ficam na operação em curso. Presets e curvas exibem valores recebidos, sem confirmação otimista. Erros preservam a última leitura e oferecem atualização explícita. Respeita reduced-motion e foco visível.

Verificação em prévia de QA separada da produção: desktop padrão, tablet768px e largura390px. Sem overflow da página; rolagem interna intencional nas10 bandas. Testada edição de32Hz, troca de aba, alteração ANC com900ms simulados e retorno ao EQ mantendo o rascunho. Dados de QA identificados na tela e sem comandos ao hardware.

## Microinterações e dados · 0.2.2

Mantém a intenção de operar: mesma paleta e estrutura, movimento curto e localizado. Abas têm indicador deslizante e entrada de painel em 220 ms; botões respondem ao pressionar em 140 ms; diálogos entram em 200 ms; barras de bateria interpolam a leitura em 480 ms usando transform. Não há animação decorativa em repouso, biblioteca adicional de gráficos ou loop JavaScript de renderização.

Bateria: medidores acessíveis para valores conhecidos, aviso textual para carga baixa (até 20%), ícone de carregamento e trilha segmentada para valor desconhecido. O padrão segmentado usa repeating-linear-gradient apenas para distinguir falta de leitura, não como fundo decorativo; justifica os dois alertas do detector de UI. Zero continua ambíguo no protocolo e não é transformado numa leitura confiável.

EQ: SVG leve com eixo logarítmico de frequência, escala de ganho, pontos dos filtros e legenda. Linha contínua é a leitura confirmada; tracejada é o rascunho. Foco/toque no slider realça sua banda e mostra os dois ganhos. O gráfico representa os ganhos dos filtros; não é resposta acústica calculada/medida nem um analisador da música. O resumo do ANC representa apenas modo, cena e nível confirmados, sem inventar porcentagem de cancelamento.

Espera: barra indeterminada só enquanto há operação; sucesso e falha dependem da resposta existente. Reduced-motion remove animações/transições e mantém feedback estático. Eventos de visibilidade pausam animações quando a página fica oculta; não geram consultas Bluetooth. A aparência foi revisada em capturas desktop/tablet/mobile, com testes que também verificam foco, preservação de rascunho e movimento reduzido durante uma operação simulada.
