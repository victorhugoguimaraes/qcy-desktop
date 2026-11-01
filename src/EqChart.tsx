import { useId } from "react";
import type { Eq } from "./api";
const gainLabel = (value: number) =>
  `${value > 0 ? "+" : ""}${value.toLocaleString("pt-BR")} dB`;
const frequencyLabel = (value: number) =>
  value >= 1000
    ? `${(value / 1000).toLocaleString("pt-BR")} kHz`
    : `${value} Hz`;
export function EqChart({
  eq,
  gains,
  active,
}: {
  eq: Eq;
  gains: number[];
  active: number | null;
}) {
  const description = useId();
  const dirty = gains.some((g, i) => g !== eq.gains[i]);
  const x = (f: number) =>
    40 +
    ((Math.log10(f) - Math.log10(20)) / (Math.log10(20000) - Math.log10(20))) *
      540;
  const y = (g: number) => 24 + ((8 - g) / 20) * 112;
  const points = (values: number[]) =>
    eq.frequencies
      .map((f, i) => `${x(f)},${y(values[i] ?? eq.gains[i])}`)
      .join(" ");
  const selected = active == null ? -1 : eq.frequencies.indexOf(active);
  return (
    <figure className="eq-visualization">
      <figcaption className="chart-caption">
        <span>Ganhos por frequência</span>
        <div className="chart-legend">
          <span className="confirmed-key">No fone</span>
          {dirty && <span className="draft-key">Em edição</span>}
        </div>
      </figcaption>
      <svg
        className="eq-chart"
        viewBox="0 0 600 166"
        role="img"
        aria-label="Ganhos do equalizador por frequência"
        aria-describedby={description}
      >
        <desc id={description}>
          {eq.frequencies
            .map(
              (f, i) =>
                `${f} Hz: ${gainLabel(gains[i] ?? eq.gains[i])}; confirmado: ${gainLabel(eq.gains[i])}`,
            )
            .join(". ")}
          . Pontos de ganho dos filtros, não uma medição de resposta acústica.
        </desc>
        {[-12, 0, 8].map((g) => (
          <g key={g} aria-hidden="true">
            <line
              x1="40"
              x2="580"
              y1={y(g)}
              y2={y(g)}
              className={g === 0 ? "chart-zero" : "chart-grid"}
            />
            <text x="30" y={y(g) + 4} textAnchor="end">
              {g > 0 ? "+" : ""}
              {g}
            </text>
          </g>
        ))}
        {[32, 1000, 16000].map((f) => (
          <text key={f} x={x(f)} y="158" textAnchor="middle" aria-hidden="true">
            {frequencyLabel(f)}
          </text>
        ))}
        <polyline
          className="chart-confirmed"
          points={points(eq.gains)}
          aria-hidden="true"
        />
        {dirty && (
          <polyline
            className="chart-draft"
            points={points(gains)}
            aria-hidden="true"
          />
        )}
        {eq.frequencies.map((f, i) => (
          <circle
            key={f}
            cx={x(f)}
            cy={y(gains[i] ?? eq.gains[i])}
            r={f === active ? 5 : 3}
            className={f === active ? "chart-point is-active" : "chart-point"}
            aria-hidden="true"
          />
        ))}
      </svg>
      <div className="chart-detail">
        {selected >= 0 ? (
          <>
            <strong>{frequencyLabel(active!)}</strong>
            <span>{gainLabel(gains[selected] ?? eq.gains[selected])}</span>
            {dirty && <small>No fone: {gainLabel(eq.gains[selected])}</small>}
          </>
        ) : (
          <span>Selecione uma banda para ver o ganho.</span>
        )}
      </div>
    </figure>
  );
}
