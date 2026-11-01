import { invoke, isTauri } from "@tauri-apps/api/core";
export type Device = {
  id: string;
  name: string;
  connected: boolean;
  rssi: number | null;
};
export type Noise = { mode: number; scene: number; gain: number };
export type Eq = {
  mode: number;
  gains: number[];
  frequencies: number[];
  raw: number[];
};
export type ControlState = {
  noise: Noise | null;
  eq: Eq | null;
  errors: string[];
};
export type Preset = {
  id: number;
  name: string;
  source: string;
  payload: number[];
};
export type Battery = {
  left: number | null;
  right: number | null;
  case: number | null;
  charging: boolean[];
};
export type Details = {
  rcsp: {
    battery: Battery | null;
    error: string | null;
    trace: string[];
  } | null;
  services: string[];
  [key: string]: unknown;
};
export type Command = {
  action: string;
  mode?: number;
  gains?: number[];
  noise?: Noise;
  preset?: number;
};
export interface DeviceApi {
  available: boolean;
  scan: (quick?: boolean) => Promise<Device[]>;
  inspect: (id: string) => Promise<Details>;
  control: (id: string, c: Command) => Promise<ControlState>;
  presets: () => Promise<Preset[]>;
}
export const desktopApi: DeviceApi = {
  available: isTauri(),
  scan: async (quick = false) =>
    (await invoke<{ devices: Device[] }>("scan_devices", { quick })).devices,
  inspect: (id) => invoke("inspect_device", { id }),
  control: (id, c) =>
    invoke("control_device", {
      id,
      action: c.action,
      mode: c.mode ?? null,
      gains: c.gains ?? null,
      noise: c.noise ?? null,
      preset: c.preset ?? null,
    }),
  presets: () => invoke("list_presets"),
};
