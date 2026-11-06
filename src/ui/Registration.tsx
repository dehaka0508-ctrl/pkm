import { useState } from "preact/hooks";
import type { GameState } from "../game/state";
import { COMPETITION_NAMES, isHomegrown, isRegistrationLegend, registerTeam, registrationOf, registrationProblems, suggestedRegistration, withdrawRegistration, type Competition } from "../game/registration";
import { koSpecies } from "../data/dex";
import { update } from "./store";
import { ConfirmButton, Modal, MonIcon, Win } from "./components";

export function RegistrationDialog({ g, competition, onClose, onRegistered }: { g: GameState; competition: Competition; onClose: () => void; onRegistered: () => void }) {
  const [uids, setUids] = useState(() => suggestedRegistration(g, competition));
  const [error, setError] = useState("");
  const problems = registrationProblems(g, competition, uids);
  return <Modal onClose={onClose}>
    <Win title={`시즌 ${g.season} ${COMPETITION_NAMES[competition]} 포켓몬 등록`} right={<button class="btn small" onClick={onClose}>닫기</button>}>
      <p class="small">최대 8마리 · 홈그로운 2마리 이상(7~8마리 등록 시 3마리 이상) · 전설·환상 합계 1마리. 이로치는 두 제한에서 예외입니다. 확정한 명단은 이번 시즌 동안 변경할 수 없습니다.</p>
      <div class="small muted">홈그로운은 본가 지방 도감 기준이며 리메이크·DLC를 포함합니다. 등록 후에도 진화할 수 있습니다.</div>
      <div class="col" style={{ gap: 4, margin: "12px 0" }}>
        {g.player.squad.map(m => <label key={m.uid} class={`registration-row ${uids.includes(m.uid) ? "selected" : ""}`}>
          <input type="checkbox" checked={uids.includes(m.uid)} disabled={!uids.includes(m.uid) && uids.length >= 8}
            onChange={() => setUids(old => old.includes(m.uid) ? old.filter(u => u !== m.uid) : [...old, m.uid])} />
          <MonIcon species={m.species} scale={1} />
          <span class="grow">{koSpecies(m.species)} <span class="tiny muted">Lv.{m.level}</span></span>
          {m.shiny ? <span class="chip gold">★ 이로치</span> : isHomegrown(m.species, g.player.region) ? <span class="chip">홈그로운</span> : <span class="tiny muted">외부</span>}
          {isRegistrationLegend(m.species) && <span class="tiny gold">전설·환상</span>}
        </label>)}
      </div>
      <b>{uids.length}/8마리 선택</b>
      {problems.map(p => <div key={p} class="small bad">{p}</div>)}
      {error && <div class="small bad" role="alert">{error}</div>}
      <div class="row" style={{ marginTop: 12 }}>
        <button class="btn primary" disabled={!!problems.length} onClick={() => {
          let err: string | null = null;
          update(st => { err = registerTeam(st, competition, uids); });
          if (err) setError(err); else onRegistered();
        }}>시즌 등록 확정</button>
        <button class="btn" onClick={onClose}>스쿼드 관리로 돌아가기</button>
      </div>
      <p class="tiny muted">조건을 맞추기 어렵다면 스카우트로 영입한 뒤 다시 진행하세요. 등록한 포켓몬만 해당 대회에 출전할 수 있습니다.</p>
      <ConfirmButton label="이번 시즌 대회 참가 포기" confirmLabel="이번 시즌 이 대회 경기는 모두 기권패 처리됩니다. 다시 눌러 확정" onConfirm={() => { update(st => withdrawRegistration(st, competition)); onRegistered(); }} />
    </Win>
  </Modal>;
}

export function RegistrationSummary({ g }: { g: GameState }) {
  return <Win title="이번 시즌 대회 등록">
    <div class="small muted">리그 개막전·대회 첫 추첨 직전에 명단을 확정합니다. 대회마다 최대 8마리이며, 보유 한도 10마리와 별개입니다.</div>
    {(Object.keys(COMPETITION_NAMES) as Competition[]).map(comp => {
      const reg = registrationOf(g, comp);
      return <div key={comp} class="small" style={{ marginTop: 6 }}><b>{COMPETITION_NAMES[comp]}</b> · {reg?.withdrawn ? "참가 포기" : reg ? reg.uids.map(u => {
        const m = g.player.squad.find(m => m.uid === u); return m ? koSpecies(m.species) : "떠난 포켓몬";
      }).join(" · ") : "미등록"}</div>;
    })}
  </Win>;
}
