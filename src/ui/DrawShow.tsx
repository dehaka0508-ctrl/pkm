// FM-style draw ceremony: balls come out of the pots one by one and land in their group / slot.
import { useEffect, useState } from "preact/hooks";
import { regionById } from "../data/dex";
import type { DrawData } from "../game/draw";
import { regionOf } from "../game/pwt";
import { displayName, displaySprite, type GameState } from "../game/state";
import { TrainerSprite, Win } from "./components";

const SPEEDS = [
  ["보통", 1100],
  ["빠르게", 380],
] as const;

export function DrawShow({ g, draw, onClose }: { g: GameState; draw: DrawData; onClose: () => void }) {
  const [n, setN] = useState(0); // steps revealed
  const [speed, setSpeed] = useState(0);
  const [paused, setPaused] = useState(false);
  const total = draw.steps.length;
  const done = n >= total;
  useEffect(() => {
    if (done || paused) return;
    const t = setTimeout(() => setN(x => x + 1), n === 0 ? 500 : SPEEDS[speed][1]);
    return () => clearTimeout(t);
  }, [n, speed, paused, done]);

  const me = g.player.slotId;
  const shown = draw.steps.slice(0, n);
  const drawn = new Set(shown.map(s => s.team));
  const cur = n > 0 ? draw.steps[n - 1] : null;
  const boxes = draw.boxes.map(b => Array.from({ length: b.size }, () => null as string | null));
  for (const s of shown) if (boxes[s.box]) boxes[s.box][s.slot] = s.team;
  const reg = (id: string) => regionById(regionOf(id))?.name ?? "";

  return (
    <div class="modal-bg" style={{ background: "var(--bg)" }}>
      <div class="draw-modal">
        <Win
          title={draw.title}
          right={
            <>
              {SPEEDS.map(([label], i) => (
                <button key={i} class={`btn small ${speed === i ? "sel" : ""}`} onClick={() => setSpeed(i)}>
                  {label}
                </button>
              ))}
              {!done && (
                <button class="btn small" onClick={() => setPaused(!paused)}>
                  {paused ? "재개" : "일시정지"}
                </button>
              )}
              {!done && (
                <button class="btn small" onClick={() => setN(total)}>
                  결과 바로 보기
                </button>
              )}
              <button class="btn small primary" onClick={onClose}>
                닫기
              </button>
            </>
          }
        >
          <div class="draw-grid">
            <div class="col draw-pools">
              {draw.pools.map((p, pi) => (
                <div key={pi} class="draw-pool">
                  <div class="tiny gold">{p.name}</div>
                  <div class="draw-balls">
                    {p.teams.map(id => (
                      <span key={id} class={`ball ${drawn.has(id) ? "out" : ""} ${cur?.team === id ? "hot" : ""} ${id === me ? "mine" : ""}`} title={displayName(g, id)}>
                        {displayName(g, id)}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div class="draw-stage">
              {cur ? (
                <div key={n} class="draw-reveal">
                  <TrainerSprite sprite={displaySprite(g, cur.team)} scale={1} box={88} />
                  <b class={cur.team === me ? "gold" : ""} style={{ fontSize: 18 }}>
                    {displayName(g, cur.team)}
                  </b>
                  <span class="tiny muted">{reg(cur.team)}</span>
                  <span class="chip">→ {draw.boxes[cur.box]?.name}</span>
                </div>
              ) : (
                <div class="muted small">추첨을 시작합니다…</div>
              )}
              <div class="tiny muted" style={{ marginTop: 8 }}>
                {n} / {total}
              </div>
            </div>
            <div class="draw-boxes">
              {draw.boxes.map((b, bi) => (
                <div key={bi} class={`draw-box ${cur?.box === bi ? "hot" : ""}`}>
                  <div class="tiny gold">{b.name}</div>
                  {boxes[bi].map((id, si) => (
                    <div key={si} class={`draw-slot ${id === me ? "mine" : ""} ${id && cur?.team === id ? "new" : ""}`}>
                      {id ? (
                        <>
                          <span class="grow">{displayName(g, id)}</span>
                          <span class="tiny muted">{reg(id)}</span>
                        </>
                      ) : (
                        <span class="muted">—</span>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </Win>
      </div>
    </div>
  );
}
