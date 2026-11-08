import { useState } from "preact/hooks";
import { itemName } from "../../game/shop";
import { fixedItems, pickItems } from "../../data/forms";
import { nickOr, REGIONS, dex, koAbility, koNature, koType } from "../../data/dex";
import type { GameState } from "../../game/state";
import { absWeek } from "../../game/state";
import { MISSION_COST, MISSION_WEEKS, RARE_SCOUT_LEVEL, SQUAD_MAX, maxMissions, signCandidate, startMission } from "../../game/scouting";
import { update } from "../store";
import { Money, Stars, TypeFilter, typesOf, Win, useToast } from "../components";
import { MonCard } from "../TeamView";
import { NameDialog } from "../NameDialog";
import { LEGEND_LEVEL, LOAN_SEASONS, loanUntilFor, renewWithTicket, ticketName, ticketsOf, useTicket } from "../../game/legend";
import { dateLabel } from "../../game/calendar";
import { koSpecies } from "../../data/dex";
import { goldenMasterBallCount } from "../../game/golden-master-ball";

export function ScoutTab({ g }: { g: GameState }) {
  const p = g.player;
  const [region, setRegion] = useState(p.region);
  const [type, setType] = useState("");
  const [picks, setPicks] = useState<Record<string, string>>({});
  /** the Pokémon just signed: offered a name */
  const [naming, setNaming] = useState<string | null>(null);
  const namingMon = naming ? p.squad.find(m => m.uid === naming) : undefined;
  const [toast, showToast] = useToast();
  const types = typesOf(dex.types.all().filter(t => t.name !== "Stellar").map(t => t.name));
  const max = maxMissions(p.facilities.scouting);
  const now = absWeek(g);
  const tickets = ticketsOf(g);
  return (
    <>
      {tickets.map(t => (
        <Win key={t.id} title={`🎫 ${ticketName(t)}`} right={<span class="tiny muted">{t.comp} 우승 상품 · 시즌 {t.season + 1} {dateLabel(t.expires - 1, false)}까지 사용</span>}>
          <div class="small muted" style={{ marginBottom: 6 }}>
            세 후보 중 한 마리를 영입합니다 (Lv.{LEGEND_LEVEL}, 개체값 3개 31). 시즌 {loanUntilFor(t)}이 끝날 때까지 {LOAN_SEASONS}시즌 동안 함께합니다.
            {t.renew?.length ? " 같은 대회 우승으로 함께하는 포켓몬을 고르면 새로 영입하는 대신 그 포켓몬의 보유 기간을 시즌 " + loanUntilFor(t) + "까지 연장합니다." : ""}
          </div>
          <div class="cards">
            {t.choices.map(sp => (
              <MonCard key={sp} m={{ species: sp, level: LEGEND_LEVEL }}>
                {pickItems(sp).length > 0 && (
                  <select value={picks[sp] || pickItems(sp)[0]} onChange={e => setPicks({ ...picks, [sp]: (e.target as HTMLSelectElement).value })} style={{ marginTop: 4, maxWidth: "100%" }}>
                    {pickItems(sp).map(k => (
                      <option key={k} value={k}>
                        {itemName(k)}
                      </option>
                    ))}
                  </select>
                )}
                {fixedItems(sp).length > 0 && <div class="tiny muted">함께 받는 물건: {fixedItems(sp).map(itemName).join(", ")}</div>}
                <div class="row" style={{ marginTop: 4 }}>
                  <button
                    class="btn small primary"
                    onClick={() =>
                      update(st => {
                        const err = useTicket(st, t.id, sp, picks[sp] || pickItems(sp)[0]);
                        showToast(err || `${koSpecies(dex.species.get(sp).name)}을(를) 영입했습니다.`);
                        if (!err) setNaming(st.player.squad[st.player.squad.length - 1]?.uid ?? null);
                      })
                    }
                  >
                    영입
                  </button>
                </div>
              </MonCard>
            ))}
            {(t.renew || []).map(uid => {
              const m = p.squad.find(x => x.uid === uid);
              if (!m || m.loanUntil == null) return null;
              return (
                <MonCard key={uid} m={m} awardCount={goldenMasterBallCount(g, p.slotId, m.uid)}>
                  <div class="tiny muted">지금 함께하는 포켓몬 · 시즌 {m.loanUntil}까지</div>
                  <div class="row" style={{ marginTop: 4 }}>
                    <button
                      class="btn small primary"
                      onClick={() =>
                        update(st => {
                          const err = renewWithTicket(st, t.id, uid);
                          showToast(err || `${nickOr(m)}의 보유 기간을 시즌 ${loanUntilFor(t)}까지 연장했습니다.`);
                        })
                      }
                    >
                      연장
                    </button>
                  </div>
                </MonCard>
              );
            })}
          </div>
        </Win>
      ))}
      <Win title={`스카우트 파견 (${p.missions.length}/${max})`}>
        <div class="small muted" style={{ marginBottom: 6 }}>
          스카우트는 {MISSION_WEEKS}주 뒤 후보 보고서를 보냅니다. 스카우팅 시설 레벨이 높을수록 후보 수·레벨·개체값과 ★ 추정 정확도가 올라갑니다. 시설 {RARE_SCOUT_LEVEL}단계부터는 알로라에서 울트라비스트, 팔데아에서 패러독스 포켓몬이 나옵니다 (일반 포켓몬의 절반 확률 · 홈그로운 아님 · 먹이값 1.5배).
        </div>
        <div class="col" style={{ gap: 6 }}>
          <div>
            <div class="tiny muted" style={{ marginBottom: 3 }}>지역</div>
            <div class="row" style={{ gap: 4 }}>
              {REGIONS.map(r => (
                <button key={r.id} class={`btn small ${region === r.id ? "sel" : ""}`} onClick={() => setRegion(r.id)}>
                  {r.name}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div class="tiny muted" style={{ marginBottom: 3 }}>
              타입 위주 {type ? `— ${koType(type)} 타입이 나올 확률 2배` : "— 고르지 않으면 모든 포켓몬이 같은 확률"}
            </div>
            <TypeFilter types={types} value={type || null} onChange={t => setType(t || "")} />
          </div>
        </div>
        <div class="row" style={{ marginTop: 6 }}>
          <span class="small">
            {REGIONS.find(r => r.id === region)?.name}
            {type ? ` · ${koType(type)} 타입 위주` : " · 모든 타입"}
          </span>
          <button
            class="btn primary"
            disabled={p.missions.length >= max}
            onClick={() =>
              update(st => {
                const err = startMission(st, region, type || null);
                showToast(err || "스카우트를 보냈습니다.");
              })
            }
          >
            파견 (<Money v={MISSION_COST} />)
          </button>
        </div>
        {p.missions.length > 0 && (
          <div class="col small" style={{ marginTop: 8, gap: 2 }}>
            {p.missions.map(m => (
              <div key={m.id}>
                · {REGIONS.find(r => r.id === m.region)!.name}
                {m.type ? ` (${koType(m.type)} 위주)` : ""} — {m.weeksLeft}주 남음
              </div>
            ))}
          </div>
        )}
      </Win>
      <Win title={`후보 보고서 (${p.candidates.length})`} right={<span class="tiny muted">스쿼드 {p.squad.length}/{SQUAD_MAX}</span>}>
        {p.candidates.length === 0 ? (
          <div class="muted">아직 받은 보고서가 없습니다.</div>
        ) : (
          <div class="cards">
            {p.candidates.map(c => (
              <MonCard key={c.id} m={c}>
                <div class="tiny">
                  <Stars n={c.stars} /> · {koNature(c.nature)} · {koAbility(c.ability)}
                  {c.shiny && <span class="gold"> · 이로치!</span>}
                </div>
                <div class="tiny muted">
                  {REGIONS.find(r => r.id === c.region)!.name} · {c.expires - now}주 후 만료
                </div>
                <div class="row" style={{ marginTop: 4 }}>
                  <button
                    class="btn small primary"
                    onClick={() =>
                      update(st => {
                        const err = signCandidate(st, c.id);
                        showToast(err || "영입했습니다! 스쿼드에서 확인하세요.");
                        if (!err) setNaming(st.player.squad[st.player.squad.length - 1]?.uid ?? null);
                      })
                    }
                  >
                    영입 <Money v={c.fee} />
                  </button>
                  <button class="btn small" onClick={() => update(st => (st.player.candidates = st.player.candidates.filter(x => x.id !== c.id)))}>
                    거절
                  </button>
                </div>
              </MonCard>
            ))}
          </div>
        )}
      </Win>
      {namingMon && <NameDialog m={namingMon} onClose={() => setNaming(null)} />}
      {toast}
    </>
  );
}
