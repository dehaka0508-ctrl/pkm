import { useEffect, useState } from "preact/hooks";
import { REGIONS, regionById } from "../data/dex";
import { PHASE_KO, phaseOf, weekLabel } from "../game/calendar";
import { advance } from "../game/season";
import { displayName, displaySprite, displayRole, teamOf, type GameState } from "../game/state";
import { rankOf, standings } from "../game/league";
import { workerSimulator } from "../battle/sim-pool";
import { getGame, go, update, useStore, refresh, consumeAutoAdvance } from "./store";
import { Form, Modal, MonIcon, Money, TrainerSprite, Win, useToast } from "./components";
import { TrainerModal } from "./TeamView";
import { SquadTab } from "./tabs/Squad";
import { TrainingTab } from "./tabs/Training";
import { ScoutTab } from "./tabs/Scout";
import { OfficeTab } from "./tabs/Office";
import { PwtTab } from "./tabs/Pwt";
import { SettingsTab } from "./tabs/Settings";
import { InboxTab } from "./tabs/Inbox";

const TABS: [string, string][] = [
  ["home", "홈"],
  ["league", "리그 순위"],
  ["fixtures", "일정·결과"],
  ["squad", "스쿼드"],
  ["training", "훈련"],
  ["scout", "스카우트"],
  ["office", "경영·시설"],
  ["pwt", "PWT"],
  ["inbox", "소식"],
  ["settings", "설정"],
];

let busy = false;

export function Hub({ tab = "home" }: { tab?: string }) {
  const { game } = useStore();
  const [progress, setProgress] = useState<string | null>(null);
  const [summary, setSummary] = useState<string[] | null>(null);
  const [toast, showToast] = useToast();
  useEffect(() => {
    if (consumeAutoAdvance()) doAdvance();
  }, []);
  if (!game) return null;
  const g = game;
  const unread = g.inbox.filter(m => !m.read).length;

  const doAdvance = async () => {
    if (busy) return;
    busy = true;
    setProgress("진행 중…");
    try {
      const st = getGame();
      const r = await advance(st, workerSimulator, (d, t) => setProgress(`다른 경기 진행 중… ${d}/${t}`));
      update(() => {});
      if (r.type === "match") go({ name: "prep" });
      else setSummary(r.summary);
    } catch (e) {
      console.error(e);
      showToast("진행 중 오류가 발생했습니다.");
    } finally {
      busy = false;
      setProgress(null);
    }
  };

  return (
    <>
      <TopBar g={g} onAdvance={doAdvance} busy={!!progress} />
      <div class="page hub">
        <div class="nav">
          {TABS.map(([id, label]) => (
            <button key={id} class={`btn ${tab === id ? "sel" : ""}`} onClick={() => go({ name: "hub", tab: id })}>
              {label}
              {id === "inbox" && unread > 0 && <span class="chip" style={{ marginLeft: 6, background: "var(--red)" }}>{unread}</span>}
            </button>
          ))}
        </div>
        <div class="col" style={{ minWidth: 0 }}>
          {tab === "home" && <HomeTab g={g} onAdvance={doAdvance} />}
          {tab === "league" && <LeagueTab g={g} />}
          {tab === "fixtures" && <FixturesTab g={g} />}
          {tab === "squad" && <SquadTab g={g} />}
          {tab === "training" && <TrainingTab g={g} />}
          {tab === "scout" && <ScoutTab g={g} />}
          {tab === "office" && <OfficeTab g={g} />}
          {tab === "pwt" && <PwtTab g={g} />}
          {tab === "inbox" && <InboxTab g={g} />}
          {tab === "settings" && <SettingsTab g={g} />}
        </div>
      </div>
      {progress && (
        <div class="modal-bg">
          <Win class="w2">
            <span class="spinner" /> {progress}
          </Win>
        </div>
      )}
      {summary && (
        <Modal onClose={() => setSummary(null)}>
          <Win title={`${weekLabel(g.week === 1 ? 52 : g.week - 1)} 결과`} right={<button class="btn small primary" onClick={() => setSummary(null)}>확인</button>}>
            <div class="col small scroll-y" style={{ gap: 2 }}>
              {summary.length ? summary.map((l, i) => <div key={i}>· {l}</div>) : <div class="muted">특별한 일이 없었습니다.</div>}
            </div>
            <div class="row" style={{ marginTop: 8 }}>
              <button
                class="btn primary"
                onClick={() => {
                  setSummary(null);
                  doAdvance();
                }}
              >
                다음 주로 ▶
              </button>
            </div>
          </Win>
        </Modal>
      )}
      {toast}
    </>
  );
}

function TopBar({ g, onAdvance, busy }: { g: GameState; onAdvance: () => void; busy: boolean }) {
  const phase = phaseOf(g.week);
  return (
    <div class="app-top">
      <div class="wrap">
        <span class="brand" style={{ cursor: "pointer" }} onClick={() => go({ name: "title" })}>
          포켓 리그
        </span>
        <span>
          시즌 {g.season} · <b class="gold">{weekLabel(g.week)}</b> <span class="muted small">{PHASE_KO[phase]}</span>
        </span>
        <span class="hide-sm">
          {g.player.name} <span class="muted small">({regionById(g.player.region).name})</span>
        </span>
        <Money v={g.player.money} />
        <span class="small muted hide-sm">명성 {Math.round(g.player.reputation)} · 팬 {g.player.fans.toLocaleString()}</span>
        <button class="btn primary right" disabled={busy} onClick={onAdvance}>
          {g.pending ? "경기 준비 ▶" : "진행 ▶"}
        </button>
      </div>
    </div>
  );
}

function nextFixture(g: GameState) {
  const lg = g.leagues[g.player.region];
  for (let i = lg.nextRound; i < lg.rounds.length; i++) {
    const f = lg.rounds[i].find(x => x.home === g.player.slotId || x.away === g.player.slotId);
    if (f && !f.result) return { f, round: i, week: lg.roundWeeks[i] };
  }
  return null;
}

function HomeTab({ g, onAdvance }: { g: GameState; onAdvance: () => void }) {
  const [view, setView] = useState<string | null>(null);
  const nf = nextFixture(g);
  const lg = g.leagues[g.player.region];
  const table = standings(lg);
  const myRank = rankOf(lg, g.player.slotId);
  const me = g.player.slotId;
  const phase = phaseOf(g.week);
  return (
    <>
      <div class="grid2">
        <Win title={g.pending ? g.pending.label : "다음 경기"} class="w2">
          {g.pending ? (
            <div class="col">
              <OpponentLine g={g} id={g.pending.opponent} onClick={() => setView(g.pending!.opponent)} />
              <button class="btn primary" onClick={() => go({ name: "prep" })}>
                경기 준비 ▶
              </button>
            </div>
          ) : nf && phase !== "offseason" ? (
            <div class="col">
              <div class="small muted">
                {nf.round + 1}라운드 · {weekLabel(nf.week)} · {nf.f.home === me ? "홈" : "원정"}
              </div>
              <OpponentLine g={g} id={nf.f.home === me ? nf.f.away : nf.f.home} onClick={() => setView(nf.f.home === me ? nf.f.away : nf.f.home)} />
            </div>
          ) : (
            <div class="muted">{phase === "preseason" ? "2월부터 리그가 시작됩니다." : "남은 리그 경기가 없습니다."}</div>
          )}
          <div class="row" style={{ marginTop: 8 }}>
            <button class="btn" onClick={onAdvance}>
              {g.pending ? "경기 준비" : "한 주 진행"} ▶
            </button>
          </div>
        </Win>
        <Win title={`${regionById(g.player.region).name} 리그 · 현재 ${myRank}위`} right={<button class="btn small" onClick={() => go({ name: "hub", tab: "league" })}>전체</button>}>
          <table class="tbl">
            <thead>
              <tr>
                <th>#</th>
                <th>트레이너</th>
                <th class="n">승점</th>
                <th class="n">득실</th>
              </tr>
            </thead>
            <tbody>
              {table
                .map((r, i) => ({ r, i }))
                .filter(({ r, i }) => i < 5 || r.id === me)
                .map(({ r, i }) => (
                  <tr key={r.id} class={r.id === me ? "me" : ""}>
                    <td>{i + 1}</td>
                    <td>{displayName(g, r.id)}</td>
                    <td class="n">{r.pts}</td>
                    <td class="n">{r.diff > 0 ? "+" : ""}{r.diff}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </Win>
      </div>
      <Win title="지난 주 요약">
        <div class="col small" style={{ gap: 2 }}>
          {g.lastWeekSummary.length ? g.lastWeekSummary.slice(0, 12).map((l, i) => <div key={i}>· {l}</div>) : <div class="muted">아직 진행한 주가 없습니다. 오른쪽 위 [진행 ▶]으로 한 주씩 넘기세요.</div>}
        </div>
      </Win>
      <Win title="내 엔트리" right={<button class="btn small" onClick={() => go({ name: "hub", tab: "squad" })}>스쿼드</button>}>
        <div class="row">
          {teamOf(g, me).map((m, i) => (
            <div key={i} class="col center" style={{ gap: 0, alignItems: "center" }}>
              <MonIcon species={m.species} scale={2} />
              <span class="tiny">Lv.{m.level}</span>
            </div>
          ))}
        </div>
      </Win>
      {view && <TrainerModal id={view} onClose={() => setView(null)} />}
    </>
  );
}

export function OpponentLine({ g, id, onClick }: { g: GameState; id: string; onClick?: () => void }) {
  const team = teamOf(g, id);
  return (
    <div class="row" style={{ cursor: onClick ? "pointer" : undefined }} onClick={onClick}>
      <TrainerSprite sprite={displaySprite(g, id)} scale={1} box={64} />
      <div class="grow">
        <b>{displayName(g, id)}</b> <span class="tiny muted">{displayRole(g, id)}</span>
        <div class="row" style={{ gap: 0 }}>
          {team.map((m, i) => (
            <MonIcon key={i} species={m.species} scale={1} />
          ))}
        </div>
      </div>
    </div>
  );
}

function LeagueTab({ g }: { g: GameState }) {
  const [region, setRegion] = useState(g.player.region);
  const [view, setView] = useState<string | null>(null);
  const lg = g.leagues[region];
  const table = standings(lg);
  const me = g.player.slotId;
  return (
    <Win title={`${regionById(region).name} 리그`} right={<span class="tiny muted">{lg.nextRound}/{lg.rounds.length} 라운드</span>}>
      <div class="row" style={{ gap: 4, marginBottom: 8 }}>
        {REGIONS.map(r => (
          <button key={r.id} class={`btn small ${r.id === region ? "sel" : ""}`} onClick={() => setRegion(r.id)}>
            {r.name}
          </button>
        ))}
      </div>
      <div class="tbl-wrap">
        <table class="tbl">
          <thead>
            <tr>
              <th>#</th>
              <th>트레이너</th>
              <th class="n">경기</th>
              <th class="n">승</th>
              <th class="n">무</th>
              <th class="n">패</th>
              <th class="n">득실</th>
              <th class="n">승점</th>
              <th class="hide-sm">최근</th>
            </tr>
          </thead>
          <tbody>
            {table.map((r, i) => (
              <tr key={r.id} class={`click ${r.id === me ? "me" : ""} ${i < 3 ? "q" : ""}`} onClick={() => r.id !== me && setView(r.id)}>
                <td>{i + 1}</td>
                <td>
                  {displayName(g, r.id)} <span class="tiny muted">{displayRole(g, r.id)}</span>
                </td>
                <td class="n">{r.p}</td>
                <td class="n">{r.w}</td>
                <td class="n">{r.d}</td>
                <td class="n">{r.l}</td>
                <td class="n">{r.diff > 0 ? "+" : ""}{r.diff}</td>
                <td class="n">
                  <b>{r.pts}</b>
                </td>
                <td class="hide-sm">
                  <Form form={r.form} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div class="tiny muted" style={{ marginTop: 6 }}>
        승 3점 · 무 1점 · 득실 = 남은 포켓몬 수 차이. 초록 표시는 PWT 진출권(상위 3위, 계수 상위 5개 지방은 4위까지).
      </div>
      {view && <TrainerModal id={view} onClose={() => setView(null)} />}
    </Win>
  );
}

function FixturesTab({ g }: { g: GameState }) {
  const lg = g.leagues[g.player.region];
  const me = g.player.slotId;
  const [round, setRound] = useState(Math.max(0, Math.min(lg.rounds.length - 1, lg.nextRound - 1)));
  return (
    <div class="grid2">
      <Win title="내 일정">
        <div class="scroll-y" style={{ maxHeight: 560 }}>
          <table class="tbl">
            <tbody>
              {lg.rounds.map((rd, i) => {
                const f = rd.find(x => x.home === me || x.away === me);
                if (!f) return null;
                const home = f.home === me;
                const opp = home ? f.away : f.home;
                let res = "";
                let cls = "";
                if (f.result) {
                  const my = home ? f.result.h : f.result.a;
                  const op = home ? f.result.a : f.result.h;
                  const won = f.result.w === -1 ? null : (f.result.w === 0) === home;
                  res = `${won === null ? "무" : won ? "승" : "패"} ${my}:${op}`;
                  cls = won === null ? "" : won ? "good" : "bad";
                }
                return (
                  <tr key={i} class="click" onClick={() => setRound(i)}>
                    <td class="tiny muted">{i + 1}R</td>
                    <td class="tiny muted">{weekLabel(lg.roundWeeks[i])}</td>
                    <td>{home ? "홈" : "원정"}</td>
                    <td>{displayName(g, opp)}</td>
                    <td class={`n ${cls}`}>{res}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Win>
      <Win
        title={`${round + 1}라운드 결과`}
        right={
          <>
            <button class="btn small" disabled={round <= 0} onClick={() => setRound(round - 1)}>
              ◀
            </button>
            <button class="btn small" disabled={round >= lg.rounds.length - 1} onClick={() => setRound(round + 1)}>
              ▶
            </button>
          </>
        }
      >
        <table class="tbl">
          <tbody>
            {lg.rounds[round].map((f, i) => (
              <tr key={i} class={f.home === me || f.away === me ? "me" : ""}>
                <td style={{ textAlign: "right" }}>{displayName(g, f.home)}</td>
                <td class="center num" style={{ width: 60 }}>
                  {f.result ? `${f.result.h} : ${f.result.a}` : "vs"}
                </td>
                <td>{displayName(g, f.away)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Win>
    </div>
  );
}

export { refresh };
