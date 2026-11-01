import React, { useEffect, useState } from "react";
import { desktopApi, type DeviceApi } from "./api";
import { useDevice } from "./useDevice";
import { Controls } from "./Controls";
import "./style.css";
import { Updates } from "./Updates";
import { WindowSettings } from "./WindowSettings";
import { BatteryStrip } from "./BatteryStrip";
export function App({
  api = desktopApi,
  preview = false,
}: {
  api?: DeviceApi;
  preview?: boolean;
}) {
  const d = useDevice(api),
    [all, setAll] = useState(false),
    [showDiagnostics, setShowDiagnostics] = useState(false);
  const [showUpdates, setShowUpdates] = useState(false);
  const [background, setBackground] = useState(document.hidden);
  useEffect(() => {
    const update = () => setBackground(document.hidden);
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  const battery = d.details?.rcsp?.battery;
  const busy = !!d.pending;
  function download() {
    const url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            {
              captured_at: new Date().toISOString(),
              device_name: d.selected?.name,
              details: d.details,
              controls: d.controls,
            },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      ),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "qcy-diagnostico.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <div className="app-shell" data-background={background}>
      {showUpdates && <Updates onClose={() => setShowUpdates(false)} />}
      <aside className="sidebar">
        <div className="brand">
          <img src="/dueto.svg" width="32" height="32" alt=""/>
          <span>
            QCY<span className="brand-sub">Desktop</span>
          </span>
        </div>
        <div className="sidebar-heading">
          <h2>Seus dispositivos</h2>
          <button
            className="icon-button"
            aria-label="Buscar dispositivos"
            disabled={busy || !api.available}
            onClick={() => d.scan()}
          >
            {d.pending === "scan" ? <span className="spinner" /> : "↻"}
          </button>
        </div>
        <nav aria-label="Dispositivos Bluetooth">
          {d.devices
            .filter((v) => all || /qcy|n50/i.test(v.name))
            .map((v) => (
              <button
                className={`device ${d.selected?.id === v.id ? "selected" : ""}`}
                aria-current={d.selected?.id === v.id ? "true" : undefined}
                key={v.id}
                disabled={busy}
                onClick={() => d.select(v)}
              >
                <span className="device-glyph" aria-hidden="true">
                  ◉
                </span>
                <span>
                  <strong>{v.name.replace(/-APP$/, "")}</strong>
                  <small>
                    {d.selected?.id === v.id
                      ? "Selecionado"
                      : v.connected
                        ? "Bluetooth conectado"
                        : "Disponível"}
                  </small>
                </span>
              </button>
            ))}
        </nav>
        {!d.devices.length && (
          <p className="sidebar-empty">
            {d.pending === "scan"
              ? "Procurando por perto…"
              : "Tire o fone da caixa e mantenha-o perto do computador."}
          </p>
        )}
        <label className="filter">
          <input
            type="checkbox"
            checked={all}
            onChange={(e) => setAll(e.target.checked)}
          />
          Mostrar outros dispositivos
        </label>
        <div className="sidebar-footer">
          <details className="support"><summary>Apoiar o projeto</summary><p>Apoio opcional ao desenvolvimento open source.</p><label>Ethereum · rede Ethereum<input readOnly aria-label="Wallet Ethereum" value="0xD3aaCD9Bea80FF948090d8689568624E4E32511a" onFocus={e=>e.target.select()}/></label><label>Bitcoin · rede Bitcoin<input readOnly aria-label="Wallet Bitcoin" value="bc1q0mqca3hzvtrznuma4krvgf3a4lsl3wpn3wh4mg" onFocus={e=>e.target.select()}/></label></details>
          {api.available && !preview && <WindowSettings />}
          <button
            className="quiet update-trigger"
            disabled={!api.available || preview}
            onClick={() => setShowUpdates(true)}
          >
            Atualizar software
          </button>
          <p>
            O som vai pelo Bluetooth.
            <br />
            Os ajustes ficam por aqui.
          </p>
          <span>Projeto independente · N50</span>
        </div>
      </aside>
      <main>
        <div className="topline">
          <span>Seu espaço de escuta</span>
          <button
            className="quiet"
            aria-expanded={showDiagnostics}
            onClick={() => setShowDiagnostics((v) => !v)}
          >
            Diagnóstico
          </button>
        </div>
        {preview && (
          <p className="notice">
            Prévia de teste com dados gravados. Nenhum comando é enviado ao
            fone.
          </p>
        )}
        {!api.available && (
          <p className="notice">
            Use o aplicativo desktop para conectar seu fone.
          </p>
        )}
        {d.selected ? (
          <>
            <header className="device-header">
              <div>
                <p className="device-caption">Controle de áudio</p>
                <h1>
                  {d.selected.name.replace(/^QCY\s*/i, "").replace(/-APP$/, "")}
                </h1>
                <p>Mais música. Menos distração.</p>
              </div>
              <button
                className="refresh-button"
                disabled={busy}
                onClick={() => d.refresh()}
              >
                {d.pending === "read" ? (
                  <span className="spinner" />
                ) : (
                  <span aria-hidden="true">↻</span>
                )}
                <span>Atualizar leitura</span>
              </button>
            </header>
            <div
              className={`operation-status ${d.error ? "has-error" : ""}`}
              role="status"
              data-busy={busy}
              data-result={
                d.error
                  ? "error"
                  : d.controls?.errors.length
                    ? "partial"
                    : "confirmed"
              }
              aria-live="polite"
            >
              {busy ? (
                <span className="spinner" />
              ) : (
                <span className="status-mark" aria-hidden="true">
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    aria-hidden="true"
                  >
                    <path
                      d={
                        d.error || d.controls?.errors.length
                          ? "M8 2v8M8 12v2"
                          : "M2 8l4 4 8-9"
                      }
                    />
                  </svg>
                </span>
              )}
              <span key={d.status} className="status-message">
                {d.status}
              </span>
              {busy && (
                <span
                  className="operation-track"
                  role="progressbar"
                  aria-label="Aguardando resposta do fone"
                >
                  <span />
                </span>
              )}
              {d.lastRead && !busy && (
                <time>
                  {d.lastRead.toLocaleTimeString("pt-BR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </time>
              )}
            </div>
            {d.error && (
              <div className="error" role="alert">
                <strong>Não foi possível confirmar</strong>
                <p>{d.error}</p>
                <button
                  className="quiet"
                  disabled={busy}
                  onClick={() => d.run({ action: "read" })}
                >
                  Conferir estado do fone
                </button>
              </div>
            )}
            <BatteryStrip
              battery={battery}
              loading={d.pending === "read" && !d.details}
            />
            {d.details?.rcsp?.error && (
              <p className="notice">Bateria: {d.details.rcsp.error}</p>
            )}
            <Controls
              state={d.controls}
              presets={d.presets}
              pending={d.pending}
              run={d.run}
            />
          </>
        ) : (
          <section className="welcome">
            <div className="welcome-headset" aria-hidden="true">
              <svg viewBox="0 0 100 100">
                <path d="M20 60V45a30 30 0 0160 0v15M20 55h12v30H20zM68 55h12v30H68z" />
              </svg>
            </div>
            <h1>Encontre seu som.</h1>
            <p>
              Conecte o MeloBuds N50 para ajustar o ambiente e escolher a curva
              que combina com você.
            </p>
            <button
              className="primary"
              disabled={busy || !api.available}
              onClick={() => d.scan(true)}
            >
              {d.pending === "scan" ? (
                <>
                  <span className="spinner" />
                  Buscando seu fone…
                </>
              ) : (
                "Conectar meu fone"
              )}
            </button>
            <span className="hint">{d.status}</span>
            {d.error && (
              <p role="alert" className="error">
                {d.error}
              </p>
            )}
          </section>
        )}
        {showDiagnostics && (
          <section className="technical">
            <h2>Conexão e diagnóstico</h2>
            <p>
              Últimas respostas do fone. Compartilhe este arquivo para
              investigar falhas.
            </p>
            <pre>
              {JSON.stringify(
                { details: d.details, controls: d.controls },
                null,
                2,
              )}
            </pre>
            <button className="quiet" onClick={download} disabled={!d.details}>
              Salvar diagnóstico
            </button>
          </section>
        )}
        <footer className="main-footer">
          {busy
            ? "Aguardando o fone. Você pode explorar as abas enquanto isso."
            : "Os controles refletem a última leitura confirmada."}
          <span>Linux + Windows</span>
        </footer>
      </main>
    </div>
  );
}
