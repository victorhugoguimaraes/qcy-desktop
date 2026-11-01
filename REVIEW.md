# Revisão 0.3.0

Falha principal encontrada: instalação usava cargo build --release sem custom-protocol. O macro Tauri seleciona configuração de desenvolvimento quando o recurso está desativado, podendo depender da URL localhost:1420. Corrigido o instalador e adicionado bloqueio de compilação para release sem o recurso. O processo iniciar não comprova a interface carregar: a verificação anterior era insuficiente.

Revisados os fluxos de scan, inspeção, serialização, parser RCSP, controles ANC/EQ, estado React, atualização, janela/bandeja, build e instalação. Atualizador agora anuncia disponibilidade apenas quando o script local existe; pacotes em computadores de terceiros não oferecem recompilação local inexistente.

Pontos que continuam exigindo evidência nativa: bandeja em diferentes desktops, Windows, desconexão física durante operações e estabilidade prolongada de memória. O diagnóstico não equivale a auditoria formal de segurança. As configurações do fone permanecem sujeitas à confirmação do protocolo.
