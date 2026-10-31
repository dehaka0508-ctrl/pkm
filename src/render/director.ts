// Turns simulator log lines into animations + Korean battle messages.
import { dex, koAbility, koItem, koMove, koSpecies, koType, josa, moveAnimKey, spriteKey } from "../data/dex";
import type { BattleSession, MatchResult } from "../battle/engine";
import type { TeamMember } from "../game/types";
import type { BattleScene } from "./BattleScene";

export interface SideView {
  trainerName: string;
  trainerSprite: string | null;
  team: TeamMember[];
}

interface SlotState {
  species: string;
  hp: number;
  maxhp: number;
  status: string;
}

const STAT_KO: Record<string, string> = { atk: "공격", def: "방어", spa: "특수공격", spd: "특수방어", spe: "스피드", accuracy: "명중률", evasion: "회피율" };
const STATUS_ON: Record<string, string> = {
  brn: "화상을 입었다!", par: "마비되어 기술이 나오기 어려워졌다!", psn: "독에 걸렸다!", tox: "맹독을 입었다!", slp: "잠들어 버렸다!", frz: "얼어붙었다!",
};
const STATUS_ANIM: Record<string, string> = { brn: "common-burn", par: "common-paralysis", psn: "common-poison", tox: "common-toxic", slp: "common-sleep", frz: "common-frozen" };
const WEATHER: Record<string, [string, string, string]> = {
  sunnyday: ["햇살이 강해졌다!", "햇살이 원래대로 돌아왔다!", "common-sunny"],
  desolateland: ["햇살이 아주 강해졌다!", "아주 강한 햇살이 사라졌다!", "common-harsh-sun"],
  raindance: ["비가 내리기 시작했다!", "비가 그쳤다!", "common-rain"],
  primordialsea: ["강한 비가 내리기 시작했다!", "강한 비가 그쳤다!", "common-heavy-rain"],
  sandstorm: ["모래바람이 불기 시작했다!", "모래바람이 가라앉았다!", "common-sandstorm"],
  hail: ["싸라기눈이 내리기 시작했다!", "싸라기눈이 그쳤다!", "common-hail"],
  snow: ["눈이 내리기 시작했다!", "눈이 그쳤다!", "common-snow"],
  deltastream: ["수수께끼의 난기류가 비행 포켓몬을 지킨다!", "난기류가 사라졌다!", "common-strong-winds"],
};
const TERRAIN: Record<string, [string, string]> = {
  electricterrain: ["발밑에 전기가 흐르기 시작했다!", "common-electric-terrain"],
  grassyterrain: ["발밑에 풀이 무성해졌다!", "common-grassy-terrain"],
  mistyterrain: ["발밑에 안개가 자욱해졌다!", "common-misty-terrain"],
  psychicterrain: ["발밑이 이상한 느낌이 되었다!", "common-psychic-terrain"],
  trickroom: ["시공간이 뒤틀렸다!", ""],
};

const idOf = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export class BattleDirector {
  slots: [Record<number, SlotState>, Record<number, SlotState>] = [{}, {}];
  active: [number | null, number | null] = [null, null];
  firstOut: [boolean, boolean] = [true, true];
  pendingMsgs: string[] = [];
  skipping = false;
  stopped = false;
  private lastMoveUser: 0 | 1 = 0;

  constructor(
    public scene: BattleScene,
    public session: BattleSession,
    public sides: [SideView, SideView],
    public requestCommand: (side: number) => Promise<string>,
    public isHuman: () => boolean,
  ) {
    sides.forEach((sv, i) =>
      sv.team.forEach((m, j) => {
        this.slots[i][j] = { species: m.species, hp: 1, maxhp: 1, status: "" };
      }),
    );
  }

  private parseIdent(id: string): { side: 0 | 1; slot: number } | null {
    const m = id.match(/^p([12])[a-z]?: m(\d)/);
    if (!m) return null;
    return { side: (Number(m[1]) - 1) as 0 | 1, slot: Number(m[2]) };
  }

  monName(side: 0 | 1, slot: number, withPrefix = true): string {
    const m = this.sides[side].team[slot];
    const st = this.slots[side][slot];
    const base = m?.nickname || koSpecies(st?.species || m?.species);
    return side === 1 && withPrefix ? `상대 ${base}` : base;
  }

  private nm(id: string): string {
    const p = this.parseIdent(id);
    return p ? this.monName(p.side, p.slot) : id;
  }

  private parseHp(s: string): { hp: number; maxhp: number; status: string } {
    const [hpPart, status] = s.split(" ");
    if (hpPart === "0" || status === "fnt") return { hp: 0, maxhp: -1, status: "fnt" };
    const [hp, max] = hpPart.split("/").map(Number);
    return { hp, maxhp: max || 100, status: status || "" };
  }

  private async say(text: string, hold = 700) {
    if (this.skipping) return;
    await this.scene.say(text, hold);
  }

  private async flushPending() {
    const msgs = this.pendingMsgs;
    this.pendingMsgs = [];
    for (const m of msgs) await this.say(m, 600);
  }

  /** Main loop. Resolves with the match result. */
  async run(): Promise<MatchResult> {
    const s = this.scene;
    await s.ready;
    await s.showTrainers(this.sides[0].trainerSprite, this.sides[1].trainerSprite);
    await this.say(`${josa(this.sides[1].trainerName, "이가")} 승부를 걸어왔다!`, 900);
    let guard = 0;
    while (guard++ < 5000 && !this.stopped) {
      const lines = this.session.drainLog();
      await this.playLines(lines);
      if (this.session.ended) break;
      if (this.isHuman() && !this.skipping) {
        const side = this.session.humanPending();
        if (side >= 0) {
          await this.flushPending();
          const req = this.session.request(side);
          s.setMessage(req?.forceSwitch ? "다음 포켓몬을 골라 주세요." : `${josa(this.monName(0, this.active[0] ?? 0), "은는")} 무엇을 할까?`);
          s.setMessageWidth(128);
          let ok = false;
          while (!ok && !this.stopped && !this.skipping) {
            const choice = await this.requestCommand(side);
            if (choice === "__ai__" || this.skipping || this.stopped) break;
            ok = this.session.choose(side, choice);
          }
          s.setMessageWidth(290);
        }
      }
      this.session.stepAI(!this.isHuman() || this.skipping);
    }
    if (!this.session.ended) this.session.runToEnd();
    await this.playLines(this.session.drainLog());
    return this.session.result();
  }

  async playLines(lines: string[]) {
    for (let i = 0; i < lines.length; i++) {
      if (this.stopped) return;
      let line = lines[i];
      if (line.startsWith("|split|")) {
        // next line = exact (secret) info, the one after = public duplicate
        line = lines[i + 1];
        i += 2;
      }
      try {
        await this.handle(line);
      } catch (e) {
        console.warn("line failed", line, e);
      }
    }
  }

  private async handle(line: string) {
    if (!line || line[0] !== "|") return;
    const parts = line.slice(1).split("|");
    const cmd = parts[0];
    const args = parts.slice(1).filter(a => !a.startsWith("["));
    const kw: Record<string, string> = {};
    for (const a of parts.slice(1)) if (a.startsWith("[")) {
      const m = a.match(/^\[(\w+)\]\s*(.*)$/);
      if (m) kw[m[1]] = m[2];
    }
    const s = this.scene;
    const fast = this.skipping;

    switch (cmd) {
      case "switch":
      case "drag":
      case "replace": {
        const p = this.parseIdent(args[0]);
        if (!p) return;
        await this.flushPending();
        const hp = this.parseHp(args[2] || "1/1");
        const species = args[1].split(",")[0];
        const st = this.slots[p.side][p.slot];
        st.species = dex.species.get(species).name;
        st.hp = hp.hp;
        st.maxhp = hp.maxhp > 0 ? hp.maxhp : st.maxhp;
        st.status = hp.status;
        const prev = this.active[p.side];
        if (prev !== null && prev !== p.slot && this.slots[p.side][prev].hp > 0 && s.mons[p.side]) {
          if (p.side === 0) await this.say(`${this.monName(0, prev)}, 돌아와!`, 400);
          else await this.say(`${josa(this.sides[1].trainerName, "은는")} ${josa(this.monName(1, prev, false), "을를")} 넣어버렸다!`, 400);
          if (!fast) await s.recall(p.side);
        }
        this.active[p.side] = p.slot;
        if (this.firstOut[p.side]) {
          this.firstOut[p.side] = false;
          if (!fast) await s.hideTrainer(p.side);
        }
        if (p.side === 0) s.setMessage(`가랏! ${this.monName(0, p.slot)}!`);
        else s.setMessage(`${josa(this.sides[1].trainerName, "은는")} ${josa(this.monName(1, p.slot, false), "을를")} 내보냈다!`);
        const m = this.sides[p.side].team[p.slot];
        if (!fast) {
          await s.sendOut(p.side, { name: this.monName(p.side, p.slot, false), spriteKey: spriteKey(st.species), level: m.level, gender: m.gender, hp: st.hp, maxhp: st.maxhp, status: st.status });
          await s.wait(250);
        }
        return;
      }
      case "detailschange":
      case "-formechange": {
        const p = this.parseIdent(args[0]);
        if (!p) return;
        const species = args[1].split(",")[0];
        this.slots[p.side][p.slot].species = dex.species.get(species).name;
        if (!fast) {
          await s.changeForm(p.side, spriteKey(species), true);
          s.infos[p.side].name.setText(this.monName(p.side, p.slot, false));
        }
        return;
      }
      case "-mega": {
        const p = this.parseIdent(args[0]);
        if (!p) return;
        const baseName = (p.side === 1 ? "상대 " : "") + koSpecies(args[1]);
        await this.say(`${josa(baseName, "은는")} ${args[2] ? josa(koItem(args[2]), "과와") + " 반응해서 " : ""}${josa(koSpecies(this.slots[p.side][p.slot].species), "으로")} 메가진화했다!`, 700);
        return;
      }
      case "-terastallize": {
        const p = this.parseIdent(args[0]);
        if (!p) return;
        if (!fast) {
          await s.moveAnim("common-terastallize", p.side, p.side);
          s.setTera(p.side, koType(args[1]));
        }
        await this.say(`${josa(this.nm(args[0]), "은는")} ${koType(args[1])}타입으로 테라스탈했다!`, 600);
        return;
      }
      case "-zpower":
        await this.say(`${josa(this.nm(args[0]), "은는")} Z파워를 몸에 둘렀다!`, 500);
        return;
      case "move": {
        const p = this.parseIdent(args[0]);
        if (!p) return;
        await this.flushPending();
        this.lastMoveUser = p.side;
        const moveName = args[1];
        const move = dex.moves.get(moveName);
        await this.say(`${this.nm(args[0])}의 ${koMove(move.id) || moveName}!`, 250);
        const t = args[2] ? this.parseIdent(args[2]) : null;
        const targetSide: 0 | 1 = t ? t.side : move.target === "self" || move.target === "allySide" || move.target === "allies" ? p.side : ((1 - p.side) as 0 | 1);
        if (!fast && !("still" in kw) && !("notarget" in kw)) {
          const key = moveAnimKey(move.id) || (move.isZ || move.isMax ? null : null);
          if (key) await s.moveAnim(key, p.side, targetSide);
        }
        if ("miss" in kw && t) await this.say(`${this.nm(args[2])}에게는 맞지 않았다!`, 500);
        return;
      }
      case "-supereffective":
        this.pendingMsgs.push("효과가 굉장했다!");
        return;
      case "-resisted":
        this.pendingMsgs.push("효과가 별로인 듯하다…");
        return;
      case "-crit":
        this.pendingMsgs.push("급소에 맞았다!");
        return;
      case "-immune":
        await this.say(`${this.nm(args[0])}에게는 효과가 없는 것 같다…`, 500);
        return;
      case "-miss":
        await this.say(args[1] ? `${this.nm(args[1])}에게는 맞지 않았다!` : "공격이 빗나갔다!", 500);
        return;
      case "-fail":
        await this.say("그러나 실패했다!", 400);
        return;
      case "-nothing":
        await this.say("하지만 아무 일도 일어나지 않았다!", 400);
        return;
      case "-damage":
      case "-heal":
      case "-sethp": {
        const p = this.parseIdent(args[0]);
        if (!p) return;
        const hp = this.parseHp(args[1]);
        const st = this.slots[p.side][p.slot];
        const before = st.hp;
        st.hp = hp.hp;
        if (hp.maxhp > 0) st.maxhp = hp.maxhp;
        if (hp.status && hp.status !== "fnt") st.status = hp.status;
        const from = kw.from || "";
        if (!fast) {
          if (cmd === "-damage" && !from) {
            const strong = this.pendingMsgs.includes("효과가 굉장했다!");
            await Promise.all([s.hit(p.side, strong), strong ? s.shake() : null]);
          } else if (cmd === "-damage" && /brn|psn|tox/.test(from)) {
            await s.moveAnim(STATUS_ANIM[from] || "common-poison", p.side, p.side);
          } else if (cmd === "-heal" && /item: Leftovers|Black Sludge/.test(from) === false) {
            await s.moveAnim("common-health-up", p.side, p.side);
          }
          await s.setHp(p.side, st.hp, st.maxhp);
        }
        await this.flushPending();
        if (from) await this.say(this.fromText(cmd, args[0], from, kw.of), 450);
        else if (cmd === "-heal" && st.hp > before) await this.say(`${this.nm(args[0])}의 체력이 회복되었다!`, 400);
        return;
      }
      case "faint": {
        const p = this.parseIdent(args[0]);
        if (!p) return;
        await this.flushPending();
        if (!fast) await s.faint(p.side);
        this.slots[p.side][p.slot].hp = 0;
        await this.say(`${josa(this.nm(args[0]), "은는")} 쓰러졌다!`, 700);
        return;
      }
      case "-status": {
        const p = this.parseIdent(args[0]);
        if (!p) return;
        this.slots[p.side][p.slot].status = args[1];
        if (!fast) {
          if (STATUS_ANIM[args[1]]) await s.moveAnim(STATUS_ANIM[args[1]], p.side, p.side);
          s.setStatus(p.side, args[1]);
        }
        await this.say(`${josa(this.nm(args[0]), "은는")} ${STATUS_ON[args[1]] || "상태 이상이 되었다!"}`, 600);
        return;
      }
      case "-curestatus": {
        const p = this.parseIdent(args[0]);
        if (!p) return;
        this.slots[p.side][p.slot].status = "";
        if (!fast && this.active[p.side] === p.slot) s.setStatus(p.side, "");
        const n = this.nm(args[0]);
        const t: Record<string, string> = { slp: `${josa(n, "은는")} 눈을 떴다!`, frz: `${n}의 얼음이 녹았다!`, par: `${n}의 마비가 풀렸다!`, brn: `${n}의 화상이 나았다!`, psn: `${n}의 독이 사라졌다!`, tox: `${n}의 독이 사라졌다!` };
        await this.say(t[args[1]] || `${n}의 상태가 회복되었다!`, 500);
        return;
      }
      case "cant": {
        const n = this.nm(args[0]);
        const t: Record<string, string> = {
          slp: `${josa(n, "은는")} 쿨쿨 잠들어 있다.`, par: `${josa(n, "은는")} 몸이 저려서 움직일 수 없다!`, frz: `${josa(n, "은는")} 얼어버려서 움직일 수 없다!`,
          flinch: `${josa(n, "은는")} 풀이 죽어 기술을 쓸 수 없다!`, recharge: `${josa(n, "은는")} 공격의 반동으로 움직일 수 없다!`, Truant: `${josa(n, "은는")} 게으름을 피우고 있다.`,
        };
        const p = this.parseIdent(args[0]);
        if (p && !fast && STATUS_ANIM[args[1]]) await s.moveAnim(STATUS_ANIM[args[1]], p.side, p.side);
        await this.say(t[args[1]] || `${josa(n, "은는")} 움직일 수 없다!`, 600);
        return;
      }
      case "-boost":
      case "-unboost": {
        const p = this.parseIdent(args[0]);
        if (!p) return;
        const amt = Number(args[2]);
        const up = cmd === "-boost";
        if (!fast && amt > 0) await s.statChange(p.side, up, args[1]);
        const deg = amt === 0 ? "" : amt >= 3 ? "매우 크게 " : amt === 2 ? "크게 " : "";
        const stat = STAT_KO[args[1]] || args[1];
        const text = amt === 0 ? `${this.nm(args[0])}의 ${josa(stat, "은는")} 더 이상 ${up ? "올라가지" : "떨어지지"} 않는다!` : `${this.nm(args[0])}의 ${josa(stat, "이가")} ${deg}${up ? "올라갔다!" : "떨어졌다!"}`;
        await this.say(text, 450);
        return;
      }
      case "-clearallboost":
        await this.say("모든 능력 변화가 원래대로 돌아왔다!", 400);
        return;
      case "-clearboost":
        await this.say(`${this.nm(args[0])}의 능력 변화가 원래대로 돌아왔다!`, 400);
        return;
      case "-weather": {
        const w = idOf(args[0]);
        if ("upkeep" in kw) {
          if (!fast && WEATHER[w]) await s.moveAnim(WEATHER[w][2], 0, 0);
          return;
        }
        if (w === "none") {
          await this.say("날씨가 원래대로 돌아왔다!", 400);
          return;
        }
        if (WEATHER[w]) {
          if (!fast) await s.moveAnim(WEATHER[w][2], 0, 0);
          await this.say(WEATHER[w][0], 500);
        }
        return;
      }
      case "-fieldstart": {
        const f = idOf(args[0].replace(/^move:\s*/, ""));
        const t = TERRAIN[f];
        if (t) {
          if (!fast && t[1]) await s.moveAnim(t[1], 0, 0);
          await this.say(t[0], 500);
        }
        return;
      }
      case "-fieldend":
        await this.say(`${args[0].replace(/^move:\s*/, "")} 효과가 사라졌다!`.replace(/Electric Terrain|Grassy Terrain|Misty Terrain|Psychic Terrain|Trick Room/, x => ({ "Electric Terrain": "일렉트릭필드", "Grassy Terrain": "그래스필드", "Misty Terrain": "미스트필드", "Psychic Terrain": "사이코필드", "Trick Room": "트릭룸" } as Record<string, string>)[x]), 400);
        return;
      case "-sidestart": {
        const side = args[0].startsWith("p1") ? 0 : 1;
        const owner = side === 0 ? "우리 편" : "상대 편";
        const what = idOf(args[1].replace(/^move:\s*/, ""));
        const t: Record<string, string> = {
          stealthrock: `${owner} 주변에 뾰족한 바위가 떠다니기 시작했다!`, spikes: `${owner} 발밑에 압정이 뿌려졌다!`, toxicspikes: `${owner} 발밑에 독압정이 뿌려졌다!`,
          stickyweb: `${owner} 발밑에 끈적끈적네트가 깔렸다!`, reflect: `리플렉터로 ${owner}가 물리 공격에 강해졌다!`, lightscreen: `빛의장막으로 ${owner}가 특수 공격에 강해졌다!`,
          auroraveil: `오로라베일로 ${owner}가 공격에 강해졌다!`, tailwind: `${owner}에 순풍이 불기 시작했다!`, safeguard: `${owner}는 신비의 베일에 둘러싸였다!`,
        };
        await this.say(t[what] || `${owner}에 ${args[1].replace(/^move:\s*/, "")} 효과가 생겼다!`, 500);
        return;
      }
      case "-sideend": {
        const side = args[0].startsWith("p1") ? 0 : 1;
        await this.say(`${side === 0 ? "우리 편" : "상대 편"}의 ${koMove(idOf(args[1].replace(/^move:\s*/, ""))) || args[1]} 효과가 사라졌다!`, 400);
        return;
      }
      case "-start": {
        const eff = idOf(args[1].replace(/^move:\s*/, ""));
        const n = this.nm(args[0]);
        const p = this.parseIdent(args[0]);
        const t: Record<string, string> = {
          confusion: `${josa(n, "은는")} 혼란에 빠졌다!`, substitute: `${n}의 분신이 나타났다!`, leechseed: `${n}에게 씨앗을 심었다!`,
          taunt: `${josa(n, "은는")} 도발에 넘어가 버렸다!`, encore: `${josa(n, "은는")} 앙코르를 받았다!`, focusenergy: `${josa(n, "은는")} 승부욕에 불타오르고 있다!`,
          yawn: `${josa(n, "은는")} 졸음이 오기 시작했다…`, perishsong: "", typechange: `${josa(n, "은는")} 타입이 바뀌었다!`,
        };
        if (eff === "confusion" && p && !fast) await s.moveAnim("common-confusion", p.side, p.side);
        if (t[eff]) await this.say(t[eff], 450);
        return;
      }
      case "-end": {
        const eff = idOf(args[1].replace(/^move:\s*/, ""));
        const n = this.nm(args[0]);
        const t: Record<string, string> = { confusion: `${n}의 혼란이 풀렸다!`, substitute: `${n}의 분신은 사라져 버렸다…`, taunt: `${n}의 도발 효과가 풀렸다!`, encore: `${n}의 앙코르 효과가 풀렸다!` };
        if (t[eff]) await this.say(t[eff], 400);
        return;
      }
      case "-singleturn": {
        const eff = idOf(args[1].replace(/^move:\s*/, ""));
        if (["protect", "kingsshield", "spikyshield", "banefulbunker", "silktrap", "burningbulwark", "obstruct", "maxguard"].includes(eff)) {
          const p = this.parseIdent(args[0]);
          if (p && !fast) await s.moveAnim("common-protect", p.side, p.side);
          await this.say(`${josa(this.nm(args[0]), "은는")} 방어 태세에 들어갔다!`, 450);
        } else if (eff === "endure") await this.say(`${josa(this.nm(args[0]), "은는")} 버티기 태세에 들어갔다!`, 450);
        return;
      }
      case "-activate": {
        const eff = idOf((args[1] || "").replace(/^(move|ability|item):\s*/, ""));
        const n = this.nm(args[0]);
        if (["protect", "kingsshield", "spikyshield", "banefulbunker", "silktrap", "maxguard"].includes(eff)) await this.say(`${josa(n, "은는")} 공격으로부터 몸을 지켰다!`, 450);
        else if (eff === "substitute") await this.say(`${n} 대신 분신이 공격을 받았다!`, 400);
        else if (eff === "focussash" || eff === "sturdy") await this.say(`${josa(n, "은는")} 공격을 버텼다!`, 450);
        else if (eff === "confusion") await this.say(`${josa(n, "은는")} 혼란에 빠져 있다!`, 400);
        return;
      }
      case "-prepare":
        await this.say(`${josa(this.nm(args[0]), "은는")} 힘을 모으고 있다!`, 450);
        return;
      case "-ability": {
        const n = this.nm(args[0]);
        await this.say(`[${n}의 ${koAbility(args[1])}]`, 450);
        return;
      }
      case "-item":
        await this.say(`${josa(this.nm(args[0]), "은는")} ${josa(koItem(args[1]), "을를")} 지니고 있다!`, 400);
        return;
      case "-enditem": {
        const n = this.nm(args[0]);
        const it = koItem(args[1]);
        if ("eat" in kw) {
          const p = this.parseIdent(args[0]);
          if (p && !fast) await s.moveAnim("common-use-item", p.side, p.side);
          await this.say(`${josa(n, "은는")} ${josa(it, "을를")} 먹었다!`, 450);
        } else if (kw.from?.includes("Knock Off")) await this.say(`${n}의 ${josa(it, "을를")} 탁쳐서 떨어뜨렸다!`, 450);
        else await this.say(`${n}의 ${josa(it, "이가")} 사라졌다!`, 400);
        return;
      }
      case "-transform":
        await this.say(`${josa(this.nm(args[0]), "은는")} 변신했다!`, 450);
        return;
      case "-hitcount":
        await this.say(`${args[1]}번 맞았다!`, 400);
        return;
      case "-ohko":
        await this.say("일격필살!", 500);
        return;
      case "win": {
        await this.flushPending();
        const winner = args[0] === this.sides[0].trainerName && args[0] !== this.sides[1].trainerName ? 0 : args[0] === this.sides[1].trainerName ? 1 : this.session.result().winner;
        if (!fast) await s.showTrainerAgain(1, this.sides[1].trainerSprite);
        await this.say(winner === 0 ? `${josa(this.sides[1].trainerName, "과와")}의 승부에서 이겼다!` : `${this.sides[1].trainerName}에게 지고 말았다…`, 1200);
        return;
      }
      case "tie":
        await this.say("승부는 무승부로 끝났다!", 1000);
        return;
      case "turn":
        await this.flushPending();
        return;
    }
  }

  private fromText(cmd: string, ident: string, from: string, of?: string): string {
    const n = this.nm(ident);
    const f = from.replace(/^(item|ability|move):\s*/, "");
    const fid = idOf(f);
    if (cmd === "-damage") {
      if (fid === "brn") return `${josa(n, "은는")} 화상 데미지를 입었다!`;
      if (fid === "psn" || fid === "tox") return `${josa(n, "은는")} 독 데미지를 입었다!`;
      if (fid === "stealthrock") return `${n}에게 뾰족한 바위가 박혔다!`;
      if (fid === "spikes") return `${josa(n, "은는")} 압정 데미지를 입었다!`;
      if (fid === "recoil") return `${josa(n, "은는")} 반동 데미지를 입었다!`;
      if (fid === "sandstorm") return `모래바람이 ${josa(n, "을를")} 덮쳤다!`;
      if (fid === "hail") return `싸라기눈이 ${josa(n, "을를")} 덮쳤다!`;
      if (fid === "leechseed") return `씨뿌리기가 ${n}의 체력을 빼앗는다!`;
      if (fid === "confusion") return `${josa(n, "은는")} 영문도 모른 채 자신을 공격했다!`;
      if (fid === "lifeorb") return `${josa(n, "은는")} 생명이 조금 깎였다!`;
      if (fid === "rockyhelmet" || fid === "roughskin" || fid === "ironbarbs") return `${josa(n, "은는")} ${f === "Rocky Helmet" ? "울퉁불퉁멧" : koAbility(fid)} 때문에 데미지를 입었다!`;
      if (fid === "curse") return `${josa(n, "은는")} 저주를 받고 있다!`;
      if (fid === "nightmare") return `${josa(n, "은는")} 악몽에 시달리고 있다!`;
      return `${josa(n, "은는")} ${f} 때문에 데미지를 입었다!`;
    }
    if (fid === "leftovers") return `${josa(n, "은는")} 먹다남은음식으로 조금 회복했다!`;
    if (fid === "blacksludge") return `${josa(n, "은는")} 검은진흙으로 조금 회복했다!`;
    if (fid === "drain") return `${of ? this.nm(of) + "의" : "상대의"} 체력을 흡수했다!`;
    if (fid === "grassyterrain") return `${n}의 체력이 회복되었다!`;
    void of;
    return `${n}의 체력이 회복되었다!`;
  }
}
