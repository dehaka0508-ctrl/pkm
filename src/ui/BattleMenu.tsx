// PokeRogue-style command / fight menus, laid out in the game's 320×180 coordinate space
// (the same numbers as PokeRogue's command-ui-handler and fight-ui-handler) and scaled to the canvas.
import { useEffect, useRef, useState } from "preact/hooks";
import type { ComponentChildren } from "preact";
import { dex, koMove, koType } from "../data/dex";
import { CategoryIcon, ItemIcon, MonIcon, TypeBadge } from "./components";

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
              <TypeIcon type={d.type} scale={0.5} />
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

export function PartyMenu({ party, message, onPick, onCancel, double, taken = [], onSummary }: { party: PartyEntry[]; message: string; onPick: (i: number) => void; onCancel?: () => void; double?: boolean; taken?: number[]; onSummary?: (i: number) => void }) {
  const [cursor, setCursor] = useState(Math.max(0, party.findIndex(p => !p.active && !p.fainted)));
  const [opt, setOpt] = useState<number | null>(null);
  const n = party.length + (onCancel ? 1 : 0);
  const canSend = (i: number) => {
    const p = party[i];
    return !!p && !p.active && !p.fainted && !taken.includes(i);
  };
  const ok = (i: number) => {
    if (i >= party.length) return onCancel?.();
    // PokeRogue: choosing a Pokémon opens "send out / summary / cancel"
    if (onSummary) return setOpt(i);
    if (canSend(i)) onPick(i);
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (opt != null) return;
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
  }, [cursor, n, party, onCancel, opt]);
  const BOT = 180; // the party container sits on the bottom edge
  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "auto" }}>
      <Spr src={double ? "party_bg_double" : "party_bg"} size={[320, 180]} f={[0, 0, 320, 180]} x={0} y={0} />
      {party.map((p, i) => {
        // PokeRogue party-ui-handler: actives on the left (two in doubles), the bench on the right
        const nActive = double ? 2 : 1;
        const bench = i >= nActive;
        const sel = cursor === i;
        const sx = bench ? 143 : 9;
        const sy = BOT + (bench ? -196 + (double ? -40 : 0) + (28 + (double ? 8 : 0)) * i : -148.5 + (double ? -8 : 0) + 64 * i);
        const ratio = p.maxhp ? p.hp / p.maxhp : 0;
        const pb = bench ? { x: 2, y: 12 } : { x: 4, y: 4 };
        const name = bench ? { x: 21, y: 2 } : { x: 24, y: 10 };
        const lv = bench ? { x: 29, y: 14 } : { x: 32, y: 22 };
        const gender = bench ? { x: lv.x + 36, y: lv.y } : { x: lv.x + 68, y: lv.y - 9 };
        const bar = bench ? { x: 72, y: 6 } : { x: 8, y: 31 };
        const S = bench ? SLOT : SLOT_MAIN;
        return (
          <div key={i} class="pr-click" onMouseEnter={() => setCursor(i)} onClick={() => ok(i)}>
            <Spr src={bench ? "party_slot" : "party_slot_main"} size={S.size} f={S.frame(sel, p.fainted || taken.includes(i))} x={sx} y={sy} />
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
        {opt != null ? "포켓몬을 어떻게 하겠습니까?" : message}
      </PartyText>
      {opt != null && (
        <PartyOptions
          items={[
            { label: "교체한다", act: () => (setOpt(null), onPick(opt)), off: !canSend(opt) },
            { label: "능력치를 본다", act: () => (setOpt(null), onSummary?.(opt)) },
            { label: "그만둔다", act: () => setOpt(null) },
          ]}
          onBack={() => setOpt(null)}
        />
      )}
      {onCancel && opt == null && (
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

/** Target selection in doubles: a wider window listing the targets one per line. */
export function TargetMenu({ items, onBack }: { items: { label: string; act: () => void }[]; onBack: () => void }) {
  const [cursor, setCursor] = useState(0);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const k = e.key;
      if (k === "ArrowUp") setCursor(c => (c + items.length - 1) % items.length);
      else if (k === "ArrowDown") setCursor(c => (c + 1) % items.length);
      else if (k === "Enter" || k === "z" || k === "Z" || k === " ") items[cursor]?.act();
      else if (k === "Escape" || k === "x" || k === "X" || k === "Backspace") onBack();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [cursor, items, onBack]);
  return (
    <>
      <PrWindow x={170} w={150} />
      {items.map((it, i) => (
        <At key={i} x={186} y={-42 + i * 13}>
          <span class="pr-text pr-click" style={{ fontSize: 36, height: 48, lineHeight: "48px" }} onMouseEnter={() => setCursor(i)} onClick={it.act}>
            {it.label}
          </span>
        </At>
      ))}
      <img class="pr-cursor" src="./assets/ui/cursor.png" style={curPos(178, 180 - 42 + 1.5 + cursor * 13)} alt="" />
      <At x={2} y={-58}>
        <span class="pr-chip" onClick={onBack}>
          ◀ 뒤로 (X)
        </span>
      </At>
    </>
  );
}

// ---------- party options window and summary screen (PokeRogue party-ui-handler / summary-ui-handler) ----------

/** Text in PokeRogue colours: `bottom` puts the baseline at y like PokeRogue's origin (0, 1). */
function T({ x, y, children, color = "#f8f8f8", shadow = "#636363", size = 44, right, bottom, center, style }: { x: number; y: number; children: ComponentChildren; color?: string; shadow?: string; size?: number; right?: boolean; bottom?: boolean; center?: boolean; style?: any }) {
  const tx = right ? "-100%" : center ? "-50%" : "0";
  const ty = bottom ? "-100%" : "0";
  return (
    <div
      class="pr-at"
      style={{ left: x * U, top: y * U, transform: `translate(${tx}, ${ty})`, fontSize: size, lineHeight: `${size + 8}px`, color, textShadow: `3px 3px 0 ${shadow}`, ...style }}
    >
      {children}
    </div>
  );
}
const ALT = { color: "#484848", shadow: "#d0d0c8" }; // WINDOW_ALT / SUMMARY_ALT
const RED = { color: "#e70808", shadow: "#ffbd73" };
const BLUE = { color: "#40c8f8", shadow: "#006090" };
const PINK = { color: "#f89890", shadow: "#984038" };
const GOLD = { color: "#e8e8a8", shadow: "#a0a060" };

/** A whole image at layer coordinates (x, y = top-left). */
function Img({ src, x, y, w, h, crop }: { src: string; x: number; y: number; w: number; h: number; crop?: number }) {
  return (
    <div
      style={{
        position: "absolute",
        left: x * U,
        top: y * U,
        width: (crop ?? w) * U,
        height: h * U,
        backgroundImage: `url(${UI}${src}.png)`,
        backgroundSize: `${w * U}px ${h * U}px`,
        imageRendering: "pixelated",
      }}
    />
  );
}

/** Options window anchored to the bottom-right corner (PokeRogue: 16 px per row, at least 94 px wide). */
export function PartyOptions({ items, onBack }: { items: { label: string; act: () => void; off?: boolean }[]; onBack: () => void }) {
  const [cursor, setCursor] = useState(0);
  const n = items.length;
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const k = e.key;
      if (k === "ArrowUp") setCursor(c => (c + n - 1) % n);
      else if (k === "ArrowDown") setCursor(c => (c + 1) % n);
      else if (k === "Enter" || k === "z" || k === "Z" || k === " ") !items[cursor].off && items[cursor].act();
      else if (k === "Escape" || k === "x" || k === "X" || k === "Backspace") onBack();
      else return;
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    window.addEventListener("keydown", h, true);
    return () => window.removeEventListener("keydown", h, true);
  }, [cursor, items, onBack]);
  // PokeRogue: widest option + 24, at least 94 (Korean labels are ~11 px a character here)
  const W = Math.max(94, Math.max(...items.map(it => it.label.length)) * 11 + 30);
  const H = 16 * n + 13;
  return (
    <>
      <div class="pr-window" style={{ left: (319 - W) * U, top: (179 - H) * U, width: W * U, height: H * U, borderWidth: 8 * U, borderImage: "url(./assets/ui/window_1.png) 8 fill stretch", pointerEvents: "auto" }} />
      {items.map((it, i) => {
        const cy = 179 - 19 - 16 * (n - 1 - i);
        return (
          <div key={i} class="pr-click" onMouseEnter={() => setCursor(i)} onClick={() => !it.off && it.act()}>
            {cursor === i && <img class="pr-cursor" src={`${UI}cursor.png`} style={{ left: (319 + 8 - W) * U, top: cy * U, width: 5 * U, height: 8 * U }} />}
            <T x={319 + 19 - W} y={cy - 4} {...(it.off ? { color: "#a0a0a0" } : {})}>
              {it.label}
            </T>
          </div>
        );
      })}
    </>
  );
}

export interface SummaryMon {
  name: string;
  species: string;
  level: number;
  gender: "M" | "F" | "";
  shiny: boolean;
  hp: number;
  maxhp: number;
  status: string;
  stats: Record<"atk" | "def" | "spa" | "spd" | "spe", number>;
  ivs?: Record<"hp" | "atk" | "def" | "spa" | "spd" | "spe", number>;
  ability: string;
  item: string;
  itemName: string;
  itemFrame: string;
  nature: string;
  teraType: string;
  moves: { id: string; pp: number | null; maxpp: number }[];
  ot: string;
  exp?: { now: number; toNext: number; ratio: number };
}

const STAT_ROWS: ["hp" | "atk" | "def" | "spa" | "spd" | "spe", string][] = [["hp", "HP"], ["atk", "공격"], ["def", "방어"], ["spa", "특수공격"], ["spd", "특수방어"], ["spe", "스피드"]];
const NATURE_FRAG: Record<string, string> = { hardy: "하는", lonely: "을 타는", brave: "한", adamant: "스러운", naughty: "같은", bold: "한", docile: "한", relaxed: "한", impish: "같은", lax: "거리는", timid: "같은", hasty: "한", serious: "한", jolly: "한", naive: "한", modest: "스러운", mild: "한", quiet: "한", bashful: "을 타는", rash: "거리는", calm: "한", gentle: "한", sassy: "진", careful: "한", quirky: "스러운" };
const STATUS_FRAME: Record<string, string> = { brn: "burn", par: "paralysis", psn: "poison", tox: "toxic", slp: "sleep", frz: "freeze", fnt: "faint" };
const STATUS_Y: Record<string, number> = { pokerus: 0, burn: 8, faint: 16, freeze: 24, paralysis: 32, poison: 40, sleep: 48, toxic: 56 };

/** PokeRogue summary screen: profile / stats / moves pages, ← → or the tabs to turn pages. */
export function SummaryScreen({ mon, sprite, onClose, koAbility, abilityDesc, moveDesc, koNature }: { mon: SummaryMon; sprite: ComponentChildren; onClose: () => void; koAbility: (id: string) => string; abilityDesc: (id: string) => string; moveDesc: (id: string) => string; koNature: (id: string) => string }) {
  const [page, setPage] = useState(0);
  const [moveCur, setMoveCur] = useState<number | null>(null);
  const [ivView, setIvView] = useState(false);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const k = e.key;
      if (k === "ArrowLeft") (setPage(p => Math.max(0, p - 1)), setMoveCur(null));
      else if (k === "ArrowRight") (setPage(p => Math.min(2, p + 1)), setMoveCur(null));
      else if (page === 2 && k === "ArrowUp") setMoveCur(c => (c == null ? 0 : (c + mon.moves.length - 1) % mon.moves.length));
      else if (page === 2 && k === "ArrowDown") setMoveCur(c => (c == null ? 0 : (c + 1) % mon.moves.length));
      else if (page === 2 && (k === "Enter" || k === "z" || k === "Z") && moveCur == null) setMoveCur(0);
      else if (page === 1 && (k === "z" || k === "Z" || k === "Enter")) setIvView(v => !v);
      else if (k === "Escape" || k === "x" || k === "X" || k === "Backspace") moveCur != null ? setMoveCur(null) : onClose();
      else return;
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    window.addEventListener("keydown", h, true);
    return () => window.removeEventListener("keydown", h, true);
  }, [page, moveCur, mon, onClose]);
  const P = { x: 106, y: 21 }; // page container top-left
  const nat = dex.natures.get(mon.nature);
  const sel = moveCur != null ? mon.moves[moveCur] : null;
  const selMove = sel ? dex.moves.get(sel.id) : null;
  const statusFrame = STATUS_FRAME[mon.status];
  const sp = dex.species.get(mon.species);
  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "auto" }}>
      <Img src="summary_bg" x={0} y={0} w={320} h={180} />
      {/* tabs: click either half to turn pages */}
      <Img src={`summary_tabs_${page + 1}_ko`} x={81} y={0} w={page === 2 ? 62 : 38} h={16} />
      <div class="pr-click" style={{ position: "absolute", left: 81 * U, top: 0, width: 140 * U, height: 16 * U }} onClick={() => (setPage(p => (p + 1) % 3), setMoveCur(null))} />
      <T x={4} y={15} bottom size={48}>
        스테이터스
      </T>
      <Img src="summary_dexnb_label_ko" x={6} y={21} w={10} h={8} />
      <T x={41} y={31} right bottom size={40} {...(mon.shiny ? GOLD : {})}>
        {String(sp.num).padStart(4, "0")}
      </T>
      {/* the light box on the left (x 4–100, y 31–126): sprite centred in it like PokeRogue, never past its edges */}
      <div style={{ position: "absolute", left: 4 * U, top: 31 * U, width: 97 * U, height: 96 * U, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {sprite}
      </div>
      <T x={6} y={127}>
        {mon.name}
        {mon.shiny && <span style={{ color: "#f8d030", marginLeft: 12 }}>★</span>}
      </T>
      <T x={24} y={163} bottom {...ALT}>
        Lv.{mon.level}
      </T>
      {mon.gender && (
        <T x={96} y={163} bottom color={mon.gender === "M" ? "#40c8f8" : "#f89890"} shadow={mon.gender === "M" ? "#006090" : "#984038"}>
          {mon.gender === "M" ? "♂" : "♀"}
        </T>
      )}
      {statusFrame && (
        <>
          <Img src="summary_status" x={0} y={164} w={106} h={16} />
          <T x={3} y={164} size={40}>
            상태 이상
          </T>
          <Spr src="statuses_ko" size={[22, 64]} f={[0, STATUS_Y[statusFrame], 20, 8]} x={91 - 10} y={168} />
        </>
      )}
      {/* move effect box slides out to the left while a move is selected */}
      <div style={{ position: "absolute", left: (sel ? 6 : 106) * U, top: 118 * U, transition: "left .25s ease-out" }}>
        <Img src="summary_moves_effect" x={0} y={0} w={100} h={62} />
        <Img src="summary_moves_effect_title_ko" x={7} y={2} w={29} h={10} />
        <T x={8} y={13} size={40} style={{ lineHeight: `${16 * U}px` }}>
          위력
          <br />
          명중
          <br />
          분류
        </T>
        {selMove && (
          <>
            <T x={99} y={27} right bottom {...ALT}>
              {selMove.basePower || "---"}
            </T>
            <T x={99} y={43} right bottom {...ALT}>
              {selMove.accuracy === true ? "---" : selMove.accuracy}
            </T>
            <Spr src="categories" size={[84, 11]} f={[{ Physical: 0, Special: 28, Status: 56 }[selMove.category] ?? 56, 0, 28, 11]} x={99 - 28} y={57 - 11} />
          </>
        )}
      </div>
      <Img src={["summary_profile", "summary_stats", "summary_moves"][page]} x={P.x} y={P.y} w={214} h={159} />
      {page === 0 && (
        <>
          <Img src="summary_profile_profile_title_ko" x={P.x + 7} y={P.y - 1} w={36} h={10} />
          <T x={P.x + 7} y={P.y + 10} {...ALT}>
            어버이/<span style={{ color: "#40c8f8", textShadow: "3px 3px 0 #006090" }}>{mon.ot}</span>
          </T>
          <T x={P.x + 7} y={P.y + 27} {...ALT}>
            타입/
          </T>
          {sp.types.map((t, i) => (
            <div key={t} class="pr-at" style={{ left: (P.x + 37 + 34 * i) * U, top: (P.y + 27) * U }}>
              <TypeIcon type={t} scale={1} />
            </div>
          ))}
          {mon.teraType && (
            <>
              <T x={P.x + 128} y={P.y + 27} {...ALT} size={40}>
                테라/
              </T>
              <div class="pr-at" style={{ left: (P.x + 160) * U, top: (P.y + 27) * U }}>
                <TypeIcon type={mon.teraType} scale={1} />
              </div>
            </>
          )}
          <Img src="summary_profile_ability_ko" x={P.x + 17} y={P.y + 42} w={18} h={10} />
          <T x={P.x + 7} y={P.y + 68} bottom {...ALT}>
            {koAbility(mon.ability)}
          </T>
          <T x={P.x + 7} y={P.y + 71} size={36} {...ALT} style={{ whiteSpace: "normal", width: 204 * U, maxHeight: 31 * U, overflow: "hidden", lineHeight: `${15 * U}px` }}>
            {abilityDesc(mon.ability)}
          </T>
          <Img src="summary_profile_memo_title_ko" x={P.x + 7} y={P.y + 102} w={68} h={10} />
          <T x={P.x + 7} y={P.y + 113} {...ALT} style={{ lineHeight: `${15 * U}px` }}>
            <span style={{ color: RED.color, textShadow: `3px 3px 0 ${RED.shadow}` }}>{koNature(mon.nature)}</span>
            {NATURE_FRAG[nat.id] || "한"} 성격.
            <br />
            레벨 {mon.level}에서 리그 배틀 중이다.
          </T>
        </>
      )}
      {page === 1 && (
        <>
          <Img src="summary_stats_item_title_ko" x={P.x + 7} y={P.y - 1} w={45} h={10} />
          {mon.item ? (
            <>
              <div class="pr-at pr-partyicon" style={{ left: (P.x + 3) * U, top: (P.y + 8) * U }}>
                <ItemIconInline frame={mon.itemFrame} />
              </div>
              <T x={P.x + 24} y={P.y + 14} {...ALT}>
                {mon.itemName}
              </T>
            </>
          ) : (
            <T x={P.x + 7} y={P.y + 14} {...ALT}>
              없음
            </T>
          )}
          <Img src="summary_stats_stats_title_ko" x={P.x + 16} y={P.y + 54} w={18} h={10} />
          <div class="pr-click" style={{ position: "absolute", left: (P.x + 4) * U, top: (P.y + 60) * U, width: 210 * U, height: 50 * U }} onClick={() => mon.ivs && setIvView(v => !v)} />
          {STAT_ROWS.map(([k, label], s) => {
            const row = s % 3;
            const col = Math.floor(s / 3);
            const mult = k === nat.plus ? 1.1 : k === nat.minus ? 0.9 : 1;
            const lc = ivView ? (mon.ivs?.[k] === 31 ? GOLD : {}) : mult > 1 ? PINK : mult < 1 ? BLUE : {};
            const val = ivView ? `${mon.ivs?.[k] ?? "-"}/31` : k === "hp" ? `${mon.hp}/${mon.maxhp}` : mon.stats[k as "atk"];
            return (
              <div key={k}>
                <T x={P.x + 27 + 116 * col + (col === 1 ? 5 : 0)} y={P.y + 64 + 16 * row} center size={40} {...lc}>
                  {label}
                </T>
                <T x={P.x + 27 + 93 + 93 * col} y={P.y + 64 + 16 * row} right {...ALT}>
                  {val}
                </T>
              </div>
            );
          })}
          <Img src="summary_stats_exp_title_ko" x={P.x + 7} y={P.y + 110} w={36} h={10} />
          <T x={P.x + 6} y={P.y + 120}>현재 경험치</T>
          <T x={P.x + 6} y={P.y + 136}>다음 레벨까지</T>
          <T x={P.x + 213} y={P.y + 120} right {...ALT}>
            {mon.exp ? mon.exp.now.toLocaleString() : "-"}
          </T>
          <T x={P.x + 213} y={P.y + 136} right {...ALT}>
            {mon.exp ? mon.exp.toNext.toLocaleString() : "-"}
          </T>
          <Img src="summary_stats_expbar_title_ko" x={P.x + 126} y={P.y + 152} w={11} h={5} />
          {mon.exp && <Img src="summary_stats_overlay_exp" x={P.x + 140} y={P.y + 153} w={64} h={3} crop={Math.floor(mon.exp.ratio * 64)} />}
        </>
      )}
      {page === 2 && (
        <>
          <Img src="summary_moves_moves_title_ko" x={P.x + 7} y={P.y - 1} w={27} h={10} />
          {[0, 1, 2, 3].map(m => {
            const mv = mon.moves[m];
            const base = P.y + 26 + 16 * m; // row baseline
            const move = mv ? dex.moves.get(mv.id) : null;
            return (
              <div key={m} class={mv ? "pr-click" : ""} onMouseEnter={() => mv && setMoveCur(m)} onClick={() => mv && setMoveCur(m)}>
                {moveCur === m && <Spr src="summary_moves_cursor" size={[211, 32]} f={[0, 0, 211, 16]} x={P.x + 5 - 2} y={base + 1 - 16} />}
                {move && (
                  <div class="pr-at" style={{ left: (P.x + 5) * U, top: (base - 14) * U }}>
                    <TypeIcon type={move.type} scale={1} />
                  </div>
                )}
                <T x={P.x + 40} y={base} bottom>
                  {move ? koMove(move.id) || move.name : "-"}
                </T>
                <Img src="summary_moves_overlay_pp_ko" x={P.x + 5 + 177 - 10} y={base - 9} w={10} h={8} />
                <T x={P.x + 5 + 178} y={base + 1} bottom size={40}>
                  {mv ? `${mv.pp ?? mv.maxpp}/${mv.maxpp}` : "--/--"}
                </T>
              </div>
            );
          })}
          <Img src="summary_moves_descriptions_title_ko" x={P.x + 7} y={P.y + 26 + 64} w={27} h={10} />
          <T x={P.x + 6} y={P.y + 26 + 84} size={38} {...ALT} style={{ whiteSpace: "normal", width: 204 * U, maxHeight: 46 * U, overflow: "hidden", lineHeight: `${15 * U}px` }}>
            {sel ? moveDesc(sel.id) : ""}
          </T>
        </>
      )}
      <div class="pr-click" style={{ position: "absolute", right: 2 * U, top: 1 * U }} onClick={onClose}>
        <T x={0} y={0} size={36} style={{ position: "static", transform: "none" }}>
          ✕ 닫기
        </T>
      </div>
    </div>
  );
}

/** Item icon drawn at 1 unit = 1 px (the caller zooms it). */
function ItemIconInline({ frame }: { frame: string }) {
  // the layer zooms .ico by U, so half scale = 16 layer px
  return <ItemIcon frame={frame} scale={0.5} />;
}
