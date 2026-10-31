import { useEffect, useMemo, useState } from "preact/hooks";
import { dex, koAbility, koSpecies } from "../data/dex";
import { displayName, displayRole, displaySprite, entryTeam, teamOf } from "../game/state";
import { pendingDecided, pendingInfo, recordPlayerGame, sideFor } from "../game/season";
import { pickThree } from "../battle/ai";
import { BattleSession } from "../battle/engine";
import { Rng } from "../game/rng";
import { go, matchCtx, requestAutoAdvance, update, useStore } from "./store";
import { MonIcon, MonSprite, TrainerSprite, Types, Win, useToast } from "./components";
import { trainerById } from "../game/lineups";

export function MatchPrep() {
  const { game: g } = useStore();
  const [toast, showToast] = useToast();
  const p = g?.pending;
  const mine = g ? entryTeam(g) : [];
  const opp = g && p ? teamOf(g, p.opponent) : [];
  const suggested = useMemo(() => (g && p ? pickThree(mine, opp, 0.9, new Rng(`${g.seed}:${g.day}:${p.games.length}`)) : []), [g?.day, p?.opponent, p?.games.length, mine.length]);
  const [picks, setPicks] = useState<number[]>([]);
  const [info, setInfo] = useState<string | null>(null);
  const done = !g || !p || pendingDecided(g);
  // leave in an effect (navigating during render loops forever)
  useEffect(() => {
    if (!done) return;
    if (g && p) requestAutoAdvance();
    go({ name: "hub" });
  }, [done]);
  if (done) return null;
  const need = Math.min(3, mine.length);
  const toggle = (i: number) => setPicks(ps => (ps.includes(i) ? ps.filter(x => x !== i) : ps.length < need ? [...ps, i] : ps));
  const ready = picks.length === need;

  const start = (mode: "manual" | "watch") => {
    matchCtx.picks = picks;
    go({ name: "battle", mode });
  };
  const quick = () => {
    const me = sideFor(g, g.player.slotId);
    const s = new BattleSession({ ...me, picks, human: false }, sideFor(g, p.opponent), `${g.seed}:${g.day}:${p.games.length}:q`);
    s.start();
    const r = s.runToEnd();
    const logs: string[] = [];
    update(st => recordPlayerGame(st, r, logs));
    showToast(r.winner === 0 ? `승리! (${r.remaining[0]}:${r.remaining[1]})` : r.winner === 1 ? `패배… (${r.remaining[0]}:${r.remaining[1]})` : "무승부");
    setPicks([]);
    // when the match is decided, the effect above returns to the hub and continues
  };

  const oppTrainer = trainerById(p.opponent);
  return (
    <div class="page col">
      <div class="row">
        <button class="btn small" onClick={() => go({ name: "hub" })}>
          ◀ 메인
        </button>
        <h2 class="gold">{p.label}</h2>
        {pendingInfo(g) && (
          <span class="chip" style={{ fontSize: 14 }}>
            {pendingInfo(g)}
          </span>
        )}
        <span class="muted small">{p.label.includes("3판") ? "중립 경기" : p.home ? "홈 경기" : "원정 경기"}</span>
      </div>
      <div class="grid2">
        <Win title="상대 엔트리" class="w3">
          <div class="row" style={{ alignItems: "flex-end" }}>
            <TrainerSprite sprite={displaySprite(g, p.opponent)} box={110} />
            <div>
              <b style={{ fontSize: 18 }}>{displayName(g, p.opponent)}</b>
              <div class="small muted">{displayRole(g, p.opponent)}</div>
              {oppTrainer?.source && <div class="tiny muted">{oppTrainer.source}</div>}
            </div>
          </div>
          <div class="cards" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}>
            {opp.map((m, i) => (
              <div key={i} class="card" onClick={() => setInfo(`${koSpecies(m.species)} — 특성 후보: ${Object.values(dex.species.get(m.species).abilities).map(a => koAbility(a as string)).join(", ")}`)}>
                <div class="row" style={{ gap: 4 }}>
                  <MonIcon species={m.species} />
                  <div>
                    <div class="small">
                      <b>{koSpecies(m.species)}</b>
                    </div>
                    <Types species={m.species} />
                  </div>
                </div>
                {m.placeholder && <span class="chip ph">임시</span>}
              </div>
            ))}
          </div>
          {info && <div class="small muted" style={{ marginTop: 6 }}>{info}</div>}
        </Win>
        <Win title={`내 엔트리 — ${need}마리 선택 (첫 번째가 선봉)`} class="w2" right={<button class="btn small" onClick={() => go({ name: "hub", tab: "squad" })}>엔트리 변경</button>}>
          <div class="cards" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}>
            {mine.map((m, i) => (
              <div key={m.uid} class={`card ${picks.includes(i) ? "sel" : ""}`} onClick={() => toggle(i)}>
                <div class="row" style={{ alignItems: "flex-end", gap: 4 }}>
                  <MonSprite species={m.species} scale={1} box={64} />
                  <div class="grow">
                    <div class="small">
                      <b>{koSpecies(m.species)}</b>
                    </div>
                    <div class="tiny muted">Lv.{m.level}</div>
                    <Types species={m.species} />
                  </div>
                  {picks.includes(i) && <span class="pick-num">{picks.indexOf(i) + 1}</span>}
                </div>
              </div>
            ))}
          </div>
          <div class="row" style={{ marginTop: 8 }}>
            <button class="btn small" onClick={() => setPicks(suggested.slice(0, need))}>
              추천 선택
            </button>
            <button class="btn small" onClick={() => setPicks([])}>
              초기화
            </button>
          </div>
        </Win>
      </div>
      <Win>
        <div class="row">
          <button class="btn primary big" disabled={!ready} onClick={() => start("manual")}>
            직접 지휘 ▶
          </button>
          <button class="btn big" disabled={!ready} onClick={() => start("watch")}>
            관전 (자동 지휘)
          </button>
          <button class="btn" disabled={!ready} onClick={quick}>
            결과만 보기
          </button>
          <span class="small muted">{ready ? "" : `출전할 포켓몬 ${need}마리를 순서대로 고르세요.`}</span>
        </div>
      </Win>
      {toast}
    </div>
  );
}
