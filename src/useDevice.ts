import { useEffect, useRef, useState } from "react";
import {
  type Command,
  type ControlState,
  type Details,
  type Device,
  type DeviceApi,
  type Preset,
} from "./api";
import { mergeControls } from "./state";
export function useDevice(api: DeviceApi) {
  const [devices, setDevices] = useState<Device[]>([]),
    [selected, setSelected] = useState<Device | null>(null),
    [details, setDetails] = useState<Details | null>(null),
    [controls, setControls] = useState<ControlState | null>(null),
    [presets, setPresets] = useState<Preset[]>([]);
  const [pending, setPending] = useState<string | null>(null),
    [status, setStatus] = useState("Pronto para conectar"),
    [error, setError] = useState(""),
    [lastRead, setLastRead] = useState<Date | null>(null);
  const started = useRef(false),
    inFlight = useRef(false),
    version = useRef(0);
  async function load(device: Device) {
    const token = ++version.current;
    const different = selected?.id !== device.id;
    setSelected(device);
    if (different) {
      setDetails(null);
      setControls(null);
    }
    setError("");
    setPending("read");
    setStatus("Lendo bateria…");
    try {
      const d = await api.inspect(device.id);
      if (version.current !== token) return;
      setDetails(d);
      setStatus("Lendo controles…");
      const c = await api.control(device.id, { action: "read" });
      if (version.current !== token) return;
      setControls(c);
      setLastRead(new Date());
      setStatus(c.errors.length ? "Leitura parcial: confira os avisos dos controles" : "Fone pronto");
      try {
        localStorage.setItem("qcy-last-device", device.id);
      } catch {}
    } catch (e) {
      if (version.current === token) {
        setError(String(e));
        setStatus("Não foi possível concluir a leitura");
      }
    } finally {
      if (version.current === token) setPending(null);
    }
  }
  async function scan(auto = false) {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending("scan");
    setError("");
    setStatus("Procurando seu fone…");
    try {
      const found = await api.scan(auto);
      setDevices(found);
      const qcy = found.filter((d) => /n50|qcy/i.test(d.name));
      setStatus(
        qcy.length
          ? "Escolha seu fone"
          : "Não encontrei o N50. Tire-o da caixa e busque novamente.",
      );
      if (auto && qcy.length) {
        let remembered = "";
        try {
          remembered = localStorage.getItem("qcy-last-device") ?? "";
        } catch {}
        await load(qcy.find((d) => d.id === remembered) ?? qcy[0]);
      }
    } catch (e) {
      setError(String(e));
      setStatus("A busca não terminou");
    } finally {
      inFlight.current = false;
      setPending(null);
    }
  }
  async function select(d: Device) {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      await load(d);
    } finally {
      inFlight.current = false;
    }
  }
  async function refresh() {
    if (selected) await select(selected);
  }
  async function run(command: Command) {
    if (!selected || inFlight.current) return;
    inFlight.current = true;
    setError("");
    const group =
      command.action === "noise"
        ? "noise"
        : command.action === "read"
          ? "read"
          : "eq";
    setPending(group);
    setStatus(
      group === "noise"
        ? "Aplicando ambiente…"
        : group === "eq"
          ? "Aplicando equalizador…"
          : "Atualizando controles…",
    );
    const t = performance.now();
    try {
      const patch = await api.control(selected.id, command);
      setControls((old) => mergeControls(old, patch));
      setLastRead(new Date());
      setStatus(
        patch.errors.length ? "Leitura parcial: confira os avisos dos controles" : `Confirmado pelo fone em ${((performance.now() - t) / 1000).toFixed(1)} s`,
      );
    } catch (e) {
      setError(String(e));
      setStatus(
        "A alteração não foi confirmada. Atualize para conferir.",
      ); /* Keep the last confirmed state; no hidden second long operation. */
    } finally {
      inFlight.current = false;
      setPending(null);
    }
  }
  useEffect(() => {
    if (started.current || !api.available) return;
    started.current = true;
    void api
      .presets()
      .then(setPresets)
      .catch(() => {});
    void scan(true);
  }, [api]);
  return {
    devices,
    selected,
    details,
    controls,
    presets,
    pending,
    status,
    error,
    lastRead,
    scan,
    select,
    refresh,
    run,
  };
}
