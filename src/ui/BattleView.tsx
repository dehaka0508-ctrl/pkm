import { useEffect, useRef, useState } from "preact/hooks";
import Phaser from "phaser";
import { BattleScene } from "../render/BattleScene";
import { BattleDirector } from "../render/director";
import { BattleSession, type MatchResult } from "../battle/engine";
import { pendingDecided, recordPlayerGame, sideFor } from "../game/season";
import { displaySprite, entryTeam, teamOf, type GameState } from "../game/state";
import { dex, koMove, koSpecies, koType, regionById, TYPE_COLORS } from "../data/dex";
import { trainerById } from "../game/lineups";
import { getGame, go, matchCtx, requestAutoAdvance, update } from "./store";
import { MonIcon } from "./components";

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

function arenaFor(g: GameState): string {
  const p = g.pending!;
  if (p.label.startsWith("PWT")) return "temple";
  const home = p.home ? g.player.region : trainerById(p.opponent)?.region || g.player.region;
  return regionById(home).arena;
}

export function BattleScreen({ mode }: { mode: "manual" | "watch" }) {
  const host = useRef<HTMLDivElement>(null);
  const [cmd, setCmd] = useState<CmdState | null>(null);
  const [showSwitch, setShowSwitch] = useState(false);
  const [gimmick, setGimmick] = useState(false);
  const [result, setResult] = useState<MatchResult | null>(null);
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
    const me = sideFor(g, g.player.slotId);
    const opp = sideFor(g, p.opponent);
    const session = new BattleSession({ ...me, human: true, picks: matchCtx.picks }, opp, `${g.seed}:${g.day}:${p.games.length}:${Date.now() % 100000}`);
    session.start();
    sessionRef.current = session;
    const scene = new BattleScene();
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
        { trainerName: g.player.name, trainerSprite: [`${g.player.sprite}_back`, playerBackSprite(g.player.sprite)], team: entryTeam(g) },
        { trainerName: opp.name, trainerSprite: displaySprite(g, p.opponent), team: teamOf(g, p.opponent) },
      ],
      side =>
        new Promise<string>(resolve => {
          setGimmick(false);
          setShowSwitch(!!session.request(side)?.forceSwitch);
          setCmd({ side, req: session.request(side), resolve });
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
  const act = req?.active?.[0];
  const g = getGame();
  const myGimmick = g.player.gimmick;
  const d = directorRef.current;
  const foeSlot = d?.active[1];
  const foeSpecies = foeSlot !== null && foeSlot !== undefined && d ? d.slots[1][foeSlot]?.species : null;
  const canG = act && ((myGimmick === "mega" && (act.canMegaEvo || act.canMegaEvoX || act.canMegaEvoY)) || (myGimmick === "tera" && act.canTerastallize) || (myGimmick === "z" && act.canZMove));
  const gLabel = myGimmick === "mega" ? "메가진화" : myGimmick === "tera" ? `테라스탈 (${koType(act?.canTerastallize || "")})` : "Z기술";

  return (
    <div style={{ minHeight: "100vh", background: "#000", display: "flex", flexDirection: "column", justifyContent: "center" }}>
      <div class="battle-wrap" ref={host}>
        <div class="battle-top">
          {[1, 2, 4].map(s => (
            <button key={s} class={`btn ${speed === s ? "sel" : ""}`} onClick={() => setSpeed(s)}>
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
        {cmd && act && !showSwitch && !req.forceSwitch && (
          <>
            <div class="battle-cmd">
              {act.moves.map((mv: any, i: number) => {
                const m = dex.moves.get(mv.id);
                const eff = foeSpecies && m.category !== "Status" ? effText(m.type, foeSpecies) : "";
                return (
                  <button
                    key={i}
                    class="mv"
                    disabled={mv.disabled || mv.pp === 0}
                    style={{ background: TYPE_COLORS[m.type] || "#777" }}
                    onClick={() => {
                      let c = `move ${i + 1}`;
                      if (gimmick && canG) {
                        if (myGimmick === "mega") c += act.canMegaEvo ? " mega" : act.canMegaEvoX ? " megax" : " megay";
                        else if (myGimmick === "tera") c += " terastallize";
                        else if (myGimmick === "z" && act.canZMove?.[i]) c += " zmove";
                      }
                      choose(c);
                    }}
                  >
                    <span>{koMove(mv.id) || mv.move}</span>
                    <small>
                      {koType(m.type)} · PP {mv.pp}/{mv.maxpp} {eff && `· ${eff}`}
                    </small>
                  </button>
                );
              })}
            </div>
            <div class="battle-side">
              <button class="btn small" onClick={() => setShowSwitch(true)} disabled={act.trapped}>
                교체
              </button>
              {canG && (
                <button class={`btn small ${gimmick ? "sel" : ""}`} onClick={() => setGimmick(!gimmick)}>
                  {gimmick ? "✔ " : ""}
                  {gLabel}
                </button>
              )}
            </div>
          </>
        )}
        {cmd && (showSwitch || req?.forceSwitch) && (
          <div class="switch-panel">
            <b class="gold">{req.forceSwitch ? "다음 포켓몬을 고르세요" : "교체할 포켓몬"}</b>
            {req.side.pokemon.map((pk: any, i: number) => {
              const slot = Number(pk.ident.match(/m(\d)/)?.[1] ?? 0);
              const team = entryTeam(g);
              const sp = pk.details.split(",")[0];
              const fainted = pk.condition.endsWith(" fnt") || pk.condition.startsWith("0");
              return (
                <button key={i} class="btn row" disabled={pk.active || fainted} onClick={() => choose(`switch ${i + 1}`)} style={{ justifyContent: "flex-start" }}>
                  <MonIcon species={sp} />
                  <span>{team[slot]?.nickname || koSpecies(sp)}</span>
                  <span class="small muted right">{fainted ? "기절" : pk.condition}</span>
                </button>
              );
            })}
            {!req.forceSwitch && (
              <button class="btn small" onClick={() => setShowSwitch(false)}>
                취소
              </button>
            )}
          </div>
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
