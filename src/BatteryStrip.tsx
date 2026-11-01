import type { CSSProperties } from "react";
import type { Battery } from "./api";
export function BatteryStrip({
  battery,
  loading,
}: {
  battery: Battery | null | undefined;
  loading: boolean;
}) {
  return (
    <section className="battery-strip" aria-label="Bateria" aria-busy={loading}>
      {(["left", "right", "case"] as const).map((part, i) => {
        const value = battery?.[part],
          known = value != null && value > 0,
          charging = !!battery?.charging[i],
          low = known && value <= 20;
        const label = ["Esquerdo", "Direito", "Caixa"][i];
        return (
          <div
            key={part}
            className="battery-cell"
            data-level={known ? (low ? "low" : "normal") : "unknown"}
          >
            <span>
              {label}
              {charging && (
                <svg
                  className="charge-icon"
                  width="14"
                  height="16"
                  viewBox="0 0 14 16"
                  aria-hidden="true"
                >
                  <path d="M8 1L2 9h4l-1 6 7-9H8z" fill="currentColor" />
                </svg>
              )}
            </span>
            <strong
              key={`${part}-${value ?? "unknown"}`}
              className={loading ? "battery-loading" : "reading-arrival"}
            >
              {known ? `${value}%` : "—"}
            </strong>
            <span
              className="battery-track"
              role={known ? "meter" : undefined}
              aria-label={
                known
                  ? `Bateria ${i === 2 ? "da caixa" : `do ${label.toLowerCase()}`}`
                  : undefined
              }
              aria-valuemin={known ? 0 : undefined}
              aria-valuemax={known ? 100 : undefined}
              aria-valuenow={known ? value : undefined}
            >
              <span
                style={
                  { "--charge": (known ? value : 0) / 100 } as CSSProperties
                }
              />
            </span>
            <small>
              {loading
                ? "Consultando…"
                : charging
                  ? "Carregando"
                  : low
                    ? "Bateria baixa"
                    : value === 0
                      ? "0% ou sem leitura"
                      : known
                        ? "Última leitura"
                        : "Sem leitura"}
            </small>
          </div>
        );
      })}
    </section>
  );
}
