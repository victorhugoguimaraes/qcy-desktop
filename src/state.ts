import type { ControlState } from "./api";
export function mergeControls(
  previous: ControlState | null,
  patch: ControlState,
): ControlState {
  return {
    noise: patch.noise ?? previous?.noise ?? null,
    eq: patch.eq ?? previous?.eq ?? null,
    errors: patch.errors,
  };
}
