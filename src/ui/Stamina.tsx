import { staminaMultiplier, staminaOf } from "../game/stamina";

export function Stamina({ mon }: { mon: { stamina?: number } }) {
  const n = staminaOf(mon);
  return <div class="stamina" title={`최대 HP·공격·특수공격 ${Math.round(staminaMultiplier(mon) * 100)}% · 50 미만 출전 불가 · 미출전일 하루 1 회복`}>
    <span>스태미너</span><span class="stamina-track" role="meter" aria-label="스태미너" aria-valuemin={0} aria-valuemax={100} aria-valuenow={n}>
      <i style={{ width: `${n}%`, background: n >= 90 ? "#9ee487" : n >= 50 ? "#f8d030" : "#ef705e" }} />
    </span><span>{n}/100</span>
  </div>;
}
