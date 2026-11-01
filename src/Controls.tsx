import { useEffect, useState } from "react";
import type { Command, ControlState, Preset } from "./api";
import { EqChart } from "./EqChart";
export type { ControlState } from "./api";
const scenes = [
  { id: 1, name: "Ruidoso", description: "Rua, conversas e locais cheios" },
  { id: 2, name: "Transporte", description: "Ônibus, metrô ou deslocamentos" },
  { id: 3, name: "Interior", description: "Trabalho, estudo e casa" },
  { id: 4, name: "Antivento", description: "Configuração fixa para vento" },
  { id: 5, name: "Adaptativo", description: "O fone ajusta o cancelamento" },
];
export function Controls({
  state,
  pending,
  presets,
  run,
}: {
  state: ControlState | null;
  pending: string | null;
  presets: Preset[];
  run: (c: Command) => Promise<void>;
}) {
  const [tab, setTab] = useState("noise"),
    [scene, setScene] = useState(1),
    [level, setLevel] = useState(2),
    [gains, setGains] = useState<number[]>([]);
  const [activeFrequency, setActiveFrequency] = useState<number | null>(null);
  useEffect(() => {
    if (state?.noise?.mode === 1) {
      setScene(state.noise.scene);
      setLevel(state.noise.gain);
    }
  }, [state?.noise]);
  useEffect(() => {
    if (state?.eq) setGains(state.eq.gains);
  }, [state?.eq]);
  const eq = state?.eq,
    noise = state?.noise;
  const dirty =
    !!eq &&
    gains.length === eq.gains.length &&
    gains.some((v, i) => v !== eq.gains[i]);
  const preset = presets.find(
    (p) => JSON.stringify(p.payload) === JSON.stringify(eq?.raw),
  );
  const sendMode = (mode: number) =>
    run({
      action: "noise",
      mode,
      noise:
        mode === 1 ? { mode, scene, gain: scene <= 3 ? level : 0 } : undefined,
    });
  return (
    <div className="sound-console" data-tab={tab}>
      <div className="console-tabs" role="tablist" aria-label="Ajustes do fone">
        <span className="tab-indicator" aria-hidden="true" />
        {[
          { id: "noise", label: "Ambiente" },
          { id: "eq", label: "Equalizador" },
        ].map((t) => (
          <button
            role="tab"
            id={`tab-${t.id}`}
            aria-controls={`panel-${t.id}`}
            aria-selected={tab === t.id}
            key={t.id}
            onKeyDown={(e) => {
              const other = t.id === "noise" ? "eq" : "noise";
              if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
                e.preventDefault();
                const next =
                  e.key === "Home" ? "noise" : e.key === "End" ? "eq" : other;
                setTab(next);
                document.getElementById(`tab-${next}`)?.focus();
              }
            }}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {pending === t.id && (
              <span className="spinner" aria-label="Atualizando" />
            )}
          </button>
        ))}
      </div>
      <section
        role="tabpanel"
        id="panel-noise"
        aria-labelledby="tab-noise"
        hidden={tab !== "noise"}
        aria-busy={pending === "noise"}
        className="sound-panel"
      >
        <div className="section-heading">
          <div>
            <h2>Escolha o que fica lá fora.</h2>
            <p>Seu ambiente, na intensidade certa.</p>
          </div>
          <span className="state-label">
            {pending === "noise"
              ? "Confirmando…"
              : noise
                ? "Leitura do fone"
                : "Aguardando leitura"}
          </span>
        </div>
        <div className="mode-options">
          {[
            { mode: 2, title: "Normal", description: "Só a música" },
            {
              mode: 1,
              title: "Cancelamento",
              description: "Menos ruído ao redor",
            },
            { mode: 3, title: "Transparência", description: "Ouça o ambiente" },
          ].map((m) => (
            <button
              key={m.mode}
              aria-pressed={noise?.mode === m.mode}
              disabled={!!pending || !noise}
              onClick={() => sendMode(m.mode)}
            >
              <span className="mode-symbol" aria-hidden="true">
                {m.mode === 2 ? "○" : m.mode === 1 ? "◉" : "◎"}
              </span>
              <strong>{m.title}</strong>
              <span>{m.description}</span>
            </button>
          ))}
        </div>
        {noise && (
          <div
            className="noise-summary"
            aria-label="Ambiente confirmado no fone"
          >
            <span>No fone</span>
            <strong>
              {noise.mode === 1
                ? `Cancelamento · ${scenes.find((s) => s.id === noise.scene)?.name ?? "ANC"}`
                : noise.mode === 3
                  ? "Transparência"
                  : "Normal"}
            </strong>
            {noise.mode === 1 && noise.scene <= 3 && (
              <span
                className="noise-level"
                role="meter"
                aria-label="Intensidade confirmada de ANC"
                aria-valuemin={0}
                aria-valuemax={2}
                aria-valuenow={noise.gain}
                aria-valuetext={["Fraco", "Médio", "Forte"][noise.gain]}
              >
                {[0, 1, 2].map((n) => (
                  <i key={n} data-filled={n <= noise.gain} />
                ))}
                <span>{["Fraco", "Médio", "Forte"][noise.gain]}</span>
              </span>
            )}
          </div>
        )}
        {!noise && (
          <p className="hint">
            Os modos ficam disponíveis quando a leitura do fone termina.
          </p>
        )}
        {noise?.mode === 1 && (
          <div className="anc-layout">
            <div>
              <h3>Onde você está?</h3>
              <div className="scene-list">
                {scenes.map((s) => (
                  <button
                    className={scene === s.id ? "chosen" : ""}
                    aria-pressed={scene === s.id}
                    disabled={pending === "noise"}
                    key={s.id}
                    onClick={() => setScene(s.id)}
                  >
                    <strong>{s.name}</strong>
                    <span>{s.description}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="intensity">
              <h3>Intensidade</h3>
              {scene <= 3 ? (
                <>
                  <div className="level-buttons">
                    {["Fraco", "Médio", "Forte"].map((name, i) => (
                      <button
                        key={i}
                        aria-pressed={level === i}
                        disabled={pending === "noise"}
                        onClick={() => setLevel(i)}
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                  <p>
                    {scene !== noise.scene || level !== noise.gain
                      ? "Seleção em edição. Clique em Aplicar ambiente para enviar."
                      : "Escolha o nível mais confortável para o seu ambiente."}
                  </p>
                </>
              ) : (
                <p>
                  {scene === 5
                    ? "O N50 escolhe a intensidade automaticamente."
                    : "O modo Antivento usa uma intensidade fixa."}
                </p>
              )}
              <button
                className="primary"
                disabled={
                  !!pending ||
                  (scene === noise.scene && (scene > 3 || level === noise.gain))
                }
                onClick={() =>
                  run({
                    action: "noise",
                    noise: { mode: 1, scene, gain: scene <= 3 ? level : 0 },
                  })
                }
              >
                {pending === "noise" ? "Aplicando…" : "Aplicar ambiente"}
              </button>
            </div>
          </div>
        )}
      </section>
      <section
        role="tabpanel"
        id="panel-eq"
        aria-labelledby="tab-eq"
        hidden={tab !== "eq"}
        aria-busy={pending === "eq"}
        className="sound-panel"
      >
        <div className="section-heading">
          <div>
            <h2>Um som com a sua assinatura.</h2>
            <p>Parta de uma curva ou ajuste cada banda.</p>
          </div>
          <span className="state-label">
            {pending === "eq"
              ? "Confirmando…"
              : eq
                ? `${eq.gains.length} filtros ativos`
                : "Aguardando leitura"}
          </span>
        </div>
        <div className="preset-list" aria-label="Curvas de som">
          {presets.map((p) => (
            <button
              title={p.source}
              className={preset?.id === p.id ? "chosen" : ""}
              aria-pressed={preset?.id === p.id}
              disabled={!!pending || !eq}
              key={p.id}
              onClick={() => run({ action: "preset", preset: p.id })}
            >
              {p.id === 20 && <span className="personal-tag">Seu preset</span>}
              {p.name}
            </button>
          ))}
        </div>
        <p className="hint preset-description">
          {preset?.source ??
            "Ajuste os ganhos abaixo. Frequência, Q e tipo dos filtros são preservados."}
        </p>
        {eq && <EqChart eq={eq} gains={gains} active={activeFrequency} />}
        {eq && eq.gains.length > 6 && (
          <p className="mobile-hint">Deslize para ver todas as bandas.</p>
        )}
        <div
          className="equalizer"
          style={{
            gridTemplateColumns: `repeat(${Math.max(gains.length, 1)},minmax(44px,1fr))`,
          }}
        >
          {eq?.frequencies.map((f, i) => (
            <label
              key={f}
              className={activeFrequency === f ? "band-active" : undefined}
              data-edited={gains[i] !== eq.gains[i]}
            >
              <output>
                {gains[i] > 0 ? "+" : ""}
                {gains[i] ?? "—"}
              </output>
              <input
                aria-label={`${f} Hz, ganho em dB`}
                onFocus={() => setActiveFrequency(f)}
                onPointerDown={() => setActiveFrequency(f)}
                type="range"
                min="-12"
                max="8"
                step="0.5"
                value={gains[i] ?? eq.gains[i]}
                disabled={pending === "eq"}
                onChange={(e) =>
                  setGains((g) =>
                    g.map((v, j) => (j === i ? Number(e.target.value) : v)),
                  )
                }
              />
              <span>{f >= 1000 ? `${f / 1000}k` : f}</span>
            </label>
          ))}
        </div>
        <div className="eq-footer">
          <span className="hint">
            {dirty
              ? "Você tem ajustes para aplicar."
              : "Ganhos em dB · frequências em Hz"}
          </span>
          <div className="button-row">
            <button
              className="quiet"
              disabled={!dirty || pending === "eq"}
              onClick={() => setGains(eq?.gains ?? [])}
            >
              Desfazer
            </button>
            <button
              className="quiet"
              disabled={!eq || pending === "eq"}
              onClick={() => setGains(gains.map(() => 0))}
            >
              Zerar ganhos
            </button>
            <button
              className="primary"
              disabled={!!pending || !dirty}
              onClick={() => run({ action: "eq", gains })}
            >
              {pending === "eq" ? "Aplicando…" : "Aplicar equalizador"}
            </button>
          </div>
        </div>
      </section>
      {state?.errors.length ? (
        <details className="technical">
          <summary>Algumas leituras não responderam</summary>
          {state.errors.map((e, i) => (
            <p key={i}>{e}</p>
          ))}
        </details>
      ) : null}
    </div>
  );
}
