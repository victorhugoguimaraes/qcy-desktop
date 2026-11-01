import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
type Status = {
  phase: "idle" | "building" | "ready" | "error";
  message: string;
  log: string[];
  version: string;
  local: boolean;
};
export function Updates({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [status, setStatus] = useState<Status | null>(null),
    [error, setError] = useState(""),
    [starting, setStarting] = useState(false);
  useEffect(() => {
    dialog.current?.showModal();
    let active = true;
    void invoke<Status>("update_status")
      .then((s) => {
        if (active) setStatus(s);
      })
      .catch((e) => {
        if (active) setError(String(e));
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (status?.phase !== "building") return;
    let active = true;
    const timer = setInterval(() => {
      void invoke<Status>("update_status")
        .then((s) => {
          if (active) setStatus(s);
        })
        .catch((e) => {
          if (active) setError(String(e));
        });
    }, 1000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [status?.phase]);
  async function start() {
    setStarting(true);
    setError("");
    try {
      setStatus(await invoke<Status>("start_local_update"));
    } catch (e) {
      setError(String(e));
    } finally {
      setStarting(false);
    }
  }
  async function restart() {
    setError("");
    try {
      await invoke("restart_installed");
    } catch (e) {
      setError(String(e));
    }
  }
  return (
    <dialog
      ref={dialog}
      className="update-dialog"
      aria-labelledby="update-title"
      onCancel={onClose}
    >
      <div className="section-heading">
        <h2 id="update-title">Atualizar QCY Desktop</h2>
        <button
          className="icon-button"
          aria-label="Fechar atualização"
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <p>
        Versão instalada em execução: <strong>{status?.version ?? "…"}</strong>
      </p>
      <p>
        Este botão compila e instala as alterações do projeto local. Ele precisa
        dos arquivos do projeto, Node e Rust neste computador. Não busca versões
        na internet.
      </p>
      <div className="update-state" role="status" aria-live="polite">
        {status?.phase === "building" && (
          <progress aria-label="Compilando atualização" />
        )}
        <p>{status?.message ?? "Consultando instalação…"}</p>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {status?.log.length ? (
        <details className="update-log">
          <summary>Detalhes da atualização</summary>
          <pre>{status.log.join("\n")}</pre>
        </details>
      ) : null}
      <div className="button-row">
        <button className="quiet" onClick={onClose}>
          {status?.phase === "building" ? "Continuar usando o app" : "Fechar"}
        </button>
        {status?.phase === "ready" ? (
          <button className="primary" onClick={restart}>
            Reiniciar e usar atualização
          </button>
        ) : (
          <button
            className="primary"
            disabled={!status?.local || status.phase === "building" || starting}
            onClick={start}
          >
            {status?.phase === "building" ? "Atualizando…" : "Atualizar agora"}
          </button>
        )}
      </div>
    </dialog>
  );
}
