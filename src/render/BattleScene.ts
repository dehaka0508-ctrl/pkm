// PokeRogue-style battle field rendered with Phaser.
import Phaser from "phaser";
import { arenaEntry, assetUrl, loadImage, pokemonEntry, trainerEntry, uiAtlas, type PackEntry, type UiAtlas } from "./assets";
import { playAnim, preloadAnim, type AnimActor } from "./anim";

export const S = 4; // pixels per field unit
export const FW = 320;
export const FH = 180;

const PLAYER_POS = { x: 106, y: 148 };
const ENEMY_POS = { x: 236, y: 84 };
const FONT = "Galmuri11, Galmuri9, monospace";

export interface MonView {
  name: string;
  spriteKey: string;
  level: number;
  gender: "M" | "F" | "";
  hp: number;
  maxhp: number;
  status: string;
  shiny?: boolean;
}

class InfoBox {
  c: Phaser.GameObjects.Container;
  name: Phaser.GameObjects.Text;
  hpBar: Phaser.GameObjects.Image;
  hpText?: Phaser.GameObjects.Text;
  lvText: Phaser.GameObjects.Text;
  status: Phaser.GameObjects.Image;
  tera: Phaser.GameObjects.Text;
  hp = 1;
  maxhp = 1;
  constructor(public scene: BattleScene, public player: boolean) {
    const s = scene;
    const pos = player ? { x: 310, y: 108 } : { x: 140, y: 39 };
    const p = player
      ? { nameX: -115, nameY: -15.2, lvX: -41, lvY: -10, hpX: -61, hpY: -1 }
      : { nameX: -124, nameY: -11.2, lvX: -50, lvY: -5, hpX: -71, hpY: 4.5 };
    this.c = s.add.container(pos.x, pos.y).setDepth(20);
    const box = s.add.image(0, 0, player ? "pbinfo_player" : "pbinfo_enemy_mini").setOrigin(1, 0.5);
    this.name = s.add.text(p.nameX, p.nameY, "", { fontFamily: FONT, fontSize: "9px", color: "#f8f8f8" }).setResolution(S).setShadow(0.6, 0.6, "#6b5a73", 0, false, true);
    this.lvText = s.add.text(p.lvX - 4, p.lvY - 4.5, "", { fontFamily: FONT, fontSize: "8px", color: "#f8f8f8" }).setResolution(S).setShadow(0.5, 0.5, "#6b5a73", 0, false, true);
    this.hpBar = s.add.image(p.hpX, p.hpY, "ui_hp", "high").setOrigin(0);
    const hpLabel = s.add.image(p.hpX - 1, p.hpY - 3, "hp_label").setOrigin(1, 0);
    this.status = s.add.image(p.nameX, p.nameY + 11.5, "ui_status", "burn").setOrigin(0).setVisible(false);
    this.tera = s.add.text(0, p.nameY + 0.5, "", { fontFamily: FONT, fontSize: "7px", color: "#9ff3ff" }).setResolution(S);
    this.c.add([box, this.name, this.lvText, this.hpBar, hpLabel, this.status, this.tera]);
    if (player) {
      this.hpText = s.add.text(-15, 7, "", { fontFamily: FONT, fontSize: "8px", color: "#f8f8f8", align: "right" }).setOrigin(1, 0).setResolution(S).setShadow(0.5, 0.5, "#6b5a73", 0, false, true);
      this.c.add(this.hpText);
    }
    this.c.setVisible(false);
  }
  set(m: MonView) {
    const g = m.gender === "M" ? " ♂" : m.gender === "F" ? " ♀" : "";
    this.name.setText(m.name + g);
    this.lvText.setText(`Lv.${m.level}`);
    this.tera.setText("").setX(this.name.x + this.name.width + 2);
    this.setHp(m.hp, m.maxhp, true);
    this.setStatus(m.status);
  }
  setTera(type: string) {
    this.tera.setText(`[${type}]`).setX(this.name.x + this.name.width + 2);
  }
  setStatus(st: string) {
    const map: Record<string, string> = { brn: "burn", par: "paralysis", psn: "poison", tox: "toxic", slp: "sleep", frz: "freeze", fnt: "faint" };
    const f = map[st];
    this.status.setVisible(!!f);
    if (f) this.status.setFrame(f);
  }
  private applyHp(hp: number) {
    const r = Math.max(0, Math.min(1, hp / this.maxhp));
    this.hpBar.setScale(r, 1).setFrame(r > 0.5 ? "high" : r > 0.25 ? "medium" : "low");
    if (this.hpText) this.hpText.setText(`${Math.max(0, Math.round(hp))}/${this.maxhp}`);
  }
  setHp(hp: number, maxhp: number, instant = false): Promise<void> {
    this.maxhp = maxhp;
    const from = this.hp;
    this.hp = hp;
    if (instant) {
      this.applyHp(hp);
      return Promise.resolve();
    }
    return new Promise(res => {
      this.scene.tweens.addCounter({
        from,
        to: hp,
        duration: Math.min(900, 250 + Math.abs(from - hp) * 6) / this.scene.speed,
        onUpdate: tw => this.applyHp(tw.getValue() ?? hp),
        onComplete: () => res(),
      });
    });
  }
}

export class BattleScene extends Phaser.Scene {
  speed = 1;
  moveAnims = true;
  field!: Phaser.GameObjects.Container;
  msgText!: Phaser.GameObjects.Text;
  msgBox!: Phaser.GameObjects.Image;
  infos!: [InfoBox, InfoBox];
  mons: [Phaser.GameObjects.Sprite | null, Phaser.GameObjects.Sprite | null] = [null, null];
  trainers: [Phaser.GameObjects.Sprite | null, Phaser.GameObjects.Sprite | null] = [null, null];
  ready: Promise<void>;
  private readyResolve!: () => void;
  arena = "plains";

  constructor() {
    super({ key: "battle" });
    this.ready = new Promise(r => (this.readyResolve = r));
  }

  preload() {
    const ui = (k: string, f: string) => this.load.image(k, assetUrl("ui/" + f));
    ui("pbinfo_player", "pbinfo_player.png");
    ui("pbinfo_enemy_mini", "pbinfo_enemy_mini.png");
    ui("hp_label", "overlay_hp_label_ko.png");
    ui("msg_bg", "bg.png");
  }

  async create() {
    // atlas UI textures from compact json
    await Promise.all([
      this.addUiAtlas("ui_hp", "overlay_hp"),
      this.addUiAtlas("ui_status", "statuses_ko"),
      this.addUiAtlas("ui_pb", "pb"),
      this.addUiAtlas("ui_stats", "battle_stats"),
    ]);
    const root = this.add.container(0, 0).setScale(S);
    this.field = this.add.container(0, 0);
    root.add(this.field);
    // message window
    const tex = this.textures.get("msg_bg");
    if (!tex.has("win")) tex.add("win", 0, 0, 0, 320, 48);
    this.msgBox = this.add.image(0, 132, "msg_bg", "win").setOrigin(0).setDepth(30);
    this.msgText = this.add
      .text(12, 139, "", { fontFamily: FONT, fontSize: "11px", color: "#f8f8f8", wordWrap: { width: 290, useAdvancedWrap: true }, lineSpacing: 3 })
      .setResolution(S)
      .setDepth(31)
      .setShadow(0.8, 0.8, "#6b5a73", 0, false, true);
    root.add([this.msgBox, this.msgText]);
    const infoE = new InfoBox(this, false);
    const infoP = new InfoBox(this, true);
    root.add([infoE.c, infoP.c]);
    this.infos = [infoP, infoE];
    root.sort("depth");
    this.readyResolve();
  }

  private async addUiAtlas(key: string, name: string) {
    const [atlas, img] = await Promise.all([uiAtlas(name), loadImage(assetUrl(`ui/${name}.png`))]);
    if (this.textures.exists(key)) return;
    const tex = this.textures.addImage(key, img)!;
    for (const [fname, f] of Object.entries((atlas as UiAtlas).f)) {
      const fr = tex.add(fname, 0, f[0], f[1], f[2], f[3]);
      if (f[6] !== f[2] || f[7] !== f[3]) fr?.setTrim(f[6], f[7], f[4], f[5], f[2], f[3]);
    }
  }

  async addPackTexture(key: string, entry: PackEntry | null, frameRate = 10): Promise<boolean> {
    if (!entry) return false;
    if (this.textures.exists(key)) return true;
    const img = await loadImage(entry.img);
    if (this.textures.exists(key)) return true;
    const tex = this.textures.addImage(key, img)!;
    const frames = entry.fr || [[0, 0, img.width, img.height, 0, 0, img.width, img.height]];
    frames.forEach((f, i) => {
      const fr = tex.add(String(i), 0, f[0], f[1], f[2], f[3]);
      fr?.setTrim(f[6], f[7], f[4], f[5], f[2], f[3]);
    });
    if (frames.length > 1 && !this.anims.exists(key)) {
      this.anims.create({ key, frames: frames.map((_, i) => ({ key, frame: String(i) })), frameRate, repeat: -1 });
    }
    return true;
  }

  async loadArena(biome: string) {
    this.arena = biome;
    const [bg, a, b] = await Promise.all([arenaEntry(`${biome}_bg`), arenaEntry(`${biome}_a`), arenaEntry(`${biome}_b`)]);
    await Promise.all([this.addPackTexture(`arena_bg_${biome}`, bg), this.addPackTexture(`arena_a_${biome}`, a, 12), this.addPackTexture(`arena_b_${biome}`, b, 12)]);
    const bgImg = this.add.sprite(0, 0, `arena_bg_${biome}`, "0").setOrigin(0).setDepth(0);
    const eb = this.add.sprite(20, 0, `arena_b_${biome}`, "0").setOrigin(0).setDepth(1);
    const pb = this.add.sprite(0, 0, `arena_a_${biome}`, "0").setOrigin(0).setDepth(2);
    if (this.anims.exists(`arena_b_${biome}`)) eb.play(`arena_b_${biome}`);
    if (this.anims.exists(`arena_a_${biome}`)) pb.play(`arena_a_${biome}`);
    this.field.add([bgImg, eb, pb]);
    this.field.sort("depth");
  }

  monKey(spriteKey: string, back: boolean) {
    return `pkmn_${back ? "b" : "f"}_${spriteKey}`;
  }

  async preloadMon(spriteKey: string, back: boolean) {
    const key = this.monKey(spriteKey, back);
    if (this.textures.exists(key)) return key;
    const e = await pokemonEntry(spriteKey, back);
    await this.addPackTexture(key, e);
    return key;
  }

  async preloadTrainer(key: string) {
    const k = "tr_" + key;
    if (this.textures.exists(k)) return k;
    const e = await trainerEntry(key);
    if (!(await this.addPackTexture(k, e, 8))) return null;
    return k;
  }

  preloadMoveAnim(key: string) {
    return preloadAnim(this, key);
  }

  wait(ms: number) {
    return new Promise<void>(r => this.time.delayedCall(ms / this.speed, () => r()));
  }

  tween(cfg: Phaser.Types.Tweens.TweenBuilderConfig): Promise<void> {
    return new Promise(res => {
      this.tweens.add({ ...cfg, duration: ((cfg.duration as number) ?? 300) / this.speed, onComplete: () => res() });
    });
  }

  async say(text: string, hold = 900) {
    this.msgText.setText(text);
    await this.wait(hold + Math.min(900, text.length * 18));
  }

  setMessage(text: string) {
    this.msgText.setText(text);
  }

  setMessageWidth(w: number) {
    this.msgText.setWordWrapWidth(w, true);
  }

  // ---------------------------------------------------------------- trainers
  async showTrainers(playerTrainer: string | string[] | null, enemyTrainer: string | null) {
    const ek = enemyTrainer ? await this.preloadTrainer(enemyTrainer) : null;
    // player candidates: trainer-specific back sprite first, then a generic one
    let pk: string | null = null;
    for (const key of Array.isArray(playerTrainer) ? playerTrainer : playerTrainer ? [playerTrainer] : []) {
      pk = await this.preloadTrainer(key).catch(() => null);
      if (pk) break;
    }
    if (ek) {
      const s = this.add.sprite(ENEMY_POS.x + 140, ENEMY_POS.y, ek, "0").setOrigin(0.5, 1).setDepth(3);
      if (this.anims.exists(ek)) s.play(ek);
      this.field.add(s);
      this.trainers[1] = s;
    }
    if (pk) {
      const s = this.add.sprite(PLAYER_POS.x - 140, PLAYER_POS.y, pk, "0").setOrigin(0.5, 1).setDepth(4);
      this.field.add(s);
      this.trainers[0] = s;
    }
    this.field.sort("depth");
    await Promise.all([
      this.trainers[1] ? this.tween({ targets: this.trainers[1], x: ENEMY_POS.x, duration: 700, ease: "Sine.easeOut" }) : null,
      this.trainers[0] ? this.tween({ targets: this.trainers[0], x: PLAYER_POS.x, duration: 700, ease: "Sine.easeOut" }) : null,
    ]);
  }

  async hideTrainer(side: 0 | 1) {
    const t = this.trainers[side];
    if (!t) return;
    await this.tween({ targets: t, x: side === 0 ? t.x - 130 : t.x + 130, alpha: 0, duration: 450 });
    t.destroy();
    this.trainers[side] = null;
  }

  async showTrainerAgain(side: 0 | 1, key: string | null) {
    if (!key) return;
    const k = await this.preloadTrainer(key);
    if (!k) return;
    const pos = side === 0 ? PLAYER_POS : ENEMY_POS;
    const s = this.add.sprite(pos.x + (side === 0 ? -100 : 100), pos.y, k, "0").setOrigin(0.5, 1).setDepth(side === 0 ? 4 : 3).setAlpha(0);
    if (this.anims.exists(k)) s.play(k);
    this.field.add(s);
    this.field.sort("depth");
    this.trainers[side] = s;
    await this.tween({ targets: s, x: pos.x, alpha: 1, duration: 500 });
  }

  // ---------------------------------------------------------------- pokemon
  async sendOut(side: 0 | 1, m: MonView) {
    const back = side === 0;
    const key = await this.preloadMon(m.spriteKey, back);
    const pos = side === 0 ? PLAYER_POS : ENEMY_POS;
    // poké ball arc
    const ball = this.add.sprite(side === 0 ? pos.x - 50 : pos.x + 40, side === 0 ? pos.y - 50 : pos.y - 70, "ui_pb", "pb").setDepth(6);
    this.field.add(ball);
    await this.tween({ targets: ball, x: pos.x, y: pos.y - 20, angle: 360, duration: 420, ease: "Quad.easeIn" });
    ball.setFrame("pb_opening");
    await this.wait(60);
    ball.setFrame("pb_open");
    const old = this.mons[side];
    if (old) old.destroy();
    const sp = this.add.sprite(pos.x, pos.y, key, "0").setOrigin(0.5, 1).setDepth(side === 0 ? 4 : 3).setScale(0.2).setTintFill(0xffffff);
    if (this.anims.exists(key)) sp.play(key);
    this.field.add(sp);
    this.field.sort("depth");
    this.mons[side] = sp;
    await this.tween({ targets: sp, scale: 1, duration: 260, ease: "Back.easeOut" });
    sp.clearTint();
    ball.destroy();
    this.infos[side].set(m);
    this.infos[side].c.setVisible(true);
    this.infos[side].c.x += side === 0 ? 60 : -60;
    await this.tween({ targets: this.infos[side].c, x: side === 0 ? 310 : 140, duration: 240 });
  }

  async recall(side: 0 | 1) {
    const sp = this.mons[side];
    if (!sp) return;
    sp.setTintFill(0xff5050);
    await this.tween({ targets: sp, scale: 0.1, alpha: 0.2, duration: 260 });
    sp.destroy();
    this.mons[side] = null;
    this.infos[side].c.setVisible(false);
  }

  async changeForm(side: 0 | 1, spriteKey: string, flash = true) {
    const sp = this.mons[side];
    if (!sp) return;
    const key = await this.preloadMon(spriteKey, side === 0);
    if (flash) {
      sp.setTintFill(0xffffff);
      await this.tween({ targets: sp, scaleX: 1.15, scaleY: 1.15, duration: 200, yoyo: true });
    }
    sp.setTexture(key, "0");
    if (this.anims.exists(key)) sp.play(key);
    sp.clearTint();
  }

  actor(side: 0 | 1): AnimActor | null {
    const sp = this.mons[side];
    if (!sp) return null;
    const pos = side === 0 ? PLAYER_POS : ENEMY_POS;
    return { x: pos.x, y: pos.y, sprite: sp, depth: sp.depth, isPlayer: side === 0 };
  }

  async moveAnim(key: string, user: 0 | 1, target: 0 | 1) {
    if (!this.moveAnims) return;
    const u = this.actor(user);
    const t = this.actor(target) || u;
    if (!u || !t) return;
    const a = await preloadAnim(this, key);
    if (!a) return;
    await playAnim(this, this.field, a, u, t, this.speed);
  }

  async hit(side: 0 | 1, strong = false) {
    const sp = this.mons[side];
    if (!sp) return;
    for (let i = 0; i < (strong ? 4 : 3); i++) {
      sp.setAlpha(0.1);
      await this.wait(55);
      sp.setAlpha(1);
      await this.wait(55);
    }
  }

  setHp(side: 0 | 1, hp: number, maxhp: number) {
    return this.infos[side].setHp(hp, maxhp);
  }

  setStatus(side: 0 | 1, st: string) {
    this.infos[side].setStatus(st);
  }

  setTera(side: 0 | 1, label: string) {
    this.infos[side].setTera(label);
  }

  async faint(side: 0 | 1) {
    const sp = this.mons[side];
    if (!sp) return;
    await this.tween({ targets: sp, y: sp.y + 30, alpha: 0, duration: 420, ease: "Quad.easeIn" });
    sp.destroy();
    this.mons[side] = null;
    await this.tween({ targets: this.infos[side].c, alpha: 0, duration: 200 });
    this.infos[side].c.setVisible(false).setAlpha(1);
  }

  async statChange(side: 0 | 1, up: boolean, stat: string) {
    const sp = this.mons[side];
    if (!sp) return;
    const frame = ({ atk: "atk", def: "def", spa: "spatk", spd: "spdef", spe: "spd", accuracy: "acc", evasion: "eva" } as Record<string, string>)[stat] || "mix";
    const w = sp.displayWidth;
    const h = sp.displayHeight;
    const ts = this.add.tileSprite(sp.x, sp.y - h / 2, w, h, "ui_stats", frame).setAlpha(0.65).setDepth(sp.depth + 0.1).setBlendMode(Phaser.BlendModes.ADD);
    if (this.game.renderer.type === Phaser.WEBGL) {
      const mask = sp.createBitmapMask();
      ts.setMask(mask);
    }
    this.field.add(ts);
    this.field.sort("depth");
    await this.tween({ targets: ts, tilePositionY: up ? 64 : -64, duration: 700 });
    ts.destroy();
  }

  async shake(intensity = 0.006) {
    this.cameras.main.shake(220 / this.speed, intensity);
    await this.wait(220);
  }
}
