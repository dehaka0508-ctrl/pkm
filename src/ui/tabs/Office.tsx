import type { GameState } from "../../game/state";
import { FACILITY_KO, FACILITY_MAX, STADIUM_CAPACITY, STADIUM_NAME, homeGate, satisfaction, upgradeCost, upgradeFacility, weeklyCosts, weeklyIncome } from "../../game/finance";
import { update } from "../store";
import { Bar, Money, Win, useToast } from "../components";

export function OfficeTab({ g }: { g: GameState }) {
  const p = g.player;
  const [toast, showToast] = useToast();
  const c = weeklyCosts(g);
  const i = weeklyIncome(g);
  const gate = homeGate(g);
  const sat = satisfaction(g);
  return (
    <>
      <div class="grid2">
        <Win title="재정">
          <div class="col small" style={{ gap: 4 }}>
            <div class="row">
              보유 자금 <b class="right">
                <Money v={p.money} />
              </b>
            </div>
            <div class="row">
              주간 스폰서 <span class="right">
                <Money v={i.sponsor} />
              </span>
            </div>
            <div class="row">
              주간 굿즈 <span class="right">
                <Money v={i.merch} />
              </span>
            </div>
            <div class="row">
              식비 ({p.squad.length}마리) <span class="right bad">-₽{c.food.toLocaleString()}</span>
            </div>
            <div class="row">
              시설 유지비 <span class="right bad">-₽{c.upkeep.toLocaleString()}</span>
            </div>
            {c.rent > 0 && (
              <div class="row">
                경기장 임대료 <span class="right bad">-₽{c.rent.toLocaleString()}</span>
              </div>
            )}
            <div class="row">
              홈 경기 예상 입장 수입 <span class="right">
                <Money v={gate.income} /> ({gate.attendance.toLocaleString()}명)
              </span>
            </div>
          </div>
        </Win>
        <Win title="팬">
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
      <Win title="커리어">
        {p.titles.length > 0 && <div class="gold small">🏆 {p.titles.join(" · ")}</div>}
        {p.history.length === 0 ? (
          <div class="muted small">첫 시즌 진행 중입니다.</div>
        ) : (
          <table class="tbl">
            <thead>
              <tr>
                <th>시즌</th>
                <th>순위</th>
                <th class="n">승점</th>
                <th class="n">승-무-패</th>
                <th>지방 컵</th>
                <th>PCT</th>
                <th>PWT</th>
              </tr>
            </thead>
            <tbody>
              {p.history.map(h => (
                <tr key={h.season}>
                  <td>{h.season}</td>
                  <td>{h.rank}위</td>
                  <td class="n">{h.pts}</td>
                  <td class="n">
                    {h.w}-{h.d}-{h.l}
                  </td>
                  <td>{h.cup ?? "-"}</td>
                  <td>{h.pct ?? "-"}</td>
                  <td>{h.pwt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Win>
      {toast}
    </>
  );
}
