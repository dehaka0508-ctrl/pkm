import { onRelease } from "../../game/fans";
import { condLabel, treatmentCost } from "../../game/clinic";
import { useEffect, useMemo, useState } from "preact/hooks";
import { dex, formParts, josa, koAbility, monName, koMove, koNature, koSpecies, koType, abilityDesc, moveDesc } from "../../data/dex";
import { calcStats } from "../../battle/calc";
import { evolutionOptions } from "../../game/moves";
import { availableMoves, bagCount, equip, isHoldable, itemDesc, itemName, takeItem, useCap, useCapsule, useMint, usePatch, useTera, NATURE_NAMES, TERA_TYPES } from "../../game/shop";
import { getGame } from "../store";
import { evolve, levelProgress, LEVEL_CAP, evText } from "../../game/training";
import type { GameState } from "../../game/state";
import { swapPlaces, type Place } from "../../game/entry";
import { TreatmentPanel } from "../LoanPanel";
import type { OwnedMon } from "../../game/types";
import { STATS, STAT_KO } from "../../game/types";
import { update } from "../store";
import { Bar, CategoryIcon, TypeBadge, ConfirmButton, MonIcon, MonSprite, Modal, Types, TypeFilter, typesOf, Win, useToast } from "../components";
import { SQUAD_MAX } from "../../game/scouting";
import { foodCost } from "../../game/finance";

type MonView = "stats" | "moves" | "items";
/** One party slot, after the handheld games' party screen: icon, name, gender, HP bar, level, HP. */
function PartySlot({ m, n, sel, swapping, onClick }: { m: OwnedMon | null; n?: number; sel?: boolean; swapping?: boolean; onClick: () => void }) {
  if (!m)
    return (
      <div class={`pslot empty ${swapping ? "target" : ""}`} onClick={onClick}>
        {n != null && <span class="pslot-n">{n}</span>}
        <span class="muted small">{n != null ? "비어 있음" : "엔트리에서 빼기"}</span>
      </div>
    );
  const max = calcStats(m).hp;
  const ratio = m.cond ? m.cond.hp : 1;
  const hp = Math.max(m.cond && m.cond.hp > 0 ? 1 : 0, Math.round(max * ratio));
  const evo = evolutionOptions(m.species, m.level).some(e => e.ready);
  // the slot is narrow: regional/other forms show only the species name ("팔데아 켄타로스 (블레이즈종)" → "켄타로스")
  const full = m.nickname || koSpecies(m.species);
  const name = monName(m);
  const len = [...name].length;
  return (
    <div class={`pslot ${sel ? "sel" : ""} ${swapping && !sel ? "target" : ""}`} onClick={onClick}>
      {n != null && <span class="pslot-n">{n}</span>}
      {(evo || m.loanUntil != null || m.placeholder) && (
        <span class="pslot-tags">
          {evo && <span class="pslot-tag" style={{ background: "#2f5c3a" }}>진화</span>}
          {m.loanUntil != null && (
            <span class="pslot-tag" style={{ background: "#5c4a1a", color: "#ffe08a" }} title={`시즌 ${m.loanUntil}이 끝나면 떠납니다`}>
              ~{m.loanUntil}
            </span>
          )}
          {m.placeholder && <span class="pslot-tag" style={{ background: "#6b4a1a" }}>임시</span>}
        </span>
      )}
      <span class="pslot-icon">
        <MonIcon species={m.species} scale={1} />
      </span>
      <div class="pslot-top">
        <b class={`pslot-name ${len > 6 ? "xlong" : len > 4 ? "long" : ""}`} title={full}>
          {name}
        </b>
        {m.gender && <span class="pslot-g" style={{ color: m.gender === "M" ? "#58b0f8" : "#f890a8" }}>{m.gender === "M" ? "♂" : "♀"}</span>}
      </div>
      <div class="pslot-hp">
        <span class="pslot-hplabel">HP</span>
        <span class="pslot-bar">
          <i style={{ width: `${Math.max(0, Math.min(1, ratio)) * 100}%`, background: ratio > 0.5 ? "#58d080" : ratio > 0.2 ? "#f8d030" : "#f05838" }} />
        </span>
      </div>
      <div class="pslot-lv">
        <span>Lv.{m.level}</span>
        <span class="right num">
          {hp}/{max}
        </span>
      </div>
    </div>
  );
}

export function SquadTab({ g }: { g: GameState }) {
  const p = g.player;
  const [menu, setMenu] = useState<{ uid: string; place: Place } | null>(null);
  const [view, setView] = useState<{ uid: string; view: MonView } | null>(null);
  const [swap, setSwap] = useState<{ uid: string; place: Place } | null>(null);
  const [toast, showToast] = useToast();
  const byUid = (u: string) => p.squad.find(m => m.uid === u) || null;
  const entry = p.entry.map(byUid).filter((m): m is OwnedMon => !!m);
  const bench = p.squad.filter(m => !p.entry.includes(m.uid));
  const tap = (place: Place, m: OwnedMon | null) => {
    if (swap) {
      update(st => {
        const err = swapPlaces(st, swap.place, place);
        if (err) showToast(err);
      });
      setSwap(null);
      return;
    }
    if (m) setMenu({ uid: m.uid, place });
    else showToast("대기 포켓몬을 누르고 '순서 바꾸기'를 고른 뒤 이 자리를 누르면 엔트리에 들어갑니다.");
  };
  useEffect(() => {
    if (!swap) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setSwap(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [swap]);
  const cursor = swap?.uid ?? menu?.uid;
  const viewed = view ? byUid(view.uid) : null;
  const menuMon = menu ? byUid(menu.uid) : null;
  return (
    <>
      <Win title={`엔트리 ${entry.length}/6`} right={<span class="tiny muted">경기 전 6마리 공개 후 3마리(지방 컵은 4마리) 출전</span>}>
        <div class="pgrid">
          {Array.from({ length: 6 }, (_, i) => (
            <PartySlot key={i} m={entry[i] || null} n={i + 1} sel={!!entry[i] && cursor === entry[i].uid} swapping={!!swap} onClick={() => tap({ kind: "entry", i }, entry[i] || null)} />
          ))}
        </div>
      </Win>
      <Win title={`대기 ${bench.length} · 스쿼드 ${p.squad.length}/${SQUAD_MAX}`}>
        <div class="pgrid">
          {bench.map(m => (
            <PartySlot key={m.uid} m={m} sel={cursor === m.uid} swapping={!!swap} onClick={() => tap({ kind: "bench", uid: m.uid }, m)} />
          ))}
          {swap && swap.place.kind === "entry" && <PartySlot m={null} swapping onClick={() => tap({ kind: "out" }, null)} />}
          {bench.length === 0 && !swap && <div class="muted small">대기 중인 포켓몬이 없습니다.</div>}
        </div>
      </Win>
      <div class="pmsg">
        <span>{swap ? `${josa(monName(byUid(swap.uid) || { species: "" }), "과와")} 바꿀 자리를 선택해 주십시오` : "포켓몬을 선택해 주십시오"}</span>
        {swap && (
          <button class="btn small right" onClick={() => setSwap(null)}>
            취소
          </button>
        )}
      </div>
      <TreatmentPanel g={g} toast={showToast} />
      {menu && menuMon && (
        <Modal onClose={() => setMenu(null)}>
          <Win title={monName(menuMon)} class="pmenu">
            <div class="col" style={{ gap: 6 }}>
              {(
                [
                  ["능력치 보기", () => setView({ uid: menu.uid, view: "stats" })],
                  ["기술·지닌 물건 변경", () => setView({ uid: menu.uid, view: "moves" })],
                  ["아이템 사용", () => setView({ uid: menu.uid, view: "items" })],
                  ["순서 바꾸기", () => setSwap({ uid: menu.uid, place: menu.place })],
                ] as [string, () => void][]
              ).map(([label, act]) => (
                <button
                  key={label}
                  class="btn"
                  onClick={() => {
                    setMenu(null);
                    act();
                  }}
                >
                  {label}
                </button>
              ))}
              <button class="btn" onClick={() => setMenu(null)}>
                그만두기
              </button>
            </div>
          </Win>
        </Modal>
      )}
      {view && viewed && <MonDetail g={g} m={viewed} view={view.view} onClose={() => setView(null)} toast={showToast} />}
      {toast}
    </>
  );
}

/** The squad menu's three screens: summary (stats), moves + held item, and item use (incl. evolution). */
function MonDetail({ g, m, view, onClose, toast }: { g: GameState; m: OwnedMon; view: MonView; onClose: () => void; toast: (s: string) => void }) {
  const name = monName(m);
  const form = formParts(m.species).form;
  const head = view === "stats" ? `${name} · Lv.${m.level}` : view === "moves" ? `${name} · 기술·지닌 물건` : `${name} · 아이템 사용`;
  // regional forms: "켄타로스 · Lv.52" with "팔데아의 모습/블레이즈종" on the next line
  const title = form ? (
    <>
      {head}
      <div class="small" style={{ color: "var(--muted)", fontWeight: "normal" }}>
        {form}
      </div>
    </>
  ) : (
    head
  );
  return (
    <Modal onClose={onClose} wide={view === "stats"}>
      <Win title={title} right={<button class="btn small" onClick={onClose}>닫기</button>}>
        {view === "stats" && <StatsView g={g} m={m} onClose={onClose} toast={toast} />}
        {view === "moves" && <MovesView g={g} m={m} toast={toast} />}
        {view === "items" && <ItemsView g={g} m={m} toast={toast} />}
      </Win>
    </Modal>
  );
}

/** Updates one squad member; fn returns an error message or null. */
function actOn(uid: string, toast: (s: string) => void) {
  return (fn: (st: GameState, x: OwnedMon) => string | null | void, ok?: string) =>
    update(st => {
      const x = st.player.squad.find(y => y.uid === uid);
      if (!x) return;
      const err = fn(st, x);
      if (err) toast(err);
      else if (ok) toast(ok);
    });
}

function StatsView({ g, m, onClose, toast }: { g: GameState; m: OwnedMon; onClose: () => void; toast: (s: string) => void }) {
  const s = dex.species.get(m.species);
  const stats = calcStats(m);
  return (
    <div class="grid2">
      <div class="col">
        <div class="row" style={{ alignItems: "flex-end" }}>
          <MonSprite species={m.species} scale={2} box={150} />
          <div class="col" style={{ gap: 4 }}>
            <Types species={m.species} />
            <span class="small">
              No.{s.num} · {m.gender === "M" ? "♂" : m.gender === "F" ? "♀" : "성별 없음"}
              {m.shiny ? " · 이로치" : ""}
            </span>
            <span class="small muted">EXP {m.level >= LEVEL_CAP ? "MAX" : `${Math.round(levelProgress(m) * 100)}%`}</span>
            {m.cond && (
              <span class="small bad" title="돈이 모자라 치료하지 못했습니다. 이 상태 그대로 다음 경기에 나섭니다.">
                치료 필요: {condLabel(m)} · 치료비 ₽{treatmentCost(getGame(), m).toLocaleString()}
              </span>
            )}
            <span class="small muted">
              {m.record.played}전 {m.record.wins}승 · KO {m.record.kos}
            </span>
            <span class="small muted">먹이값 주 ₽{foodCost(m).toLocaleString()}</span>
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
            배틀 능력치 (Lv.50 기준) · 개체값 {STATS.map(k => m.ivs[k]).join("/")} · 노력치 {evText(m)}
          </div>
        </div>
      </div>
      <div class="col">
        <div class="small">
          특성 <b>{koAbility(m.ability)}</b>
          {s.abilities.H === m.ability && <span class="tiny muted"> (숨겨진 특성)</span>}
        </div>
        <div class="tiny muted">{abilityDesc(m.ability)}</div>
        <div class="small">
          성격 <b>{koNature(m.nature)}</b> · 테라타입 <b>{koType(m.teraType || s.types[0])}</b>
        </div>
        <div class="small">
          지닌 물건 <b>{m.item ? itemName(m.item) : "없음"}</b>
        </div>
        <b style={{ marginTop: 4 }}>기술</b>
        {m.moves.map((mv, i) => (
          <MoveLine key={i} id={mv} />
        ))}
        <div class="row" style={{ marginTop: 8 }}>
          <span class="right">
            <ConfirmButton
              label="방출"
              confirmLabel="한 번 더 누르면 방출 (되돌릴 수 없음)"
              onConfirm={() => {
                if (g.player.squad.length <= 4) return toast("스쿼드는 최소 4마리가 필요합니다. (지방 컵 더블배틀)");
                update(st => {
                  onRelease(st, m, st.player.squad, koSpecies);
                  st.player.squad = st.player.squad.filter(x => x.uid !== m.uid);
                  st.player.entry = st.player.entry.filter(x => x !== m.uid);
                  delete st.player.plan[m.uid];
                  if (st.player.entry.length < 4) st.player.entry = st.player.squad.slice(0, 6).map(x => x.uid);
                });
                onClose();
              }}
            />
          </span>
        </div>
      </div>
    </div>
  );
}

function MovesView({ g, m, toast }: { g: GameState; m: OwnedMon; toast: (s: string) => void }) {
  const bag = g.player.bag || {};
  const holdable = Object.keys(bag).filter(k => bag[k] > 0 && isHoldable(k));
  const act = actOn(m.uid, toast);
  return (
    <div class="col" style={{ gap: 6 }}>
      <label class="small row" style={{ gap: 6 }}>
        <b>지닌 물건</b>
        <select value={m.item} onChange={e => act((st, x) => equip(st, x, (e.target as HTMLSelectElement).value))}>
          <option value="">없음</option>
          {m.item && <option value={m.item}>{itemName(m.item)}</option>}
          {holdable
            .filter(k => k !== m.item)
            .map(k => (
              <option key={k} value={k}>
                {itemName(k)} (가방 {bag[k]})
              </option>
            ))}
        </select>
      </label>
      {m.item && <div class="tiny muted">{itemDesc(m.item)}</div>}
      <MoveEditor key={m.uid + m.moves.join()} m={m} toast={toast} />
    </div>
  );
}

function ItemsView({ g, m, toast }: { g: GameState; m: OwnedMon; toast: (s: string) => void }) {
  const s = dex.species.get(m.species);
  const bag = g.player.bag || {};
  const mints = NATURE_NAMES.filter(n => bag[`mint:${n}`] > 0 && n !== m.nature);
  const shards = TERA_TYPES.filter(t => bag[`tera:${t}`] > 0);
  const evos = evolutionOptions(m.species, m.level);
  const act = actOn(m.uid, toast);
  const ab = s.abilities;
  return (
    <div class="col" style={{ gap: 8 }}>
      <div class="col" style={{ gap: 4 }}>
        <div class="small">
          특성 <b>{koAbility(m.ability)}</b>
          {ab.H === m.ability && <span class="tiny muted"> (숨겨진 특성)</span>}
        </div>
        <div class="tiny muted">{abilityDesc(m.ability)}</div>
        <div class="row" style={{ gap: 4 }}>
          {ab[1] && (
            <button class="btn small" disabled={!bag.capsule || ab.H === m.ability} onClick={() => act(useCapsule, "특성이 바뀌었다!")}>
              특성캡슐 ({bag.capsule || 0})
            </button>
          )}
          {ab.H && ab.H !== m.ability && (
            <button class="btn small" disabled={!bag.patch} onClick={() => act(usePatch, "숨겨진 특성이 되었다!")}>
              특성패치 → {koAbility(ab.H)} ({bag.patch || 0})
            </button>
          )}
        </div>
      </div>
      <div class="row small" style={{ gap: 4 }}>
        성격 <b>{koNature(m.nature)}</b>
        {mints.length > 0 ? (
          <select value="" onChange={e => act((st, x) => useMint(st, x, (e.target as HTMLSelectElement).value), "성격이 바뀌었다!")}>
            <option value="">민트 사용…</option>
            {mints.map(n => (
              <option key={n} value={n}>
                {koNature(n)} 민트 ({bag[`mint:${n}`]})
              </option>
            ))}
          </select>
        ) : (
          <span class="tiny muted">민트 없음</span>
        )}
      </div>
      <div class="row small" style={{ gap: 4 }}>
        테라타입 <b>{koType(m.teraType || s.types[0])}</b>
        {shards.length > 0 ? (
          <select value="" onChange={e => act((st, x) => useTera(st, x, (e.target as HTMLSelectElement).value), "테라타입이 바뀌었다!")}>
            <option value="">테라피스 사용…</option>
            {shards.map(t => (
              <option key={t} value={t}>
                {koType(t)} ({bag[`tera:${t}`]})
              </option>
            ))}
          </select>
        ) : (
          <span class="tiny muted">테라피스 없음</span>
        )}
      </div>
      <div class="row small" style={{ gap: 4 }}>
        개체값 <span class="num">{STATS.map(k => m.ivs[k]).join("/")}</span>
        {bag["cap:gold"] > 0 && (
          <button class="btn small" onClick={() => act((st, x) => useCap(st, x, "all"), "모든 개체값이 최대가 되었다!")}>
            금색병뚜껑 ({bag["cap:gold"]})
          </button>
        )}
        {bag["cap:silver"] > 0 && (
          <select value="" onChange={e => act((st, x) => useCap(st, x, (e.target as HTMLSelectElement).value as any), "개체값이 최대가 되었다!")}>
            <option value="">은색병뚜껑 ({bag["cap:silver"]})…</option>
            {STATS.filter(k => m.ivs[k] < 31).map(k => (
              <option key={k} value={k}>
                {STAT_KO[k]} ({m.ivs[k]} → 31)
              </option>
            ))}
          </select>
        )}
        {!(bag["cap:gold"] > 0) && !(bag["cap:silver"] > 0) && <span class="tiny muted">병뚜껑 없음</span>}
      </div>
      {evos.length > 0 && (
        <div class="col" style={{ gap: 4 }}>
          <b>진화</b>
          {evos.map(e => (
            <div key={e.id} class="row">
              <MonIcon species={e.id} />
              <span>{koSpecies(e.id)}</span>
              <span class="tiny muted">{e.how}</span>
              {e.item && <span class="tiny">보유 {bagCount(g, e.item) + (m.item === e.item ? 1 : 0)}</span>}
              <button
                class="btn small right"
                disabled={!e.ready || (!!e.item && bagCount(g, e.item) <= 0 && m.item !== e.item)}
                onClick={() =>
                  act((st, x) => {
                    if (e.item) {
                      if (x.item === e.item) x.item = "";
                      else if (!takeItem(st, e.item)) return "진화 도구가 없습니다. 상점에서 사세요.";
                    }
                    evolve(x, e.id);
                    toast(`${koSpecies(e.id)}(으)로 진화했다!`);
                    return null;
                  })
                }
              >
                진화
              </button>
            </div>
          ))}
        </div>
      )}
      <div class="tiny muted">민트·특성캡슐·테라피스·병뚜껑·진화의 돌은 상점에서 삽니다.</div>
    </div>
  );
}

function MoveLine({ id }: { id: string }) {
  const mv = dex.moves.get(id);
  return (
    <div class="row small" style={{ gap: 6 }} title={moveDesc(id)}>
      <CategoryIcon cat={mv.category} />
      <TypeBadge type={mv.type} />
      <span class="grow">{koMove(id)}</span>
      <span class="tiny muted num">
        위력 {mv.basePower || "-"} · 명중 {mv.accuracy === true ? "-" : mv.accuracy}
      </span>
    </div>
  );
}

/** Pick up to 4 moves from what this Pokémon can learn right now; saved with one button. */
function MoveEditor({ m, toast }: { m: OwnedMon; toast: (s: string) => void }) {
  const [q, setQ] = useState("");
  const [moves, setMoves] = useState<string[]>(m.moves.slice());
  const all = useMemo(() => availableMoves(getGame(), m), [m.species, m.level]);
  const via = Object.fromEntries(all.map(x => [x.id, x.via]));
  const [tf, setTf] = useState<string | null>(null);
  const types = useMemo(() => typesOf(all.map(x => dex.moves.get(x.id).type)), [all]);
  const filtered = all
    .map(x => x.id)
    .filter(id => (!q || koMove(id).includes(q) || id.includes(q.toLowerCase())) && (!tf || !types.includes(tf) || dex.moves.get(id).type === tf));
  const toggle = (id: string) => setMoves(ms => (ms.includes(id) ? ms.filter(x => x !== id) : ms.length < 4 ? [...ms, id] : ms));
  const changed = moves.join() !== m.moves.join();
  return (
    <div class="col" style={{ gap: 4 }}>
      <div class="row">
        <b>기술 ({moves.length}/4)</b>
        <span class="right row" style={{ gap: 4 }}>
          {changed && (
            <button class="btn small" onClick={() => setMoves(m.moves.slice())}>
              되돌리기
            </button>
          )}
          <button
            class="btn small primary"
            disabled={!moves.length || !changed}
            onClick={() => {
              update(st => {
                const x = st.player.squad.find(y => y.uid === m.uid);
                if (x) {
                  x.moves = moves;
                  x.autoMoves = false;
                  x.known = [...new Set([...(x.known || []), ...moves])];
                }
              });
              toast("기술을 바꿨습니다.");
            }}
          >
            저장
          </button>
        </span>
      </div>
      <div class="col" style={{ gap: 2 }}>
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
      <div class="tiny muted">현재 레벨까지의 레벨업 기술 · 전에 배운 기술 · 가진 기술머신(상점) 중에서 고릅니다.</div>
      <input type="text" placeholder="기술 검색" value={q} onInput={e => setQ((e.target as HTMLInputElement).value)} style={{ width: "100%" }} />
      <TypeFilter types={types} value={tf} onChange={setTf} />
      <div class="scroll-y col" style={{ gap: 2, maxHeight: 280 }}>
        {filtered.length === 0 && <div class="tiny muted">조건에 맞는 기술이 없습니다.</div>}
        {filtered.map(id => (
          <div key={id} class={`row card ${moves.includes(id) ? "sel" : ""}`} style={{ padding: "2px 6px" }} onClick={() => toggle(id)}>
            <span class="grow">
              <MoveLine id={id} />
            </span>
            <span class="tiny muted">{via[id] === "tm" ? "기술머신" : via[id] === "known" ? "배운 기술" : ""}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
