import { useMemo, useState } from "preact/hooks";
import { REGIONS, dex, koAbility, koNature, koSpecies, josa } from "../data/dex";
import { roleLabel, allTrainers, resolveTeam, teamRating } from "../game/lineups";
import { ROLE_START_ITEMS, startingItems } from "../game/npc";
import { RENTED_SEATS, roleRented, roleSeats } from "../game/finance";
import { freshTeam } from "../game/fresh";
import { createGame, playerSprite, type PlayerGender, type ScoutCandidate } from "../game/state";
import { ROOKIE_QUESTION, ROOKIE_STAGES, rookieOptions, scoutStartOptions } from "../game/scouting";
import { go, setGame } from "./store";
import { MonIcon, Stars, TrainerSprite, Win, Modal } from "./components";
import { MonCard, TeamList } from "./TeamView";
import { CustomStart } from "./CustomStart";

type Step = "mode" | "trainer" | "scout-region" | "scout-pick" | "custom";
type NpcMode = "done" | "fresh";
type PlayerMode = "trainer" | "scout" | "custom";

const NPC_MODES: { id: NpcMode; title: string; desc: string }[] = [
  { id: "done", title: "완성", desc: "모든 트레이너가 데이터 그대로의 완성된 라인업·명성·경기장·도구로 시작합니다." },
  { id: "fresh", title: "새출발", desc: "모든 트레이너의 포켓몬이 Lv.5 미진화체가 됩니다. 성격·특성·개체값은 매번 무작위, 도구·기믹 없음, 명성·잔고·경기장은 신인과 같습니다. 포켓몬은 매주 자라며 진화합니다." },
];
const PLAYER_MODES: { id: PlayerMode; title: string; desc: string; fresh?: string }[] = [
  { id: "trainer", title: "이어받기", desc: "180명의 트레이너 중 한 명이 되어 그 트레이너의 라인업으로 리그에 뛰어듭니다.", fresh: "새출발: 그 트레이너의 포켓몬이 Lv.5 미진화체가 되고, 신인과 같은 명성·경기장으로 시작합니다." },
  { id: "scout", title: "신인", desc: "이어받을 리그 자리를 고른 뒤, 질문에 답하며 Lv.5 포켓몬 6마리를 데려갑니다 (파트너 1 · 처음 잡은 포켓몬 1 · 모험에서 만난 포켓몬 2 · 여행에서 만날 포켓몬 2)." },
  { id: "custom", title: "커스텀", desc: "원하는 포켓몬 4~6마리를 폼·성별·성격·특성·개체값·기술까지 직접 정해서 시작합니다.", fresh: "새출발: Lv.5 미진화체만 고를 수 있습니다 (레벨은 5로 고정)." },
];

export function NewGame() {
  const [step, setStep] = useState<Step>("mode");
  const [region, setRegion] = useState("kanto");
  const [npcMode, setNpcMode] = useState<NpcMode>("done");
  const [playerMode, setPlayerMode] = useState<PlayerMode>("trainer");
  /** 새출발: the seed every trainer's Lv.5 six are rolled from (rolled first, when 시작 is pressed) */
  const [fresh, setFresh] = useState<string | undefined>(undefined);
  const start = () => {
    setFresh(npcMode === "fresh" ? `f${Math.floor(Math.random() * 2 ** 31).toString(36)}` : undefined);
    setStep(playerMode === "trainer" ? "trainer" : playerMode === "scout" ? "scout-region" : "custom");
  };
  return (
    <div class="page col" style={{ gap: 12 }}>
      <div class="row">
        <button class="btn small" onClick={() => (step === "mode" ? go({ name: "title" }) : setStep(step === "scout-pick" ? "scout-region" : "mode"))}>
          ◀ 뒤로
        </button>
        <h2 class="gold">새 게임</h2>
        {step !== "mode" && <span class="chip">{fresh ? "새출발" : "완성"} · {PLAYER_MODES.find(m => m.id === playerMode)!.title}</span>}
      </div>
      {step === "mode" && (
        <div class="col" style={{ gap: 12, maxWidth: 760 }}>
          <ModePick title="1. NPC 트레이너" options={NPC_MODES} value={npcMode} onChange={setNpcMode} />
          <ModePick title="2. 플레이어" options={PLAYER_MODES} value={playerMode} onChange={setPlayerMode} fresh={npcMode === "fresh"} />
          <div class="row" style={{ justifyContent: "flex-end" }}>
            <button class="btn primary big" onClick={start}>
              시작 ▶
            </button>
          </div>
        </div>
      )}
      {step === "trainer" && <TrainerPicker region={region} setRegion={setRegion} fresh={fresh} />}
      {(step === "scout-region" || step === "scout-pick") && <ScoutStart region={region} setRegion={setRegion} step={step} setStep={setStep} fresh={fresh} />}
      {step === "custom" && <CustomStart region={region} setRegion={setRegion} fresh={fresh} />}
    </div>
  );
}

function ModePick<T extends string>({ title, options, value, onChange, fresh }: { title: string; options: { id: T; title: string; desc: string; fresh?: string }[]; value: T; onChange: (v: T) => void; fresh?: boolean }) {
  const cur = options.find(o => o.id === value);
  return (
    <Win title={title}>
      <div class="row" role="group" aria-label={title} style={{ gap: 6 }}>
        {options.map(o => (
          <button type="button" key={o.id} class={`btn ${o.id === value ? "sel" : ""}`} aria-pressed={o.id === value} onClick={() => onChange(o.id)}>
            {o.title}
          </button>
        ))}
      </div>
      <div class="small muted" style={{ marginTop: 6 }}>{cur?.desc}</div>
      {fresh && cur?.fresh && <div class="small gold">{cur.fresh}</div>}
    </Win>
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

function TrainerPicker({ region, setRegion, fresh }: { region: string; setRegion: (r: string) => void; fresh?: string }) {
  const [sel, setSel] = useState<string | null>(null);
  const trainers = allTrainers().filter(t => t.region === region);
  const t = sel ? trainers.find(x => x.id === sel) : null;
  // 새출발: the six rolled for this game (the same ones the trainer gets on 시작)
  const teams = useMemo(() => Object.fromEntries(trainers.map(tr => [tr.id, fresh ? freshTeam(tr, fresh) : resolveTeam(tr)])), [region, fresh]);
  return (
    <>
      <RegionTabs region={region} setRegion={setRegion} />
      <div class="cards">
        {trainers.map(tr => {
          const team = teams[tr.id];
          const ph = team.filter(m => m.placeholder).length;
          return (
            <div key={tr.id} class="card" onClick={() => setSel(tr.id)}>
              <div class="row" style={{ alignItems: "flex-end" }}>
                <TrainerSprite sprite={tr.sprite} scale={1} box={64} />
                <div class="grow">
                  <b>{tr.name}</b>
                  <div class="tiny muted">
                    {roleLabel(tr)} · 전력 {teamRating(team)}
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
          <Win title={`${t.name} · ${roleLabel(t)}`} right={<button class="btn small" onClick={() => setSel(null)}>닫기</button>}>
            <div class="row" style={{ alignItems: "flex-start" }}>
              <TrainerSprite sprite={t.sprite} box={130} />
              <div class="grow col">
                <div class="small">배틀은 실전 룰대로 모두 Lv.50 능력치로 치릅니다.</div>
                <button
                  class="btn primary big"
                  onClick={() => {
                    setGame(createGame({ mode: "trainer", slotId: t.id, name: t.name, fresh }));
                    go({ name: "hub" });
                  }}
                >
                  {josa(t.name.split(" ").pop()!, "으로")} 시작
                </button>
              </div>
            </div>
            {fresh ? (
              <div class="tiny muted">새출발: Lv.5 미진화체 6마리로, 도구 없이 신인과 같은 명성으로 {RENTED_SEATS.toLocaleString()}석 경기장을 빌려 쓰며 시작합니다.</div>
            ) : (
              <div class="tiny muted">처음엔 등급에 따라 도구 {ROLE_START_ITEMS[t.role] ?? 0}개로 시작합니다 (메가스톤·Z크리스탈·테라스탈 포함, 나머지는 강한 포켓몬부터). {roleSeats(t.role) ? `전용 경기장 ${roleSeats(t.role).toLocaleString()}석.` : `${roleRented(t.role).toLocaleString()}석 경기장을 빌려 씁니다.`}</div>
            )}
            <TeamList team={fresh ? teams[t.id] : startTeam(t)} />
          </Win>
        </Modal>
      )}
    </>
  );
}

/** The team as the player would get it: held items only on the strongest few (by role). */
function startTeam(t: Parameters<typeof resolveTeam>[0]) {
  const items = startingItems(t);
  return resolveTeam(t).map((m, i) => ({ ...m, item: items[String(i)] || "", teraType: null }));
}

/** Default league slot to take over: a generic trainer, otherwise the weakest. */
export function defaultSlotOf(region: string): string {
  const trainers = allTrainers().filter(t => t.region === region);
  const generic = trainers.find(t => t.role === "트레이너");
  if (generic) return generic.id;
  return trainers.slice().sort((a, b) => teamRating(resolveTeam(a)) - teamRating(resolveTeam(b)))[0].id;
}

/** Region, league slot and trainer name (shared by the rookie and custom starts). */
export function SlotSetup(props: { region: string; setRegion: (r: string) => void; slotId: string; setSlot: (id: string) => void; name: string; setName: (n: string) => void; gender: PlayerGender; setGender: (gender: PlayerGender) => void }) {
  const trainers = allTrainers().filter(t => t.region === props.region);
  return (
    <>
      <Win title="1. 지방 고르기">
        <RegionTabs region={props.region} setRegion={props.setRegion} />
      </Win>
      <Win title="2. 이어받을 리그 자리" right={<span class="tiny muted">이 트레이너는 리그에서 빠집니다</span>}>
        <div class="cards">
          {trainers.map(t => (
            <div key={t.id} class={`card ${t.id === props.slotId ? "sel" : ""}`} onClick={() => props.setSlot(t.id)}>
              <div class="row">
                <TrainerSprite sprite={t.sprite} scale={1} box={48} />
                <div>
                  <b>{t.name}</b>
                  <div class="tiny muted">{roleLabel(t)}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Win>
      <Win title="3. 트레이너 설정">
        <div class="row" style={{ alignItems: "center" }}>
          <TrainerSprite sprite={playerSprite(props.gender)} scale={1} box={70} />
          <div class="col">
            <label class="small">트레이너 이름 <input type="text" value={props.name} maxLength={10} onInput={e => props.setName(e.currentTarget.value)} /></label>
            <div class="row" role="group" aria-label="트레이너 성별">
              {(["M", "F"] as const).map(gender => <button type="button" key={gender} class={`btn small ${props.gender === gender ? "sel" : ""}`} aria-pressed={props.gender === gender} onClick={() => props.setGender(gender)}>{gender === "M" ? "남자" : "여자"}</button>)}
            </div>
          </div>
        </div>
      </Win>
    </>
  );
}

function ScoutStart({ region, setRegion, step, setStep, fresh }: { region: string; setRegion: (r: string) => void; step: Step; setStep: (s: Step) => void; fresh?: string }) {
  const trainers = allTrainers().filter(t => t.region === region);
  const defaultSlot = useMemo(() => defaultSlotOf(region), [region]);
  const [slot, setSlot] = useState<string | null>(null);
  const [name, setName] = useState("나");
  const [gender, setGender] = useState<PlayerGender>("M");
  const [rerolls, setRerolls] = useState(2);
  const [seed] = useState(() => String(Math.random()));
  const [picks, setPicks] = useState<ScoutCandidate[]>([]);
  // each question's three, rolled for the region (a re-scout replaces one question's three)
  const [opts, setOpts] = useState<{ region: string; list: ScoutCandidate[][] } | null>(null);
  const rolled = useMemo(() => scoutStartOptions(region, `${region}:${seed}`), [region, seed]);
  const list = opts?.region === region ? opts.list : rolled;
  const slotId = slot && trainers.some(t => t.id === slot) ? slot : defaultSlot;

  if (step === "scout-region") {
    return (
      <>
        <SlotSetup region={region} setRegion={r => (setRegion(r), setSlot(null), setPicks([]))} slotId={slotId} setSlot={setSlot} name={name} setName={setName} gender={gender} setGender={setGender} />
        <div class="row" style={{ justifyContent: "flex-end" }}>
          <button class="btn primary" disabled={!name.trim()} onClick={() => setStep("scout-pick")}>
            포켓몬 고르기 ▶
          </button>
        </div>
      </>
    );
  }
  const TOTAL = ROOKIE_STAGES.length;
  const i = Math.min(TOTAL - 1, picks.length);
  const stage = ROOKIE_STAGES[i];
  const canReroll = (stage === "region" || stage === "world") && picks.length < TOTAL;
  const reroll = () => {
    const taken = new Set([...list.flat(), ...picks].map(c => dex.species.get(c.species).id));
    const next = list.slice();
    next[i] = rookieOptions(region, stage, `${region}:${seed}:re${rerolls}:${Math.random()}`, taken);
    if (!next[i].length) return;
    setOpts({ region, list: next });
    setRerolls(r => r - 1);
  };
  return (
    <>
      <Win
        title={picks.length < TOTAL ? `${i + 1}/${TOTAL} · ${ROOKIE_QUESTION[stage]}` : `${REGIONS.find(r => r.id === region)!.name}의 신인 트레이너 ${name.trim() || "나"}`}
        right={
          canReroll ? (
            <button class="btn small" disabled={rerolls <= 0} onClick={reroll}>
              다시 만나기 ({rerolls})
            </button>
          ) : null
        }
      >
        <div class="small muted">Lv.5 포켓몬 6마리를 데려갑니다. 개체값 ★는 추정치입니다.</div>
        {picks.length > 0 && (
          <div class="row" style={{ marginTop: 6 }}>
            {picks.map((c, k) => (
              <span key={c.id} class="chip">
                {k + 1}. {koSpecies(c.species)}
              </span>
            ))}
            <button class="btn small" onClick={() => setPicks(p => p.slice(0, -1))}>
              ◀ 이전 선택 취소
            </button>
          </div>
        )}
      </Win>
      {picks.length < TOTAL && (
        <div class="cards">
          {list[i].map(c => (
            <MonCard key={c.id} m={c} onClick={() => setPicks(p => [...p, c])}>
              <div class="tiny">
                <Stars n={c.stars} /> · {koNature(c.nature)} · {koAbility(c.ability)}
                {c.shiny && <span class="gold"> · 이로치!</span>}
              </div>
            </MonCard>
          ))}
        </div>
      )}
      <div class="row" style={{ justifyContent: "flex-end" }}>
        <button
          class="btn primary big"
          disabled={picks.length !== TOTAL}
          onClick={() => {
            setGame(createGame({ mode: "scout", slotId, name: name.trim() || "나", gender, scoutPicks: picks, fresh }));
            go({ name: "hub" });
          }}
        >
          이 {TOTAL}마리로 시작 ({picks.length}/{TOTAL})
        </button>
      </div>
    </>
  );
}
