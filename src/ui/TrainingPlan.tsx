import { useState } from "preact/hooks";
import { calcStats } from "../battle/calc";
import { nickOr, dex, koNature, koSpecies } from "../data/dex";
import { EV_STAT_CAP, EV_TOTAL_CAP, LEVEL_CAP, PLAN_KO, levelProgress } from "../game/training";
import { STATS, STAT_KO, type OwnedMon } from "../game/types";
import { Bar, Modal, Win } from "./components";
import { GoldenMasterBallStar } from "./GoldenMonName";

const ICONS = ["♥", "✦", "▣", "◉", "◈", "»"];
export function TrainingPlan({ mon: m, awardCount = 0, current, onSelect, onClose }: { mon: OwnedMon; awardCount?: number; current: string; onSelect: (plan: string) => void; onClose: () => void }) {
  const [plan, setPlan] = useState(current);
  const stats = calcStats(m);
  const nature = dex.natures.get(m.nature);
  const total = STATS.reduce((n, stat) => n + m.evs[stat], 0);
  return <Modal onClose={onClose}>
    <Win class="training-plan" title={<>{nickOr(m)}{awardCount > 0 && <> <GoldenMasterBallStar count={awardCount} /></>} · 훈련 선택</>} right={<button class="btn small" onClick={onClose}>닫기</button>}>
      <div class="small muted">배틀 Lv.50 능력치 · 노력치 {total}/{EV_TOTAL_CAP} · 주간 훈련 한 종목 선택</div>
      <div class="training-head"><span>능력</span><span>능력치</span><span>노력치 배분</span><span>EV</span><span>훈련</span></div>
      {STATS.map((stat, i) => <div key={stat} class="training-stat">
        <span class="training-label"><span aria-hidden="true">{ICONS[i]}</span> {STAT_KO[stat]}</span>
        <span class={`num ${nature.plus === stat ? "nature-up" : nature.minus === stat ? "nature-down" : ""}`}>
          {nature.plus === stat ? "↑ " : nature.minus === stat ? "↓ " : ""}{stats[stat]}
        </span>
        <Bar v={m.evs[stat] / EV_STAT_CAP} cls="ev" />
        <span class="num">{m.evs[stat]}</span>
        <span class="training-actions">
          <button class={`btn small ${plan === stat ? "sel" : ""}`} aria-label={`${STAT_KO[stat]} 노력치 강화`} aria-pressed={plan === stat} disabled={m.evs[stat] >= EV_STAT_CAP || total >= EV_TOTAL_CAP} onClick={() => setPlan(stat)}>+</button>
          <button class={`btn small ${plan === "-" + stat ? "sel" : ""}`} aria-label={`${STAT_KO[stat]} 노력치 감소`} aria-pressed={plan === "-" + stat} disabled={!m.evs[stat]} onClick={() => setPlan("-" + stat)}>−</button>
        </span>
      </div>)}
      <div class="small" style={{ margin: "8px 0" }}>능력 보정 <span class="right">{koNature(m.nature)}</span></div>
      <div class="training-extra"><span>경험치 · Lv.{m.level}</span><Bar v={levelProgress(m)} cls="exp" /><button class={`btn small ${plan === "level" ? "sel" : ""}`} disabled={m.level >= LEVEL_CAP} onClick={() => setPlan("level")}>경험치 훈련</button></div>
      <div class="row" style={{ marginTop: 12 }}>
        <button class={`btn small ${plan === "rest" ? "sel" : ""}`} onClick={() => setPlan("rest")}>휴식</button>
        <span class="small grow">선택: <b class="gold">{PLAN_KO[plan]}</b></span>
        <button class="btn primary" onClick={() => onSelect(plan)}>훈련 확정</button>
      </div>
      <p class="tiny muted">선택한 훈련은 주말에 적용됩니다. +/− 버튼은 즉시 능력치를 변경하지 않습니다.</p>
    </Win>
  </Modal>;
}
