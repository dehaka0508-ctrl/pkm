import { koAbility, koItem, koMove, koSpecies, koNature, dex, koType } from "../data/dex";
import type { TeamMember } from "../game/types";
import { MonIcon, MonSprite, Types, TrainerSprite, Win, Modal } from "./components";
import { resolveTeam, teamRating, trainerById } from "../game/lineups";

export function TeamList({ team, showMoves = true, compact = false }: { team: TeamMember[]; showMoves?: boolean; compact?: boolean }) {
  return (
    <div class="col" style={{ gap: 4 }}>
      {team.map((m, i) => (
        <div key={i} class="row" style={{ gap: 6, alignItems: "flex-start", borderBottom: "1px solid rgba(87,74,110,.4)", paddingBottom: 4 }}>
          <MonIcon species={m.species} scale={compact ? 1 : 1.5} />
          <div class="grow">
            <div class="row" style={{ gap: 6 }}>
              <b>{m.nickname || koSpecies(m.species)}</b>
              <span class="tiny muted">Lv.{m.level}</span>
              <Types species={m.species} />
              {m.placeholder && <span class="chip ph" title="데이터가 비어 있어 임시로 채운 포켓몬입니다">임시</span>}
              {!m.placeholder && m.autoMoves && <span class="chip auto" title="기술 데이터가 비어 있어 자동으로 고른 기술입니다">자동 기술</span>}
              {m.teraType && <span class="chip">테라 {koType(m.teraType)}</span>}
            </div>
            {!compact && (
              <div class="tiny muted">
                {koAbility(m.ability)}
                {m.item ? ` · ${koItem(m.item)}` : ""}
                {m.nature ? ` · ${koNature(m.nature)}` : ""}
              </div>
            )}
            {showMoves && <div class="small">{m.moves.map(x => koMove(x)).join(" / ")}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

export function TrainerModal({ id, onClose, extra }: { id: string; onClose: () => void; extra?: any }) {
  const t = trainerById(id);
  if (!t) return null;
  const team = resolveTeam(t);
  return (
    <Modal onClose={onClose}>
      <Win title={`${t.name} · ${t.role}`} right={<button class="btn small" onClick={onClose}>닫기</button>}>
        <div class="row" style={{ alignItems: "flex-start" }}>
          <TrainerSprite sprite={t.sprite} scale={2} box={140} />
          <div class="grow col">
            <div class="small muted">출처: {t.source || "미입력"}</div>
            <div class="small">전력 지수 {teamRating(team)} {t.gimmick ? `· 기믹 ${({ mega: "메가진화", z: "Z기술", tera: "테라스탈" } as any)[t.gimmick]}` : ""}</div>
            {extra}
          </div>
        </div>
        <TeamList team={team} />
      </Win>
    </Modal>
  );
}

export function MonCard({ m, selected, onClick, children }: { m: { species: string; level: number }; selected?: boolean; onClick?: () => void; children?: any }) {
  const s = dex.species.get(m.species);
  return (
    <div class={`card ${selected ? "sel" : ""}`} onClick={onClick}>
      <div class="row" style={{ alignItems: "flex-end" }}>
        <MonSprite species={m.species} scale={1} box={80} />
        <div class="grow col" style={{ gap: 2 }}>
          <b>{koSpecies(m.species)}</b>
          <span class="tiny muted">
            Lv.{m.level} · No.{s.num}
          </span>
          <Types species={m.species} />
        </div>
      </div>
      {children}
    </div>
  );
}
