import { RegistrationDialog, RegistrationNotice } from "./Registration";
import { pendingCompetition, registrationOf, type Competition } from "../game/registration";
import { useEffect, useRef, useState } from "preact/hooks";
import { REGIONS, regionById } from "../data/dex";
import { PHASE_KO, dateLabel, dayOf, leagueRoundDay, phaseOf } from "../game/calendar";
import { FriendlyPanel } from "./FriendlyPanel";
import { advance, pendingDecided, playerSchedule, type ScheduleRow } from "../game/season";

/** The player still has games to play today (a decided match is finished by the next advance). */
const mustPlay = (g: GameState) => !!g.pending && !pendingDecided(g);
import type { DrawData } from "../game/draw";
import { DrawShow } from "./DrawShow";
import { displayName, displaySprite, displayRole, teamOf, type GameState } from "../game/state";
import { rankOf, standings } from "../game/league";
import { workerSimulator } from "../battle/sim-pool";
import { getGame, go, update, useStore, refresh, consumeAutoAdvance } from "./store";
import { declineAllOffers, offersLapsingToday } from "../game/sponsor";
import { moneyBlocked } from "../game/loan";
import { FacilityTab } from "./tabs/Facility";
import { Form, Modal, MonIcon, Money, TrainerSprite, Win, useToast } from "./components";
import { TrainerModal } from "./TeamView";
import { SquadTab } from "./tabs/Squad";
import { TrainingTab } from "./tabs/Training";
import { ScoutTab } from "./tabs/Scout";
import { OfficeTab } from "./tabs/Office";
import { ShopTab } from "./tabs/Shop";
import { PwtTab, CupTab } from "./tabs/Comps";
import { RecordsTab } from "./tabs/Records";
import { SettingsTab } from "./tabs/Settings";
import { InboxTab } from "./tabs/Inbox";

const TABS: [string, string][] = [
  ["home", "홈"],
  ["comps", "대회"],
  ["fixtures", "일정·결과"],
  ["squad", "스쿼드"],
  ["training", "훈련"],
  ["scout", "스카우트"],
  ["shop", "상점·가방"],
  ["office", "경영"],
  ["facility", "시설"],
  ["inbox", "소식"],
  ["settings", "설정"],
];

/** The 대회 tab's sub-tabs; their ids are also the hub routes, so old links still land in the right place. */
const COMP_TABS: [string, string][] = [
  ["league", "리그 순위"],
  ["pwt", "PWT"],
  ["pct", "PCT"],
  ["cup", "지방 컵"],
  ["records", "기록"],
];
const isCompTab = (t: string) => COMP_TABS.some(([id]) => id === t);
/** last sub-tab opened in 대회 (the nav button returns there) */
let lastComp = "league";

let busy = false;

export function Hub({ tab = "home" }: { tab?: string }) {
  const { game } = useStore();
  const [progress, setProgress] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ lines: string[]; day: number } | null>(null);
  const [draws, setDraws] = useState<DrawData[]>([]);
  const [noSponsorAsk, setNoSponsorAsk] = useState<null | { toMyNext: boolean }>(null);
  const [registration, setRegistration] = useState<Competition | null>(null);
  const [regPanel, setRegPanel] = useState(false);
  const [regEarly, setRegEarly] = useState<Competition | null>(null);
  const [loanAsk, setLoanAsk] = useState(false);
  const [toast, showToast] = useToast();
  useEffect(() => {
    if (consumeAutoAdvance()) doAdvance();
  }, []);
  if (!game) return null;
  const g = game;
  const unread = g.inbox.filter(m => !m.read).length;

  const doAdvance = async (toMyNext = false, skipSponsorCheck = false) => {
    if (busy) return;
    if (!skipSponsorCheck && offersLapsingToday(getGame())) {
      setNoSponsorAsk({ toMyNext });
      return;
    }
    const comp = pendingCompetition(getGame().pending);
    if (comp && !registrationOf(getGame(), comp)) {
      update(st => { st.registrationDue = comp; });
      setRegistration(comp);
      return;
    }
    if (mustPlay(getGame())) {
      go({ name: "prep" });
      return;
    }
    // today's match can still be played (it brings in money); moving on to the next day cannot
    if (moneyBlocked(getGame())) {
      setLoanAsk(true);
      return;
    }
    busy = true;
    setProgress("진행 중…");
    try {
      const st = getGame();
      const r = await advance(st, workerSimulator, (d, t) => setProgress(`다른 경기 진행 중… ${d}/${t}`), { toMyNext });
      update(() => {});
      if (r.type === "match") go({ name: "prep" });
      else if (r.type === "registration") setRegistration(r.competition);
      else if (r.type === "draw") setDraws(r.draws);
      else setSummary({ lines: r.summary, day: r.day });
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
            <button key={id} class={`btn ${tab === id || (id === "comps" && isCompTab(tab)) ? "sel" : ""}`} onClick={() => go({ name: "hub", tab: id === "comps" ? lastComp : id })}>
              {label}
              {id === "inbox" && unread > 0 && <span class="chip" style={{ marginLeft: 6, background: "var(--red)" }}>{unread}</span>}
            </button>
          ))}
        </div>
        <div class="col" style={{ minWidth: 0 }}>
          {tab === "home" && <HomeTab g={g} onAdvance={doAdvance} />}
          {isCompTab(tab) && <CompSubTabs tab={tab} />}
          {tab === "league" && <LeagueTab g={g} />}
          {tab === "fixtures" && <FixturesTab g={g} />}
          {tab === "squad" && <SquadTab g={g} />}
          {tab === "training" && <TrainingTab g={g} />}
          {tab === "scout" && <ScoutTab g={g} />}
          {tab === "office" && <OfficeTab g={g} />}
          {tab === "facility" && <FacilityTab g={g} />}
          {tab === "shop" && <ShopTab g={g} />}
          {tab === "pwt" && <PwtTab g={g} />}
          {tab === "pct" && <PwtTab key="pct" g={g} pct />}
          {tab === "cup" && <CupTab g={g} />}
          {tab === "records" && <RecordsTab g={g} />}
          {isCompTab(tab) && (
            <div class="row" style={{ justifyContent: "flex-end" }}>
              <button class="btn" onClick={() => setRegPanel(true)}>대회 포켓몬 등록</button>
            </div>
          )}
          {tab === "inbox" && <InboxTab g={g} />}
          {tab === "settings" && <SettingsTab g={g} />}
        </div>
      </div>
      {(regPanel || (g as any).regNotice === g.season) && !regEarly && (
        <RegistrationNotice g={g} onRegister={c => setRegEarly(c)} onClose={() => { setRegPanel(false); if ((g as any).regNotice) update(st => { delete (st as any).regNotice; }); }} />
      )}
      {regEarly && <RegistrationDialog key={`early:${g.season}:${regEarly}`} g={g} competition={regEarly} onClose={() => setRegEarly(null)} onRegistered={() => { setRegEarly(null); showToast("등록을 확정했습니다."); }} />}
      {registration && <RegistrationDialog key={`${g.season}:${registration}`} g={g} competition={registration} onClose={() => { setRegistration(null); go({ name: "hub", tab: "squad" }); }} onRegistered={() => { setRegistration(null); doAdvance(); }} />}
      {progress && (
        <div class="modal-bg">
          <Win class="w2">
            <span class="spinner" /> {progress}
          </Win>
        </div>
      )}
      {summary && (
        <Modal onClose={() => setSummary(null)}>
          <Win title={`${dateLabel(summary.day)} 결과`} right={<button class="btn small primary" onClick={() => setSummary(null)}>확인</button>}>
            <div class="col small scroll-y" style={{ gap: 2 }}>
              {summary.lines.length ? summary.lines.map((l, i) => <div key={i}>· {l}</div>) : <div class="muted">특별한 일이 없었습니다.</div>}
            </div>
            <div class="row" style={{ marginTop: 8 }}>
              <button
                class="btn primary"
                onClick={() => {
                  setSummary(null);
                  doAdvance();
                }}
              >
                계속 진행 ▶
              </button>
              <button
                class="btn"
                onClick={() => {
                  setSummary(null);
                  doAdvance(true);
                }}
              >
                내 다음 경기까지 ▶▶
              </button>
            </div>
          </Win>
        </Modal>
      )}
      {loanAsk && (
        <Modal onClose={() => setLoanAsk(false)}>
          <Win title="자금 부족">
            <div class="small">먹이값을 2주 연속 내지 못했습니다. 돈을 마련하기 전에는 다음 날로 넘어갈 수 없습니다.</div>
            <div style={{ margin: "8px 0", fontWeight: "bold" }}>돈이 부족합니다. 대출을 받으시겠습니까?</div>
            <div class="row">
              <button
                class="btn primary"
                onClick={() => {
                  setLoanAsk(false);
                  go({ name: "hub", tab: "office" });
                }}
              >
                예
              </button>
              <button
                class="btn"
                onClick={() => {
                  setLoanAsk(false);
                  go({ name: "hub", tab: "home" });
                }}
              >
                아니오
              </button>
            </div>
          </Win>
        </Modal>
      )}
      {noSponsorAsk && (
        <Modal onClose={() => setNoSponsorAsk(null)}>
          <Win title="스폰서 제의 마감">
            <div class="small">오늘이 스폰서 제의를 받을 수 있는 마지막 날입니다. 계약하지 않고 날짜를 넘기면 제의가 모두 사라집니다.</div>
            <div style={{ margin: "8px 0", fontWeight: "bold" }}>이번 시즌은 스폰서 없이 진행하겠습니까?</div>
            <div class="row">
              <button
                class="btn primary"
                onClick={() => {
                  const t = noSponsorAsk.toMyNext;
                  setNoSponsorAsk(null);
                  update(st => declineAllOffers(st));
                  doAdvance(t, true);
                }}
              >
                스폰서 없이 진행
              </button>
              <button
                class="btn"
                onClick={() => {
                  setNoSponsorAsk(null);
                  go({ name: "hub", tab: "office" });
                }}
              >
                계약하러 가기
              </button>
            </div>
          </Win>
        </Modal>
      )}
      {draws.length > 0 && <DrawShow g={g} draw={draws[0]} onClose={() => setDraws(draws.slice(1))} />}
      {toast}
    </>
  );
}

function TopBar({ g, onAdvance, busy }: { g: GameState; onAdvance: (toMyNext?: boolean) => void; busy: boolean }) {
  const phase = phaseOf(g.day);
  // the tab bar sticks right under this bar, whose height changes when it wraps on phones
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const set = () => document.documentElement.style.setProperty("--top-h", `${Math.ceil(el.getBoundingClientRect().height)}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div class="app-top" ref={ref}>
      <div class="wrap">
        <span class="brand" style={{ cursor: "pointer" }} onClick={() => go({ name: "title" })}>
          포켓 리그
        </span>
        <span>
          시즌 {g.season} · <b class="gold">{dateLabel(g.day)}</b> <span class="muted small">{PHASE_KO[phase]}</span>
        </span>
        <span class="hide-sm">
          {g.player.name} <span class="muted small">({regionById(g.player.region).name})</span>
        </span>
        <Money v={g.player.money} />
        <span class="small muted" title="명성 · 팬 만족도 · 팬 수">
          명성 {Math.round(g.player.reputation)} · 만족 {Math.round(g.player.satisfaction ?? 60)}<span class="hide-sm"> · 팬 {g.player.fans.toLocaleString()}</span>
        </span>
        <span class="right row" style={{ gap: 4 }}>
          {!mustPlay(g) && (
            <button class="btn" disabled={busy} onClick={() => onAdvance(true)} title="내 다음 경기나 추첨까지 한 번에 진행">
              ▶▶
            </button>
          )}
          <button class="btn primary" disabled={busy} onClick={() => onAdvance()}>
            {mustPlay(g) ? "경기 준비 ▶" : "진행 ▶"}
          </button>
        </span>
      </div>
    </div>
  );
}

function nextFixture(g: GameState): ScheduleRow | null {
  return playerSchedule(g).find(r => !r.result && r.day >= g.day) ?? null;
}

export const COMP_KO = { league: "리그", pwt: "PWT", pct: "PCT", cup: "컵", friendly: "친선" };

function HomeTab({ g, onAdvance }: { g: GameState; onAdvance: (toMyNext?: boolean) => void }) {
  const [view, setView] = useState<string | null>(null);
  const nf = nextFixture(g);
  const lg = g.leagues[g.player.region];
  const table = standings(lg);
  const myRank = rankOf(lg, g.player.slotId);
  const me = g.player.slotId;
  return (
    <>
      <div class="grid2">
        <Win title={mustPlay(g) ? g.pending!.label : "다음 경기"} class="w2">
          {mustPlay(g) ? (
            <div class="col">
              <OpponentLine g={g} id={g.pending!.opponent} onClick={() => setView(g.pending!.opponent)} />
              <button class="btn primary" onClick={() => go({ name: "prep" })}>
                경기 준비 ▶
              </button>
            </div>
          ) : nf ? (
            <div class="col">
              <div class="small muted">
                <span class={`comp ${nf.comp}`}>{COMP_KO[nf.comp]}</span> {nf.label} · {dateLabel(nf.day)}
                {nf.home !== null && ` · ${nf.home ? "홈" : "원정"}`}
              </div>
              {nf.opp ? <OpponentLine g={g} id={nf.opp} onClick={() => setView(nf.opp!)} /> : <div class="muted">상대 미정</div>}
            </div>
          ) : (
            <div class="muted">이번 시즌 남은 경기가 없습니다. 8월 1일에 새 시즌 프리시즌이 시작됩니다.</div>
          )}
          <div class="row" style={{ marginTop: 8 }}>
            <button class="btn" onClick={() => onAdvance()}>
              {mustPlay(g) ? "경기 준비" : "진행"} ▶
            </button>
            {!mustPlay(g) && (
              <button class="btn" onClick={() => onAdvance(true)}>
                내 다음 경기까지 ▶▶
              </button>
            )}
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
      <Win title="최근 진행 요약">
        <div class="col small" style={{ gap: 2 }}>
          {g.lastWeekSummary.length ? g.lastWeekSummary.slice(0, 12).map((l, i) => <div key={i}>· {l}</div>) : <div class="muted">아직 진행한 날이 없습니다. 오른쪽 위 [진행 ▶]은 경기·추첨이 있는 날이나 주말까지, [▶▶]는 내 다음 경기나 추첨까지 진행합니다.</div>}
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
              <th class="n hide-sm">경기</th>
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
                  {displayName(g, r.id)} <span class="tiny muted hide-sm">{displayRole(g, r.id)}</span>
                </td>
                <td class="n hide-sm">{r.p}</td>
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
        승 3점 · 무 1점 · 득실 = 남은 포켓몬 수 차이 · 동률이면 득실 → 다득점 → 추첨. 초록 = 다음 시즌 PWT 진출(1~3위).
      </div>
      {view && <TrainerModal id={view} onClose={() => setView(null)} />}
    </Win>
  );
}

function FixturesTab({ g }: { g: GameState }) {
  const lg = g.leagues[g.player.region];
  const me = g.player.slotId;
  const [round, setRound] = useState(Math.max(0, Math.min(lg.rounds.length - 1, lg.nextRound - 1)));
  let shownNext = 0;
  const preseason = g.day <= dayOf(g.season, 8, 31);
  return (
    <>
    {preseason && <FriendlyPanel g={g} />}
    <div class="grid2">
      <Win title={`내 일정 · 시즌 ${g.season}`}>
        <div class="scroll-y" style={{ maxHeight: 560 }}>
          <table class="tbl">
            <tbody>
              {playerSchedule(g).map((r, i) => (
                <tr key={i} class={`click ${!r.result && r.day >= g.day && !shownNext++ ? "me" : ""}`} onClick={() => r.comp === "league" && setRound(Number(r.label.match(/\d+/)![0]) - 1)}>
                  <td class="tiny muted" style={{ whiteSpace: "nowrap" }}>{dateLabel(r.day, false)}</td>
                  <td>
                    <span class={`comp ${r.comp}`}>{COMP_KO[r.comp]}</span> <span class="tiny" style={{ whiteSpace: "nowrap" }}>{r.label.replace(/^(PWT|PCT|컵|리그) /, "").replace("조별리그", "조별").replace(/ \(더블배틀\)$/, "")}</span>
                  </td>
                  <td class="tiny" style={{ whiteSpace: "nowrap" }}>{r.home === null ? "" : r.home ? "홈" : "원정"}</td>
                  <td>{r.opp ? displayName(g, r.opp) : <span class="muted">미정</span>}</td>
                  <td class={`n ${r.cls || ""}`} style={{ whiteSpace: "nowrap" }}>{r.result || ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Win>
      <Win
        title={`리그 ${round + 1}라운드 · ${dateLabel(leagueRoundDay(g.season, round), false)}`}
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
    </>
  );
}

export { refresh };

/** Sub-tabs inside 대회: league table, PWT, PCT, regional cup. */
function CompSubTabs({ tab }: { tab: string }) {
  lastComp = tab;
  return (
    <div class="row subtabs" style={{ gap: 4 }}>
      {COMP_TABS.map(([id, label]) => (
        <button key={id} class={`btn small ${tab === id ? "sel" : ""}`} onClick={() => go({ name: "hub", tab: id })}>
          {label}
        </button>
      ))}
    </div>
  );
}
