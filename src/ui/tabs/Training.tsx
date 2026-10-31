import { koSpecies } from "../../data/dex";
import type { GameState } from "../../game/state";
import { LEVEL_CAP, PLAN_KO, levelProgress, evText } from "../../game/training";
import { update } from "../store";
import { Bar, MonIcon, Win } from "../components";

export function TrainingTab({ g }: { g: GameState }) {
  const p = g.player;
  const fac = p.facilities.training;
  const baseExp = 100 + 25 * fac;
  const setAll = (plan: string) => update(st => st.player.squad.forEach(m => (st.player.plan[m.uid] = plan)));
  return (
    <Win
      title={`주간 훈련 (훈련 시설 Lv.${fac})`}
      right={
        <>
          <button class="btn small" onClick={() => setAll("level")}>
            전원 레벨
          </button>
          <button class="btn small" onClick={() => setAll("rest")}>
            전원 휴식
          </button>
        </>
      }
    >
      <div class="small muted" style={{ marginBottom: 6 }}>
        매주 끝에 훈련이 적용됩니다. 레벨 훈련: 경험치 {Math.round(baseExp * 1.6)} · 능력 강화: 경험치 {Math.round(baseExp * 0.5)} + 노력치 {8 + fac * 3}. 레벨 상한 {LEVEL_CAP}. 경기에 나가면 추가 경험치를 얻습니다.
      </div>
      <div class="tbl-wrap">
        <table class="tbl">
          <thead>
            <tr>
              <th>포켓몬</th>
              <th>Lv</th>
              <th class="hide-sm">경험치</th>
              <th class="hide-sm">노력치</th>
              <th>훈련</th>
            </tr>
          </thead>
          <tbody>
            {p.squad.map(m => (
              <tr key={m.uid}>
                <td>
                  <div class="row" style={{ gap: 4 }}>
                    <MonIcon species={m.species} />
                    {koSpecies(m.species)}
                  </div>
                </td>
                <td class="num">{m.level}</td>
                <td class="hide-sm" style={{ width: 120 }}>
                  <Bar v={levelProgress(m)} cls="exp" />
                </td>
                <td class="tiny hide-sm">{evText(m)}</td>
                <td>
                  <select value={p.plan[m.uid] || "level"} onChange={e => update(st => (st.player.plan[m.uid] = (e.target as HTMLSelectElement).value))}>
                    {Object.entries(PLAN_KO).map(([k, v]) => (
                      <option key={k} value={k} disabled={k === "level" && m.level >= LEVEL_CAP}>
                        {v}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Win>
  );
}
