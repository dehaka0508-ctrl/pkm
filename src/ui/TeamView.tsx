import { nickOr, koAbility, koItem, koMove, koSpecies, koNature, dex, koType } from "../data/dex";
import { paradoxNote } from "../game/fresh";
import type { TeamMember } from "../game/types";
import { MonIcon, MonSprite, TypeBadge, Types, TrainerSprite, Win, Modal } from "./components";
import { roleLabel, resolveTeam, teamRating, trainerById, trainerIv } from "../game/lineups";
import { getGame, hasGame } from "./store";
import { teamOf, type GameState } from "../game/state";
import { npcCapacity, npcGate, npcMembers, npcOf, npcRoster, npcSeats } from "../game/npc";
import { groundName, playerSeats } from "../game/finance";
import { nextGoal } from "../game/ai/controller";
import { STATS, STAT_KO } from "../game/types";
import { itemName } from "../game/shop";
import { dateLabel } from "../game/calendar";
import { GoldenMasterBallStar, GoldenMonName } from "./GoldenMonName";

export function TeamList({ team, showMoves = true, compact = false, g, owner = "" }: { team: TeamMember[]; showMoves?: boolean; compact?: boolean; g?: GameState | null; owner?: string }) {
  return (
    <div class="col" style={{ gap: 4 }}>
      {team.map((m, i) => (
        <div key={i} class="row" style={{ gap: 6, alignItems: "flex-start", borderBottom: "1px solid rgba(87,74,110,.4)", paddingBottom: 4 }}>
          <MonIcon species={m.species} scale={compact ? 1 : 1.5} />
          <div class="grow">
            <div class="row" style={{ gap: 6 }}>
              <b><GoldenMonName g={g} owner={owner} uid={m.uid} species={m.species}>{m.nickname || nickOr(m)}</GoldenMonName></b>
              <span class="tiny muted">Lv.{m.level}</span>
              <Types species={m.species} />
              {m.placeholder && <span class="chip ph" title="데이터가 비어 있어 임시로 채운 포켓몬입니다">임시</span>}
              {m.teraType && <span class="chip">테라 <TypeBadge type={m.teraType} /></span>}
            </div>
            {!compact && (
              <div class="tiny muted">
                {koAbility(m.ability)}
                {m.item ? ` · ${koItem(m.item)}` : ""}
                {m.nature ? ` · ${koNature(m.nature)}` : ""}
                {STATS.some(k => m.evs?.[k]) ? ` · 노력치 ${STATS.filter(k => m.evs[k]).map(k => `${STAT_KO[k]} ${m.evs[k]}`).join(" ")}` : ""}
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
  const g = hasGame() ? getGame() : null;
  const team = g ? teamOf(g, id) : resolveTeam(t);
  const isNpc = g && id !== g.player.slotId;
  const n = isNpc ? npcOf(g!, id) : null;
  const next = isNpc ? nextGoal(g!, id) : null;
  const inEntry = isNpc ? new Set(npcMembers(g!, id).map(m => m.key)) : new Set<string>();
  const bench = isNpc ? npcRoster(g!, id).filter(c => !inEntry.has(c.key)) : [];
  return (
    <Modal onClose={onClose}>
      <Win title={`${t.name} · ${roleLabel(t)}`} right={<button class="btn small" onClick={onClose}>닫기</button>}>
        <div class="row" style={{ alignItems: "flex-start" }}>
          <TrainerSprite sprite={t.sprite} scale={2} box={140} />
          <div class="grow col">
            <div class="small">전력 지수 {teamRating(team)}{g?.fresh ? "" : ` · 개체값 전원 ${trainerIv(t)}`} {t.gimmick && !g?.fresh ? `· 기믹 ${({ mega: "메가진화", z: "Z기술", tera: "테라스탈" } as any)[t.gimmick]}` : ""}</div>
            {g && <div class="small">{n
              ? groundName(id, npcSeats(n))
              : groundName(g.player.replaced, playerSeats(g.player.facilities), g.player.facilities.name)}</div>}
            {extra}
          </div>
        </div>
        {n && (
          <div class="col small" style={{ gap: 2, margin: "6px 0" }}>
            <div>
              자금 <b>₽{Math.round(n.money).toLocaleString()}</b> · 명성 {Math.round(n.reputation)} · 팬 {n.fans.toLocaleString()}명 · {npcCapacity(n).toLocaleString()}석 (홈 관중 약 {npcGate(n).attendance.toLocaleString()}명)
            </div>
            <div>스폰서: {n.sponsor && (n.sponsor.fixed || n.sponsor.toSeason >= g!.season) ? `${n.sponsor.name} · 월 ₽${n.sponsor.monthly.toLocaleString()}${n.sponsor.fixed ? " (소속 조직)" : ` · ~${n.sponsor.toSeason}시즌`}` : "없음"}</div>
            {n.legends.length > 0 && <div class="gold">영입: {n.legends.map(({ mon, comp, until }, i) =>
              <span key={mon.uid}>{i > 0 && ", "}<GoldenMonName g={g} owner={id} uid={mon.uid} species={mon.species}>{nickOr(mon)}</GoldenMonName> ({comp} 우승, 시즌 {until}까지)</span>
            )}</div>}
            {bench.length > 0 && <div>대기: {bench.map(({ mon }, i) =>
              <span key={mon.uid}>{i > 0 && ", "}<GoldenMonName g={g} owner={id} uid={mon.uid} species={mon.species}>{nickOr(mon)}</GoldenMonName></span>
            )}</div>}
            {(n.scouts || []).map(sc => (
              <div key={sc.id} class="muted tiny">
                스카우트 파견 중: {sc.type ? `${koType(sc.type)} 타입` : "전력 보강"} · {sc.weeksLeft}주 뒤 보고
              </div>
            ))}
            <div class="muted tiny">
              다음 목표: {next || "모두 갖춤"}
            </div>
            {n.log.length > 0 && <div class="muted tiny">최근: {n.log.slice(0, 4).map(l => `${dateLabel(l.day, false)} ${l.text}`).join(" · ")}</div>}
          </div>
        )}
        {g?.fresh && (() => {
          // 올림박사 / 투로박사 on a fresh start: how far their Paradox Pokémon have come
          const own = id === g.player.slotId ? g.player.squad : n?.lineup ?? [];
          const note = paradoxNote(id, own, team);
          return note ? <div class="small gold">{note}</div> : null;
        })()}
        <TeamList team={team} g={g} owner={id} />
      </Win>
    </Modal>
  );
}

export function MonCard({ m, selected, onClick, children, awardCount = 0 }: { m: { species: string; level: number }; selected?: boolean; onClick?: () => void; children?: any; awardCount?: number }) {
  const s = dex.species.get(m.species);
  return (
    <div class={`card ${selected ? "sel" : ""}`} onClick={onClick}>
      <div class="row" style={{ alignItems: "flex-end", flexWrap: "nowrap" }}>
        <MonSprite species={m.species} scale={1} box={80} />
        <div class="grow col" style={{ gap: 2, minWidth: 0 }}>
          <b>{nickOr(m)}{awardCount > 0 && <> <GoldenMasterBallStar count={awardCount} /></>}</b>
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
