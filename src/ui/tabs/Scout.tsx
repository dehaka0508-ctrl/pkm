import { useState } from "preact/hooks";
import { REGIONS, dex, koAbility, koNature, koType } from "../../data/dex";
import type { GameState } from "../../game/state";
import { absWeek } from "../../game/state";
import { MISSION_COST, MISSION_WEEKS, SQUAD_MAX, maxMissions, signCandidate, startMission } from "../../game/scouting";
import { update } from "../store";
import { Money, Stars, Win, useToast } from "../components";
import { MonCard } from "../TeamView";

export function ScoutTab({ g }: { g: GameState }) {
  const p = g.player;
  const [region, setRegion] = useState(p.region);
  const [type, setType] = useState("");
  const [toast, showToast] = useToast();
  const types = dex.types.all().filter(t => t.name !== "Stellar").map(t => t.name);
  const max = maxMissions(p.facilities.scouting);
  const now = absWeek(g);
  return (
    <>
      <Win title={`스카우트 파견 (${p.missions.length}/${max})`}>
        <div class="small muted" style={{ marginBottom: 6 }}>
          스카우트는 {MISSION_WEEKS}주 뒤 후보 보고서를 보냅니다. 스카우팅 시설 레벨이 높을수록 후보 수·레벨·개체값과 ★ 추정 정확도가 올라갑니다.
        </div>
        <div class="row">
          <select value={region} onChange={e => setRegion((e.target as HTMLSelectElement).value)}>
            {REGIONS.map(r => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <select value={type} onChange={e => setType((e.target as HTMLSelectElement).value)}>
            <option value="">모든 타입</option>
            {types.map(t => (
              <option key={t} value={t}>
                {koType(t)} 타입 위주
              </option>
            ))}
          </select>
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
                {m.type ? ` (${koType(m.type)})` : ""} — {m.weeksLeft}주 남음
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
      {toast}
    </>
  );
}
