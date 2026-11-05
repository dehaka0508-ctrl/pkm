import { staminaOf } from "../game/stamina";

export function Stamina({ mon }: { mon: { stamina?: number } }) {
  const n = staminaOf(mon);
  return <div class="stamina" title="배틀 HP와 별개 · 출전하지 않은 날 하루 1 회복 · 치료로 회복 불가">
    <span>스태미너</span><span class="stamina-track" role="meter" aria-label="스태미너" aria-valuemin={0} aria-valuemax={100} aria-valuenow={n}>
      <i style={{ width: `${n}%`, background: n > 30 ? "#9ee487" : n > 0 ? "#f8d030" : "#ef705e" }} />
    </span><span>{n}/100</span>
  </div>;
}
