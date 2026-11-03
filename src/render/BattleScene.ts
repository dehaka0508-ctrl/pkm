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
  /** player side: progress to next level (0..1) for the EXP bar */
  exp?: number;
}

const PB_TINT = 0xd52929;

class InfoBox {
  c: Phaser.GameObjects.Container;
  name: Phaser.GameObjects.Text;
  hpBar: Phaser.GameObjects.Image;
  hpNums?: Phaser.GameObjects.Container;
  lvNums: Phaser.GameObjects.Container;
  expBar?: Phaser.GameObjects.Image;
  status: Phaser.GameObjects.Image;
  tera: Phaser.GameObjects.Text;
  hp = 1;
  maxhp = 1;
  baseX = 0;
  box!: Phaser.GameObjects.Image;
  private shifted: Phaser.GameObjects.GameObject[] = [];
  private mini = false;
  constructor(public scene: BattleScene, public player: boolean) {
    const s = scene;
    const pos = player ? { x: 310, y: 108 } : { x: 140, y: 39 };
    const p = player
      ? { nameX: -115, nameY: -15.2, lvX: -41, lvY: -10, hpX: -61, hpY: -1 }
      : { nameX: -124, nameY: -11.2, lvX: -50, lvY: -5, hpX: -71, hpY: 4.5 };
    this.c = s.add.container(pos.x, pos.y).setDepth(20);
    const box = s.add.image(0, 0, player ? "pbinfo_player" : "pbinfo_enemy_mini").setOrigin(1, 0.5);
    this.box = box;
    this.name = s.add.text(p.nameX, p.nameY, "", { fontFamily: FONT, fontSize: "9px", color: "#f8f8f8" }).setResolution(S).setShadow(0.6, 0.6, "#6b5a73", 0, false, true);
    // level: "Lv" overlay + number images, as in PokeRogue's battle-info
    const lvC = s.add.container(p.lvX, p.lvY);
    lvC.add(s.add.image(5.5, 0, "lv_label").setOrigin(1, 0.5));
    this.lvNums = s.add.container(9.5, -0.5);
    lvC.add(this.lvNums);
    this.hpBar = s.add.image(p.hpX, p.hpY, "ui_hp", "high").setOrigin(0);
    const hpLabel = s.add.image(p.hpX - 1, p.hpY - 3, "hp_label").setOrigin(1, 0);
    this.status = s.add.image(p.nameX, p.nameY + 11.5, "ui_status", "burn").setOrigin(0).setVisible(false);
    this.tera = s.add.text(0, p.nameY + 0.5, "", { fontFamily: FONT, fontSize: "7px", color: "#9ff3ff" }).setResolution(S);
    this.c.add([box, this.name, lvC, this.hpBar, hpLabel, this.status, this.tera]);
    this.shifted = [this.name, lvC, this.status, this.tera];
    if (player) {
      this.hpNums = s.add.container(-15, 10);
      const expLabel = s.add.image(-91, 20, "exp_label").setOrigin(1, 1);
      this.expBar = s.add.image(-98, 18, "exp_bar").setOrigin(0);
      this.c.add([this.hpNums, expLabel, this.expBar]);
    }
    this.c.setVisible(false);
    this.baseX = pos.x;
  }
  /**
   * Doubles layout, as PokeRogue's battle-info setMini / setOffset: both boxes go mini (the player's
   * loses its HP numbers and EXP bar and moves up 12), and the right-hand Pokémon's box is offset
   * by (±10, +27).
   */
  place(doubles: boolean, pos: number) {
    const mini = doubles && this.player;
    if (mini !== this.mini) {
      this.mini = mini;
      this.box.setTexture(mini ? "pbinfo_player_mini" : "pbinfo_player");
      this.shifted.forEach((el: any) => (el.y += 1.5 * (mini ? -1 : 1)));
      [this.hpNums, this.expBar, this.c.list.find((o: any) => o.texture?.key === "exp_label")].forEach((el: any) => el?.setVisible(!mini));
    }
    const base = this.player ? { x: 310, y: 108 } : { x: 140, y: 39 };
    let x = base.x;
    let y = base.y - (mini ? 12 : 0);
    if (doubles && pos === 1) {
      x += this.player ? 10 : -10;
      y += 27;
    }
    this.baseX = x;
    this.c.setPosition(x, y);
  }
  set(m: MonView) {
    const g = m.gender === "M" ? " ♂" : m.gender === "F" ? " ♀" : "";
    this.name.setText(m.name + g);
    this.lvNums.removeAll(true);
    String(m.level)
      .split("")
      .forEach((d, i) => this.lvNums.add(this.scene.add.image(i * 8, 0, "ui_num", d)));
    this.expBar?.setScale(Math.max(0, Math.min(1, m.exp ?? 0)), 1);
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
    if (this.hpNums) {
      // "hp/max" drawn right-to-left with PokeRogue's number images
      this.hpNums.removeAll(true);
      const str = `${Math.max(0, Math.ceil(hp))}/${this.maxhp}`;
      let off = 0;
      for (let i = str.length - 1; i >= 0; i--) this.hpNums.add(this.scene.add.image(off++ * -8, 0, "ui_num", str[i]));
    }
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
      // PokeRogue: |ΔHP| × 5 ms, clamped to 250–5000 ms, Sine.easeOut
      const realDelta = Math.abs(from - hp) * (maxhp === 100 && !this.player ? 1.6 : 1);
      this.scene.tweens.addCounter({
        from,
        to: hp,
        ease: "Sine.easeOut",
        duration: Phaser.Math.Clamp(realDelta * 5, 250, 5000) / this.scene.speed,
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
  /** field positions: 0 player, 1 enemy, 2 player right, 3 enemy right (2–3 only in doubles) */
  infos!: InfoBox[];
  mons: (Phaser.GameObjects.Sprite | null)[] = [null, null, null, null];
  doubles = false;
  trainers: [Phaser.GameObjects.Sprite | null, Phaser.GameObjects.Sprite | null] = [null, null];
  trainerKeys: [string | null, string | null] = [null, null];
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
    ui("pbinfo_player_mini", "pbinfo_player_mini.png");
    ui("pbinfo_enemy_mini", "pbinfo_enemy_mini.png");
    ui("hp_label", "overlay_hp_label_ko.png");
    ui("msg_bg", "bg.png");
    ui("lv_label", "overlay_lv_ko.png");
    ui("exp_label", "overlay_exp_label_ko.png");
    ui("exp_bar", "overlay_exp.png");
  }

  async create() {
    // atlas UI textures from compact json
    await Promise.all([
      this.addUiAtlas("ui_hp", "overlay_hp"),
      this.addUiAtlas("ui_status", "statuses_ko"),
      this.addUiAtlas("ui_pb", "pb"),
      this.addUiAtlas("ui_stats", "battle_stats"),
      this.addUiAtlas("ui_num", "numbers"),
      this.addUiAtlas("ui_pbp", "pb_particles"),
    ]);
    if (!this.anims.exists("pb_open_particle"))
      this.anims.create({ key: "pb_open_particle", frames: ["0", "1", "2", "3"].map(frame => ({ key: "ui_pbp", frame })), frameRate: 16, repeat: -1 });
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
    const infoE2 = new InfoBox(this, false);
    const infoP2 = new InfoBox(this, true);
    root.add([infoE2.c, infoE.c, infoP.c, infoP2.c]);
    this.infos = [infoP, infoE, infoP2, infoE2];
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
      const delay = typeof cfg.delay === "number" ? cfg.delay / this.speed : cfg.delay;
      this.tweens.add({ ...cfg, delay, duration: ((cfg.duration as number) ?? 300) / this.speed, onComplete: () => res() });
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
    this.trainerKeys = [pk, ek];
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
  /** Where a field position stands (PokeRogue doubles: left −32/−8, right +32/0). */
  posOf(who: number): { x: number; y: number } {
    const base = who % 2 === 0 ? PLAYER_POS : ENEMY_POS;
    if (!this.doubles) return base;
    const [dx, dy] = who >= 2 ? [32, 0] : [-32, -8];
    return { x: base.x + dx, y: base.y + dy };
  }
  private depthOf(who: number) {
    return (who % 2 === 0 ? 4 : 3) + (who >= 2 ? 0.5 : 0);
  }
  /** Player trainer throws the first ball (PokeRogue summon-phase): throw frames, then slide off to the left. */
  async playerThrow() {
    const t = this.trainers[0];
    if (!t) return;
    const base = (this.trainerKeys[0] || "").replace(/^tr_/, "");
    if (/^trainer_[mf]_back$/.test(base)) {
      const pbKey = await this.preloadTrainer(`${base}_pb`).catch(() => null);
      if (pbKey) {
        t.stop();
        t.setTexture(pbKey, "0");
        this.time.delayedCall(562 / this.speed, () => t.active && t.setFrame("1"));
        this.time.delayedCall(626 / this.speed, () => t.active && t.setFrame("2"));
      }
    }
    this.tweens.add({ targets: t, x: -36, duration: 1000 / this.speed, onComplete: () => t.destroy() });
    this.trainers[0] = null;
    await this.wait(750);
  }

  /** Poké Ball open particles (PokeRogue doDefaultPbOpenParticles). */
  private pbParticles(x: number, y: number, radius = 48) {
    let n = 0;
    this.time.addEvent({
      delay: 20 / this.speed,
      repeat: 16,
      callback: () => {
        const i = ++n;
        const p = this.add.sprite(x, y, "ui_pbp", "0").setDepth(7);
        this.field.add(p);
        const ang = (i * 45 * Math.PI) / 180;
        this.tweens.add({ targets: p, x: x + radius * Math.cos(ang), y: y + radius * Math.sin(ang), duration: 575 / this.speed });
        p.play({ key: "pb_open_particle", startFrame: (i + 3) % 4, frameRate: 16 * this.speed });
        this.tweens.add({ targets: p, delay: 500 / this.speed, duration: 75 / this.speed, alpha: 0, ease: "Sine.easeIn", onComplete: () => p.destroy() });
      },
    });
  }

  /** A same-texture overlay filled with a colour, for PokeRogue-style tint in / tint out. */
  private tintOverlay(sp: Phaser.GameObjects.Sprite, color: number, alpha: number) {
    const o = this.add.sprite(sp.x, sp.y, sp.texture.key, sp.frame.name).setOrigin(sp.originX, sp.originY).setDepth(sp.depth + 0.05).setScale(sp.scaleX, sp.scaleY).setTintFill(color).setAlpha(alpha);
    this.field.add(o);
    this.field.sort("depth");
    return o;
  }

  async sendOut(who: number, m: MonView) {
    const side = who % 2;
    const back = side === 0;
    const key = await this.preloadMon(m.spriteKey, back);
    const pos = this.posOf(who);
    const dx = pos.x - (side === 0 ? PLAYER_POS.x : ENEMY_POS.x);
    // PokeRogue summon: arc from the thrower, short rise, then a spinning drop onto the spot
    const ball = this.add.sprite(side === 0 ? 36 : 248, side === 0 ? 80 : 44, "ui_pb", "pb").setOrigin(0.5, 0.625).setDepth(6);
    this.field.add(ball);
    this.field.sort("depth");
    const landY = pos.y - 16;
    await Promise.all([
      this.tween({ targets: ball, x: (side === 0 ? 100 : 236) + dx, duration: 650 }),
      (async () => {
        await this.tween({ targets: ball, y: side === 0 ? 70 : 34, duration: 150, ease: "Cubic.easeOut" });
        await this.tween({ targets: ball, y: landY, angle: 1440, duration: 500, ease: "Cubic.easeIn" });
      })(),
    ]);
    ball.destroy();
    const old = this.mons[who];
    if (old) old.destroy();
    this.pbParticles(pos.x, landY);
    const sp = this.add.sprite(pos.x, pos.y, key, "0").setOrigin(0.5, 1).setDepth(this.depthOf(who)).setScale(0.5);
    if (this.anims.exists(key)) sp.play(key);
    this.field.add(sp);
    this.field.sort("depth");
    this.mons[who] = sp;
    const glow = this.tintOverlay(sp, PB_TINT, 1);
    await Promise.all([this.tween({ targets: [sp, glow], scale: 1, duration: 250, ease: "Sine.easeIn" }), this.tween({ targets: glow, alpha: 0, duration: 250, ease: "Sine.easeIn" })]);
    glow.destroy();
    const info = this.infos[who];
    info.place(this.doubles, who >= 2 ? 1 : 0);
    info.set(m);
    info.c.setVisible(true);
    info.c.x = info.baseX + (side === 0 ? 150 : -150);
    void this.tween({ targets: info.c, x: info.baseX, duration: 1000, ease: "Cubic.easeOut" });
  }

  /** PokeRogue switch-out: tint to the ball colour while shrinking to half size. */
  async recall(who: number) {
    const sp = this.mons[who];
    if (!sp) return;
    const glow = this.tintOverlay(sp, PB_TINT, 0);
    await Promise.all([this.tween({ targets: [sp, glow], scale: 0.5, duration: 250, ease: "Sine.easeIn" }), this.tween({ targets: glow, alpha: 1, duration: 250, ease: "Sine.easeIn" })]);
    await this.tween({ targets: [sp, glow], alpha: 0, duration: 120 });
    glow.destroy();
    sp.destroy();
    this.mons[who] = null;
    await this.hideInfo(who);
  }

  /** Transform / Imposter: the sprite squeezes to a line, turns into the target, and springs back. */
  async transformTo(who: number, spriteKey: string) {
    const sp = this.mons[who];
    if (!sp) return;
    const key = await this.preloadMon(spriteKey, who % 2 === 0);
    const glow = this.tintOverlay(sp, 0xffffff, 0);
    await Promise.all([this.tween({ targets: glow, alpha: 1, duration: 200 }), this.tween({ targets: [sp, glow], scaleX: 1.1, scaleY: 0.9, duration: 200, ease: "Sine.easeOut" })]);
    await this.tween({ targets: [sp, glow], scaleX: 0.05, scaleY: 1.15, duration: 180, ease: "Sine.easeIn" });
    this.swapTexture(sp, key);
    glow.setTexture(key, "0");
    await this.tween({ targets: [sp, glow], scaleX: 1, scaleY: 1, duration: 260, ease: "Back.easeOut" });
    await this.tween({ targets: glow, alpha: 0, duration: 260 });
    glow.destroy();
  }

  /** Swaps a battler's texture; the old frame animation must stop or it keeps drawing the old form. */
  private swapTexture(sp: Phaser.GameObjects.Sprite, key: string) {
    sp.anims.stop();
    sp.setTexture(key, "0");
    if (this.anims.exists(key)) sp.play(key);
  }

  /**
   * Mega Evolution / form change, after PokeRogue's QuietFormChangePhase:
   * the old form glows white, shrinks away while the new form grows out of a white silhouette,
   * then the glow fades.
   */
  async changeForm(who: number, spriteKey: string, flash = true) {
    const sp = this.mons[who];
    if (!sp) return;
    const key = await this.preloadMon(spriteKey, who % 2 === 0);
    if (!flash) {
      this.swapTexture(sp, key);
      return;
    }
    const oldGlow = this.tintOverlay(sp, 0xffffff, 0);
    await this.tween({ targets: oldGlow, alpha: 1, duration: 1000, ease: "Cubic.easeIn" });
    sp.setVisible(false);
    this.swapTexture(sp, key);
    const newGlow = this.add.sprite(sp.x, sp.y, key, "0").setOrigin(sp.originX, sp.originY).setDepth(sp.depth + 0.05).setTintFill(0xffffff).setScale(0.01);
    this.field.add(newGlow);
    this.field.sort("depth");
    await Promise.all([
      this.tween({ targets: oldGlow, scale: 0.01, duration: 500, delay: 250, ease: "Cubic.easeInOut" }),
      this.tween({ targets: newGlow, scale: 1, duration: 500, delay: 250,  ease: "Cubic.easeInOut" }),
    ]);
    oldGlow.destroy();
    sp.setVisible(true);
    await this.tween({ targets: newGlow, alpha: 0, duration: 1000, delay: 250, ease: "Cubic.easeOut" });
    newGlow.destroy();
  }

  actor(who: number): AnimActor | null {
    const sp = this.mons[who];
    if (!sp) return null;
    const pos = this.posOf(who);
    return { x: pos.x, y: pos.y, sprite: sp, depth: sp.depth, isPlayer: who % 2 === 0 };
  }

  async moveAnim(key: string, user: number, target: number) {
    if (!this.moveAnims) return;
    const u = this.actor(user);
    const t = this.actor(target) || u;
    if (!u || !t) return;
    const a = await preloadAnim(this, key);
    if (!a) return;
    await playAnim(this, this.field, a, u, t, this.speed);
  }

  /** PokeRogue DamageAnimPhase: the sprite blinks (visibility toggled every 100 ms, 6 times). */
  async hit(who: number, _strong = false) {
    const sp = this.mons[who];
    if (!sp) return;
    for (let i = 0; i < 6; i++) {
      sp.setVisible(i % 2 === 1);
      await this.wait(100);
    }
    sp.setVisible(true);
  }

  /** PokeRogue Pokemon.hideInfo: the info box slides 150 px off-screen (500 ms, Cubic.easeIn). */
  async hideInfo(who: number) {
    const info = this.infos[who];
    if (!info.c.visible) return;
    await this.tween({ targets: info.c, x: info.baseX + (who % 2 === 0 ? 150 : -150), duration: 500, ease: "Cubic.easeIn" });
    info.c.setVisible(false);
    info.c.x = info.baseX;
  }

  setHp(who: number, hp: number, maxhp: number) {
    return this.infos[who].setHp(hp, maxhp);
  }

  setStatus(who: number, st: string) {
    this.infos[who].setStatus(st);
  }

  setTera(who: number, label: string) {
    this.infos[who].setTera(label);
  }

  async faint(who: number) {
    const sp = this.mons[who];
    if (!sp) return;
    const hide = this.hideInfo(who);
    await this.tween({ targets: sp, y: sp.y + 150, duration: 500, ease: "Sine.easeIn" });
    sp.destroy();
    this.mons[who] = null;
    await hide;
  }

  async statChange(who: number, up: boolean, stat: string) {
    const sp = this.mons[who];
    if (!sp) return;
    void stat;
    const frame = up ? "atk" : "spd";
    const w = sp.displayWidth;
    const h = sp.displayHeight;
    const ts = this.add.tileSprite(sp.x, sp.y - h / 2, w, h, "ui_stats", frame).setAlpha(0).setDepth(sp.depth + 0.1);
    if (this.game.renderer.type === Phaser.WEBGL) {
      const mask = sp.createBitmapMask();
      ts.setMask(mask);
    }
    this.field.add(ts);
    this.field.sort("depth");
    await this.tween({ targets: ts, alpha: 0.8375, duration: 250 });
    await this.tween({ targets: ts, tilePositionY: up ? 160 : -160, duration: 1500 });
    await this.tween({ targets: ts, alpha: 0, duration: 250 });
    ts.destroy();
  }

  // ---------------------------------------------------------------- target selection (PokeRogue TargetSelectUiHandler)
  private targetTweens: Phaser.Tweens.Tween[] = [];
  private targetInfoY: [Phaser.GameObjects.Container, number][] = [];
  /** The chosen target(s) blink (alpha 1 ↔ 0.25) and their info boxes bob by a pixel, at a fixed pace. */
  highlightTargets(whos: number[]) {
    this.clearTargets();
    for (const w of whos) {
      const sp = this.mons[w];
      if (sp) {
        this.targetTweens.push(
          this.tweens.addCounter({ from: 1, to: 0.25, duration: 450, ease: "Sine.easeInOut", yoyo: true, loop: -1, loopDelay: 150, onUpdate: t => sp.active && sp.setAlpha(t.getValue() ?? 1) }),
        );
      }
      const info = this.infos[w]?.c;
      if (info?.visible) {
        this.targetInfoY.push([info, info.y]);
        this.targetTweens.push(this.tweens.add({ targets: info, y: info.y + 1, duration: 250, ease: "Linear", yoyo: true, loop: -1 }));
      }
    }
  }
  clearTargets() {
    for (const t of this.targetTweens) t.stop();
    this.targetTweens = [];
    for (const [c, y] of this.targetInfoY) c.y = y;
    this.targetInfoY = [];
    for (const sp of this.mons) if (sp?.active) sp.setAlpha(1);
  }
  /** Screen box of a field position's Pokémon (layer units), for tapping it. */
  targetBox(who: number): { x: number; y: number; w: number; h: number } | null {
    const sp = this.mons[who];
    if (!sp) return null;
    const pos = this.posOf(who);
    const w = Math.max(40, sp.displayWidth * 0.8);
    const h = Math.max(40, sp.displayHeight * 0.9);
    return { x: pos.x - w / 2, y: pos.y - h, w, h };
  }

  async shake(intensity = 0.006) {
    this.cameras.main.shake(220 / this.speed, intensity);
    await this.wait(220);
  }
}
