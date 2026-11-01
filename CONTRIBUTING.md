# Contribuir

Issues e pull requests são bem-vindos. Informe versão, distribuição, desktop e como reproduzir. Remova endereços Bluetooth e dados pessoais dos diagnósticos antes de publicar.

Use Node 22.12+ e Rust estável, `npm ci`, `npm run check` e `npm run test:ui`. Instale Chromium para os testes de UI com `npx playwright install chromium`. Mudanças de comportamento devem ter teste de regressão. Não altere automaticamente o estado do fone durante testes comuns. Consulte TESTING.md e PROTOCOL.md.

Build de produção: `npm run tauri -- build --bundles deb` ou `cargo build --release --features custom-protocol --manifest-path src-tauri/Cargo.toml` após `npm run build`. O recurso custom-protocol é obrigatório para embutir a interface.
