import { useMemo, useState } from "preact/hooks";
import { dex, koAbility, koItem, koMove, koNature, koSpecies, koType, abilityDesc, moveDesc } from "../../data/dex";
import { calcStats } from "../../battle/calc";
import { learnableMoves, evolutionOptions } from "../../game/moves";
import { evolve, levelProgress, LEVEL_CAP, evText } from "../../game/training";
import type { GameState } from "../../game/state";
import type { OwnedMon } from "../../game/types";
import { STATS, STAT_KO } from "../../game/types";
import { update } from "../store";
import { Bar, CategoryIcon, MonIcon, MonSprite, Modal, Types, Win, useToast } from "../components";
import { SQUAD_MAX } from "../../game/scouting";

const HELD_ITEMS = [
  "", "Leftovers", "Life Orb", "Choice Band", "Choice Specs", "Choice Scarf", "Focus Sash", "Assault Vest", "Rocky Helmet",
  "Sitrus Berry", "Lum Berry", "Expert Belt", "Light Clay", "Weakness Policy", "Air Balloon", "Heavy-Duty Boots",
  "Black Sludge", "Eviolite", "Quick Claw", "Scope Lens", "King's Rock", "Wide Lens", "Shell Bell", "Light Ball",
  "Toxic Orb", "Flame Orb", "Muscle Band", "Wise Glasses", "Bright Powder", "Mental Herb", "White Herb", "Power Herb",
  "Charcoal", "Mystic Water", "Magnet", "Miracle Seed", "Never-Melt Ice", "Black Belt", "Poison Barb", "Soft Sand",
  "Sharp Beak", "Twisted Spoon", "Silver Powder", "Hard Stone", "Spell Tag", "Dragon Fang", "Black Glasses", "Metal Coat",
  "Silk Scarf", "Fairy Feather",
];

export function SquadTab({ g }: { g: GameState }) {
  const p = g.player;
  const [sel, setSel] = useState<string | null>(null);
  const [toast, showToast] = useToast();
  const mon = p.squad.find(m => m.uid === sel);
  const toggleEntry = (uid: string) =>
    update(st => {
      const e = st.player.entry;
      if (e.includes(uid)) {
        if (e.length <= Math.min(3, st.player.squad.length)) return showToast("엔트리는 최소 3마리입니다.");
        st.player.entry = e.filter(x => x !== uid);
      } else {
        if (e.length >= 6) return showToast("엔트리는 최대 6마리입니다.");
        e.push(uid);
      }
    });
  const move = (uid: string, d: number) =>
    update(st => {
      const e = st.player.entry;
      const i = e.indexOf(uid);
      const j = i + d;
      if (i < 0 || j < 0 || j >= e.length) return;
      [e[i], e[j]] = [e[j], e[i]];
    });
  return (
    <>
      <Win title={`스쿼드 ${p.squad.length}/${SQUAD_MAX}`} right={<span class="tiny muted">엔트리 {p.entry.length}/6 · 경기 전 6마리 공개 후 3마리 출전</span>}>
        <div class="tbl-wrap">
          <table class="tbl">
            <thead>
              <tr>
                <th>엔트리</th>
                <th>포켓몬</th>
                <th class="hide-sm">타입</th>
                <th>Lv</th>
                <th class="hide-sm">기술</th>
                <th class="n hide-sm">전적</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {p.squad.map(m => {
                const ei = p.entry.indexOf(m.uid);
                return (
                  <tr key={m.uid} class="click" onClick={() => setSel(m.uid)}>
                    <td onClick={e => e.stopPropagation()}>
                      <div class="row" style={{ gap: 2 }}>
                        <button class={`btn small ${ei >= 0 ? "sel" : ""}`} onClick={() => toggleEntry(m.uid)}>
                          {ei >= 0 ? `${ei + 1}번` : "제외"}
                        </button>
                        {ei >= 0 && (
                          <>
                            <button class="btn small" onClick={() => move(m.uid, -1)}>▲</button>
                            <button class="btn small" onClick={() => move(m.uid, 1)}>▼</button>
                          </>
                        )}
                      </div>
                    </td>
                    <td>
                      <div class="row" style={{ gap: 4 }}>
                        <MonIcon species={m.species} />
                        <div>
                          <b>{m.nickname || koSpecies(m.species)}</b>
                          {m.placeholder && <span class="chip ph" style={{ marginLeft: 4 }}>임시</span>}
                          <div style={{ width: 90 }}>
                            <Bar v={levelProgress(m)} cls="exp" />
                          </div>
                        </div>
                      </div>
                    </td>
                    <td class="hide-sm">
                      <Types species={m.species} />
                    </td>
                    <td class="num">{m.level}</td>
                    <td class="small hide-sm">{m.moves.map(koMove).join(" / ")}</td>
                    <td class="n small hide-sm">
                      {m.record.played}전 {m.record.wins}승 · KO {m.record.kos}
                    </td>
                    <td>
                      {evolutionOptions(m.species, m.level).some(e => e.ready) && <span class="chip" style={{ background: "#2f5c3a" }}>진화 가능</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Win>
      {mon && <MonDetail g={g} m={mon} onClose={() => setSel(null)} toast={showToast} />}
      {toast}
    </>
  );
}

function MonDetail({ g, m, onClose, toast }: { g: GameState; m: OwnedMon; onClose: () => void; toast: (s: string) => void }) {
  const [editMoves, setEditMoves] = useState(false);
  const s = dex.species.get(m.species);
  const stats = calcStats(m);
  const evos = evolutionOptions(m.species, m.level);
  const abilities = [...new Set(Object.values(s.abilities) as string[])];
  const allTypes = dex.types.all().filter(t => t.name !== "Stellar").map(t => t.name);
  const set = (fn: (x: OwnedMon) => void) => update(st => {
    const x = st.player.squad.find(y => y.uid === m.uid);
    if (x) fn(x);
  });
  return (
    <Modal onClose={onClose} wide>
      <Win title={`${koSpecies(m.species)} · Lv.${m.level}`} right={<button class="btn small" onClick={onClose}>닫기</button>}>
        <div class="grid2">
          <div class="col">
            <div class="row" style={{ alignItems: "flex-end" }}>
              <MonSprite species={m.species} scale={2} box={150} />
              <div class="col" style={{ gap: 4 }}>
                <Types species={m.species} />
                <span class="small">No.{s.num} · {m.gender === "M" ? "♂" : m.gender === "F" ? "♀" : "성별 없음"}{m.shiny ? " · 이로치" : ""}</span>
                <span class="small muted">EXP {m.level >= LEVEL_CAP ? "MAX" : `${Math.round(levelProgress(m) * 100)}%`}</span>
                <span class="small muted">
                  {m.record.played}전 {m.record.wins}승 · KO {m.record.kos}
                </span>
              </div>
            </div>
            <div class="col" style={{ gap: 2 }}>
              {STATS.map(k => (
                <div key={k} class="statbar">
                  <span class="muted">{STAT_KO[k]}</span>
                  <span class="num">{stats[k]}</span>
                  <Bar v={stats[k] / (k === "hp" ? 260 : 220)} />
                </div>
              ))}
              <div class="tiny muted">
                개체값 {STATS.map(k => m.ivs[k]).join("/")} · 노력치 {evText(m)}
              </div>
            </div>
          </div>
          <div class="col">
            <label class="small">
              특성{" "}
              <select value={m.ability} onChange={e => set(x => (x.ability = (e.target as HTMLSelectElement).value))}>
                {abilities.map(a => (
                  <option key={a} value={a}>
                    {koAbility(a)}
                  </option>
                ))}
              </select>
            </label>
            <div class="tiny muted">{abilityDesc(m.ability)}</div>
            <label class="small">
              도구{" "}
              <select value={m.item} onChange={e => set(x => (x.item = (e.target as HTMLSelectElement).value))}>
                {(HELD_ITEMS.includes(m.item) ? HELD_ITEMS : [m.item, ...HELD_ITEMS]).map(it => (
                  <option key={it} value={it}>
                    {it ? koItem(it) : "없음"}
                  </option>
                ))}
              </select>
            </label>
            <div class="small">성격: {koNature(m.nature)}</div>
            <label class="small">
              테라타입{" "}
              <select value={m.teraType || ""} onChange={e => set(x => (x.teraType = (e.target as HTMLSelectElement).value || null))}>
                <option value="">기본 ({koType(s.types[0])})</option>
                {allTypes.map(t => (
                  <option key={t} value={t}>
                    {koType(t)}
                  </option>
                ))}
              </select>
            </label>
            <div class="row">
              <b>기술</b>
              <button class="btn small right" onClick={() => setEditMoves(true)}>
                기술 편집
              </button>
            </div>
            {m.moves.map((mv, i) => (
              <MoveLine key={i} id={mv} />
            ))}
            {evos.length > 0 && (
              <div class="col" style={{ gap: 4 }}>
                <b>진화</b>
                {evos.map(e => (
                  <div key={e.id} class="row">
                    <MonIcon species={e.id} />
                    <span>{koSpecies(e.id)}</span>
                    <span class="tiny muted">{e.how}</span>
                    <button
                      class="btn small right"
                      disabled={!e.ready}
                      onClick={() =>
                        set(x => {
                          evolve(x, e.id);
                          toast(`${koSpecies(e.id)}(으)로 진화했다!`);
                        })
                      }
                    >
                      진화
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div class="row" style={{ marginTop: 8 }}>
              <button
                class="btn danger small right"
                onClick={() => {
                  if (g.player.squad.length <= 3) return toast("스쿼드는 최소 3마리가 필요합니다.");
                  if (!confirm(`${koSpecies(m.species)}을(를) 방출할까요? 되돌릴 수 없습니다.`)) return;
                  update(st => {
                    st.player.squad = st.player.squad.filter(x => x.uid !== m.uid);
                    st.player.entry = st.player.entry.filter(x => x !== m.uid);
                    delete st.player.plan[m.uid];
                    if (st.player.entry.length < 3) st.player.entry = st.player.squad.slice(0, 6).map(x => x.uid);
                  });
                  onClose();
                }}
              >
                방출
              </button>
            </div>
          </div>
        </div>
      </Win>
      {editMoves && <MoveEditor m={m} onClose={() => setEditMoves(false)} />}
    </Modal>
  );
}

function MoveLine({ id }: { id: string }) {
  const mv = dex.moves.get(id);
  return (
    <div class="row small" style={{ gap: 6 }} title={moveDesc(id)}>
      <CategoryIcon cat={mv.category} />
      <span class="chip" style={{ minWidth: 40, textAlign: "center" }}>{koType(mv.type)}</span>
      <span class="grow">{koMove(id)}</span>
      <span class="tiny muted num">
        위력 {mv.basePower || "-"} · 명중 {mv.accuracy === true ? "-" : mv.accuracy}
      </span>
    </div>
  );
}

function MoveEditor({ m, onClose }: { m: OwnedMon; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [moves, setMoves] = useState<string[]>(m.moves.slice());
  const all = useMemo(() => learnableMoves(m.species, m.level), [m.species, m.level]);
  const filtered = all.filter(id => !q || koMove(id).includes(q) || id.includes(q.toLowerCase()));
  const toggle = (id: string) => setMoves(ms => (ms.includes(id) ? ms.filter(x => x !== id) : ms.length < 4 ? [...ms, id] : ms));
  return (
    <Modal onClose={onClose}>
      <Win title="기술 편집 (최대 4개)" right={<button class="btn small" onClick={onClose}>취소</button>}>
        <div class="small muted">배울 수 있는 기술: 현재 레벨까지의 레벨업 기술 + 기술머신·가르침 기술</div>
        <div class="col" style={{ gap: 2, margin: "6px 0" }}>
          {moves.map(id => (
            <div key={id} class="row">
              <span class="grow">
                <MoveLine id={id} />
              </span>
              <button class="btn small" onClick={() => toggle(id)}>
                빼기
              </button>
            </div>
          ))}
        </div>
        <input type="text" placeholder="기술 검색" value={q} onInput={e => setQ((e.target as HTMLInputElement).value)} style={{ width: "100%" }} />
        <div class="scroll-y col" style={{ gap: 2, marginTop: 6, maxHeight: 300 }}>
          {filtered.map(id => (
            <div key={id} class={`row card ${moves.includes(id) ? "sel" : ""}`} style={{ padding: "2px 6px" }} onClick={() => toggle(id)}>
              <span class="grow">
                <MoveLine id={id} />
              </span>
            </div>
          ))}
        </div>
        <div class="row" style={{ marginTop: 8 }}>
          <button
            class="btn primary"
            disabled={!moves.length}
            onClick={() => {
              update(st => {
                const x = st.player.squad.find(y => y.uid === m.uid);
                if (x) {
                  x.moves = moves;
                  x.autoMoves = false;
                }
              });
              onClose();
            }}
          >
            저장
          </button>
        </div>
      </Win>
    </Modal>
  );
}
