// PokeRogue-style command / fight menus, laid out in the game's 320×180 coordinate space
// (the same numbers as PokeRogue's command-ui-handler and fight-ui-handler) and scaled to the canvas.
import { useEffect, useRef, useState } from "preact/hooks";
import type { ComponentChildren } from "preact";
import { dex, koMove, koType } from "../data/dex";
import { CategoryIcon, MonIcon, TypeBadge } from "./components";

/**
 * Layout unit: the layer is drawn at 4× (1280×720) and scaled down, so text is never tiny —
 * browsers with a minimum font size would otherwise enlarge 7–11px text and push it out of place.
 */
const U = 4;

/** Fills the battle canvas with a 320×180-unit layer that scales with it. */
export function PrLayer({ children }: { children: ComponentChildren }) {
  const ref = useRef<HTMLDivElement>(null);
  const [k, setK] = useState(4);
  useEffect(() => {
    const el = ref.current?.parentElement;
    if (!el) return;
    const ro = new ResizeObserver(() => setK(el.clientWidth / 320));
    ro.observe(el);
    setK(el.clientWidth / 320);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={ref} class="pr-layer" style={{ width: 320 * U, height: 180 * U, transform: `scale(${k / U})` }}>
      {children}
    </div>
  );
}

/** PokeRogue window (9-slice of window_1.png), positioned from the bottom-left like PokeRogue's UI container. */
function PrWindow({ x, w, h = 48, children }: { x: number; w: number; h?: number; children?: ComponentChildren }) {
  return (
    <div class="pr-window" style={{ left: x * U, bottom: 0, width: w * U, height: h * U, borderWidth: 8 * U, borderImage: "url(./assets/ui/window_1.png) 8 fill stretch" }}>
      {children}
    </div>
  );
}

/** Text at PokeRogue UI coordinates (y is negative = up from the bottom edge). */
function At({ x, y, children, right, style }: { x: number; y: number; children: ComponentChildren; right?: boolean; style?: any }) {
  return (
    <div class="pr-at" style={{ left: right ? undefined : x * U, right: right ? (320 - x) * U : undefined, top: (180 + y) * U, ...style }}>
      {children}
    </div>
  );
}

/** Type badge sized in layer units (the atlas frame is 32×14). */
function TypeIcon({ type, scale }: { type: string; scale: number }) {
  return (
    <span style={{ display: "inline-block", width: 32 * scale * U, height: 14 * scale * U, overflow: "visible" }}>
      <span style={{ display: "inline-block", transform: `scale(${scale})`, transformOrigin: "0 0" }}>
        <TypeBadge type={type} />
      </span>
    </span>
  );
}

const curPos = (left: number, top: number) => ({ left: left * U, top: top * U, width: 6 * U, height: 10 * U });

export interface CommandItem {
  label: string;
  disabled?: boolean;
  on?: boolean;
  act: () => void;
}

function useKeys(n: number, cursor: number, setCursor: (i: number) => void, ok: () => void, back?: () => void) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const k = e.key;
      let c = cursor;
      if (k === "ArrowLeft" && c % 2 === 1) c--;
      else if (k === "ArrowRight" && c % 2 === 0 && c + 1 < n) c++;
      else if (k === "ArrowUp" && c >= 2) c -= 2;
      else if (k === "ArrowDown" && c + 2 < n) c += 2;
      else if (k === "Enter" || k === "z" || k === "Z" || k === " ") {
        e.preventDefault();
        ok();
        return;
      } else if ((k === "Escape" || k === "x" || k === "X" || k === "Backspace") && back) {
        back();
        return;
      } else return;
      e.preventDefault();
      setCursor(c);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [n, cursor, ok, back]);
}

/** "싸운다 / 포켓몬 / …" window on the right of the message box. */
export function CommandMenu({ items }: { items: CommandItem[] }) {
  const [cursor, setCursor] = useState(0);
  const pick = (i: number) => {
    const it = items[i];
    if (it && !it.disabled) it.act();
  };
  useKeys(items.length, cursor, setCursor, () => pick(cursor));
  return (
    <>
      <PrWindow x={202} w={118} />
      {items.map((it, i) => (
        <At key={i} x={217 + (i % 2 ? 55.8 : 0)} y={-38.7 + (i >= 2 ? 16 : 0)}>
          <span
            class={`pr-text pr-click ${it.disabled ? "pr-disabled" : ""} ${it.on ? "pr-on" : ""}`}
            onMouseEnter={() => setCursor(i)}
            onClick={() => pick(i)}
          >
            {it.label}
          </span>
        </At>
      ))}
      <img class="pr-cursor" src="./assets/ui/cursor.png" style={curPos(217 - 5 - 3 + (cursor % 2 ? 56 : 0), 180 - 38.7 + 8 - 5 + (cursor >= 2 ? 16 : 0))} alt="" />
    </>
  );
}

export interface MoveSlot {
  id: string;
  pp: number;
  maxpp: number;
  disabled?: boolean;
}

/** Classic (Gen 4) type colours for the move buttons. */
const TYPE_COLOR: Record<string, string> = {
  Normal: "#A8A878", Fire: "#F08030", Water: "#6890F0", Electric: "#F8D030", Grass: "#78C850", Ice: "#98D8D8",
  Fighting: "#C03028", Poison: "#A040A0", Ground: "#E0C068", Flying: "#A890F0", Psychic: "#F85888", Bug: "#A8B820",
  Rock: "#B8A038", Ghost: "#705898", Dragon: "#7038F8", Dark: "#705848", Steel: "#B8B8D0", Fairy: "#EE99AC", Stellar: "#40B5A5",
};
function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(k < 0 ? c * (1 + k) : c + (255 - c) * k)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

const OFFENSE_COLOR: Record<number, string | undefined> = { 0: "#929292", 0.25: "#FF7400", 0.5: "#FE8E00", 2: "#4AA500", 4: "#4BB400" };

function multiplier(type: string, foe: string | null): number {
  if (!foe) return 1;
  const s = dex.species.get(foe);
  if (!s.exists) return 1;
  if (!dex.getImmunity(type, s.types)) return 0;
  return Math.pow(2, dex.getEffectiveness(type, s.types));
}

function ppColor(pp: number, max: number): string {
  const r = max ? pp / max : 1;
  if (r <= 0) return "#e13d3d";
  if (r <= 0.25) return "#d64b00";
  if (r <= 0.5) return "#ccbe00";
  return "#f8f8f8";
}

/** Move list (2×2) and the move-info window, like PokeRogue's fight UI. */
export function FightMenu({ moves, foe, onPick, onBack, zMoves }: { moves: MoveSlot[]; foe: string | null; onPick: (i: number) => void; onBack: () => void; zMoves?: (string | null)[] }) {
  const [cursor, setCursor] = useState(0);
  const pick = (i: number) => {
    const m = moves[i];
    if (m && !m.disabled && m.pp > 0) onPick(i);
  };
  useKeys(moves.length, cursor, setCursor, () => pick(cursor), onBack);
  const cur = moves[cursor];
  const mv = cur ? dex.moves.get(cur.id) : null;
  return (
    <>
      <PrWindow x={0} w={243} />
      <PrWindow x={240} w={80} />
      {moves.map((m, i) => {
        const d = dex.moves.get(m.id);
        const mult = d.category === "Status" ? 1 : multiplier(d.type, foe);
        const out = m.disabled || m.pp <= 0;
        const z = zMoves?.[i];
        const bg = TYPE_COLOR[d.type] || "#888";
        const eff = d.category === "Status" || !foe ? "" : mult === 0 ? "효과 없음" : mult > 1 ? "효과 굉장" : mult < 1 ? "별로" : "";
        return (
          <div
            key={i}
            class="pr-click pr-movecard"
            style={{
              left: (6 + (i % 2) * 117) * U,
              top: (180 - 45 + (i >= 2 ? 22 : 0)) * U,
              width: 113 * U,
              height: 20 * U,
              background: shade(bg, 0.82),
              borderColor: bg,
              boxShadow: `inset 0 0 0 ${U}px ${shade(bg, -0.35)}, 0 0 0 ${U}px ${shade(bg, -0.35)}${cursor === i ? `, 0 0 0 ${2 * U}px #f8f8f8, 0 0 0 ${3 * U}px #f8d030` : ""}`,
              filter: out ? "grayscale(1) brightness(.7)" : undefined,
            }}
            onMouseEnter={() => setCursor(i)}
            onClick={() => pick(i)}
          >
            <div class="pr-movename">{z ? `${z}` : koMove(m.id)}</div>
            <div class="pr-moveinfo">
              <TypeIcon type={d.type} scale={0.55} />
              {eff && <span style={{ color: mult === 0 ? "#707070" : mult > 1 ? "#2f8a00" : "#c05800", marginLeft: 2 * U }}>{eff}</span>}
              <span style={{ marginLeft: "auto", color: m.pp / (m.maxpp || 1) > 0.5 ? "#383838" : ppColor(m.pp, m.maxpp) }}>
                PP {m.pp}/{m.maxpp}
              </span>
            </div>
          </div>
        );
      })}
      {mv && cur && (
        <>
          <At x={320 - 70} y={-44}>
            <TypeIcon type={mv.type} scale={0.75} />
          </At>
          <At x={320 - 25 - 14} y={-44.5}>
            <CategoryIcon cat={mv.category} />
          </At>
          <At x={320 - 70} y={-28 - 4}>
            <span class="pr-info">PP</span>
          </At>
          <At x={320 - 12} y={-28 - 4} right>
            <span class="pr-info" style={{ color: ppColor(cur.pp, cur.maxpp) }}>
              {cur.pp}/{cur.maxpp}
            </span>
          </At>
          <At x={320 - 70} y={-20 - 4}>
            <span class="pr-info">위력</span>
          </At>
          <At x={320 - 12} y={-20 - 4} right>
            <span class="pr-info">{mv.basePower || "---"}</span>
          </At>
          <At x={320 - 70} y={-12 - 4}>
            <span class="pr-info">명중</span>
          </At>
          <At x={320 - 12} y={-12 - 4} right>
            <span class="pr-info">{mv.accuracy === true ? "---" : mv.accuracy}</span>
          </At>
        </>
      )}
      <At x={2} y={-58}>
        <span class="pr-chip" title={mv ? `${koType(mv.type)} · ${mv.shortDesc || ""}` : ""} onClick={onBack}>
          ◀ 뒤로 (X)
        </span>
      </At>
    </>
  );
}

// ---------- party (switch) screen, laid out like PokeRogue's party UI ----------

export interface PartyEntry {
  name: string;
  species: string;
  gender: "M" | "F" | "";
  hp: number;
  maxhp: number;
  fainted: boolean;
  active: boolean;
}

const UI = "./assets/ui/";
/** One frame of a PokeRogue UI sheet at layer coordinates (x, y from the top). */
function Spr({ src, size, f, x, y, z }: { src: string; size: [number, number]; f: [number, number, number, number]; x: number; y: number; z?: number }) {
  return (
    <div
      style={{
        position: "absolute",
        left: x * U,
        top: y * U,
        width: f[2] * U,
        height: f[3] * U,
        backgroundImage: `url(${UI}${src}.png)`,
        backgroundPosition: `${-f[0] * U}px ${-f[1] * U}px`,
        backgroundSize: `${size[0] * U}px ${size[1] * U}px`,
        imageRendering: "pixelated",
        zIndex: z,
      }}
    />
  );
}
const SLOT_MAIN = { size: [110, 294] as [number, number], frame: (sel: boolean, fnt: boolean) => [0, 49 * ((fnt ? 2 : 0) + (sel ? 1 : 0)), 110, 49] as [number, number, number, number] };
const SLOT = { size: [175, 144] as [number, number], frame: (sel: boolean, fnt: boolean) => [0, 24 * ((fnt ? 2 : 0) + (sel ? 1 : 0)), 175, 24] as [number, number, number, number] };
const PB = (sel: boolean): [number, number, number, number] => (sel ? [0, 0, 20, 24] : [0, 24, 20, 22]);

function PartyText({ x, y, children, size = 44, color, right }: { x: number; y: number; children: ComponentChildren; size?: number; color?: string; right?: boolean }) {
  return (
    <div
      class="pr-at"
      style={{
        left: right ? undefined : x * U,
        right: right ? (320 - x) * U : undefined,
        top: y * U,
        fontSize: size,
        lineHeight: `${size + 4}px`,
        color: color || "#f8f8f8",
        textShadow: `${size > 36 ? 3 : 2}px ${size > 36 ? 3 : 2}px 0 #6b5a73`,
      }}
    >
      {children}
    </div>
  );
}

export function PartyMenu({ party, message, onPick, onCancel }: { party: PartyEntry[]; message: string; onPick: (i: number) => void; onCancel?: () => void }) {
  const [cursor, setCursor] = useState(Math.max(0, party.findIndex(p => !p.active && !p.fainted)));
  const n = party.length + (onCancel ? 1 : 0);
  const ok = (i: number) => {
    if (i >= party.length) return onCancel?.();
    const p = party[i];
    if (p && !p.active && !p.fainted) onPick(i);
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const k = e.key;
      if (k === "ArrowUp") setCursor(c => (c + n - 1) % n);
      else if (k === "ArrowDown") setCursor(c => (c + 1) % n);
      else if (k === "Enter" || k === "z" || k === "Z" || k === " ") ok(cursor);
      else if ((k === "Escape" || k === "x" || k === "X") && onCancel) onCancel();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [cursor, n, party, onCancel]);
  const BOT = 180; // the party container sits on the bottom edge
  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "auto" }}>
      <Spr src="party_bg" size={[320, 180]} f={[0, 0, 320, 180]} x={0} y={0} />
      {party.map((p, i) => {
        const bench = i > 0;
        const sel = cursor === i;
        const sx = bench ? 143 : 9;
        const sy = BOT + (bench ? -196 + 28 * i : -148.5);
        const ratio = p.maxhp ? p.hp / p.maxhp : 0;
        const pb = bench ? { x: 2, y: 12 } : { x: 4, y: 4 };
        const name = bench ? { x: 21, y: 2 } : { x: 24, y: 10 };
        const lv = bench ? { x: 29, y: 14 } : { x: 32, y: 22 };
        const gender = bench ? { x: lv.x + 36, y: lv.y } : { x: lv.x + 68, y: lv.y - 9 };
        const bar = bench ? { x: 72, y: 6 } : { x: 8, y: 31 };
        const S = bench ? SLOT : SLOT_MAIN;
        return (
          <div key={i} class="pr-click" onMouseEnter={() => setCursor(i)} onClick={() => ok(i)}>
            <Spr src={bench ? "party_slot" : "party_slot_main"} size={S.size} f={S.frame(sel, p.fainted)} x={sx} y={sy} />
            <Spr src="party_pb" size={[20, 46]} f={PB(sel)} x={sx + pb.x - 10} y={sy + pb.y - (sel ? 12 : 11)} />
            <div class="pr-at pr-partyicon" style={{ left: (sx + pb.x - 20) * U, top: (sy + pb.y - 15) * U }}>
              <MonIcon species={p.species} scale={1} />
            </div>
            <PartyText x={sx + name.x} y={sy + name.y - 1} size={38}>
              {p.name}
            </PartyText>
            <Spr src="party_slot_overlay_lv_ko" size={[8, 8]} f={[0, 0, 8, 8]} x={sx + lv.x} y={sy + lv.y} />
            <PartyText x={sx + lv.x + 9} y={sy + lv.y - 1.5} size={30}>
              50
            </PartyText>
            {p.gender && (
              <PartyText x={sx + gender.x} y={sy + gender.y - 1.5} size={30} color={p.gender === "M" ? "#40c8f8" : "#f89890"}>
                {p.gender === "M" ? "♂" : "♀"}
              </PartyText>
            )}
            <Spr src="party_slot_overlay_hp_ko" size={[13, 6]} f={[0, 0, 13, 6]} x={sx + bar.x + 15 - 13} y={sy + bar.y} />
            <Spr src="party_slot_hp_bar" size={[100, 7]} f={[0, 0, 100, 7]} x={sx + bar.x} y={sy + bar.y} />
            <div
              style={{
                position: "absolute",
                left: (sx + bar.x + 16) * U,
                top: (sy + bar.y + 2) * U,
                width: 80 * ratio * U,
                height: 3 * U,
                backgroundImage: `url(${UI}party_slot_hp_overlay.png)`,
                backgroundPosition: `0px ${-(ratio > 0.5 ? 0 : ratio > 0.25 ? 3 : 6) * U}px`,
                backgroundSize: `${80 * U}px ${9 * U}px`,
                imageRendering: "pixelated",
              }}
            />
            <PartyText x={sx + bar.x + 97} y={sy + bar.y + 5 - 1.5} size={30} right>
              {p.hp}/{p.maxhp}
            </PartyText>
          </div>
        );
      })}
      <div
        class="pr-window"
        style={{ left: 1 * U, top: (BOT - 32 + 31 - 30) * U, width: 262 * U, height: 30 * U, borderWidth: 8 * U, borderImage: "url(./assets/ui/window_1.png) 8 fill stretch" }}
      />
      <PartyText x={10} y={BOT - 32 + 8 - 2} size={40}>
        {message}
      </PartyText>
      {onCancel && (
        <div class="pr-click" onMouseEnter={() => setCursor(party.length)} onClick={onCancel}>
          <Spr src="party_cancel" size={[52, 32]} f={cursor === party.length ? [0, 16, 52, 16] : [0, 0, 52, 16]} x={291 - 26} y={BOT - 16 - 8} />
          <Spr src="party_pb" size={[20, 46]} f={PB(cursor === party.length)} x={291 - 17 - 10} y={BOT - 16 - (cursor === party.length ? 12 : 11)} />
          <PartyText x={291 - 9} y={BOT - 16 - 7 - 0.5} size={28}>
            그만둔다
          </PartyText>
        </div>
      )}
    </div>
  );
}
