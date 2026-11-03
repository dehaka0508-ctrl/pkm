import { useState } from "preact/hooks";
import { REGIONS, regionById } from "../../data/dex";
import type { GameState } from "../../game/state";
import { displayName } from "../../game/state";
import { GROUP_NAMES, type DrawData } from "../../game/draw";
import { groupTable, KO_NAMES, makePots, qualified, regionOf } from "../../game/pwt";
import { CUP_STAGE_NAME, KO_KEYS, SWISS_ROUNDS, TOP_CUT, isLegacyCup, stageOf, swissTable } from "../../game/cup";
import type { Tie } from "../../game/tie";
import { standings } from "../../game/league";
import { dateLabel, seasonEvents } from "../../game/calendar";
import { Win } from "../components";
import { DrawShow } from "../DrawShow";
import { TrainerModal } from "../TeamView";

const regName = (id: string) => regionById(regionOf(id))?.name ?? "";

export function TieCard({ g, t, label, onPick, noRegion }: { g: GameState; t: Tie | undefined; label?: string; onPick?: (id: string) => void; noRegion?: boolean }) {
  const me = g.player.slotId;
  if (!t)
    return (
      <div class="tie-card">
        {label && <div class="tiny gold">{label}</div>}
        <div class="muted small">미정</div>
      </div>
    );
  const games = t.games;
  const line = (id: string, side: 0 | 1) => {
    const cls = t.winner ? (t.winner === id ? "tw" : "tl") : "";
    const wins = games.filter(x => x.w === side).length;
    return (
      <div class={`tie-line ${cls}`} style={{ fontWeight: id === me ? 700 : 400, cursor: onPick ? "pointer" : undefined }} onClick={() => onPick?.(id)}>
        <span class="grow" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {displayName(g, id)} {!noRegion && <span class="tiny muted">{regName(id)}</span>}
        </span>
        {t.format === "bo3" ? (
          <b class="num">{games.length ? wins : ""}</b>
        ) : (
          games.map((x, i) => (
            <span key={i} class="num" style={{ width: 14, textAlign: "center", opacity: x.extra ? 0.7 : 1 }}>
              {side === 0 ? x.ra : x.rb}
            </span>
          ))
        )}
      </div>
    );
  };
  const extra = games.some(x => x.extra);
  return (
    <div class={`tie-card ${t.a === me || t.b === me ? "mine" : ""}`}>
      {label && <div class="tiny gold">{label}</div>}
      {line(t.a, 0)}
      {line(t.b, 1)}
      {t.format === "two-leg" && games.length > 0 && <div class="tie-legs">남은 포켓몬 · 1차전 / 2차전{extra ? " / 추가전" : ""}</div>}
    </div>
  );
}

function ReplayBtn({ g, draw, label }: { g: GameState; draw?: DrawData; label: string }) {
  const [open, setOpen] = useState(false);
  if (!draw) return null;
  return (
    <>
      <button class="btn small" onClick={() => setOpen(true)}>
        {label}
      </button>
      {open && <DrawShow g={g} draw={draw} onClose={() => setOpen(false)} />}
    </>
  );
}

export function PwtTab({ g, pct = false }: { g: GameState; pct?: boolean }) {
  const T0 = pct ? g.pct : g.pwt;
  const pwt = T0 && T0.season === g.season ? T0 : null;
  const N = pct ? "PCT" : "PWT";
  const me = g.player.slotId;
  const [view, setView] = useState<string | null>(null);
  const [gsel, setGsel] = useState(() => Math.max(0, pwt ? pwt.groups.findIndex(x => x.includes(me)) : 0));
  const q = pct ? null : g.qual;
  const ev = seasonEvents(g.season);
  const groupDays = ev.filter(e => e.kind === (pct ? "pctGroup" : "group")).map(e => e.day);
  return (
    <>
      <Win title={`시즌 ${g.season} ${pct ? "포켓몬 챌린지 토너먼트 (PCT)" : "포켓몬 월드 토너먼트 (PWT)"}`} right={pwt && <ReplayBtn g={g} draw={pwt.groupDraw} label="조 추첨 다시 보기" />}>
        {pct ? (
          <div class="small">
            PWT 다음 단계의 대회입니다. 전 시즌 지방 컵 우승자와 리그 4~6위 중 PWT에 못 나간 트레이너가 직행하고, 남은 자리는 리그 7위(모자라면 8위…)들이 전 시즌 승점 순으로 채워 32명이 나갑니다. 경기는 PWT와 같은 주 목요일에 열리며 방식도 PWT와 같습니다(조별리그 → 홈·원정 토너먼트 → 3판 2선승 결승). 우승자에게는 은색병뚜껑(포켓몬 한 마리의 개체값 하나 최대)이 수여됩니다.
          </div>
        ) : (
          <div class="small">
            전 시즌 지방 리그 1~3위와 디펜딩 챔피언이 직행하고, 4위끼리 단판 플레이오프로 남은 자리를 채워 32명이 나갑니다. 4개 포트로 나눠 8개 조(같은 지방끼리는 같은 조 불가)에서 홈·원정 6경기를 치러 조 2위까지 1월 토너먼트에 오릅니다. 16강·8강·4강은 홈·원정 2경기(승수 → 남은 포켓몬 차이 → 추가 1판), 결승은 3판 2선승입니다. 우승자에게는 금색병뚜껑(포켓몬 한 마리의 모든 개체값 최대)과 전국 전설·환상의 포켓몬 스카우트권이 수여됩니다.
          </div>
        )}
        {pwt && (
          <div class="tiny muted" style={{ marginTop: 4 }}>
            조별리그: {groupDays.map(d => dateLabel(d, false)).join(" · ")}
          </div>
        )}
      </Win>

      {!pct && g.supers?.world && (
        <Win title={`시즌 ${g.supers.season} 월드 슈퍼컵 (PWT 챔피언 vs PCT 챔피언)`}>
          <div style={{ maxWidth: 280 }}>
            <TieCard g={g} t={g.supers.world} />
          </div>
        </Win>
      )}
      {!pwt && pct && <div class="muted small">9월 첫 월요일 PWT 조 추첨 직후에 PCT 조 추첨을 합니다.</div>}
      {pwt?.champion && (
        <Win title={`${N} 챔피언`}>
          <b class="gold">🏆 {displayName(g, pwt.champion)}</b> <span class="muted">({pwt.seeds[pwt.champion]})</span>
        </Win>
      )}

      {pwt && (pwt.ko.length > 0 || pwt.koDraw) && (
        <Win title="토너먼트" right={<ReplayBtn g={g} draw={pwt.koDraw} label="토너먼트 추첨 다시 보기" />}>
          <div class="bracket">
            {[0, 1, 2].map(r => (
              <div key={r} class="bracket-col">
                <b class="small gold">{KO_NAMES[r]}</b>
                {Array.from({ length: 8 >> r }, (_, i) => (
                  <TieCard key={i} g={g} t={pwt.ko[r]?.[i]} onPick={id => id !== me && setView(id)} />
                ))}
              </div>
            ))}
            <div class="bracket-col">
              <b class="small gold">결승 (3판 2선승)</b>
              <TieCard g={g} t={pwt.final} onPick={id => id !== me && setView(id)} />
            </div>
          </div>
          <div class="tiny muted" style={{ marginTop: 4 }}>
            숫자는 경기별 남은 포켓몬 수. 16강은 조 2위가 1차전 홈, 조 1위가 2차전 홈.
          </div>
        </Win>
      )}

      {pwt && (
        <Win title="조별리그">
          <div class="cards" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))" }}>
            {pwt.groups.map((_, gi) => (
              <div key={gi} class={`card ${gi === gsel ? "sel" : ""}`} onClick={() => setGsel(gi)} style={{ padding: 6 }}>
                <b class="small gold">{GROUP_NAMES[gi]}조</b>
                <table class="tbl" style={{ fontSize: 12 }}>
                  <tbody>
                    {groupTable(pwt, gi).map((r, i) => (
                      <tr key={r.id} class={`${r.id === me ? "me" : ""} ${i < 2 ? "q" : ""}`}>
                        <td>{i + 1}</td>
                        <td style={{ maxWidth: 110, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {displayName(g, r.id)} <span class="tiny muted">{regName(r.id)}</span>
                        </td>
                        <td class="n">
                          {r.w}-{r.d}-{r.l}
                        </td>
                        <td class="n">{r.diff > 0 ? "+" : ""}{r.diff}</td>
                        <td class="n">
                          <b>{r.pts}</b>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
          <div class="small gold" style={{ marginTop: 8 }}>
            {GROUP_NAMES[gsel]}조 경기
          </div>
          <table class="tbl">
            <tbody>
              {pwt.fixtures.map((md, i) =>
                md
                  .filter(f => pwt.groups[gsel].includes(f.home))
                  .map((f, j) => (
                    <tr key={`${i}-${j}`} class={f.home === me || f.away === me ? "me" : ""}>
                      <td class="tiny muted">
                        {i + 1}차전 · {dateLabel(groupDays[i], false)}
                      </td>
                      <td style={{ textAlign: "right" }}>{displayName(g, f.home)}</td>
                      <td class="center num" style={{ width: 56 }}>
                        {f.result ? `${f.result.h} : ${f.result.a}` : "vs"}
                      </td>
                      <td>{displayName(g, f.away)}</td>
                    </tr>
                  )),
              )}
            </tbody>
          </table>
        </Win>
      )}

      {q && (
        <Win title={`시즌 ${q.season} PWT 진출권`} right={q.po.entrants.length > 0 && <ReplayBtn g={g} draw={q.po.draw} label="플레이오프 추첨 다시 보기" />}>
          <div class="small" style={{ marginBottom: 6 }}>
            직행 {q.direct.length}명 · 플레이오프 {q.po.entrants.length}명(부전승 {q.po.byes.length}) → {qualified(q).length >= 32 ? "32명 확정" : `${32 - q.direct.length - q.po.byes.length}자리 경쟁`}
          </div>
          {q.po.byes.length > 0 && (
            <div class="small">
              부전승: {q.po.byes.map(id => `${displayName(g, id)} (${regName(id)})`).join(", ")}
            </div>
          )}
          <div class="cards" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", marginTop: 6 }}>
            {q.po.ties.map((t, i) => (
              <TieCard key={i} g={g} t={t} label={`플레이오프 ${i + 1}`} />
            ))}
          </div>
          {!pwt && q.season === g.season && <PotsPreview g={g} />}
        </Win>
      )}

      {!pct && !(q && q.season === g.season + 1) && <NextQualPreview g={g} />}
      {pct && pwt && (
        <Win title="참가 자격">
          <div class="cards" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
            {pwt.pots.map((p, i) => (
              <div key={i} class="card" style={{ cursor: "default", padding: 6 }}>
                <b class="small gold">포트 {i + 1}</b>
                {p.map(id => (
                  <div key={id} class={`tiny ${id === me ? "gold" : ""}`}>
                    {displayName(g, id)} <span class="muted">{pwt.seeds[id]}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </Win>
      )}
      {view && <TrainerModal id={view} onClose={() => setView(null)} />}
    </>
  );
}

function PotsPreview({ g }: { g: GameState }) {
  const q = g.qual!;
  if (qualified(q).length < 32) return null;
  const pots = makePots(q, g.prev);
  return (
    <div class="cards" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", marginTop: 8 }}>
      {pots.map((p, i) => (
        <div key={i} class="card" style={{ cursor: "default", padding: 6 }}>
          <b class="small gold">포트 {i + 1}</b>
          {p.map(id => (
            <div key={id} class="tiny">
              {displayName(g, id)} <span class="muted">{q.seeds[id]}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function NextQualPreview({ g }: { g: GameState }) {
  return (
    <Win title="다음 시즌 진출권 현황 (현재 리그 순위)">
      <table class="tbl">
        <thead>
          <tr>
            <th>지방</th>
            <th>직행 (1~3위)</th>
            <th>플레이오프 (4위)</th>
          </tr>
        </thead>
        <tbody>
          {REGIONS.map(r => {
            const t = standings(g.leagues[r.id]);
            return (
              <tr key={r.id} class={r.id === g.player.region ? "me" : ""}>
                <td>{r.name}</td>
                <td class="small">{t.slice(0, 3).map(x => displayName(g, x.id)).join(", ")}</td>
                <td class="small">{t[3] ? displayName(g, t[3].id) : ""}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Win>
  );
}

export function CupTab({ g }: { g: GameState }) {
  const [region, setRegion] = useState(g.player.region);
  const [view, setView] = useState<string | null>(null);
  const me = g.player.slotId;
  const cup0 = g.cups?.[region];
  const cup = cup0 && !isLegacyCup(cup0) ? cup0 : null;
  const ev = seasonEvents(g.season);
  const cupDays = ev.filter(e => e.kind === "cup").map(e => e.day);
  const finalDay = ev.find(e => e.kind === "cupFinal")!.day;
  const pick = (id: string) => id !== me && setView(id);
  const T = (key: string) => <TieCard g={g} t={cup?.ties[key]} label={CUP_STAGE_NAME[stageOf(key)]} onPick={pick} noRegion />;
  const table = cup ? swissTable(cup) : [];
  const nm = (id: string) => (
    <span class={`click ${id === me ? "gold" : ""}`} onClick={() => pick(id)}>
      {displayName(g, id)}
    </span>
  );
  return (
    <>
      <Win title={`${regionById(region).name} 컵`}>
        <div class="row" style={{ gap: 4, marginBottom: 8 }}>
          {REGIONS.map(r => (
            <button key={r.id} class={`btn small ${r.id === region ? "sel" : ""}`} onClick={() => setRegion(r.id)}>
              {r.name}
            </button>
          ))}
        </div>
        <div class="small">
          포켓몬 챔피언스 대회 방식입니다. 모든 경기는 <b>6마리가 전부 나오는 더블배틀 단판</b>입니다. 지방 리그 20명이 스위스 {SWISS_ROUNDS}라운드(승점이 같은 사람끼리, 같은 상대와는 다시 붙지 않음)를 치르고, 승점·상대 승점 합(뷰흐홀츠)·전 시즌 순위로 매긴 상위 {TOP_CUT}명이 8강(1위–8위, 4위–5위, 2위–7위, 3위–6위)·4강·결승을 치릅니다. 우승자에게는 은색병뚜껑이 수여되고, 2시즌부터는 8월 마지막 일요일에 리그 우승자와 컵 우승자가 슈퍼컵을 치릅니다.
        </div>
        <div class="tiny muted" style={{ marginTop: 4 }}>
          {cupDays.map((d, i) => `${["스위스 1R", "2R", "3R", "4R", "5R", "8강", "4강"][i]} ${dateLabel(d, false)}`).join(" / ")} / 결승 {dateLabel(finalDay, false)}
        </div>
        {!cup && <div class="muted" style={{ marginTop: 8 }}>10월 첫 월요일에 스위스 1라운드 대진이 정해집니다.</div>}
      </Win>
      {cup && (
        <>
          {g.supers?.regional[region] && (
            <Win title={`시즌 ${g.supers.season} ${regionById(region).name} 슈퍼컵 (리그 우승 vs 컵 우승)`}>
              <div style={{ maxWidth: 280 }}>
                <TieCard g={g} t={g.supers.regional[region]} noRegion />
              </div>
            </Win>
          )}
          {cup.champion && (
            <Win title="컵 우승">
              <b class="gold">🏆 {displayName(g, cup.champion)}</b>
            </Win>
          )}
          {cup.seeds && (
            <Win title="토너먼트 (모두 단판 더블배틀)">
              <div class="bracket">
                <div class="bracket-col">
                  <b class="small gold">8강</b>
                  {KO_KEYS[0].map(k => T(k))}
                </div>
                <div class="bracket-col">
                  <b class="small gold">4강</b>
                  {KO_KEYS[1].map(k => T(k))}
                </div>
                <div class="bracket-col">
                  <b class="small gold">결승</b>
                  {T("F")}
                </div>
              </div>
            </Win>
          )}
          <Win title={`스위스 순위 (${cup.swiss.filter(r => r.every(f => f.result)).length}/${SWISS_ROUNDS}라운드)`}>
            <div class="tbl-wrap">
              <table class="tbl">
                <thead>
                  <tr>
                    <th class="n">#</th>
                    <th>트레이너</th>
                    <th class="n">승-패</th>
                    <th class="n">승점</th>
                    <th class="n hide-sm">뷰흐홀츠</th>
                  </tr>
                </thead>
                <tbody>
                  {table.map((r, i) => (
                    <tr key={r.id} class={`${r.id === me ? "me" : ""} ${i < TOP_CUT ? "q" : ""}`}>
                      <td class="n">{i + 1}</td>
                      <td>{nm(r.id)}</td>
                      <td class="n">
                        {r.w}-{r.l}
                        {r.d ? `-${r.d}` : ""}
                      </td>
                      <td class="n">{r.pts}</td>
                      <td class="n hide-sm">{r.buchholz}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div class="tiny muted">초록 표시: 현재 상위 {TOP_CUT}명 (토너먼트 진출권)</div>
          </Win>
          {cup.swiss
            .map((round, ri) => ({ round, ri }))
            .reverse()
            .map(({ round, ri }) => (
              <Win key={ri} title={`스위스 ${ri + 1}라운드`}>
                <div class="col small" style={{ gap: 2 }}>
                  {round.map((f, i) => {
                    const r = f.result;
                    return (
                      <div key={i} class="row" style={{ gap: 6 }}>
                        <span style={{ flex: 1, textAlign: "right" }} class={r && r.w === 0 ? "good" : ""}>
                          {nm(f.home)}
                        </span>
                        <span class="num" style={{ minWidth: 44, textAlign: "center" }}>
                          {r ? `${r.h}:${r.a}` : "vs"}
                        </span>
                        <span style={{ flex: 1 }} class={r && r.w === 1 ? "good" : ""}>
                          {nm(f.away)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </Win>
            ))}
        </>
      )}
      {view && <TrainerModal id={view} onClose={() => setView(null)} />}
    </>
  );
}
