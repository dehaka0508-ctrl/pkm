import type { ComponentChildren } from "preact";
import { dex, koSpecies, spriteKey } from "../data/dex";
import { formSpecies } from "../data/forms";
import { allTrainers } from "../game/lineups";
import { teamOf, type GameState } from "../game/state";
import type { Ceremony } from "../game/ceremony";
import { assetUrl, firstFrame } from "../render/assets";
import { Modal, useAsync, Win } from "./components";

const CONFETTI = ["#f9d568", "#ff83a6", "#86f1da", "#91adff", "#f8f3f1"];

function Stage({ children, solo = false }: { children: ComponentChildren; solo?: boolean }) {
  return (
    <div class={`ceremony-stage ${solo ? "solo" : ""}`}>
      <img class="ceremony-backdrop" src={assetUrl("ui/ceremony-stadium.png")} alt="" />
      <div class="ceremony-cast">{children}</div>
      <div class="ceremony-confetti" aria-hidden="true">
        {Array.from({ length: 30 }, (_, i) => (
          <i key={i} style={{ left: `${(i * 37) % 100}%`, backgroundColor: CONFETTI[i % CONFETTI.length],
            animationDelay: `${-(i * 0.41)}s`, animationDuration: `${3.2 + (i % 7) * 0.42}s` }} />
        ))}
      </div>
    </div>
  );
}

// Back rows rise outward, framing the trainer at the front of the stage.
const LEFT = [[37, 18], [26, 22], [15, 27]];
const RIGHT = [[63, 18], [74, 22], [85, 27]];

function StageSprite({ species, trainer, name, x, bottom }: { species?: string; trainer?: string; name?: string; x: number; bottom: number }) {
  const key = trainer ?? spriteKey(species!);
  const portrait = useAsync(async () => ({
    key, frame: await firstFrame(trainer ? "trainer" : "front", key, true),
  }), [key, trainer]);
  const frame = portrait?.key === key ? portrait.frame : null;
  if (!frame) return null;
  const height = trainer ? 30 : Math.max(11, Math.min(25, 15 + 5 * Math.log2((dex.species.get(species!).heightm || 1) + 0.2)));
  const maxWidth = trainer ? 20 : 25;
  const size = Math.min(height, maxWidth * frame.h / frame.w);
  const distanceFromCenter = Math.abs(x - 50) / 50;
  return (
    <div class={`ceremony-actor ${trainer ? "ceremony-trainer" : "ceremony-mon"}`}
      style={{
        left: `${x}%`, bottom: `${bottom}%`, height: `${size}cqw`, width: `${size * frame.w / frame.h}cqw`,
        zIndex: trainer ? 4 : bottom < 22 ? 3 : bottom < 27 ? 2 : 1,
        "--beam-angle": x < 50 ? "135deg" : x > 50 ? "225deg" : "180deg",
        "--beam-opacity": 0.11 + distanceFromCenter * 0.38,
      }}>
      <img src={frame.url} alt={name ?? koSpecies(species)} />
      <span class="ceremony-light" aria-hidden="true" style={{ maskImage: `url("${frame.url}")` }} />
    </div>
  );
}

function VictoryLineup({ winner, roster }: { winner: { sprite: string; name: string }; roster: string[] }) {
  return (
    <Stage>
      {roster.map((species, index) => {
        const [x, bottom] = (index % 2 ? RIGHT : LEFT)[Math.floor(index / 2)];
        return <StageSprite key={index} species={species} x={x} bottom={bottom} />;
      })}
      <StageSprite trainer={winner.sprite} name={winner.name} x={50} bottom={15} />
    </Stage>
  );
}

export function CeremonyShow({ g, ceremony, onClose }: { g: GameState; ceremony: Ceremony; onClose: () => void }) {
  const team = ceremony.kind === "team" ? ceremony : null;
  const winner = team?.places.find(place => place.rank === 1);
  const showWinner = !!team?.showPodium && !!winner;
  const winnerId = winner?.id ?? (winner && (winner.sprite === g.player.sprite && winner.name === g.player.name
    ? g.player.slotId : allTrainers().find(t => t.name === winner.name && t.sprite === winner.sprite)?.id));
  const roster = team?.winnerTeam ?? (showWinner && winnerId ? teamOf(g, winnerId).map(formSpecies) : []);
  const places = showWinner ? [winner!] : team?.places ?? [];
  const title = team ? `${ceremony.competition} ${team.showPodium ? "시상식" : "최종 결과"}` : `${ceremony.competition} 개인 시상식`;
  return (
    <Modal onClose={onClose}>
      <section role="dialog" aria-modal="true" aria-label={title}>
        <Win title={title}>
          {showWinner && <VictoryLineup winner={winner!} roster={roster.slice(0, 6)} />}
          {team && <ol class="ceremony-results">
            {places.map(place => <li key={place.rank}><b>{place.rank === 1 ? "우승" : `${place.rank}위`}</b> {place.name}</li>)}
          </ol>}
          {ceremony.kind === "individual" && (
            <>
              <Stage solo>
                <StageSprite species={ceremony.species} x={50} bottom={19} />
              </Stage>
              <p class="ceremony-caption"><b class="gold">{ceremony.prize}</b> · {ceremony.name} <span class="muted">({ceremony.detail})</span></p>
            </>
          )}
          <button class="btn primary" autoFocus onClick={onClose}>계속</button>
        </Win>
      </section>
    </Modal>
  );
}
