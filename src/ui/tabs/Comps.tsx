import { TIER_LONG, TIER_NAME } from "../../game/pwt";
import { CONF_KO, PSB_ROUND_KO } from "../../game/psb";
import { useState } from "preact/hooks";
import { REGIONS, regionById } from "../../data/dex";
import type { GameState } from "../../game/state";
import { displayName } from "../../game/state";
import { GROUP_NAMES, type DrawData } from "../../game/draw";
import { groupTable, KO_NAMES, makePots, qualified, regionOf } from "../../game/pwt";
import { CUP_STAGE_NAME, LETTERS, WING_NAMES } from "../../game/cup";
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

export function PwtTab({ g, tier = "pwt" }: { g: GameState; tier?: "pwt" | "pct" | "ect" }) {
  const pct = tier !== "pwt";
  const T0 = tier === "pct" ? g.pct : tier === "ect" ? g.ect : g.pwt;
  const pwt = T0 && T0.season === g.season ? T0 : null;
  const N = TIER_NAME[tier];
  const me = g.player.slotId;
  const [view, setView] = useState<string | null>(null);
  const [gsel, setGsel] = useState(() => Math.max(0, pwt ? pwt.groups.findIndex(x => x.includes(me)) : 0));
  const q = pct ? null : g.qual;
  const ev = seasonEvents(g.season);
  const groupDays = ev.filter(e => e.kind === (tier === "pct" ? "pctGroup" : tier === "ect" ? "ectGroup" : "group")).map(e => e.day);
  const kpoDays = ev.filter(e => e.kind === "kpo").map(e => e.day);
  return (
    <>
      <Win title={`시즌 ${g.season} ${TIER_LONG[tier]} (${N})`} right={pwt && <ReplayBtn g={g} draw={pwt.groupDraw} label="조 추첨 다시 보기" />}>
        {pct ? (
          <details class="rules">
            <summary>대회 방식</summary>
            <div class="small">
            {tier === "pct"
              ? "PWT 다음 단계의 대회입니다. PWT에 못 나간 트레이너 중 지방마다 상위 3명(그 지방 컵 우승자 우선)과 전 시즌 PCT 우승자가 나가고, 각 지방의 그다음 순위 중 승점 → 득실(같으면 추첨) 순으로 남은 자리를 채워 32명이 됩니다. "
              : "PST 다음 단계의 대회입니다. PWT·PST에 못 나간 트레이너 중 지방마다 상위 3명(그 지방 컵 우승자 우선)이 나가고, 각 지방의 그다음 순위 중 승점 → 득실(같으면 추첨) 순으로 남은 자리를 채워 32명이 됩니다. "}
            경기는 PWT와 같은 주 목요일에 열립니다. 조 1위는 16강에 바로 오르고, 조 2위는 {tier === "pct" ? "PWT" : "PST"} 조 3위와 12월 녹아웃 플레이오프(홈·원정 2경기, 16강 1차전 2주 전·1주 전 수요일)를 치러 이기면 16강에서 조 1위를 만납니다.
            {tier === "pct" ? " 조 3위는 PCT 녹아웃 플레이오프로 내려갑니다." : ""} 16강부터는 PWT와 같습니다(홈·원정 토너먼트 → 3판 2선승 결승). 우승자에게는 은색병뚜껑이 수여되고{tier === "pct" ? ", 다음 시즌 PWT에 나갑니다." : ", 다음 시즌 PST에 나갑니다."}
          </div>
          </details>
        ) : (
          <details class="rules">
            <summary>대회 방식</summary>
            <div class="small">
            전 시즌 지방 리그 1~3위(30명)와 디펜딩 챔피언, 전 시즌 PST 우승자가 나가 32명이 됩니다. 두 우승자가 이미 어느 지방 3위 안이라면 그 지방의 다음 순위가 대신 나갑니다. 4개 포트로 나눠 8개 조(같은 지방끼리는 같은 조 불가)에서 홈·원정 6경기를 치러 조 2위까지 1월 토너먼트에 오르고, 조 3위는 PST 녹아웃 플레이오프로 내려갑니다. 16강·8강·4강은 홈·원정 2경기(승수 → 남은 포켓몬 차이 → 추가 1판), 결승은 3판 2선승입니다. 우승자에게는 금색병뚜껑(포켓몬 한 마리의 모든 개체값 최대)과 전국 전설·환상의 포켓몬 스카우트권이 수여됩니다.
          </div>
          </details>
        )}
        {pwt && (
          <div class="tiny muted" style={{ marginTop: 4 }}>
            조별리그: {groupDays.map(d => dateLabel(d, false)).join(" · ")}
          </div>
        )}
      </Win>

      {!pct && (g.supers?.world || g.supers?.semi) && (
        <Win title={`시즌 ${g.supers!.season} 전국 슈퍼컵`}>
          <div class="cards" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
            {g.supers!.semi && <TieCard g={g} t={g.supers!.semi} label="준결승 · PST 챔피언 vs PCT 챔피언" />}
            {g.supers!.world && <TieCard g={g} t={g.supers!.world} label="결승 · PWT 챔피언 vs 준결승 승자" />}
          </div>
        </Win>
      )}
      {!pwt && pct && <div class="muted small">9월 첫 월요일 PWT 조 추첨 직후에 {tier === "pct" ? "PST" : "PST, PCT"} 조 추첨을 합니다.</div>}
      {pwt?.kpo && (
        <Win title="녹아웃 플레이오프" right={<ReplayBtn g={g} draw={pwt.kpoDraw} label="플레이오프 추첨 다시 보기" />}>
          <div class="cards" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
            {pwt.kpo.map((t, i) => (
              <TieCard key={i} g={g} t={t} onPick={id => id !== me && setView(id)} />
            ))}
          </div>
          <div class="tiny muted" style={{ marginTop: 4 }}>
            {kpoDays.map(d => dateLabel(d, false)).join(" · ")} · {tier === "pct" ? "PWT" : "PST"} 조 3위가 1차전 홈, 조 2위가 2차전 홈. 이긴 쪽이 16강에서 조 1위를 만납니다.
          </div>
        </Win>
      )}
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
            숫자는 경기별 남은 포켓몬 수. 16강은 {pct ? "플레이오프 승자" : "조 2위"}가 1차전 홈, 조 1위가 2차전 홈.
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
                      <tr key={r.id} class={`${r.id === me ? "me" : ""} ${i < (pct ? 1 : 2) ? "q" : pct && i === 1 ? "po" : ""}`}>
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
        <Win title={`시즌 ${q.season} PWT 진출권`}>
          <div class="small" style={{ marginBottom: 6 }}>
            진출 {qualified(q).length}명 확정
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
            <th>PWT 진출 (1~3위)</th>
          </tr>
        </thead>
        <tbody>
          {REGIONS.map(r => {
            const t = standings(g.leagues[r.id]);
            return (
              <tr key={r.id} class={r.id === g.player.region ? "me" : ""}>
                <td>{r.name}</td>
                <td class="small">{t.slice(0, 3).map(x => displayName(g, x.id)).join(", ")}</td>
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
  const cup = g.cups?.[region];
  const ev = seasonEvents(g.season);
  const cupDays = ev.filter(e => e.kind === "cup").map(e => e.day);
  const finalDay = ev.find(e => e.kind === "cupFinal")!.day;
  const pick = (id: string) => id !== me && setView(id);
  const T = (w: number, key: string, label: string) => <TieCard g={g} t={cup?.ties[`${w}${key}`]} label={label} onPick={pick} noRegion />;
  return (
    <>
      <Win
        title={`${regionById(region).name} 컵`}
        right={cup && <ReplayBtn g={g} draw={cup.draw} label="대진 추첨 다시 보기" />}
      >
        <div class="row" style={{ gap: 4, marginBottom: 8 }}>
          {REGIONS.map(r => (
            <button key={r.id} class={`btn small ${r.id === region ? "sel" : ""}`} onClick={() => setRegion(r.id)}>
              {r.name}
            </button>
          ))}
        </div>
        <details class="rules">
          <summary>대회 방식</summary>
          <div class="small">
          지방 리그 20명이 A윙·B윙으로 나뉘어 토너먼트를 치르고, 각 윙 우승자가 리그 최종 라운드 뒤 수요일에 결승을 치릅니다. <b>모든 경기는 단판 더블배틀</b>이며 포켓몬 챔피언스 룰(6마리 중 4마리 선택, 같은 포켓몬·같은 지닌 도구 중복 금지, Lv.50)을 따릅니다. 2시즌부터는 전 시즌 홀수 순위가 A윙, 짝수 순위가 B윙이며 순위대로 E·D·C·B·A 자리에 두 명씩 들어갑니다(1~4위는 1라운드를 쉬는 E 자리). 우승자에게는 은색병뚜껑이 수여됩니다. 2시즌부터는 8월 마지막 일요일에 리그 우승자와 컵 우승자가 슈퍼컵 단판 승부를 펼칩니다(같은 사람이면 리그 2위가 나섬).
        </div>
        </details>
        <div class="tiny muted" style={{ marginTop: 4 }}>
          1R {dateLabel(cupDays[0], false)} / 2R {dateLabel(cupDays[1], false)} / 3R {dateLabel(cupDays[2], false)} / 윙 결승 {dateLabel(cupDays[3], false)} / 결승 {dateLabel(finalDay, false)}
        </div>
        {!cup && <div class="muted" style={{ marginTop: 8 }}>10월 첫 월요일에 대진을 추첨합니다.</div>}
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
          <Win title="결승 (단판 더블배틀)">
            <div style={{ maxWidth: 260 }}>
              <TieCard g={g} t={cup.ties.F} onPick={pick} noRegion />
            </div>
          </Win>
          {[0, 1].map(w => (
            <Win key={w} title={WING_NAMES[w]}>
              <div class="bracket">
                <div class="bracket-col">
                  <b class="small gold">1라운드</b>
                  {T(w, "A", "A")}
                  {T(w, "B", "B")}
                  {T(w, "C", "C")}
                  {T(w, "D", "D")}
                </div>
                <div class="bracket-col">
                  <b class="small gold">2라운드</b>
                  {T(w, "AB", "A·B 승자")}
                  {T(w, "CD", "C·D 승자")}
                  {T(w, "E", "E")}
                </div>
                <div class="bracket-col">
                  <b class="small gold">3라운드</b>
                  {T(w, "CDE", "C·D 승자 vs E 승자")}
                </div>
                <div class="bracket-col">
                  <b class="small gold">윙 결승</b>
                  {T(w, "WF", `${WING_NAMES[w]} 결승`)}
                </div>
              </div>
            </Win>
          ))}
          <div class="tiny muted">자리: {LETTERS.map(L => `${L} ${CUP_STAGE_NAME[L]}부터`).join(" · ")}</div>
        </>
      )}
      {view && <TrainerModal id={view} onClose={() => setView(null)} />}
    </>
  );
}

/** PSB: the league champions' bracket (East and West, then the final). */
export function PsbTab({ g }: { g: GameState }) {
  const psb = g.psb && g.psb.season === g.season ? g.psb : null;
  const me = g.player.slotId;
  const [view, setView] = useState<string | null>(null);
  const days = seasonEvents(g.season).filter(e => e.kind === "psb").map(e => e.day);
  return (
    <>
      <Win title={`시즌 ${g.season} 포켓몬 슈퍼볼 (PSB)`}>
        <details class="rules">
          <summary>대회 방식</summary>
          <div class="small">
            10개 지방 리그 우승팀이 단판 더블배틀(지방 컵 등록 명단)로 겨룹니다. 동부(관동·성도·호연·신오·레전드)와 서부(하나·알로라·칼로스·가라르·팔데아)로 나눠, 1라운드는 각 지구에서 리그 승점이 가장 낮은 두 팀(같으면 득실, 그것도 같으면 추첨)이 붙고, 4강은 1라운드 승자와 나머지 세 팀을 추첨해 짝짓습니다. 지구 결승의 두 승자가 시즌 마지막 경기인 결승에서 맞붙습니다. 우승자에게는 은색병뚜껑이 수여됩니다.
          </div>
        </details>
        <div class="tiny muted" style={{ marginTop: 4 }}>
          {PSB_ROUND_KO.map((r, i) => `${r} ${days[i] != null ? dateLabel(days[i], false) : ""}`).join(" · ")}
        </div>
      </Win>
      {!psb && <div class="muted small">리그가 끝나고 PWT 결승 1주 뒤에 시작합니다.</div>}
      {psb?.champion && (
        <Win title="PSB 챔피언">
          <b class="gold">🏆 {displayName(g, psb.champion)}</b>
        </Win>
      )}
      {psb && (
        <>
          {(["east", "west"] as const).map(conf => (
            <Win key={conf} title={`${CONF_KO[conf]} (${psb.champs[conf].map(id => displayName(g, id)).join(", ")})`}>
              <div class="cards" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
                {[`${conf}:1`, `${conf}:2a`, `${conf}:2b`, `${conf}:3`].map((k, i) => (
                  <TieCard key={k} g={g} t={psb.ties[k]} label={i === 0 ? "1라운드" : i === 3 ? "지구 결승" : "4강"} onPick={id => id !== me && setView(id)} />
                ))}
              </div>
            </Win>
          ))}
          <Win title="결승 (동부 vs 서부)">
            <div style={{ maxWidth: 280 }}>
              <TieCard g={g} t={psb.ties.final} onPick={id => id !== me && setView(id)} />
            </div>
          </Win>
        </>
      )}
      {view && <TrainerModal id={view} onClose={() => setView(null)} />}
    </>
  );
}
