import { useState } from "preact/hooks";
import type { GameState } from "../game/state";
import { COMPETITION_NAMES, canChangeRegistration, changeRegistration, countsHomegrown, inWinterWindow, registrationDeadline, isRegistrationLegend, registerTeam, registrationOf, registrationProblems, suggestedRegistration, withdrawRegistration, type Competition } from "../game/registration";
import { koSpecies } from "../data/dex";
import { dateLabel } from "../game/calendar";
import { entersCompetition } from "../game/season";
import { update } from "./store";
import { ConfirmButton, Modal, MonIcon, Win } from "./components";

export function RegistrationDialog({ g, competition, onClose, onRegistered }: { g: GameState; competition: Competition; onClose: () => void; onRegistered: () => void }) {
  // a registered league / cup roster: January's change, or its confirmation on Feb 1
  const change = canChangeRegistration(g, competition);
  const confirmDay = change && !inWinterWindow(g);
  const [uids, setUids] = useState(() =>
    change ? registrationOf(g, competition)!.uids.filter(u => g.player.squad.some(m => m.uid === u)) : suggestedRegistration(g, competition),
  );
  const [error, setError] = useState("");
  const problems = registrationProblems(g, competition, uids);
  const name = COMPETITION_NAMES[competition];
  const title = confirmDay ? `시즌 ${g.season} ${name} 등록 확정 (1월 변경 기간 끝)` : change ? `시즌 ${g.season} ${name} 등록 명단 변경 (1월)` : `시즌 ${g.season} ${name} 포켓몬 등록`;
  return <Modal onClose={onClose}>
    <Win title={title} right={<button class="btn small" onClick={onClose}>닫기</button>}>
      <p class="small">최대 8마리 · 홈그로운 2마리 이상(7~8마리 등록 시 3마리 이상) · 전설·환상 합계 1마리. 이로치는 두 제한에서 예외입니다. {confirmDay ? "2월이 되었습니다. 여기서 확정한 명단은 시즌이 끝날 때까지 바꿀 수 없습니다." : change ? "1월 31일까지는 몇 번이든 바꿀 수 있고, 2월 1일로 넘어갈 때 한 번 더 확정합니다." : "확정한 명단은 1월(리그·지방 컵 명단 변경 기간) 말고는 이번 시즌 동안 바꿀 수 없습니다."}</p>
      <div class="small muted">홈그로운은 그 지방 세대에 처음 나온 포켓몬입니다 (리전폼은 그 지방). 레전드 리그는 Z-A 쪽 트레이너가 6세대, 아르세우스 쪽 트레이너가 히스이 도감 포켓몬입니다. 트레이너로 시작했다면 처음 함께한 6마리도 홈그로운으로 인정합니다. 등록 후에도 진화할 수 있습니다.</div>
      <div class="col" style={{ gap: 4, margin: "12px 0" }}>
        {g.player.squad.map(m => <label key={m.uid} class={`registration-row ${uids.includes(m.uid) ? "selected" : ""}`}>
          <input type="checkbox" checked={uids.includes(m.uid)} disabled={!uids.includes(m.uid) && uids.length >= 8}
            onChange={() => setUids(old => old.includes(m.uid) ? old.filter(u => u !== m.uid) : [...old, m.uid])} />
          <MonIcon species={m.species} scale={1} />
          <span class="grow">{koSpecies(m.species)} <span class="tiny muted">Lv.{m.level}</span></span>
          {m.shiny ? <span class="chip gold">★ 이로치</span> : countsHomegrown(m, g.player.region, g.player.slotId) ? <span class="chip">홈그로운</span> : <span class="tiny muted">외부</span>}
          {!m.notLegend && isRegistrationLegend(m.species) && <span class="tiny gold">전설·환상</span>}
        </label>)}
      </div>
      <b>{uids.length}/8마리 선택</b>
      {problems.map(p => <div key={p} class="small bad">{p}</div>)}
      {error && <div class="small bad" role="alert">{error}</div>}
      <div class="row" style={{ marginTop: 12 }}>
        <button class="btn primary" disabled={!!problems.length} onClick={() => {
          let err: string | null = null;
          update(st => { err = change ? changeRegistration(st, competition, uids) : registerTeam(st, competition, uids); });
          if (err) setError(err); else onRegistered();
        }}>{confirmDay ? "명단 확정" : change ? "명단 변경" : "시즌 등록 확정"}</button>
        <button class="btn" onClick={onClose}>스쿼드 관리로 돌아가기</button>
      </div>
      <p class="tiny muted">조건을 맞추기 어렵다면 스카우트로 영입한 뒤 다시 진행하세요. 등록한 포켓몬만 해당 대회에 출전할 수 있습니다.</p>
      {!change && <ConfirmButton label="이번 시즌 대회 참가 포기" confirmLabel="이번 시즌 이 대회 경기는 모두 기권패 처리됩니다. 다시 눌러 확정" onConfirm={() => { update(st => withdrawRegistration(st, competition)); onRegistered(); }} />}
    </Win>
  </Modal>;
}

export function RegistrationSummary({ g }: { g: GameState }) {
  return <Win title="이번 시즌 대회 등록">
    <div class="small muted">대회 탭의 '대회 포켓몬 등록'에서 기한 안에 언제든 명단을 확정합니다. 대회마다 최대 8마리이며, 보유 한도 10마리와 별개입니다.</div>
    {(Object.keys(COMPETITION_NAMES) as Competition[]).filter(comp => entersCompetition(g, comp) !== false || registrationOf(g, comp)).map(comp => {
      const reg = registrationOf(g, comp);
      return <div key={comp} class="small" style={{ marginTop: 6 }}><b>{COMPETITION_NAMES[comp]}</b> · {reg?.withdrawn ? "참가 포기" : reg ? reg.uids.map(u => {
        const m = g.player.squad.find(m => m.uid === u); return m ? koSpecies(m.species) : "떠난 포켓몬";
      }).join(" · ") : "미등록"}</div>;
    })}
  </Win>;
}

/** The season's registration overview: deadline and status per competition, with a button to register each. */
export function RegistrationNotice({ g, onClose, onRegister }: { g: GameState; onClose: () => void; onRegister: (c: Competition) => void }) {
  return <Modal onClose={onClose}>
    <Win title={`시즌 ${g.season} 대회 포켓몬 등록`} right={<button class="btn small" onClick={onClose}>닫기</button>}>
      <p class="small">대회마다 출전할 포켓몬을 최대 8마리 등록합니다. 기한 안에 언제든 등록할 수 있고, 확정한 명단은 바꿀 수 없습니다. 단 리그·지방 컵 명단은 1월 1일~31일에 바꿀 수 있고, 2월 1일로 넘어갈 때 다시 확정합니다. 기한까지 등록하지 않으면 그날 등록 화면이 열립니다.</p>
      {inWinterWindow(g) && <p class="small gold">지금은 1월 명단 변경 기간입니다 (1월 31일까지).</p>}
      <div class="col" style={{ gap: 6, marginTop: 8 }}>
        {(Object.keys(COMPETITION_NAMES) as Competition[]).filter(comp => entersCompetition(g, comp) !== false || registrationOf(g, comp)).map(comp => {
          const reg = registrationOf(g, comp);
          const due = registrationDeadline(g.season, comp);
          const open = !reg && g.day <= due;
          return <div key={comp} class="row" style={{ gap: 8, alignItems: "center" }}>
            <div class="grow small">
              <b>{COMPETITION_NAMES[comp]}</b>{entersCompetition(g, comp) === "maybe" && <span class="tiny muted"> (PWT 플레이오프에서 지면 출전)</span>}
              <div class="tiny muted">등록 기한 {dateLabel(due)} · {reg?.withdrawn ? "참가 포기" : reg ? `등록 완료 (${reg.uids.length}마리)` : g.day > due ? "기한 지남" : "미등록"}</div>
            </div>
            {open && <button class="btn small primary" onClick={() => onRegister(comp)}>등록하기</button>}
            {canChangeRegistration(g, comp) && <button class="btn small primary" onClick={() => onRegister(comp)}>명단 변경</button>}
          </div>;
        })}
      </div>
    </Win>
  </Modal>;
}
