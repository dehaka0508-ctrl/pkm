// Schedule tab, August only: preseason friendlies — invite an NPC club, or answer its invitation.
import { useState } from "preact/hooks";
import { regionById } from "../data/dex";
import { dateLabel, dayOf } from "../game/calendar";
import { acceptChance, AWAY_SHARE, answerOffer, friendliesOf, friendlyGate, invite, inviteable, openDays } from "../game/friendly";
import { roleLabel, trainerById } from "../game/lineups";
import { npcOf } from "../game/npc";
import { displayName, type GameState } from "../game/state";
import { Win, useToast } from "./components";
import { update } from "./store";

const pct = (x: number) => `${Math.round(x * 100)}%`;

export function FriendlyPanel({ g }: { g: GameState }) {
  const [toast, show] = useToast();
  const me = g.player.slotId;
  const days = openDays(g);
  const region = g.player.region;
  const opps = inviteable(g).sort((a, b) => {
    const ta = trainerById(a)!;
    const tb = trainerById(b)!;
    return (ta.region === region ? 0 : 1) - (tb.region === region ? 0 : 1) || ta.region.localeCompare(tb.region) || npcOf(g, b).reputation - npcOf(g, a).reputation;
  });
  const [day, setDay] = useState<number | null>(null);
  const [opp, setOpp] = useState("");
  const d = day != null && days.includes(day) ? day : days[0];
  const o = opp && opps.includes(opp) ? opp : opps[0];
  const list = friendliesOf(g).filter(f => f.home === me || f.away === me);
  const offers = list.filter(f => f.status === "offer");
  const booked = list.filter(f => f.status === "set" || f.status === "played"); // refused / lapsed invitations are not listed
  const gate = friendlyGate(g, me);
  const chance = o ? acceptChance(g, o) : 0;
  const regions = [...new Set(opps.map(id => trainerById(id)!.region))];
  return (
    <Win title="친선경기 · 프리시즌">
      <div class="col small" style={{ gap: 6 }}>
        <div class="tiny muted">8월에만 · 공식 경기가 없는 날 · 주 1회. 초청한 팀이 홈이고, 입장 수입의 {pct(AWAY_SHARE)}를 원정팀에 나눠 줍니다. 순위·명성에는 영향이 없고 경험치는 얻습니다.</div>
        {offers.map(f => {
          const share = friendlyGate(g, f.home).share;
          return (
            <div key={f.id} class="row card" style={{ cursor: "default", gap: 6 }}>
              <div class="grow">
                <b>{displayName(g, f.home)}</b> <span class="tiny muted">{regionById(trainerById(f.home)!.region).name}</span>의 초청
                <div class="tiny">
                  {dateLabel(f.day)} · 원정 · 분배금 약 ₽{share.toLocaleString()} · {dateLabel(f.day - 1, false)}까지 답변
                </div>
              </div>
              <button class="btn small primary" onClick={() => update(st => show(answerOffer(st, f.id, true) || "친선경기를 잡았습니다."))}>
                수락
              </button>
              <button class="btn small" onClick={() => update(st => void answerOffer(st, f.id, false))}>
                거절
              </button>
            </div>
          );
        })}
        {booked.length > 0 && (
          <div class="col" style={{ gap: 2 }}>
            {booked.map(f => (
              <div key={f.id} class="row" style={{ gap: 6 }}>
                <span class="tiny muted" style={{ whiteSpace: "nowrap" }}>{dateLabel(f.day, false)}</span>
                <span>{displayName(g, f.home === me ? f.away : f.home)}</span>
                <span class="tiny muted">{f.home === me ? "홈" : "원정"}</span>
                <span class={`right tiny ${f.status === "declined" ? "muted" : f.result ? (f.result.w === 0 ? "good" : f.result.w === 1 ? "bad" : "") : "gold"}`}>
                  {f.status === "declined" ? "성사 안 됨" : f.result ? `${f.result.w === -1 ? "무" : f.result.w === 0 ? "승" : "패"} ${f.result.my}:${f.result.opp}` : "확정"}
                </span>
              </div>
            ))}
          </div>
        )}
        {days.length > 0 && opps.length > 0 ? (
          <div class="col" style={{ gap: 4, borderTop: "1px solid rgba(87,74,110,.4)", paddingTop: 6 }}>
            <b>상대 초청하기 (홈)</b>
            <div class="row" style={{ gap: 6 }}>
              <select value={d} onChange={e => setDay(Number((e.target as HTMLSelectElement).value))}>
                {days.map(x => (
                  <option key={x} value={x}>
                    {dateLabel(x)}
                  </option>
                ))}
              </select>
              <select value={o} onChange={e => setOpp((e.target as HTMLSelectElement).value)} style={{ maxWidth: "100%" }}>
                {regions.map(r => (
                  <optgroup key={r} label={regionById(r).name}>
                    {opps
                      .filter(id => trainerById(id)!.region === r)
                      .map(id => (
                        <option key={id} value={id}>
                          {trainerById(id)!.name} ({roleLabel(trainerById(id)!)}) · 명성 {Math.round(npcOf(g, id).reputation)}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </select>
            </div>
            <div class="tiny">
              예상 관중 {gate.attendance.toLocaleString()}명 · 입장 수입 ₽{gate.income.toLocaleString()} → 내 몫 ₽{(gate.income - gate.share).toLocaleString()}, 상대 ₽{gate.share.toLocaleString()} · 수락 가능성 {chance >= 0.7 ? "높음" : chance >= 0.45 ? "보통" : "낮음"}
            </div>
            <div class="row">
              <button
                class="btn small primary"
                onClick={() =>
                  update(st => {
                    const r = invite(st, o, d);
                    show(r.text);
                  })
                }
              >
                초청 제의
              </button>
              <span class="tiny muted">한 상대에게는 프리시즌에 한 번만 제의할 수 있습니다.</span>
            </div>
          </div>
        ) : (
          <div class="tiny muted">{g.day > dayOf(g.season, 8, 31) ? "프리시즌이 끝났습니다." : "남은 8월 일정에 친선경기를 더 잡을 수 있는 주가 없습니다."}</div>
        )}
      </div>
      {toast}
    </Win>
  );
}
