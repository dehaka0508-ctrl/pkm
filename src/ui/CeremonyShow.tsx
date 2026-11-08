import type { ComponentChildren } from "preact";
import type { Ceremony } from "../game/ceremony";
import { Modal, MonSprite, TrainerSprite, Win } from "./components";

const CONFETTI = ["#f9d568", "#ff83a6", "#86f1da", "#91adff", "#f8f3f1"];

function Stage({ children, solo }: { children: ComponentChildren; solo: boolean }) {
  return (
    <div class={`ceremony-stage ${solo ? "solo" : ""}`}>
      <svg class="ceremony-backdrop" viewBox="0 0 320 180" preserveAspectRatio="none" shape-rendering="crispEdges" aria-hidden="true">
        <path fill="#211b40" d="M0 0h320v180H0z" />
        <path fill="#332953" d="M0 9h320v112H0z" />
        <path fill="#4c376d" d="M17 12h286v103H17z" />
        <path fill="#625085" d="M42 18h236v93H42z" />
        <path fill="#473a70" d="M59 25h202v82H59z" />
        <path fill="#39305d" d="M75 31h170v75H75z" />
        <path fill="#8a6bb0" d="M20 9h280v3H20zM40 15h240v3H40zM20 110h280v4H20z" />
        <path fill="#b297d9" d="M29 17h4v79h-4zM287 17h4v79h-4z" />
        <path fill="#f4d387" d="M25 18h12v5H25zM283 18h12v5h-12zM148 10h24v4h-24z" />
        <path fill="#a28abe" opacity=".24" d="M29 23h4v19h6v20h8v38H15V62h7V42h7zM287 23h4v19h7v20h7v38h-32V62h8V42h6z" />
        <path fill="#624c83" d="M30 111h260v5h13v8h17v31H0v-31h17v-8h13z" />
        <path fill="#80649b" d="M17 122h286v3H17zM0 139h320v3H0z" />
        <path fill="#393150" d="M0 151h320v29H0z" />
      </svg>
      <div class="ceremony-podium">{children}</div>
      <svg class="ceremony-crowd" viewBox="0 0 320 26" preserveAspectRatio="none" shape-rendering="crispEdges" aria-hidden="true">
        {Array.from({ length: 28 }, (_, i) => {
          const x = i * 12 - 5;
          const y = 2 + (i * 7 % 9);
          return <path key={i} fill={i % 2 ? "#241e39" : "#191629"} d={`M${x + 3} ${y}h7v8h3v20H${x}V${y + 8}h3z`} />;
        })}
        <path fill="#141221" d="M0 21h320v5H0z" />
      </svg>
      <div class="ceremony-confetti" aria-hidden="true">
        {Array.from({ length: 30 }, (_, i) => (
          <i key={i} style={{ left: `${(i * 37) % 100}%`, backgroundColor: CONFETTI[i % CONFETTI.length],
            animationDelay: `${-(i * 0.41)}s`, animationDuration: `${3.2 + (i % 7) * 0.42}s` }} />
        ))}
      </div>
    </div>
  );
}

export function CeremonyShow({ ceremony, onClose }: { ceremony: Ceremony; onClose: () => void }) {
  const team = ceremony.kind === "team" ? ceremony : null;
  const places = team?.places.slice().sort((a, b) => (a.rank === 2 ? 0 : a.rank) - (b.rank === 2 ? 0 : b.rank)) ?? [];
  const title = team ? `${ceremony.competition} ${team.showPodium ? "시상식" : "최종 결과"}` : `${ceremony.competition} 개인 시상식`;
  return (
    <Modal onClose={onClose}>
      <section role="dialog" aria-modal="true" aria-label={title}>
        <Win title={title}>
          {team?.showPodium && (
            <Stage solo={places.length === 1}>
              {places.map(place => (
                <div key={place.rank} class={`ceremony-position rank-${place.rank}`}>
                  <TrainerSprite sprite={place.sprite} />
                  <div class="ceremony-step" aria-hidden="true">{place.rank}</div>
                </div>
              ))}
            </Stage>
          )}
          {team && <ol class="ceremony-results">
            {team.places.map(place => <li key={place.rank}><b>{team.places.length === 1 ? "우승" : `${place.rank}위`}</b> {place.name}</li>)}
          </ol>}
          {ceremony.kind === "individual" && (
            <>
              <Stage solo>
                <div class="ceremony-position rank-1">
                  <MonSprite species={ceremony.species} />
                  <div class="ceremony-step" aria-hidden="true">★</div>
                </div>
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
