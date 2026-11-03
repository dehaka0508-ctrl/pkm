import { useState } from "preact/hooks";
import type { GameState } from "../../game/state";
import {
  FACILITY_KO,
  FACILITY_MAX,
  MAX_SEATS,
  RENTED_SEATS,
  RENT,
  SEAT_TIERS,
  UPKEEP_PER_LEVEL,
  capacityOf,
  expandStadium,
  expansionCost,
  gateDemand,
  gateIncome,
  homeGate,
  minExpansion,
  playerSeats,
  satisfaction,
  seatPrice,
  stadiumName,
  stadiumRent,
  stadiumUpkeep,
  upgradeCost,
  upgradeFacility,
} from "../../game/finance";
import { LEAGUE_ROUNDS } from "../../game/calendar";
import { update } from "../store";
import { Bar, Money, Win, useToast } from "../components";

/** Facilities: ticket price and fans' mood, the home stadium (built seat by seat), training and scouting. */
export function FacilityTab({ g }: { g: GameState }) {
  const p = g.player;
  const [toast, showToast] = useToast();
  const sat = satisfaction(g);
  const gate = homeGate(g);
  const seats = playerSeats(p.facilities);
  const cap = capacityOf(seats);
  const demand = Math.round(gateDemand(p.fans, sat));
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
              경기장 <b class="right">{stadiumName(seats)}</b>
            </div>
            <div class="row">
              좌석 <span class="right">
                {cap.toLocaleString()}석{seats === 0 && <span class="muted tiny"> (빌린 경기장)</span>}
              </span>
            </div>
            <div class="row">
              <span title="팬 수와 만족도로 정해지는, 표를 사려는 사람 수">관중 수요</span> <span class="right">{demand.toLocaleString()}명</span>
            </div>
            <div class="row">
              예상 관중 <span class="right">
                {gate.attendance.toLocaleString()}명{demand > cap && <span class="bad tiny"> ({(demand - cap).toLocaleString()}명 못 들어옴)</span>}
              </span>
            </div>
            <div class="row">
              <span title="관중 × 입장료 (구단 간 격차는 30% 줄여서 계산)">홈 경기 수입</span> <span class="right">
                <Money v={gate.income} /> · 시즌 약 {Math.ceil(LEAGUE_ROUNDS / 2)}경기
              </span>
            </div>
            <div class="row">
              {seats > 0 ? "경기장 유지비 (주)" : "경기장 임대료 (주)"} <span class="right bad">-₽{(seats > 0 ? stadiumUpkeep(seats) : stadiumRent(seats)).toLocaleString()}</span>
            </div>
          </div>
        </Win>
      </div>
      <StadiumBuilder g={g} toast={showToast} demand={demand} />
      <Win title="시설">
        <div class="grid2">
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

/** Choose how many seats to add and see what it costs and what it brings in. */
function StadiumBuilder({ g, toast, demand }: { g: GameState; toast: (s: string) => void; demand: number }) {
  const p = g.player;
  const seats = playerSeats(p.facilities);
  const min = minExpansion(seats);
  const room = MAX_SEATS - seats;
  // seats needed for today's demand (a renting club builds its whole ground)
  const toDemand = Math.max(0, Math.ceil((demand - seats) / 100) * 100);
  const [add, setAdd] = useState(Math.min(room, Math.max(min, toDemand)));
  const n = Math.max(0, Math.min(room, Math.round(add / 100) * 100));
  const to = seats + n;
  const cost = expansionCost(seats, to);
  // match-day money the new seats bring once full (vs today's ground)
  const nowCap = capacityOf(seats);
  const filled = Math.min(demand, to) - Math.min(demand, nowCap);
  const gain = gateIncome(Math.min(demand, to), p.ticketPrice) - gateIncome(Math.min(demand, nowCap), p.ticketPrice);
  const weekly = stadiumUpkeep(to) - stadiumUpkeep(seats) - stadiumRent(seats) + stadiumRent(to);
  const quick = [500, 1000, 5000].filter(v => v >= min && v <= room);
  return (
    <Win title="경기장 증축">
      <div class="col small" style={{ gap: 6 }}>
        <div class="tiny muted">
          좌석을 직접 지어 늘립니다. 좌석 번호에 따라 1석당 건설비가 다릅니다:{" "}
          {SEAT_TIERS.map(([upto, price], i) => `${(i ? SEAT_TIERS[i - 1][0] + 1 : 1).toLocaleString()}~${upto.toLocaleString()}석 ₽${price}`).join(" · ")}.
          {seats === 0 && ` 지금은 ${RENTED_SEATS.toLocaleString()}석 경기장을 빌려 쓰며 주 ₽${RENT.toLocaleString()}을 냅니다. 처음 짓는 전용 경기장은 ${RENTED_SEATS.toLocaleString()}석 이상이어야 하고, 완공하면 임대료 대신 1석당 주 ₽0.15의 유지비를 냅니다.`}
        </div>
        {room <= 0 ? (
          <div class="gold">최대 {MAX_SEATS.toLocaleString()}석입니다.</div>
        ) : (
          <>
            <div class="row" style={{ gap: 6 }}>
              <span>늘릴 좌석</span>
              <input type="number" min={min} max={room} step={100} value={add} style={{ width: 96 }} onInput={e => setAdd(Number((e.target as HTMLInputElement).value) || 0)} />
              <span>석</span>
              {quick.map(v => (
                <button key={v} class="btn small" onClick={() => setAdd(v)}>
                  +{v.toLocaleString()}
                </button>
              ))}
              {toDemand >= min && toDemand <= room && (
                <button class="btn small" title="관중 수요만큼" onClick={() => setAdd(toDemand)}>
                  수요만큼
                </button>
              )}
            </div>
            <input type="range" min={min} max={Math.min(room, Math.max(min, 20000))} step={100} value={Math.min(add, Math.max(min, 20000))} onInput={e => setAdd(Number((e.target as HTMLInputElement).value))} />
            <div class="col" style={{ gap: 2 }}>
              <div class="row">
                {seats.toLocaleString()}석 → <b>{to.toLocaleString()}석</b> <span class="muted tiny">({stadiumName(to)})</span>
                <b class="right">
                  <Money v={cost} />
                </b>
              </div>
              <div class="tiny muted">
                이번 증축 좌석 1석당 평균 ₽{n ? Math.round(cost / n) : 0} (다음 좌석 ₽{seatPrice(to + 1)}) · 주간 고정비 {weekly >= 0 ? "+" : "-"}₽{Math.abs(weekly).toLocaleString()}
                {seats === 0 && " (임대료 대신 유지비)"}
              </div>
              <div class="tiny">
                {filled > 0 ? (
                  <>
                    지금 수요로 {filled.toLocaleString()}석이 더 차서 홈 경기마다 <span class="good">+₽{gain.toLocaleString()}</span> · 약 {Math.ceil(cost / Math.max(1, gain))}경기면 본전
                  </>
                ) : (
                  <span class="muted">지금 팬 수로는 늘린 좌석이 차지 않습니다. 팬이 늘어야 수입이 오릅니다.</span>
                )}
              </div>
            </div>
            <button
              class="btn primary"
              disabled={n < min || cost > p.money}
              onClick={() =>
                update(st => {
                  const err = expandStadium(st, n);
                  toast(err || `경기장을 ${to.toLocaleString()}석으로 늘렸습니다.`);
                })
              }
            >
              {cost > p.money ? "자금 부족" : seats === 0 ? "전용 경기장 짓기" : "증축하기"} <Money v={cost} />
            </button>
          </>
        )}
      </div>
    </Win>
  );
}
