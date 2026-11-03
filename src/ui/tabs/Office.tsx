import type { GameState } from "../../game/state";
import { homeGate, weeklyCosts, weeklyIncome } from "../../game/finance";
import { LoanPanel, TreatmentPanel } from "../LoanPanel";
import { update } from "../store";
import { Money, Win, useToast } from "../components";
import { sponsorOf } from "../../game/sponsor";
import { SponsorPanel } from "../SponsorPanel";

export function OfficeTab({ g }: { g: GameState }) {
  const p = g.player;
  const [toast, showToast] = useToast();
  const c = weeklyCosts(g);
  const i = weeklyIncome(g);
  const gate = homeGate(g);
  return (
    <>
      <SponsorPanel g={g} toast={showToast} />
      <div class="grid2">
        <Win title="재정">
          <div class="col small" style={{ gap: 4 }}>
            <div class="row">
              보유 자금 <b class="right">
                <Money v={p.money} />
              </b>
            </div>
            <div class="row">
              월 스폰서 <span class="right">
                <Money v={sponsorOf(g).contract && (sponsorOf(g).contract!.fixed || sponsorOf(g).contract!.toSeason >= g.season) ? sponsorOf(g).contract!.monthly : 0} />
              </span>
            </div>
            <div class="row">
              <span title="명성이 낮은 구단이 매주 받는 리그 지원금: (60 − 명성) × ₽100, 명성 60부터 없음. 최소 경기일 수입·소규모 스폰서와 합쳐 최상급 포켓몬 6마리 먹이값을 간신히 낼 수 있는 수준입니다.">주간 리그 지원금</span> <span class="right">
                <Money v={i.share} />
              </span>
            </div>
            <div class="row">
              주간 굿즈 <span class="right">
                <Money v={i.merch} />
              </span>
            </div>
            <div class="row">
              <span title="포켓몬마다 종족값 × 개체값 합에 비례 (600족·6V = 주 ₽2,000)">먹이값 ({p.squad.length}마리)</span> <span class="right bad">-₽{c.food.toLocaleString()}</span>
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
              홈 경기 예상 경기일 수입 <span class="right">
                <Money v={gate.income} /> ({gate.attendance.toLocaleString()}명)
              </span>
            </div>
          </div>
        </Win>
        <LoanPanel g={g} toast={showToast} />
      </div>
      <TreatmentPanel g={g} toast={showToast} />
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
