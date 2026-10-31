// Loads packed PokeRogue assets (see scripts/pack-assets.py).
const BASE = "./assets/";

const jsonCache = new Map<string, Promise<any>>();
export function fetchJson<T = any>(path: string): Promise<T> {
  let p = jsonCache.get(path);
  if (!p) {
    p = fetch(BASE + path).then(r => {
      if (!r.ok) throw new Error(`asset ${path}: ${r.status}`);
      return r.json();
    });
    p.catch(() => jsonCache.delete(path));
    jsonCache.set(path, p);
  }
  return p;
}

export const assetUrl = (path: string) => BASE + path;

/** [x, y, w, h, offX, offY, srcW, srcH] */
export type Frame = [number, number, number, number, number, number, number, number];
export interface PackEntry {
  img: string; // data URL
  fr?: Frame[];
}

async function fromPack(dir: string, prefix: string, key: string): Promise<PackEntry | null> {
  const index = await fetchJson<Record<string, number>>(`${dir}/index.json`);
  const n = index[key];
  if (n === undefined) return null;
  const pack = await fetchJson<Record<string, PackEntry>>(`${dir}/${prefix}${n}.json`);
  return pack[key] ?? null;
}

export const pokemonEntry = (spriteKey: string, back: boolean) =>
  fromPack(back ? "pokemon/back" : "pokemon/front", back ? "b" : "f", spriteKey);
export const trainerEntry = (key: string) => fromPack("trainer", "t", key);
export const arenaEntry = (key: string) => fromPack("arenas", "a", key);
export const animGraphicEntry = (key: string) => fromPack("anims/gfx", "g", key);

export interface CompactAnim {
  g: string;
  p: number;
  f: any[][][];
  e: Record<string, any[][]>;
}
export async function animData(key: string): Promise<CompactAnim | [CompactAnim | null, CompactAnim | null] | null> {
  const index = await fetchJson<Record<string, number>>("anims/index.json");
  const n = index[key];
  if (n === undefined) return null;
  const chunk = await fetchJson<Record<string, any>>(`anims/c${n}.json`);
  return chunk[key] ?? null;
}

export interface UiAtlas {
  w: number;
  h: number;
  f: Record<string, Frame>;
}
export const uiAtlas = (name: string) => fetchJson<UiAtlas>(`ui/${name}.json`);
export const iconAtlas = (n: number) => fetchJson<UiAtlas>(`icons/icons_${n}.json`);

const imgCache = new Map<string, Promise<HTMLImageElement>>();
export function loadImage(src: string): Promise<HTMLImageElement> {
  let p = imgCache.get(src);
  if (!p) {
    p = new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error("image " + src.slice(0, 60)));
      im.src = src;
    });
    imgCache.set(src, p);
  }
  return p;
}

/** First frame of a packed atlas as a small data URL (for DOM portraits). */
const firstFrameCache = new Map<string, Promise<{ url: string; w: number; h: number } | null>>();
export function firstFrame(kind: "front" | "back" | "trainer", key: string): Promise<{ url: string; w: number; h: number } | null> {
  const ck = kind + ":" + key;
  let p = firstFrameCache.get(ck);
  if (!p) {
    p = (async () => {
      const e = kind === "trainer" ? await trainerEntry(key) : await pokemonEntry(key, kind === "back");
      if (!e) return null;
      const im = await loadImage(e.img);
      const f = e.fr?.[0] ?? [0, 0, im.width, im.height, 0, 0, im.width, im.height];
      const c = document.createElement("canvas");
      c.width = f[6];
      c.height = f[7];
      c.getContext("2d")!.drawImage(im, f[0], f[1], f[2], f[3], f[4], f[5], f[2], f[3]);
      return { url: c.toDataURL(), w: f[6], h: f[7] };
    })();
    p.catch(() => firstFrameCache.delete(ck));
    firstFrameCache.set(ck, p);
  }
  return p;
}
