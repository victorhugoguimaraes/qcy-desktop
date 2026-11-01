import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
export type CloseAction = "ask" | "tray" | "exit";
export interface WindowApi {
  preferences: () => Promise<{ close_action: CloseAction }>;
  save: (action: CloseAction) => Promise<unknown>;
  finish: (action: CloseAction, remember: boolean) => Promise<unknown>;
  onClose: (callback: () => void) => Promise<() => void>;
}
const nativeApi: WindowApi = {
  preferences: () => invoke("window_preferences"),
  save: (action) => invoke("save_window_preferences", { action }),
  finish: (action, remember) => invoke("finish_close", { action, remember }),
  onClose: (callback) => listen("choose-close", callback),
};
export function WindowSettings({ api = nativeApi }: { api?: WindowApi }) {
  const [action, setAction] = useState<CloseAction>("ask"),
    [message, setMessage] = useState(""),
    [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [asking, setAsking] = useState(false),
    [remember, setRemember] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    let active = true;
    let unlisten: (() => void) | undefined;
    api
      .preferences()
      .then((p) => {
        if (active) {
          setAction(p.close_action);
          setReady(true);
        }
      })
      .catch((e) => {
        if (active) setMessage(String(e));
      });
    api
      .onClose(() => setAsking(true))
      .then((stop) => {
        if (active) unlisten = stop;
        else stop();
      })
      .catch((e) => {
        if (active) setMessage(String(e));
      });
    return () => {
      active = false;
      unlisten?.();
    };
  }, [api]);
  useEffect(() => {
    if (asking) dialog.current?.showModal();
  }, [asking]);
  async function save(next: CloseAction) {
    setBusy(true);
    try {
      await api.save(next);
      setAction(next);
      setMessage("Preferência salva");
    } catch (e) {
      setMessage(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function finish(next: CloseAction) {
    setBusy(true);
    try {
      await api.finish(next, remember);
      if (remember) setAction(next);
      setAsking(false);
    } catch (e) {
      setMessage(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="window-settings">
      <label htmlFor="close-action">Ao fechar a janela</label>
      <select
        id="close-action"
        value={action}
        disabled={!ready || busy}
        onChange={(e) => void save(e.target.value as CloseAction)}
      >
        <option value="ask">Perguntar sempre</option>
        <option value="tray">Continuar na bandeja</option>
        <option value="exit">Encerrar o aplicativo</option>
      </select>
      <small role="status">{message}</small>
      {asking && (
        <dialog
          ref={dialog}
          className="update-dialog"
          aria-labelledby="close-title"
          onCancel={() => setAsking(false)}
        >
          <h2 id="close-title">Como prefere fechar?</h2>
          <p>
            Na bandeja, seus ajustes continuam aqui. Para abrir novamente, use o
            ícone do QCY na bandeja.
          </p>
          <label className="filter">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            Lembrar minha escolha
          </label>
          <div className="button-row">
            <button className="quiet" onClick={() => setAsking(false)}>
              Cancelar
            </button>
            <button disabled={busy} onClick={() => void finish("exit")}>
              Encerrar
            </button>
            <button
              className="primary"
              disabled={busy}
              onClick={() => void finish("tray")}
            >
              Continuar na bandeja
            </button>
          </div>
          {message && <p role="alert">{message}</p>}
        </dialog>
      )}
    </div>
  );
}
