import { useEffect, useState } from "preact/hooks";
import { useStore, setGame, go } from "./store";
import { loadGame, type GameState } from "../game/state";
import { NewGame } from "./NewGame";
import { Hub } from "./Hub";
import { MatchPrep } from "./MatchPrep";
import { BattleScreen } from "./BattleView";
import { arenaEntry } from "../render/assets";
import { Win, useToast } from "./components";

export function App() {
  const { screen } = useStore();
  useEffect(() => {
    document.fonts?.load("16px Galmuri11").catch(() => {});
  }, []);
  switch (screen.name) {
    case "new":
      return <NewGame />;
    case "hub":
      return <Hub tab={screen.tab} />;
    case "prep":
      return <MatchPrep />;
    case "battle":
      return <BattleScreen mode={screen.mode} />;
    default:
      return <Title />;
  }
}

function Title() {
  const [bg, setBg] = useState<string | null>(null);
  const [toast, showToast] = useToast();
  const saved = loadGame();
  useEffect(() => {
    arenaEntry("plains_bg").then(e => e && setBg(e.img));
  }, []);
  const importSave = () => {
    const inp = document.createElement("input");
    inp.type = "file";
    inp.accept = ".json,application/json";
    inp.onchange = async () => {
      const f = inp.files?.[0];
      if (!f) return;
      try {
        const g = JSON.parse(await f.text()) as GameState;
        if (g.version !== 2 || !g.player) throw new Error();
        setGame(g);
        go({ name: "hub" });
      } catch {
        showToast("저장 파일을 읽지 못했습니다.");
      }
    };
    inp.click();
  };
  return (
    <div class="page" style={{ minHeight: "100vh", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", gap: 24 }}>
      {bg && <div class="title-bg" style={{ backgroundImage: `url(${bg})` }} />}
      <div class="center">
        <div class="logo">포켓 리그</div>
        <div class="muted">포켓몬 트레이너 리그 매니지먼트 · 비공식 팬게임</div>
      </div>
      <Win class="w2" style={{ width: "min(420px, 100%)" }}>
        <div class="col">
          {saved && (
            <button
              class="btn primary big"
              onClick={() => {
                setGame(saved);
                go({ name: "hub" });
              }}
            >
              이어하기 — 시즌 {saved.season} · {saved.player.name}
            </button>
          )}
          <button class={`btn big ${saved ? "" : "primary"}`} onClick={() => go({ name: "new" })}>
            새 게임
          </button>
          <button class="btn" onClick={importSave}>
            저장 파일 불러오기
          </button>
        </div>
      </Win>
      <div class="tiny muted center" style={{ maxWidth: 560 }}>
        Pokémon 및 관련 명칭은 Nintendo · Creatures · GAME FREAK의 상표입니다. 이 게임은 비공식 팬게임으로 어떤 공식 단체와도 관련이 없습니다.
        <br />
        그래픽·기술 애니메이션: PokéRogue (AGPL-3.0) · 배틀 엔진: Pokémon Showdown (MIT) · 글꼴: Galmuri (OFL)
      </div>
      {toast}
    </div>
  );
}
