import { pendingCompetition, registrationOf } from "../game/registration";
import { avoidLineupIndices, leagueLineupToAvoid, previewLeagueLineup } from "../game/rotation";
import { condLabel, treatSquad, type TreatResult } from "../game/clinic";
import { useEffect, useMemo, useState } from "preact/hooks";
import type { ComponentChildren } from "preact";
import { nickOr, dex, koAbility, koItem, koSpecies } from "../data/dex";
import { displayName, displayRole, displaySprite, entryTeam, teamOf } from "../game/state";
import { pendingDecided, pendingInfo, pendingVenueName, playerCupTeam, recordPlayerGame, sideFor } from "../game/season";
import { autoRegistration, registrationProblems } from "../game/cup";
import { MATCH_SIZE, type MatchRules } from "../game/match-rules";
import { pickLineup } from "../battle/ai";
import { BattleSession } from "../battle/engine";
import { Rng } from "../game/rng";
import { getGame, go, matchCtx, requestAutoAdvance, update, useStore } from "./store";
import { ConfirmButton, MonIcon, MonSprite, TrainerSprite, Types, Win, useToast } from "./components";
import { GoldenMonName } from "./GoldenMonName";

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
  const league = pendingCompetition(p ?? null) === "league";
  const rules: MatchRules = dbl ? "doubles" : league ? "league" : "singles";
  const opp = g && p ? (league || dbl && registered ? sideFor(g, p.opponent, dbl, undefined, undefined, false).team : teamOf(g, p.opponent)) : [];
  const avoid = g && league ? avoidLineupIndices(mine, leagueLineupToAvoid(g, g.player.slotId)) : undefined;
  const suggested = useMemo(() => (g && p ? pickLineup(mine, opp, 0.9, new Rng(`${g.seed}:${g.day}:${p.games.length}`), rules, avoid) : []), [g?.day, p?.opponent, p?.games.length, mine.map(m => m.uid).join(), rules, registered, avoid?.join()]);
  const [picks, setPicks] = useState<number[]>([]);
  const [info, setInfo] = useState<ComponentChildren>(null);
  const done = !g || !p || pendingDecided(g);
  const missingRegistration = !!g && !!pendingCompetition(p ?? null) && !registrationOf(g, pendingCompetition(p ?? null)!);
  useEffect(() => { if (missingRegistration) go({ name: "hub" }); }, [missingRegistration]);
  // before the match: treat anyone still hurt if the club can pay now (money may have come in since)
  useEffect(() => {
    const st = getGame();
    if (st?.player.squad.some(m => m.cond)) update(x => void treatSquad(x));
  }, []);
  // leave in an effect (navigating during render loops forever)
  useEffect(() => {
    if (!done) return;
    if (g && p) requestAutoAdvance();
    go({ name: "hub" });
  }, [done]);
  if (done || missingRegistration) return null;
  const venue = pendingVenueName(g);
  // doubles (regional cup): four of the registered team, 1·2 lead
  const need = Math.min(MATCH_SIZE[rules], mine.length);
  const minimum = league || dbl ? 4 : 3;
  const toggle = (i: number) => setPicks(ps => (ps.includes(i) ? ps.filter(x => x !== i) : ps.length < need ? [...ps, i] : ps));
  const comp = pendingCompetition(p);
  const seasonRegistered = !comp || !!registrationOf(g, comp);

  const enough = mine.length >= minimum;
  const ready = seasonRegistered && enough && picks.length === need;
  const rotation = league ? previewLeagueLineup(g, g.player.slotId, picks.map(i => mine[i]?.uid).filter((u): u is string => !!u), mine.length) : null;

  const start = (mode: "manual" | "watch") => {
    if (!ready) return;
    matchCtx.picks = picks;
    go({ name: "battle", mode });
  };
  const quick = () => {
    if (!ready) return;
    const me = sideFor(g, g.player.slotId, dbl);
    const s = new BattleSession({ ...me, picks, human: false }, sideFor(g, p.opponent, dbl), `${g.seed}:${g.day}:${p.games.length}:q`, { doubles: dbl });
    s.start();
    const r = s.runToEnd();
    const logs: string[] = [];
    let t: TreatResult | null = null;
    update(st => (t = recordPlayerGame(st, r, logs)));
    const tr = t as TreatResult | null;
    const care = tr ? (tr.left.length ? ` · 치료 못 함 ${tr.left.length}마리` : tr.paid ? ` · 치료비 ₽${tr.paid.toLocaleString()}` : "") : "";
    showToast((r.winner === 0 ? `승리! (${r.remaining[0]}:${r.remaining[1]})` : r.winner === 1 ? `패배… (${r.remaining[0]}:${r.remaining[1]})` : "무승부") + care);
    setPicks([]);
    // when the match is decided, the effect above returns to the hub and continues
  };

  if (!enough) return <div class="page"><Win title={p.label}>
    <p>출전 가능한 포켓몬이 {minimum}마리 미만입니다.</p>
    <p class="small muted">시즌 등록 명단 안에서 엔트리를 바꾸거나, 이번 경기를 기권할 수 있습니다.</p>
    <div class="row"><button class="btn" onClick={() => go({ name: "hub", tab: "squad" })}>엔트리 변경</button>
      <ConfirmButton label="이번 경기 기권" onConfirm={() => update(st => recordPlayerGame(st, { winner: 1, remaining: [0, Math.min(MATCH_SIZE[rules], opp.length)], turns: 0, picks: [[], []], kos: [{}, {}] }))} />
    </div>
  </Win></div>;

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
                      <b><GoldenMonName g={g} owner={g.player.slotId} uid={m.uid}>{nickOr(m)}</GoldenMonName></b>
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
      {venue && <div class="small muted">{venue}</div>}
      <div class="grid2">
        <Win title={dbl || league ? "상대 등록 팀" : "상대 엔트리"} class="w3">
          <div class="row" style={{ alignItems: "flex-end" }}>
            <TrainerSprite sprite={displaySprite(g, p.opponent)} box={110} />
            <div>
              <b style={{ fontSize: 18 }}>{displayName(g, p.opponent)}</b>
              <div class="small muted">{displayRole(g, p.opponent)}</div>
            </div>
          </div>
          <div class="cards" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}>
            {opp.map((m, i) => (
              <div key={i} class="card" onClick={() => setInfo(<><GoldenMonName g={g} owner={p.opponent} uid={m.uid} species={m.species}>{nickOr(m)}</GoldenMonName> — 특성 후보 {Object.values(dex.species.get(m.species).abilities).map(a => koAbility(a as string)).join(", ")}</>)}>
                <div class="row" style={{ gap: 4, flexWrap: "nowrap" }}>
                  <MonIcon species={m.species} />
                  <div style={{ minWidth: 0 }}>
                    <div class="small">
                      <b><GoldenMonName g={g} owner={p.opponent} uid={m.uid} species={m.species}>{nickOr(m)}</GoldenMonName></b>
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
          title={dbl ? `2단계: 등록 팀에서 ${need}마리 선택 (1·2번이 선봉)` : `${league ? "내 등록 명단" : "내 엔트리"} — ${need}마리 선택 (첫 번째가 선봉)`}
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
                      <b><GoldenMonName g={g} owner={g.player.slotId} uid={m.uid}>{nickOr(m)}</GoldenMonName></b>
                    </div>
                    <div class="tiny muted">Lv.{m.level}</div>
                    {condLabel(m) && (
                      <div class="tiny bad" style={{ whiteSpace: "nowrap" }} title="치료하지 못해 이 상태로 나섭니다">
                        {condLabel(m)}
                      </div>
                    )}
                    <Types species={m.species} />
                  </div>
                  {picks.includes(i) && <span class="pick-num">{picks.indexOf(i) + 1}</span>}
                </div>
              </div>
            ))}
          </div>
          <div class="row" style={{ marginTop: 8 }}>
            <button class="btn small" onClick={() => setPicks(suggested.slice(0, need))}>추천 선택</button>
            <button class="btn small" onClick={() => setPicks([])}>
              초기화
            </button>
          </div>
          {league && mine.length > need && <div class={`small ${rotation?.penalty ? "bad" : "muted"}`} style={{ marginTop: 6 }} role="status">
            {rotation?.penalty ? `같은 ${need}마리로 리그 ${rotation.streak}경기 연속 출전하면 팬 만족도 −${rotation.penalty}` : `리그에서 같은 ${need}마리는 순서와 무관하게 4경기까지 페널티가 없습니다. 5경기째 −1, 이후 −2, −3…`}
          </div>}
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
