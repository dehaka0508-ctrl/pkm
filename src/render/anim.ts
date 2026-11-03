// Player for PokeRogue's move animation format (RPG Maker style frames).
// Written from the data format: frames of sprites targeting the user (0), target (1)
// or a 96x96-cell graphic (2), positioned relative to "focus" points.
import Phaser from "phaser";
import { animData, animGraphicEntry, loadImage, type CompactAnim } from "./assets";

const USER_FOCUS_X = 106;
const USER_FOCUS_Y = 116;
const TARGET_FOCUS_X = 234;
const TARGET_FOCUS_Y = 52;
export const ANIM_FRAME_MS = 50;

export interface AnimActor {
  /** feet position in field coords */
  x: number;
  y: number;
  sprite: Phaser.GameObjects.Sprite;
  depth: number;
  isPlayer: boolean;
}

// compact sprite fields
const X = 0, Y = 1, ZX = 2, ZY = 3, ANG = 4, MIR = 5, VIS = 6, BLEND = 7, TGT = 8, GF = 9, OP = 10, PRI = 11, FOC = 12, LOCK = 13, TONE = 14;

async function ensureGraphic(scene: Phaser.Scene, name: string): Promise<boolean> {
  if (!name) return false;
  const key = "anim:" + name;
  if (scene.textures.exists(key)) return true;
  const e = await animGraphicEntry(name);
  if (!e) return false;
  const img = await loadImage(e.img);
  if (!scene.textures.exists(key)) {
    if (img.width >= 96 && img.height >= 96) scene.textures.addSpriteSheet(key, img, { frameWidth: 96, frameHeight: 96 });
    else scene.textures.addImage(key, img);
  }
  return true;
}

export async function preloadAnim(scene: Phaser.Scene, key: string): Promise<CompactAnim | [CompactAnim | null, CompactAnim | null] | null> {
  try {
    const a = await animData(key);
    if (!a) return null;
    const list = Array.isArray(a) ? a : [a];
    for (const x of list) {
      if (!x) continue;
      await ensureGraphic(scene, x.g);
      for (const evs of Object.values(x.e || {})) for (const ev of evs) if (ev[0] === "a" && ev[1]) await ensureGraphic(scene, ev[1]);
    }
    return a;
  } catch (e) {
    console.warn("anim load failed", key, e);
    return null;
  }
}

function transform(px: number, py: number, src: number[], dst: number[]): [number, number] {
  const [x1, y1, x2, y2] = src;
  const [x3, y3, x4, y4] = dst;
  const tx = x2 - x1 === 0 ? 0 : (px - x1) / (x2 - x1);
  const ty = y2 - y1 === 0 ? 0 : (py - y1) / (y2 - y1);
  return [x3 + tx * (x4 - x3), y3 + ty * (y4 - y3)];
}

function applyTone(obj: Phaser.GameObjects.Sprite, overlay: Phaser.GameObjects.Sprite | null, tone?: number[]) {
  if (!tone || !tone.some(v => v)) {
    obj.clearTint();
    overlay?.setVisible(false);
    return;
  }
  const [r, g, b] = tone;
  const neg = (v: number) => Math.max(0, Math.min(255, 255 + Math.min(0, v)));
  obj.setTint(Phaser.Display.Color.GetColor(neg(r), neg(g), neg(b)));
  const pos = Math.max(r, g, b, 0);
  if (overlay) {
    if (pos > 0) {
      overlay.setVisible(true).setTintFill(Phaser.Display.Color.GetColor(Math.max(0, r), Math.max(0, g), Math.max(0, b))).setAlpha(Math.min(1, pos / 255) * obj.alpha);
    } else overlay.setVisible(false);
  }
}

/**
 * Plays an animation. `field` is the container holding battle objects (field coordinates).
 * Resolves when done. Real user/target sprites are hidden and replaced by copies while playing.
 */
export function playAnim(
  scene: Phaser.Scene,
  field: Phaser.GameObjects.Container,
  animAny: CompactAnim | [CompactAnim | null, CompactAnim | null],
  user: AnimActor,
  target: AnimActor,
  speed = 1,
): Promise<void> {
  let anim: CompactAnim | null;
  let isOpp = false;
  if (Array.isArray(animAny)) {
    if (!user.isPlayer && animAny[1]) {
      anim = animAny[1];
      isOpp = true;
    } else anim = animAny[0];
  } else anim = animAny;
  if (!anim || !anim.f.length) return Promise.resolve();
  const a = anim;
  const U = isOpp ? target : user;
  const T = isOpp ? user : target;
  const same = U === T;
  const gKey = "anim:" + a.g;
  const hasGraphic = scene.textures.exists(gKey);
  const uHalf = U.sprite.displayHeight / 2;
  const tHalf = T.sprite.displayHeight / 2;
  const src = [USER_FOCUS_X, USER_FOCUS_Y, TARGET_FOCUS_X, TARGET_FOCUS_Y];
  const dst = [U.x, U.y - uHalf, T.x, T.y - tHalf];
  const reversed = (() => {
    if (src[0] === src[2]) return false;
    return src[0] < src[2] ? dst[0] > dst[2] : dst[0] < dst[2];
  })();

  const gfx: Phaser.GameObjects.Sprite[] = [];
  const copies: Record<number, { s: Phaser.GameObjects.Sprite; o: Phaser.GameObjects.Sprite }[]> = { 0: [], 1: [] };
  let bg: Phaser.GameObjects.TileSprite | Phaser.GameObjects.Rectangle | null = null;
  const tweens: Phaser.Tweens.Tween[] = [];
  const frameMs = ANIM_FRAME_MS / speed;
  let extra = 0;

  const realU = U.sprite;
  const realT = T.sprite;

  const position = (s: any[], idx: number) => {
    let x = s[X] + USER_FOCUS_X;
    let y = s[Y] + USER_FOCUS_Y;
    let sx = (s[ZX] / 100) * (s[MIR] ? -1 : 1);
    const sy = s[ZY] / 100;
    switch (s[FOC]) {
      case 1:
        x += T.x - TARGET_FOCUS_X;
        y += T.y - tHalf - TARGET_FOCUS_Y;
        break;
      case 2:
        x += U.x - USER_FOCUS_X;
        y += U.y - uHalf - USER_FOCUS_Y;
        break;
      case 3: {
        [x, y] = transform(x, y, src, dst);
        if (s[TGT] === 2 && reversed) sx *= -1;
        break;
      }
    }
    void idx;
    return { x, y, sx, sy, angle: -s[ANG] };
  };

  const depthFor = (pri: number, focus: number) => {
    if (pri === 0) return Math.min(U.depth, T.depth) + 0.5;
    if (pri === 2) return (focus === 2 ? U.depth : focus === 1 ? T.depth : 2) - 0.2;
    if (pri === 3) return (focus === 2 ? U.depth : focus === 1 ? T.depth : 8) + 0.2;
    return Math.max(U.depth, T.depth) + 1;
  };

  const blendOf = (b: number) => (b === 1 ? Phaser.BlendModes.ADD : b === 2 ? Phaser.BlendModes.MULTIPLY : Phaser.BlendModes.NORMAL);

  return new Promise(resolve => {
    let f = 0;
    const step = () => {
      if (f >= a.f.length) {
        scene.time.delayedCall((Math.max(0, extra) * frameMs) / 3, cleanup); // short tail so the HP bar follows quickly
        return;
      }
      if (f === 0) {
        realU.setVisible(false);
        realT.setVisible(false);
      }
      let g = 0;
      const cnt = [0, 0];
      for (const s of a.f[f]) {
        const tgt = s[TGT];
        const p = position(s, 0);
        if (tgt === 2) {
          if (!hasGraphic) continue;
          let sp = gfx[g];
          if (!sp) {
            sp = scene.add.sprite(0, 0, gKey, 0);
            field.add(sp);
            gfx.push(sp);
          }
          g++;
          const tex = scene.textures.get(gKey);
          const fr = tex.frameTotal > 1 ? Math.min(s[GF], tex.frameTotal - 2) : undefined;
          if (fr !== undefined) sp.setFrame(fr);
          sp.setPosition(p.x, p.y).setScale(p.sx, p.sy).setAngle(p.angle).setAlpha(s[OP] / 255).setVisible(!!s[VIS]).setBlendMode(blendOf(s[BLEND]));
          sp.setDepth(depthFor(s[PRI], s[FOC]));
          applyTone(sp, null, s[TONE]);
          if (s[TONE + 1]) {
            const c = s[TONE + 1];
            if (c[3] > 0) sp.setTintFill(Phaser.Display.Color.GetColor(c[0], c[1], c[2]));
          }
        } else {
          const isUser = tgt === 0;
          if (isUser && same) continue;
          const real = isUser ? realU : realT;
          const list = copies[tgt];
          const i = cnt[tgt]++;
          let c = list[i];
          if (!c) {
            const s2 = scene.add.sprite(0, 0, real.texture.key, real.frame.name).setOrigin(0.5, 0.5);
            const o = scene.add.sprite(0, 0, real.texture.key, real.frame.name).setOrigin(0.5, 0.5).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
            field.add(s2);
            field.add(o);
            c = { s: s2, o };
            list.push(c);
          }
          c.s.setFrame(real.frame.name);
          c.o.setFrame(real.frame.name);
          const vis = !!s[VIS];
          c.s.setPosition(p.x, p.y).setScale(p.sx * real.scaleX, p.sy * real.scaleY).setAngle(p.angle).setAlpha((s[OP] / 255) * real.alpha).setVisible(vis).setBlendMode(blendOf(s[BLEND]));
          c.o.setPosition(p.x, p.y).setScale(p.sx * real.scaleX, p.sy * real.scaleY).setAngle(p.angle);
          c.s.setDepth(isUser ? U.depth : T.depth);
          c.o.setDepth((isUser ? U.depth : T.depth) + 0.01);
          applyTone(c.s, vis ? c.o : null, s[TONE]);
          if (!vis) c.o.setVisible(false);
        }
      }
      // remove unused (non-locked) graphic sprites
      while (gfx.length > g) gfx.pop()!.destroy();
      for (const t of [0, 1]) {
        const list = copies[t];
        while (list.length > cnt[t]) {
          const c = list.pop()!;
          c.s.destroy();
          c.o.destroy();
        }
      }
      const evs = a.e?.[String(f)];
      if (evs) for (const ev of evs) handleEvent(ev);
      field.sort("depth");
      f++;
      scene.time.delayedCall(frameMs, step);
    };

    const handleEvent = (ev: any[]) => {
      const type = ev[0];
      if (type === "a") {
        bg?.destroy();
        const [, res, bx, by, op, dur] = ev;
        if (res && scene.textures.exists("anim:" + res)) bg = scene.add.tileSprite(bx - 320, by - 284, 896, 576, "anim:" + res).setOrigin(0, 0).setScale(1.25);
        else bg = scene.add.rectangle(bx - 320, by - 284, 896, 576, 0).setOrigin(0, 0).setScale(1.25);
        bg.setAlpha((op || 0) / 255).setDepth(2.5);
        field.add(bg);
        extra = Math.max(extra, (dur || 0) * 2);
      } else if (type === "u" && bg) {
        const [, , bx, by, op, dur] = ev;
        const props: any = {};
        if (bx !== null && bx !== undefined) props.x = bx * 0.5 - 320;
        if (by !== null && by !== undefined) props.y = by * 0.5 - 284;
        if (op !== null && op !== undefined) props.alpha = (op || 0) / 255;
        if (Object.keys(props).length) tweens.push(scene.tweens.add({ targets: bg, duration: Math.max(1, (dur || 0) * 3 * (1000 / 60)) / speed, ...props }));
        extra = Math.max(extra, (dur || 0) * 2);
      }
    };

    const cleanup = () => {
      for (const s of gfx) s.destroy();
      for (const t of [0, 1]) for (const c of copies[t]) {
        c.s.destroy();
        c.o.destroy();
      }
      for (const tw of tweens) tw.stop();
      bg?.destroy();
      realU.setVisible(true);
      realT.setVisible(true);
      resolve();
    };
    step();
  });
}
