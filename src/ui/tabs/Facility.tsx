import type { GameState } from "../../game/state";
import { UPKEEP_PER_LEVEL, FACILITY_KO, FACILITY_MAX, STADIUM_CAPACITY, STADIUM_NAME, homeGate, satisfaction, upgradeCost, upgradeFacility, upkeepOf } from "../../game/finance";
import { update } from "../store";
import { Bar, Money, Win, useToast } from "../components";

/** Facilities: ticket price and fans' mood, and the club's buildings. */
export function FacilityTab({ g }: { g: GameState }) {
  const p = g.player;
  const [toast, showToast] = useToast();
  const sat = satisfaction(g);
  const gate = homeGate(g);
  return (
    <>
      <div class="grid2">
        <Win title="입장료·팬 만족도">
          <div class="col small" style={{ gap: 6 }}>
            <div class="row">
              팬 수 <b class="right">{p.fans.toLocaleString()}명</b>
            </div>
            <div class="row">
              명성 <b class="right">{Math.round(p.reputation)}/100</b>
            </div>
            <div>
              팬 만족도 {Math.round(sat * 100)}%
              <Bar v={sat / 1.2} />
            </div>
            <label class="col" style={{ gap: 2 }}>
              <span>
                입장료 <b>₽{p.ticketPrice}</b> <span class="muted tiny">(올리면 수입은 늘지만 만족도가 떨어집니다)</span>
              </span>
              <input type="range" min={5} max={60} step={1} value={p.ticketPrice} onInput={e => update(st => (st.player.ticketPrice = Number((e.target as HTMLInputElement).value)))} />
            </label>
          </div>
        </Win>
        <Win title="홈 경기장">
          <div class="col small" style={{ gap: 6 }}>
            <div class="row">
              경기장 <b class="right">{STADIUM_NAME[p.facilities.stadium]}</b>
            </div>
            <div class="row">
              좌석 <span class="right">{STADIUM_CAPACITY[p.facilities.stadium].toLocaleString()}석</span>
            </div>
            <div class="row">
              예상 관중 <span class="right">{gate.attendance.toLocaleString()}명</span>
            </div>
            <div class="row">
              <span title="관중 × 입장료 (구단 간 격차는 30% 줄여서 계산)">예상 경기일 수입</span> <span class="right">
                <Money v={gate.income} />
              </span>
            </div>
            <div class="row">
              시설 유지비 (주) <span class="right bad">-₽{upkeepOf(p.facilities).toLocaleString()}</span>
            </div>
            {gate.attendance >= STADIUM_CAPACITY[p.facilities.stadium] && <div class="tiny gold">매진! 경기장을 넓히면 관중이 더 들어옵니다.</div>}
          </div>
        </Win>
      </div>
      <Win title="시설">
        <div class="grid3">
          {(Object.keys(FACILITY_MAX) as (keyof typeof FACILITY_MAX)[]).map(k => {
            const lv = p.facilities[k];
            const max = FACILITY_MAX[k];
            const cost = upgradeCost(k, lv);
            return (
              <div key={k} class="card" style={{ cursor: "default" }}>
                <b>{FACILITY_KO[k]}</b> <span class="gold">Lv.{lv}</span>
                <span class="tiny muted">/{max}</span>
                <div class="tiny muted" style={{ minHeight: 34 }}>
                  {k === "training" && "주간 훈련 경험치·노력치 증가"}
                  {k === "scouting" && "후보 수·레벨·개체값, ★ 정확도, 동시 파견 수 증가"}
                  {k === "stadium" && `${STADIUM_NAME[lv]} · ${STADIUM_CAPACITY[lv].toLocaleString()}석`}
                </div>
                <div class="tiny muted">
                  유지비 주 ₽{((lv - 1) * UPKEEP_PER_LEVEL[k]).toLocaleString()}
                  {lv < max && ` → 다음 단계 ₽${(lv * UPKEEP_PER_LEVEL[k]).toLocaleString()}`}
                </div>
                <button
                  class="btn small primary"
                  disabled={lv >= max}
                  onClick={() =>
                    update(st => {
                      const err = upgradeFacility(st, k);
                      showToast(err || `${FACILITY_KO[k]}을(를) 업그레이드했습니다.`);
                    })
                  }
                >
                  {lv >= max ? "최고 단계" : <>업그레이드 <Money v={cost} /></>}
                </button>
              </div>
            );
          })}
        </div>
      </Win>
      {toast}
    </>
  );
}
