import type { ControlState, DeviceApi } from "../src/api";
export const initial: ControlState = {
  noise: { mode: 1, scene: 1, gain: 2 },
  eq: {
    mode: 0,
    gains: [0, 0, 0, 0],
    frequencies: [32, 250, 2000, 8000],
    raw: [],
  },
  errors: [],
};
export function fixture(): DeviceApi {
  return {
    available: true,
    scan: async () => [
      { id: "n50", name: "QCY MeloBuds N50-APP", connected: true, rssi: -40 },
    ],
    inspect: async () => ({
      services: [],
      rcsp: {
        battery: {
          left: 80,
          right: 90,
          case: 60,
          charging: [false, false, false],
        },
        error: null,
        trace: [],
      },
    }),
    control: async () => structuredClone(initial),
    presets: async () => [],
  };
}
export function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
