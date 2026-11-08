// Custom start: build 4–6 Pokémon (species, level, IVs, nature, ability, moves) and take over a league slot.
import { useMemo, useState } from "preact/hooks";
import { REGIONS, dex, koAbility, koMove, koNature, koSpecies, koSpeciesFull, koType, speciesRegion } from "../data/dex";
import { allLearnableMoves, defaultMoves } from "../game/moves";
import { pickNature } from "../game/natures";
import { createGame, type CustomMon } from "../game/state";
import { STATS, STAT_KO, type StatTable } from "../game/types";
import { calcStats } from "../battle/calc";
import { go, setGame } from "./store";
import { CategoryIcon, TypeBadge, TypeFilter, typesOf, Modal, MonIcon, MonSprite, Types, Win } from "./components";
import { SlotSetup, defaultSlotOf } from "./NewGame";

const MIN = 4; // the regional cup is doubles: four Pokémon take the field
const MAX = 6;

let speciesCache: { id: string; ko: string; gen: number; types: string[] }[] | null = null;
/** Every Pokémon that can be picked (regional forms included; battle-only forms like megas, Arceus types and
 *  Pikachu's look-only forms excluded). */
function speciesList() {
  if (speciesCache) return speciesCache;
  speciesCache = dex.species
    .all()
    .filter(s => s.exists && s.num > 0 && s.num <= 1025 && !s.battleOnly && !["CAP", "LGPE", "Custom", "Future"].includes(s.isNonstandard as string) && !/Gmax|Totem/.test(s.forme) && !(s.baseSpecies === "Arceus" && s.forme) && !(s.baseSpecies === "Pikachu" && s.forme))
    // generation as in PokeRogue's starter screen: regional forms belong to the generation that added them (Hisui = 8)
    .map(s => ({ id: s.id, ko: koSpeciesFull(s.name), gen: /^Hisui/.test(s.forme) ? 8 : REGIONS.find(r => r.id === speciesRegion(s.id))!.gen, types: s.types.slice() }))
    .sort((a, b) => dex.species.get(a.id).num - dex.species.get(b.id).num);
  return speciesCache;
}

const allIvs = (v: number): StatTable => ({ hp: v, atk: v, def: v, spa: v, spd: v, spe: v });

function newMon(speciesId: string, level = 50): CustomMon {
  const s = dex.species.get(speciesId);
  const moves = defaultMoves(s.id, level);
  return { species: s.name, level, ivs: allIvs(31), nature: pickNature(s.id, moves).nature, ability: s.abilities[0], moves };
}

export function CustomStart({ region, setRegion }: { region: string; setRegion: (r: string) => void }) {
  const [slot, setSlot] = useState<string | null>(null);
  const [name, setName] = useState("나");
  const [team, setTeam] = useState<CustomMon[]>([]);
  const [edit, setEdit] = useState<{ i: number; m: CustomMon | null } | null>(null);
  const slotId = slot && slot.startsWith(region + "-") ? slot : defaultSlotOf(region);
  const ready = team.length >= MIN && team.length <= MAX && !!name.trim();
  return (
    <>
      <SlotSetup region={region} setRegion={r => (setRegion(r), setSlot(null))} slotId={slotId} setSlot={setSlot} name={name} setName={setName} />
      <Win title={`4. 포켓몬 (${team.length}/${MAX}, 최소 ${MIN}마리)`} right={<button class="btn small primary" disabled={team.length >= MAX} onClick={() => setEdit({ i: team.length, m: null })}>+ 포켓몬 추가</button>}>
        {team.length === 0 && <div class="muted small">[+ 포켓몬 추가]로 데려갈 포켓몬을 정하세요. 배틀은 레벨과 상관없이 Lv.50 능력치로 치르고, 레벨은 기술 습득과 진화에 쓰입니다.</div>}
        <div class="cards">
          {team.map((m, i) => (
            <div key={i} class="card" onClick={() => setEdit({ i, m })}>
              <div class="row" style={{ gap: 6 }}>
                <MonIcon species={m.species} />
                <div class="grow">
                  <b>{koSpecies(m.species)}</b> <span class="tiny muted">Lv.{m.level}</span>
                  <div class="tiny muted">
                    {koNature(m.nature)} · {koAbility(m.ability)} · 개체값 {STATS.map(k => m.ivs[k]).join("/")}
                  </div>
                </div>
                <button
                  class="btn small"
                  onClick={e => {
                    e.stopPropagation();
                    setTeam(t => t.filter((_, j) => j !== i));
                  }}
                >
                  빼기
                </button>
              </div>
              <div class="tiny">{m.moves.map(koMove).join(" / ")}</div>
            </div>
          ))}
        </div>
      </Win>
      <div class="row">
        <button
          class="btn primary big"
          disabled={!ready}
          onClick={() => {
            setGame(createGame({ mode: "custom", slotId, name: name.trim(), sprite: "player_m", customTeam: team }));
            go({ name: "hub" });
          }}
        >
          이 {team.length}마리로 시작
        </button>
        {!ready && <span class="small muted">포켓몬을 {MIN}~{MAX}마리 정하고 이름을 입력하세요.</span>}
      </div>
      {edit && (
        <MonEditor
          init={edit.m}
          onClose={() => setEdit(null)}
          onSave={m => {
            setTeam(t => {
              const next = t.slice();
              next[edit.i] = m;
              return next;
            });
            setEdit(null);
          }}
        />
      )}
    </>
  );
}

function MonEditor({ init, onClose, onSave }: { init: CustomMon | null; onClose: () => void; onSave: (m: CustomMon) => void }) {
  const [m, setM] = useState<CustomMon | null>(init);
  const [q, setQ] = useState("");
  const [mq, setMq] = useState("");
  const [gen, setGen] = useState(0);
  const [type, setType] = useState("");
  const list = speciesList();
  const filtering = !!q || !!gen || !!type;
  const found = filtering
    ? list.filter(x => (!q || x.ko.includes(q) || x.id.includes(q.toLowerCase())) && (!gen || x.gen === gen) && (!type || x.types.includes(type))).slice(0, 150)
    : [];
  const moves = useMemo(() => (m ? allLearnableMoves(m.species) : []), [m?.species]);
  const set = (patch: Partial<CustomMon>) => setM(x => (x ? { ...x, ...patch } : x));
  const s = m ? dex.species.get(m.species) : null;
  const abilities = s ? ([s.abilities[0], s.abilities[1], s.abilities.H].filter(Boolean) as string[]) : [];
  const stats = m ? calcStats({ ...m, item: "", gender: "", evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 } } as any) : null;
  const toggleMove = (id: string) => m && set({ moves: m.moves.includes(id) ? m.moves.filter(x => x !== id) : m.moves.length < 4 ? [...m.moves, id] : m.moves });
  const [mt, setMt] = useState<string | null>(null);
  const mTypes = useMemo(() => typesOf(moves.map(id => dex.moves.get(id).type)), [moves]);
  const mFound = moves.filter(id => (!mq || koMove(id).includes(mq) || id.includes(mq.toLowerCase())) && (!mt || !mTypes.includes(mt) || dex.moves.get(id).type === mt)).slice(0, 120);
  return (
    <Modal onClose={onClose} wide>
      <Win title={m ? `${koSpecies(m.species)} 설정` : "포켓몬 고르기"} right={<button class="btn small" onClick={onClose}>취소</button>}>
        <div class="col">
          <div class="row">
            <input type="text" placeholder="포켓몬 이름으로 검색 (예: 리자몽, 알로라)" value={q} onInput={e => setQ((e.target as HTMLInputElement).value)} style={{ flex: 1, minWidth: 200 }} />
          </div>
          <div class="row" style={{ gap: 4 }}>
            <select value={gen} onChange={e => setGen(Number((e.target as HTMLSelectElement).value))}>
              <option value={0}>세대: 전체</option>
              {REGIONS.filter(r => r.id !== "legend").map(r => (
                <option key={r.gen} value={r.gen}>
                  {r.gen}세대 ({r.name})
                </option>
              ))}
            </select>
            <select value={type} onChange={e => setType((e.target as HTMLSelectElement).value)}>
              <option value="">타입: 전체</option>
              {dex.types
                .all()
                .filter(t => t.name !== "Stellar" && t.name !== "???")
                .map(t => (
                  <option key={t.name} value={t.name}>
                    {koType(t.name)}
                  </option>
                ))}
            </select>
            {filtering && <span class="tiny muted">{found.length >= 150 ? "150마리 이상 (검색어로 좁혀 보세요)" : `${found.length}마리`}</span>}
          </div>
          {found.length > 0 && (
            <div class="scroll-y" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 4, maxHeight: 200 }}>
              {found.map(x => (
                <button
                  key={x.id}
                  class={`btn small ${m && dex.species.get(m.species).id === x.id ? "sel" : ""}`}
                  style={{ display: "flex", alignItems: "center", gap: 2, minWidth: 0, padding: "2px 4px", justifyContent: "flex-start" }}
                  title={x.ko}
                  onClick={() => {
                    setM(newMon(x.id, m?.level ?? 50));
                  }}
                >
                  <MonIcon species={x.id} scale={0.8} />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{x.ko}</span>
                </button>
              ))}
            </div>
          )}
          {m && s && stats && (
            <div class="grid2">
              <div class="col">
                <div class="row" style={{ alignItems: "flex-end" }}>
                  <MonSprite species={m.species} scale={1.5} box={110} />
                  <div class="col" style={{ gap: 4 }}>
                    <Types species={m.species} />
                    <label class="small">
                      레벨{" "}
                      <input type="number" min={1} max={100} value={m.level} style={{ width: 64 }} onInput={e => set({ level: Math.max(1, Math.min(100, Number((e.target as HTMLInputElement).value) || 1)) })} />
                    </label>
                    <label class="small">
                      성격{" "}
                      <select value={m.nature} onChange={e => set({ nature: (e.target as HTMLSelectElement).value })}>
                        {dex.natures.all().map(n => (
                          <option key={n.name} value={n.name}>
                            {koNature(n.name)}
                            {n.plus ? ` (+${STAT_KO[n.plus as keyof typeof STAT_KO]} −${STAT_KO[n.minus as keyof typeof STAT_KO]})` : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label class="small">
                      특성{" "}
                      <select value={m.ability} onChange={e => set({ ability: (e.target as HTMLSelectElement).value })}>
                        {abilities.map(a => (
                          <option key={a} value={a}>
                            {koAbility(a)}
                            {a === s.abilities.H ? " (숨겨진 특성)" : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>
                <div class="row small" style={{ gap: 4 }}>
                  <b>개체값</b>
                  <button class="btn small" onClick={() => set({ ivs: allIvs(31) })}>
                    전부 31
                  </button>
                  <button class="btn small" onClick={() => set({ ivs: allIvs(0) })}>
                    전부 0
                  </button>
                </div>
                {STATS.map(k => (
                  <div key={k} class="row small" style={{ gap: 6 }}>
                    <span style={{ width: 44 }} class="muted">
                      {STAT_KO[k]}
                    </span>
                    <input type="range" min={0} max={31} value={m.ivs[k]} onInput={e => set({ ivs: { ...m.ivs, [k]: Number((e.target as HTMLInputElement).value) } })} style={{ flex: 1 }} />
                    <input type="number" min={0} max={31} value={m.ivs[k]} style={{ width: 52 }} onInput={e => set({ ivs: { ...m.ivs, [k]: Math.max(0, Math.min(31, Number((e.target as HTMLInputElement).value) || 0)) } })} />
                    <span class="num tiny" style={{ width: 34, textAlign: "right" }}>
                      {stats[k]}
                    </span>
                  </div>
                ))}
                <div class="tiny muted">오른쪽 숫자는 배틀 능력치 (Lv.50, 노력치 0)</div>
              </div>
              <div class="col">
                <b class="small">기술 ({m.moves.length}/4)</b>
                {m.moves.map(id => (
                  <div key={id} class="row small" style={{ gap: 6 }}>
                    <CategoryIcon cat={dex.moves.get(id).category} />
                    <TypeBadge type={dex.moves.get(id).type} />
                    <span class="grow">{koMove(id)}</span>
                    <button class="btn small" onClick={() => toggleMove(id)}>
                      빼기
                    </button>
                  </div>
                ))}
                <input type="text" placeholder="배울 수 있는 기술 검색" value={mq} onInput={e => setMq((e.target as HTMLInputElement).value)} />
                <TypeFilter types={mTypes} value={mt} onChange={setMt} />
                <div class="col scroll-y" style={{ gap: 2, maxHeight: 260 }}>
                  {mFound.map(id => {
                    const mv = dex.moves.get(id);
                    return (
                      <div key={id} class={`row card ${m.moves.includes(id) ? "sel" : ""}`} style={{ padding: "2px 6px", gap: 6 }} onClick={() => toggleMove(id)}>
                        <CategoryIcon cat={mv.category} />
                        <TypeBadge type={mv.type} />
                        <span class="grow small">{koMove(id)}</span>
                        <span class="tiny muted">위력 {mv.basePower || "-"}</span>
                      </div>
                    );
                  })}
                </div>
                <div class="tiny muted">레벨업·기술머신·가르침·교배기를 모두 고를 수 있습니다. 고른 기술은 나중에도 다시 쓸 수 있습니다.</div>
              </div>
            </div>
          )}
          <div class="row">
            <button class="btn primary" disabled={!m || m.moves.length === 0} onClick={() => m && onSave(m)}>
              저장
            </button>
            {m && m.moves.length === 0 && <span class="small muted">기술을 1개 이상 고르세요.</span>}
          </div>
        </div>
      </Win>
    </Modal>
  );
}
