import { useEffect, useState } from "preact/hooks";
import type { ComponentChildren } from "preact";
import { iconRef, koSpecies, koType, spriteKey, species as getSpecies } from "../data/dex";
import { assetUrl, firstFrame, iconAtlas, uiAtlas, type UiAtlas } from "../render/assets";

export function Win(props: { title?: ComponentChildren; children?: ComponentChildren; class?: string; style?: any; right?: ComponentChildren }) {
  return (
    <div class={`win ${props.class || ""}`} style={props.style}>
      {props.title && (
        <div class="row" style={{ marginBottom: 6 }}>
          <h3 style={{ margin: 0, color: "var(--gold)", fontSize: 16 }}>{props.title}</h3>
          {props.right && <div class="right row">{props.right}</div>}
        </div>
      )}
      {props.children}
    </div>
  );
}

function useAsync<T>(fn: () => Promise<T>, deps: any[]): T | undefined {
  const [v, setV] = useState<T | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    fn().then(x => alive && setV(x)).catch(() => {});
    return () => {
      alive = false;
    };
  }, deps);
  return v;
}

const iconAtlasCache: Record<number, UiAtlas> = {};
/** PokeRogue party icon (40x30). */
export function MonIcon({ species, scale = 1.5, title }: { species: string; scale?: number; title?: string }) {
  const ref = iconRef(species);
  const atlas = useAsync(async () => (ref ? (iconAtlasCache[ref[0]] ||= await iconAtlas(ref[0])) : null), [ref?.[0]]);
  const w = 40 * scale;
  const h = 30 * scale;
  if (!ref || !atlas) return <span class="ico" style={{ width: w, height: h }} title={title} />;
  const f = atlas.f[ref[1]] || atlas.f[ref[1].split("-")[0]];
  if (!f) return <span class="ico" style={{ width: w, height: h }} title={title} />;
  const [x, y, fw, fh, ox, oy] = f;
  return (
    <span class="ico" title={title ?? koSpecies(species)} style={{ width: w, height: h, position: "relative", overflow: "hidden" }}>
      <span
        class="ico"
        style={{
          position: "absolute",
          left: ox * scale,
          top: oy * scale,
          width: fw * scale,
          height: fh * scale,
          backgroundImage: `url(${assetUrl(`icons/icons_${ref[0]}.png`)})`,
          backgroundPosition: `${-x * scale}px ${-y * scale}px`,
          backgroundSize: `${atlas.w * scale}px ${atlas.h * scale}px`,
        }}
      />
    </span>
  );
}

/** First frame of the PokeRogue battle sprite. */
export function MonSprite({ species, back = false, scale = 2, box }: { species: string; back?: boolean; scale?: number; box?: number }) {
  const key = spriteKey(species);
  const img = useAsync(() => firstFrame(back ? "back" : "front", key), [key, back]);
  const size = box ?? 96 * scale;
  return (
    <div class="portrait" style={{ width: size, height: size }}>
      {img && <img class="spr" src={img.url} width={img.w * scale} height={img.h * scale} style={{ maxWidth: size, maxHeight: size, objectFit: "contain" }} alt={koSpecies(species)} />}
    </div>
  );
}

export function TrainerSprite({ sprite, scale = 2, box }: { sprite: string; scale?: number; box?: number }) {
  const img = useAsync(() => firstFrame("trainer", sprite), [sprite]);
  const size = box ?? 80 * scale;
  return (
    <div class="portrait" style={{ width: size, height: size }}>
      {img && <img class="spr" src={img.url} width={img.w * scale} height={img.h * scale} style={{ maxWidth: size, maxHeight: size, objectFit: "contain" }} alt={sprite} />}
    </div>
  );
}

let typesAtlas: UiAtlas | null = null;
export function TypeBadge({ type }: { type: string }) {
  const atlas = useAsync(async () => (typesAtlas ||= await uiAtlas("types_ko")), []);
  const f = atlas?.f[type.toLowerCase()];
  if (!f) return <span class="chip">{koType(type)}</span>;
  return (
    <span
      class="tbadge"
      title={koType(type)}
      style={{ backgroundImage: `url(${assetUrl("ui/types_ko.png")})`, backgroundPosition: `${-f[0]}px ${-f[1]}px`, width: f[2], height: f[3] }}
    />
  );
}

export function Types({ species }: { species: string }) {
  const s = getSpecies(species);
  return (
    <span class="row" style={{ gap: 3, display: "inline-flex", flexWrap: "nowrap" }}>
      {s.types.map(t => (
        <TypeBadge key={t} type={t} />
      ))}
    </span>
  );
}

let catAtlas: UiAtlas | null = null;
export function CategoryIcon({ cat }: { cat: string }) {
  const atlas = useAsync(async () => (catAtlas ||= await uiAtlas("categories")), []);
  const f = atlas?.f[cat.toLowerCase()];
  if (!f) return null;
  return <span class="ico" style={{ width: f[2], height: f[3], zoom: 1.3, backgroundImage: `url(${assetUrl("ui/categories.png")})`, backgroundPosition: `${-f[0]}px ${-f[1]}px` }} />;
}

export function Stars({ n }: { n: number }) {
  const full = Math.floor(n);
  const half = n - full >= 0.5;
  return (
    <span class="gold" title={`${n}`}>
      {"★".repeat(full)}
      {half ? "☆" : ""}
      <span class="muted">{"·".repeat(5 - full - (half ? 1 : 0))}</span>
    </span>
  );
}

export function Money({ v }: { v: number }) {
  return <span class={`num ${v < 0 ? "bad" : ""}`}>₽{Math.round(v).toLocaleString()}</span>;
}

export function Modal({ children, onClose, wide }: { children: ComponentChildren; onClose: () => void; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);
  return (
    <div class="modal-bg" onClick={e => e.target === e.currentTarget && onClose()}>
      <div class="modal" style={wide ? { maxWidth: 1000 } : undefined}>
        {children}
      </div>
    </div>
  );
}

export function Bar({ v, cls = "" }: { v: number; cls?: string }) {
  return (
    <div class={`bar ${cls}`}>
      <i style={{ width: `${Math.max(0, Math.min(1, v)) * 100}%` }} />
    </div>
  );
}

export function Form({ form }: { form: string[] }) {
  return (
    <span class="form">
      {form.map((f, i) => (
        <i key={i} class={f}>
          {f === "W" ? "승" : f === "L" ? "패" : "무"}
        </i>
      ))}
    </span>
  );
}

export function useToast(): [ComponentChildren, (msg: string) => void] {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 2600);
    return () => clearTimeout(t);
  }, [msg]);
  const node = msg ? (
    <div class="toast">
      <div class="win w2">{msg}</div>
    </div>
  ) : null;
  return [node, setMsg];
}

/** Button that asks for a second click instead of window.confirm (blocked in some hosts). */
export function ConfirmButton({ label, confirmLabel, onConfirm, class: cls = "btn danger small" }: { label: string; confirmLabel?: string; onConfirm: () => void; class?: string }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3500);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button class={`${cls} ${armed ? "sel" : ""}`} onClick={() => (armed ? (setArmed(false), onConfirm()) : setArmed(true))}>
      {armed ? confirmLabel || `한 번 더 누르면 ${label}` : label}
    </button>
  );
}

let itemsAtlas: UiAtlas | null = null;
/** PokeRogue item icon (32×32 frame from ui/items). */
export function ItemIcon({ frame, scale = 1.5 }: { frame: string; scale?: number }) {
  const atlas = useAsync(async () => (itemsAtlas ||= await uiAtlas("items")), []);
  const size = 32 * scale;
  const f = atlas?.f[frame] || atlas?.f.unknown;
  if (!atlas || !f) return <span class="ico" style={{ width: size, height: size }} />;
  const [x, y, w, h, ox, oy] = f;
  return (
    <span class="ico" style={{ width: size, height: size, position: "relative", overflow: "hidden", flex: "none" }}>
      <span
        class="ico"
        style={{
          position: "absolute",
          left: ox * scale,
          top: oy * scale,
          width: w * scale,
          height: h * scale,
          backgroundImage: `url(${assetUrl("ui/items.png")})`,
          backgroundPosition: `${-x * scale}px ${-y * scale}px`,
          backgroundSize: `${atlas.w * scale}px ${atlas.h * scale}px`,
        }}
      />
    </span>
  );
}

const TYPE_ORDER = ["Normal", "Fire", "Water", "Electric", "Grass", "Ice", "Fighting", "Poison", "Ground", "Flying", "Psychic", "Bug", "Rock", "Ghost", "Dragon", "Dark", "Steel", "Fairy"];

/** Move types present in a list, in the games' usual order. */
export function typesOf(types: Iterable<string>): string[] {
  const have = new Set(types);
  return [...TYPE_ORDER.filter(t => have.has(t)), ...[...have].filter(t => !TYPE_ORDER.includes(t))];
}

/** A row of type badges to narrow a move list to one type; tapping the chosen one again shows all. */
export function TypeFilter({ types, value, onChange }: { types: string[]; value: string | null; onChange: (t: string | null) => void }) {
  const cur = value && types.includes(value) ? value : null;
  return (
    <div class="tfilter">
      <button class={`btn small ${!cur ? "sel" : ""}`} onClick={() => onChange(null)}>
        전체
      </button>
      {types.map(t => (
        <button key={t} class={`tf ${cur === t ? "on" : cur ? "off" : ""}`} title={koType(t)} onClick={() => onChange(cur === t ? null : t)}>
          <TypeBadge type={t} />
        </button>
      ))}
    </div>
  );
}
