import { useMemo, useState } from "preact/hooks";
import { dex, koAbility, koMove, koNature, koSpecies, koType, abilityDesc, moveDesc } from "../../data/dex";
import { calcStats } from "../../battle/calc";
import { evolutionOptions } from "../../game/moves";
import { availableMoves, bagCount, equip, isHoldable, itemName, takeItem, useCap, useCapsule, useMint, usePatch, useTera, NATURE_NAMES, TERA_TYPES } from "../../game/shop";
import { getGame } from "../store";
import { evolve, levelProgress, LEVEL_CAP, evText } from "../../game/training";
import type { GameState } from "../../game/state";
import type { OwnedMon } from "../../game/types";
import { STATS, STAT_KO } from "../../game/types";
import { update } from "../store";
import { Bar, CategoryIcon, ConfirmButton, MonIcon, MonSprite, Modal, Types, Win, useToast } from "../components";
import { SQUAD_MAX } from "../../game/scouting";

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
                          {m.loanUntil != null && (
                            <span class="chip" style={{ marginLeft: 4, background: "#5c4a1a", color: "#ffe08a" }} title={`시즌 ${m.loanUntil}이 끝나면 떠납니다`}>
                              ~{m.loanUntil}시즌
                            </span>
                          )}
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
                배틀 능력치 (Lv.50 기준) · 개체값 {STATS.map(k => m.ivs[k]).join("/")} · 노력치 {evText(m)}
              </div>
            </div>
          </div>
          <div class="col">
            <Care g={g} m={m} toast={toast} />
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
                    {e.item && <span class="tiny">보유 {bagCount(g, e.item) + (m.item === e.item ? 1 : 0)}</span>}
                    <button
                      class="btn small right"
                      disabled={!e.ready || (!!e.item && bagCount(g, e.item) <= 0 && m.item !== e.item)}
                      onClick={() =>
                        update(st => {
                          const x = st.player.squad.find(y => y.uid === m.uid);
                          if (!x) return;
                          if (e.item) {
                            if (x.item === e.item) x.item = "";
                            else if (!takeItem(st, e.item)) return toast("진화 도구가 없습니다. 상점에서 사세요.");
                          }
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
              <span class="right">
                <ConfirmButton
                  label="방출"
                  confirmLabel="한 번 더 누르면 방출 (되돌릴 수 없음)"
                  onConfirm={() => {
                    if (g.player.squad.length <= 3) return toast("스쿼드는 최소 3마리가 필요합니다.");
                    update(st => {
                      st.player.squad = st.player.squad.filter(x => x.uid !== m.uid);
                      st.player.entry = st.player.entry.filter(x => x !== m.uid);
                      delete st.player.plan[m.uid];
                      if (st.player.entry.length < 3) st.player.entry = st.player.squad.slice(0, 6).map(x => x.uid);
                    });
                    onClose();
                  }}
                />
              </span>
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
  const all = useMemo(() => availableMoves(getGame(), m), [m.species, m.level]);
  const via = Object.fromEntries(all.map(x => [x.id, x.via]));
  const filtered = all.map(x => x.id).filter(id => !q || koMove(id).includes(q) || id.includes(q.toLowerCase()));
  const toggle = (id: string) => setMoves(ms => (ms.includes(id) ? ms.filter(x => x !== id) : ms.length < 4 ? [...ms, id] : ms));
  return (
    <Modal onClose={onClose}>
      <Win title="기술 편집 (최대 4개)" right={<button class="btn small" onClick={onClose}>취소</button>}>
        <div class="small muted">현재 레벨까지의 레벨업 기술 · 전에 배운 기술 · 가진 기술머신(상점) 중에서 고릅니다.</div>
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
              <span class="tiny muted">{via[id] === "tm" ? "기술머신" : via[id] === "known" ? "배운 기술" : ""}</span>
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
                  x.known = [...new Set([...(x.known || []), ...moves])];
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

function Care({ g, m, toast }: { g: GameState; m: OwnedMon; toast: (s: string) => void }) {
  const s = dex.species.get(m.species);
  const bag = g.player.bag || {};
  const holdable = Object.keys(bag).filter(k => bag[k] > 0 && isHoldable(k));
  const mints = NATURE_NAMES.filter(n => bag[`mint:${n}`] > 0 && n !== m.nature);
  const shards = TERA_TYPES.filter(t => bag[`tera:${t}`] > 0);
  const act = (fn: (st: GameState, x: OwnedMon) => string | null, ok?: string) =>
    update(st => {
      const x = st.player.squad.find(y => y.uid === m.uid);
      if (!x) return;
      const err = fn(st, x);
      if (err) toast(err);
      else if (ok) toast(ok);
    });
  const ab = s.abilities;
  return (
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
      <label class="small">
        도구{" "}
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
      <div class="row small" style={{ gap: 4 }}>
        성격 <b>{koNature(m.nature)}</b>
        {mints.length > 0 && (
          <select value="" onChange={e => act((st, x) => useMint(st, x, (e.target as HTMLSelectElement).value), "성격이 바뀌었다!")}>
            <option value="">민트 사용…</option>
            {mints.map(n => (
              <option key={n} value={n}>
                {koNature(n)} 민트 ({bag[`mint:${n}`]})
              </option>
            ))}
          </select>
        )}
      </div>
      <div class="row small" style={{ gap: 4 }}>
        테라타입 <b>{koType(m.teraType || s.types[0])}</b>
        {shards.length > 0 && (
          <select value="" onChange={e => act((st, x) => useTera(st, x, (e.target as HTMLSelectElement).value), "테라타입이 바뀌었다!")}>
            <option value="">테라피스 사용…</option>
            {shards.map(t => (
              <option key={t} value={t}>
                {koType(t)} ({bag[`tera:${t}`]})
              </option>
            ))}
          </select>
        )}
      </div>
      {(bag["cap:silver"] > 0 || bag["cap:gold"] > 0) && (
        <div class="row small" style={{ gap: 4 }}>
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
        </div>
      )}
      <div class="tiny muted">도구·민트·특성캡슐·테라피스·기술머신은 상점에서 삽니다.</div>
    </div>
  );
}
