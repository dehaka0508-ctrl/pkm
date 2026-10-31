import { useMemo, useState } from "preact/hooks";
import { REGIONS, koAbility, koNature, josa } from "../data/dex";
import { allTrainers, resolveTeam, roleIv, teamRating } from "../game/lineups";
import { createGame, type ScoutCandidate } from "../game/state";
import { starterCandidates } from "../game/scouting";
import { go, setGame } from "./store";
import { MonIcon, Stars, TrainerSprite, Win, Modal } from "./components";
import { MonCard, TeamList } from "./TeamView";

type Step = "mode" | "trainer" | "scout-region" | "scout-pick";

export function NewGame() {
  const [step, setStep] = useState<Step>("mode");
  const [region, setRegion] = useState("kanto");
  return (
    <div class="page col" style={{ gap: 12 }}>
      <div class="row">
        <button class="btn small" onClick={() => (step === "mode" ? go({ name: "title" }) : setStep(step === "scout-pick" ? "scout-region" : "mode"))}>
          ◀ 뒤로
        </button>
        <h2 class="gold">새 게임</h2>
      </div>
      {step === "mode" && (
        <div class="grid2">
          <Win title="트레이너로 시작" class="w2">
            <p>180명의 트레이너 중 한 명이 되어, 그 트레이너의 완성된 라인업으로 리그에 뛰어듭니다.</p>
            <button class="btn primary" onClick={() => setStep("trainer")}>
              트레이너 고르기
            </button>
          </Win>
          <Win title="스카우트로 시작" class="w3">
            <p>신인 트레이너로 시작합니다. 지방을 고르고, Lv.5 포켓몬 3마리를 스카우트해 키워 나갑니다. 고른 지방의 트레이너 한 명의 리그 자리를 이어받습니다.</p>
            <button class="btn primary" onClick={() => setStep("scout-region")}>
              지방 고르기
            </button>
          </Win>
        </div>
      )}
      {step === "trainer" && <TrainerPicker region={region} setRegion={setRegion} />}
      {(step === "scout-region" || step === "scout-pick") && <ScoutStart region={region} setRegion={setRegion} step={step} setStep={setStep} />}
    </div>
  );
}

function RegionTabs({ region, setRegion }: { region: string; setRegion: (r: string) => void }) {
  return (
    <div class="row" style={{ gap: 4 }}>
      {REGIONS.map(r => (
        <button key={r.id} class={`btn small ${r.id === region ? "sel" : ""}`} onClick={() => setRegion(r.id)}>
          {r.name}
        </button>
      ))}
    </div>
  );
}

function TrainerPicker({ region, setRegion }: { region: string; setRegion: (r: string) => void }) {
  const [sel, setSel] = useState<string | null>(null);
  const trainers = allTrainers().filter(t => t.region === region);
  const t = sel ? trainers.find(x => x.id === sel) : null;
  return (
    <>
      <RegionTabs region={region} setRegion={setRegion} />
      <div class="cards">
        {trainers.map(tr => {
          const team = resolveTeam(tr);
          const ph = team.filter(m => m.placeholder).length;
          return (
            <div key={tr.id} class="card" onClick={() => setSel(tr.id)}>
              <div class="row" style={{ alignItems: "flex-end" }}>
                <TrainerSprite sprite={tr.sprite} scale={1} box={64} />
                <div class="grow">
                  <b>{tr.name}</b>
                  <div class="tiny muted">
                    {tr.role} · 전력 {teamRating(team)}
                  </div>
                  {ph > 0 && <span class="chip ph">임시 {ph}</span>}
                </div>
              </div>
              <div class="row" style={{ gap: 0 }}>
                {team.map((m, i) => (
                  <MonIcon key={i} species={m.species} scale={1} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
      {t && (
        <Modal onClose={() => setSel(null)}>
          <Win title={`${t.name} · ${t.role}`} right={<button class="btn small" onClick={() => setSel(null)}>닫기</button>}>
            <div class="row" style={{ alignItems: "flex-start" }}>
              <TrainerSprite sprite={t.sprite} box={130} />
              <div class="grow col">
                <div class="small muted">출처: {t.source || "미입력 (전부 임시 포켓몬)"}</div>
                <div class="small">레벨은 모두 50, 개체값은 {t.role} 기준 전원 {roleIv(t.role)}입니다.</div>
                <button
                  class="btn primary big"
                  onClick={() => {
                    setGame(createGame({ mode: "trainer", slotId: t.id, name: t.name }));
                    go({ name: "hub" });
                  }}
                >
                  {josa(t.name, "으로")} 시작
                </button>
              </div>
            </div>
            <TeamList team={resolveTeam(t)} />
          </Win>
        </Modal>
      )}
    </>
  );
}

function ScoutStart({ region, setRegion, step, setStep }: { region: string; setRegion: (r: string) => void; step: Step; setStep: (s: Step) => void }) {
  const trainers = allTrainers().filter(t => t.region === region);
  const defaultSlot = useMemo(() => {
    const generic = trainers.find(t => t.role === "트레이너");
    if (generic) return generic.id;
    return trainers.slice().sort((a, b) => teamRating(resolveTeam(a)) - teamRating(resolveTeam(b)))[0].id;
  }, [region]);
  const [slot, setSlot] = useState<string | null>(null);
  const [name, setName] = useState("나");
  const [rerolls, setRerolls] = useState(2);
  const [seed, setSeed] = useState(() => String(Math.random()));
  const [picks, setPicks] = useState<string[]>([]);
  const cands: ScoutCandidate[] = useMemo(() => starterCandidates(region, `${region}:${seed}`), [region, seed]);
  const slotId = slot && trainers.some(t => t.id === slot) ? slot : defaultSlot;

  if (step === "scout-region") {
    return (
      <>
        <Win title="1. 지방 고르기">
          <RegionTabs region={region} setRegion={r => (setRegion(r), setSlot(null), setPicks([]))} />
        </Win>
        <Win title="2. 이어받을 리그 자리" right={<span class="tiny muted">이 트레이너는 리그에서 빠집니다</span>}>
          <div class="cards">
            {trainers.map(t => (
              <div key={t.id} class={`card ${t.id === slotId ? "sel" : ""}`} onClick={() => setSlot(t.id)}>
                <div class="row">
                  <TrainerSprite sprite={t.sprite} scale={1} box={48} />
                  <div>
                    <b>{t.name}</b>
                    <div class="tiny muted">{t.role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Win>
        <Win title="3. 트레이너 이름">
          <div class="row">
            <input type="text" value={name} maxLength={10} onInput={e => setName((e.target as HTMLInputElement).value)} />
            <button class="btn primary" disabled={!name.trim()} onClick={() => setStep("scout-pick")}>
              스카우트 시작 ▶
            </button>
          </div>
        </Win>
      </>
    );
  }
  const toggle = (id: string) => setPicks(p => (p.includes(id) ? p.filter(x => x !== id) : p.length < 3 ? [...p, id] : p));
  return (
    <>
      <Win
        title={`스카우트 보고서 — ${REGIONS.find(r => r.id === region)!.name} (3마리 선택)`}
        right={
          <>
            <button
              class="btn small"
              disabled={rerolls <= 0}
              onClick={() => {
                setRerolls(r => r - 1);
                setSeed(String(Math.random()));
                setPicks([]);
              }}
            >
              다시 스카우트 ({rerolls})
            </button>
          </>
        }
      >
        <div class="small muted">개체값 ★는 스카우트의 추정치라 실제와 다를 수 있습니다.</div>
      </Win>
      <div class="cards">
        {cands.map(c => (
          <MonCard key={c.id} m={c} selected={picks.includes(c.id)} onClick={() => toggle(c.id)}>
            <div class="tiny">
              <Stars n={c.stars} /> · {koNature(c.nature)} · {koAbility(c.ability)}
              {c.shiny && <span class="gold"> · 이로치!</span>}
            </div>
            {picks.includes(c.id) && <span class="pick-num">{picks.indexOf(c.id) + 1}</span>}
          </MonCard>
        ))}
      </div>
      <div class="row">
        <button
          class="btn primary big"
          disabled={picks.length !== 3}
          onClick={() => {
            const chosen = picks.map(id => cands.find(c => c.id === id)!);
            setGame(createGame({ mode: "scout", slotId, name: name.trim() || "나", sprite: "player_m", scoutPicks: chosen }));
            go({ name: "hub" });
          }}
        >
          이 3마리로 시작 ({picks.length}/3)
        </button>
      </div>
    </>
  );
}
