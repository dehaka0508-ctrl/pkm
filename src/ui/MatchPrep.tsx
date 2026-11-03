import { useEffect, useMemo, useState } from "preact/hooks";
import { dex, koAbility, koItem, koSpecies } from "../data/dex";
import { displayName, displayRole, displaySprite, entryTeam, teamOf } from "../game/state";
import { pendingDecided, pendingInfo, playerCupTeam, recordPlayerGame, sideFor } from "../game/season";
import { autoRegistration, registrationProblems } from "../game/cup";
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
  const dbl = !!p?.doubles;
  const entry = g ? entryTeam(g) : [];
  // cup (Pokémon Champions rules): register 4–6, then pick 4 after seeing both registered teams
  const registered = dbl && !!p?.reg && p.reg.length >= 4;
  const [reg, setReg] = useState<number[]>(() => (g && dbl ? autoRegistration(entry).idx : []));
  const mine = g && dbl && registered ? playerCupTeam(g).team : entry;
  const opp = g && p ? (dbl && registered ? sideFor(g, p.opponent, true).team : teamOf(g, p.opponent)) : [];
  const suggested = useMemo(() => (g && p ? pickThree(mine, opp, 0.9, new Rng(`${g.seed}:${g.day}:${p.games.length}`), dbl ? Math.min(4, mine.length) : 3) : []), [g?.day, p?.opponent, p?.games.length, mine.length, dbl, registered]);
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
  // doubles (regional cup): four of the registered team, 1·2 lead
  const need = Math.min(dbl ? 4 : 3, mine.length);
  const toggle = (i: number) => setPicks(ps => (ps.includes(i) ? ps.filter(x => x !== i) : ps.length < need ? [...ps, i] : ps));
  const ready = picks.length === need;

  const start = (mode: "manual" | "watch") => {
    matchCtx.picks = picks;
    go({ name: "battle", mode });
  };
  const quick = () => {
    const me = sideFor(g, g.player.slotId, dbl);
    const s = new BattleSession({ ...me, picks, human: false }, sideFor(g, p.opponent, dbl), `${g.seed}:${g.day}:${p.games.length}:q`, { doubles: dbl });
    s.start();
    const r = s.runToEnd();
    const logs: string[] = [];
    update(st => recordPlayerGame(st, r, logs));
    showToast(r.winner === 0 ? `승리! (${r.remaining[0]}:${r.remaining[1]})` : r.winner === 1 ? `패배… (${r.remaining[0]}:${r.remaining[1]})` : "무승부");
    setPicks([]);
    // when the match is decided, the effect above returns to the hub and continues
  };

  const oppTrainer = trainerById(p.opponent);
  if (dbl && !registered) {
    const problems = registrationProblems(entry, reg);
    const toggleReg = (i: number) => setReg(r => (r.includes(i) ? r.filter(x => x !== i) : [...r, i].sort((a, b) => a - b)));
    return (
      <div class="page col">
        <div class="row">
          <button class="btn small" onClick={() => go({ name: "hub" })}>
            ◀ 메인
          </button>
          <h2 class="gold">{p.label}</h2>
          <span class="muted small">더블배틀 · 포켓몬 챔피언스 룰</span>
        </div>
        <Win title={`1단계: 팀 등록 (${reg.length}/6, 4~6마리)`} right={<button class="btn small" onClick={() => go({ name: "hub", tab: "squad" })}>엔트리 변경</button>}>
          <div class="small muted" style={{ marginBottom: 6 }}>
            엔트리에서 4~6마리를 골라 등록합니다. 같은 포켓몬을 두 마리, 같은 도구를 지닌 포켓몬을 두 마리 등록할 수 없습니다. 등록하면 서로의 등록 팀을 보고 4마리와 순서를 고릅니다.
          </div>
          <div class="cards" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}>
            {entry.map((m, i) => (
              <div key={m.uid} class={`card ${reg.includes(i) ? "sel" : ""}`} onClick={() => toggleReg(i)}>
                <div class="row" style={{ alignItems: "flex-end", gap: 4 }}>
                  <MonSprite species={m.species} scale={1} box={64} />
                  <div class="grow">
                    <div class="small">
                      <b>{koSpecies(m.species)}</b>
                    </div>
                    <div class="tiny muted">{m.item ? koItem(m.item) : "도구 없음"}</div>
                    <Types species={m.species} />
                  </div>
                </div>
              </div>
            ))}
          </div>
          {problems.map(x => (
            <div key={x} class="small bad">
              {x}
            </div>
          ))}
        </Win>
        <Win>
          <div class="row">
            <button class="btn primary big" disabled={problems.length > 0} onClick={() => update(st => st.pending && (st.pending.reg = reg.slice()))}>
              등록하고 상대 팀 보기 ▶
            </button>
            <button class="btn small" onClick={() => setReg(autoRegistration(entry).idx)}>
              자동 등록
            </button>
          </div>
        </Win>
      </div>
    );
  }
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
        <span class="muted small">{dbl ? "더블배틀 · 포켓몬 챔피언스 룰 · 4마리 선택 · 단판" : p.label.includes("3판") ? "중립 경기" : p.home ? "홈 경기" : "원정 경기"}</span>
      </div>
      <div class="grid2">
        <Win title={dbl ? "상대 등록 팀" : "상대 엔트리"} class="w3">
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
        <Win
          title={dbl ? `2단계: 등록 팀에서 ${need}마리 선택 (1·2번이 선봉)` : `내 엔트리 — ${need}마리 선택 (첫 번째가 선봉)`}
          class="w2"
          right={
            dbl ? (
              <button class="btn small" onClick={() => (setPicks([]), update(st => st.pending && delete st.pending.reg))}>
                등록 다시 하기
              </button>
            ) : (
              <button class="btn small" onClick={() => go({ name: "hub", tab: "squad" })}>엔트리 변경</button>
            )
          }
        >
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
          <span class="small muted">{ready ? "" : dbl ? `상대 등록 팀을 보고 ${need}마리를 순서대로 고르세요 (1·2번이 먼저 나감).` : `출전할 포켓몬 ${need}마리를 순서대로 고르세요.`}</span>
        </div>
      </Win>
      {toast}
    </div>
  );
}
