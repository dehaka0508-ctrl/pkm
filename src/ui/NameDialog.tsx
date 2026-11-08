// Naming a Pokémon (after signing it, or from the squad's 능력치 보기). Battles, records and awards use the name.
import { useEffect, useRef, useState } from "preact/hooks";
import { koSpecies } from "../data/dex";
import { NICKNAME_MAX, setNickname } from "../game/training";
import { formSpecies } from "../data/forms";
import { update } from "./store";
import { Modal, MonSprite, Win } from "./components";

export function NameDialog({ m, onClose }: { m: { uid: string; species: string; nickname?: string; item?: string; moves?: string[] }; onClose: () => void }) {
  const [v, setV] = useState(m.nickname || "");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  const save = (name: string) => {
    update(st => {
      const x = st.player.squad.find(y => y.uid === m.uid);
      if (x) setNickname(x, name);
    });
    onClose();
  };
  return (
    <Modal onClose={onClose}>
      <Win title={`${koSpecies(m.species)}에게 이름을 지어 줄까요?`}>
        <div class="row" style={{ alignItems: "center" }}>
          <MonSprite species={formSpecies(m)} scale={1.5} box={96} />
          <div class="col grow" style={{ gap: 6 }}>
            <input
              type="text"
              aria-label="포켓몬 이름"
              value={v}
              maxLength={NICKNAME_MAX}
              placeholder={koSpecies(m.species)}
              ref={input}
              onInput={e => setV(e.currentTarget.value)}
              onKeyDown={e => e.key === "Enter" && save(v)}
            />
            <div class="row">
              <button class="btn primary" onClick={() => save(v)}>
                확인
              </button>
              <button class="btn" onClick={() => save("")}>
                {m.nickname ? "원래 이름으로" : "짓지 않기"}
              </button>
            </div>
          </div>
        </div>
      </Win>
    </Modal>
  );
}
