import { useEffect, useRef, useState } from "preact/hooks";
import Phaser from "phaser";
import { BattleScene } from "../render/BattleScene";
import { BattleDirector } from "../render/director";
import { BattleSession, forcedMove, slotForced, type MatchResult } from "../battle/engine";
import { pendingDecided, recordPlayerGame, sideFor } from "../game/season";
import { displaySprite, entryTeam, teamOf, type GameState } from "../game/state";
import { dex, koMove, koSpecies, koType, regionById, TYPE_COLORS } from "../data/dex";
import { trainerById } from "../game/lineups";
import { getGame, go, matchCtx, requestAutoAdvance, update } from "./store";
import { MonIcon } from "./components";
import { CommandMenu, FightMenu, PartyMenu, PrLayer, TargetMenu } from "./BattleMenu";
import { calcStats } from "../battle/calc";

interface CmdState {
  side: number;
  req: any;
  resolve: (choice: string) => void;
}

const FEMALE = new Set([
  "lorelei", "agatha", "misty", "erika", "janine", "sabrina", "whitney", "jasmine", "clair", "karen", "phoebe", "glacia",
  "roxanne", "flannery", "winona", "liza", "cynthia", "bertha", "gardenia", "maylene", "fantina", "candice", "iris",
  "shauntal", "caitlin", "lenora", "elesa", "skyla", "roxie", "diantha", "malva", "drasna", "viola", "korrina", "valerie",
  "olympia", "olivia", "kahili", "acerola", "lusamine", "marnie", "nessa", "bea", "opal", "melony", "geeta", "rika",
  "poppy", "katy", "iono", "tulip", "penny", "nemona", "hex_maniac", "dancer", "baker", "artist", "mira", "lacey",
  "lyra", "kimono_girl",
]);
function playerBackSprite(sprite: string): string {
  return FEMALE.has(sprite) || /_f(_|$)|female/.test(sprite) ? "trainer_f_back" : "trainer_m_back";
}

/** Moves that need a target in doubles (Showdown target types). */
const TARGETED = new Set(["normal", "any", "adjacentFoe", "adjacentAlly", "adjacentAllyOrSelf"]);

/** Request slots that need an order this turn (switch-ins when forced, otherwise every standing active). */
function needSlots(req: any): number[] {
  if (!req) return [];
  if (req.forceSwitch) return (req.forceSwitch as boolean[]).map((f, i) => (f ? i : -1)).filter(i => i >= 0);
  return (req.active || []).map((_: any, i: number) => i).filter((i: number) => {
    const pk = req.side?.pokemon?.[i];
    return pk && !pk.condition.endsWith(" fnt") && !req.active[i]?.commanding;
  });
}

/** Target choices for the active Pokémon at position k: foes left/right (1/2), the partner (-1/-2). */
function targetOptions(target: string, k: number, d: BattleDirector, scene: BattleScene | null): { label: string; n: number }[] {
  const out: { label: string; n: number }[] = [];
  const name = (who: number) => {
    const slot = d.active[who];
    return slot === null || slot === undefined ? "" : d.monName((who % 2) as 0 | 1, slot, false);
  };
  if (target !== "adjacentAlly" && target !== "adjacentAllyOrSelf")
    [1, 3].forEach((who, j) => scene?.mons[who] && out.push({ label: `상대 ${name(who)}`, n: j + 1 }));
  const ally = k === 0 ? 2 : 0;
  if (target !== "adjacentFoe" && scene?.mons[ally]) out.push({ label: `아군 ${name(ally)}`, n: -((ally === 0 ? 0 : 1) + 1) });
  if (target === "adjacentAllyOrSelf") out.push({ label: "자신", n: -(k + 1) });
  return out.length ? out : [{ label: "대상 없음", n: 1 }];
}

const g0 = () => getGame();

function arenaFor(g: GameState): string {
  const p = g.pending!;
  if (/^(PWT|PCT|월드)/.test(p.label)) return "temple";
  const home = p.home ? g.player.region : trainerById(p.opponent)?.region || g.player.region;
  return regionById(home).arena;
}

export function BattleScreen({ mode }: { mode: "manual" | "watch" }) {
  const host = useRef<HTMLDivElement>(null);
  const [cmd, setCmd] = useState<CmdState | null>(null);
  const [showSwitch, setShowSwitch] = useState(false);
  const [gimmick, setGimmick] = useState(false);
  const [menu, setMenu] = useState<"cmd" | "fight">("cmd");
  const [result, setResult] = useState<MatchResult | null>(null);
  // doubles: which of the two active Pokémon is being ordered, and the orders given so far this turn
  const dbl = !!getGame().pending?.doubles;
  const [k, setK] = useState(0);
  const parts = useRef<string[]>([]);
  const [targetFor, setTargetFor] = useState<{ base: string; target: string; gim: string } | null>(null);
  const [speed, setSpeed] = useState(() => getGame().settings.battleSpeed || 1);
  const [auto, setAuto] = useState(mode === "watch");
  const autoRef = useRef(auto);
  const directorRef = useRef<BattleDirector | null>(null);
  const sceneRef = useRef<BattleScene | null>(null);
  const sessionRef = useRef<BattleSession | null>(null);

  useEffect(() => {
    const g = getGame();
    const p = g.pending;
    if (!p) {
      go({ name: "hub" });
      return;
    }
    const me = sideFor(g, g.player.slotId, !!p.doubles);
    const opp = sideFor(g, p.opponent, !!p.doubles);
    const session = new BattleSession({ ...me, human: true, picks: matchCtx.picks }, opp, `${g.seed}:${g.day}:${p.games.length}:${Date.now() % 100000}`, { doubles: !!p.doubles });
    session.start();
    sessionRef.current = session;
    const scene = new BattleScene();
    scene.doubles = !!p.doubles;
    scene.speed = speed;
    scene.moveAnims = g.settings.moveAnims;
    sceneRef.current = scene;
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: host.current!,
      width: 320 * 4,
      height: 180 * 4,
      pixelArt: true,
      backgroundColor: "#000000",
      scene: [scene],
      banner: false,
      audio: { noAudio: true },
      scale: { mode: Phaser.Scale.NONE },
    });
    const director = new BattleDirector(
      scene,
      session,
      [
        { trainerName: g.player.name, trainerSprite: [`${g.player.sprite}_back`, playerBackSprite(g.player.sprite)], team: me.team },
        { trainerName: opp.name, trainerSprite: displaySprite(g, p.opponent), team: opp.team },
      ],
      side =>
        new Promise<string>(resolve => {
          // forced turns (recharge after Giga Impact / Hyper Beam, locked Outrage, Struggle…):
          // nothing to choose, so skip the menu like the main games do
          if (forcedMove(session.request(side))) return resolve("move 1");
          setGimmick(false);
          setMenu("cmd");
          setTargetFor(null);
          const rq = session.request(side);
          parts.current = [];
          // doubles: a Pokémon that must recharge / is locked into a move gets its only option automatically
          if (rq && !rq.forceSwitch) (rq.active || []).forEach((a: any, i: number) => slotForced(a) && (parts.current[i] = "move 1"));
          const first = needSlots(rq).find(i => parts.current[i] === undefined) ?? 0;
          setK(first);
          setShowSwitch(!!rq?.forceSwitch);
          const actv = rq?.side?.pokemon?.[first];
          if (actv && !rq.forceSwitch) {
            scene.setMessageWidth(185);
            scene.setMessage(`${koSpecies(actv.details.split(",")[0])}은(는) 무엇을 할까?`);
          }
          setCmd({ side, req: rq, resolve });
        }),
      () => !autoRef.current,
    );
    directorRef.current = director;
    let alive = true;
    (async () => {
      await scene.ready;
      await scene.loadArena(arenaFor(g));
      const r = await director.run();
      if (!alive) return;
      update(st => recordPlayerGame(st, r));
      setResult(r);
    })().catch(e => {
      console.error(e);
      if (alive) {
        const r = session.runToEnd();
        update(st => recordPlayerGame(st, r));
        setResult(r);
      }
    });
    return () => {
      alive = false;
      director.stopped = true;
      game.destroy(true);
    };
  }, []);

  useEffect(() => {
    autoRef.current = auto;
    if (auto && cmd) {
      // hand the pending decision to the AI
      const c = cmd;
      setCmd(null);
      c.resolve("__ai__");
    }
  }, [auto]);

  useEffect(() => {
    if (sceneRef.current) sceneRef.current.speed = speed;
  }, [speed]);

  const choose = (choice: string) => {
    if (!cmd) return;
    const c = cmd;
    // doubles: collect one order per active Pokémon, then send them together
    if (dbl && choice !== "__ai__") {
      const need = needSlots(c.req);
      parts.current[k] = choice;
      const next = need.find(x => x !== k && parts.current[x] === undefined);
      if (next !== undefined) {
        setK(next);
        setMenu("cmd");
        setGimmick(false);
        setTargetFor(null);
        setShowSwitch(!!c.req.forceSwitch);
        const nm = c.req.side.pokemon[next]?.details.split(",")[0];
        if (nm && !c.req.forceSwitch) sceneRef.current?.setMessage(`${koSpecies(nm)}은(는) 무엇을 할까?`);
        return;
      }
      const n = Math.max(c.req.active?.length || 0, c.req.forceSwitch?.length || 0);
      choice = Array.from({ length: n }, (_, i) => parts.current[i] ?? "pass").join(", ");
    }
    sceneRef.current?.setMessageWidth(290);
    sceneRef.current?.setMessage("");
    setCmd(null);
    setShowSwitch(false);
    c.resolve(choice);
  };

  const skip = () => {
    const d = directorRef.current;
    if (!d) return;
    d.skipping = true;
    if (sceneRef.current) sceneRef.current.speed = 50;
    if (cmd) choose("__ai__");
  };

  const finish = () => {
    const g = getGame();
    if (g.pending && pendingDecided(g)) {
      requestAutoAdvance();
      go({ name: "hub" });
    } else go({ name: "prep" });
  };

  const req = cmd?.req;
  const myTeam = sideFor(g0(), g0().player.slotId, dbl).team;
  const act = req?.active?.[dbl ? k : 0];
  // one Mega / Z / Tera per turn in doubles
  const gimmickTaken = dbl && parts.current.some(x => / (mega|megax|megay|zmove|terastallize)$/.test(x || ""));
  const g = getGame();
  // mega stones and Z crystals work for anyone holding them; Terastallization stays a Paldea rule
  // gimmicks: Mega (stone), Z (crystal), Tera (bought Tera Type) — 1 per battle in singles, 2 different in doubles
  const sess = sessionRef.current;
  const gOk = (k: "mega" | "z" | "tera") => !sess || sess.gimmickOk(0, k);
  const curSlot = Number(req?.side?.pokemon?.[dbl ? k : 0]?.ident?.match(/m(\d)/)?.[1] ?? -1);
  const hasTera = curSlot >= 0 && !!myTeam[curSlot]?.teraType;
  const myGimmick =
    act && gOk("mega") && (act.canMegaEvo || act.canMegaEvoX || act.canMegaEvoY)
      ? "mega"
      : act && gOk("z") && Array.isArray(act.canZMove) && act.canZMove.some(Boolean)
        ? "z"
        : act && gOk("tera") && act.canTerastallize && hasTera
          ? "tera"
          : null;
  const d = directorRef.current;
  const foeWho = [1, 3].find(w => d && d.active[w] !== null && d.active[w] !== undefined && sceneRef.current?.mons[w]) ?? 1;
  const foeSlot = d?.active[foeWho];
  const foeSpecies = foeSlot !== null && foeSlot !== undefined && d ? d.slots[1][foeSlot]?.species : null;
  const canG = act && !gimmickTaken && ((myGimmick === "mega" && (act.canMegaEvo || act.canMegaEvoX || act.canMegaEvoY)) || (myGimmick === "tera" && act.canTerastallize) || (myGimmick === "z" && act.canZMove));
  const gShort = myGimmick === "mega" ? "메가진화" : myGimmick === "tera" ? `테라 ${koType(act?.canTerastallize || "")}` : "Z기술";

  return (
    <div style={{ minHeight: "100vh", background: "#000", display: "flex", flexDirection: "column", justifyContent: "center" }}>
      <div class="battle-wrap" ref={host}>
        <div class="battle-top">
          {[1, 2, 4].map(s => (
            <button key={s} class={`btn ${speed === s ? "sel" : ""}`} onClick={() => {
                setSpeed(s);
                update(st => (st.settings.battleSpeed = s)); // remembered in the save for later battles
              }}>
              ×{s}
            </button>
          ))}
          <button class={`btn ${auto ? "sel" : ""}`} onClick={() => setAuto(!auto)}>
            자동 {auto ? "ON" : "OFF"}
          </button>
          {!result && (
            <button class="btn" onClick={skip}>
              건너뛰기
            </button>
          )}
        </div>
        {cmd && act && !showSwitch && !req.forceSwitch && !targetFor && (
          <PrLayer>
            {menu === "cmd" ? (
              <CommandMenu
                items={[
                  { label: "싸운다", act: () => setMenu("fight") },
                  { label: "포켓몬", disabled: !!act.trapped, act: () => setShowSwitch(true) },
                  ...(canG ? [{ label: gimmick ? `✔${gShort}` : gShort, on: gimmick, act: () => setGimmick(!gimmick) }] : [{ label: "-", disabled: true, act: () => {} }]),
                  { label: "AI 맡김", act: () => choose("__ai__") },
                ]}
              />
            ) : (
              <FightMenu
                moves={act.moves.map((mv: any) => ({ id: mv.id, pp: mv.pp, maxpp: mv.maxpp, disabled: mv.disabled }))}
                foe={foeSpecies}
                zMoves={gimmick && myGimmick === "z" && act.canZMove ? act.canZMove.map((z: any) => (z ? koMove(z.move) || z.move : null)) : undefined}
                onBack={() => setMenu("cmd")}
                onPick={i => {
                  let c = `move ${i + 1}`;
                  if (gimmick && canG) {
                    if (myGimmick === "mega") c += act.canMegaEvo ? " mega" : act.canMegaEvoX ? " megax" : " megay";
                    else if (myGimmick === "tera") c += " terastallize";
                    else if (myGimmick === "z" && act.canZMove?.[i]) c += " zmove";
                  }
                  const tgt = act.moves[i]?.target;
                  if (dbl && TARGETED.has(tgt)) {
                    const base = `move ${i + 1}`;
                    setTargetFor({ base, target: tgt, gim: c.slice(base.length) });
                    return;
                  }
                  choose(c);
                }}
              />
            )}
          </PrLayer>
        )}
        {cmd && act && targetFor && d && (
          <PrLayer>
            <TargetMenu
              items={targetOptions(targetFor.target, k, d, sceneRef.current).map(o => ({ label: o.label, act: () => choose(`${targetFor.base} ${o.n}${targetFor.gim}`) }))}
              onBack={() => setTargetFor(null)}
            />
          </PrLayer>
        )}
        {cmd && (showSwitch || req?.forceSwitch) && (
          <PrLayer>
            <PartyMenu
              message={req.forceSwitch ? "다음 포켓몬을 선택하세요." : "포켓몬을 선택하세요."}
              party={req.side.pokemon.map((pk: any) => {
                const slot = Number(pk.ident.match(/m(\d)/)?.[1] ?? 0);
                const sp = pk.details.split(",")[0];
                const gender = / F(,|$)/.test(pk.details) ? "F" : / M(,|$)/.test(pk.details) ? "M" : "";
                const fainted = pk.condition.endsWith(" fnt") || pk.condition.startsWith("0");
                const [hp, maxhp] = pk.condition.split(" ")[0].split("/").map(Number);
                return { name: myTeam[slot]?.nickname || koSpecies(sp), species: sp, gender, hp: fainted ? 0 : hp || 0, maxhp: maxhp || (myTeam[slot] ? calcStats({ ...myTeam[slot], level: 50 } as any).hp : 0), fainted, active: !!pk.active };
              })}
              double={dbl}
              taken={dbl ? parts.current.filter(x => x?.startsWith("switch")).map(x => Number(x.split(" ")[1]) - 1) : []}
              onPick={i => choose(`switch ${i + 1}`)}
              onCancel={req.forceSwitch ? undefined : () => setShowSwitch(false)}
            />
          </PrLayer>
        )}
        {result && (
          <div class="result-panel">
            <div class="win w2 center" style={{ minWidth: 260 }}>
              <div style={{ fontSize: 28 }} class={result.winner === 0 ? "gold" : result.winner === 1 ? "bad" : ""}>
                {result.winner === 0 ? "승리!" : result.winner === 1 ? "패배…" : "무승부"}
              </div>
              <div class="small">
                남은 포켓몬 {result.remaining[0]} : {result.remaining[1]} · {result.turns}턴
              </div>
              <button class="btn primary" style={{ marginTop: 8 }} onClick={finish}>
                계속 ▶
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function effText(type: string, species: string): string {
  const s = dex.species.get(species);
  if (!dex.getImmunity(type, s.types)) return "효과 없음";
  const e = dex.getEffectiveness(type, s.types);
  if (e >= 2) return "효과 매우 굉장";
  if (e === 1) return "효과 굉장";
  if (e === -1) return "효과 별로";
  if (e <= -2) return "효과 매우 별로";
  return "";
}
