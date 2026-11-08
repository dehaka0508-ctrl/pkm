import type { GimmickKind, MatchResult } from "../battle/engine";
import { dex, josa, monName, regionById } from "../data/dex";
import { dateLabel, LEAGUE_ROUNDS, seasonStart } from "./calendar";
import { rankOf, standings } from "./league";
import { teamRating, trainerById } from "./lineups";
import { trainerFame } from "./npc";
import { pressOutlet } from "./press-outlets";
import { registeredEntry, registrationOf, type Competition } from "./registration";
import { hashStr, Rng } from "./rng";
import type { ScheduleRow } from "./season";
import { displayName, teamOf, type GameState, type PendingMatch } from "./state";
import type { Tie } from "./tie";
import { tieText } from "./tie";
import type { TeamMember } from "./types";

export interface PressArticle {
  id: string;
  title: string;
  body: string;
  outlet: string;
}

type PressTopic = "award" | "draw" | "result" | "run" | "record" | "comeback" | "upset" | "entry" | "purchase" | "rumor";
type Story = Omit<PressArticle, "outlet"> & { day: number; topic: PressTopic; region?: string; outlet?: string };
type PastMeeting = { day: number; w: 0 | 1 | -1; score: string; label: string };
interface PressMatch extends PastMeeting {
  season: number;
  opponent: string;
  rankBefore?: number;
  rankAfter?: number;
  oppRank?: number;
  margin?: number;
  streakBefore?: number;
  streakAfter?: number;
  star?: { name: string; side: 0 | 1; kos: number };
  gimmicks?: GimmickKind[][];
  turns?: number;
  comeback?: boolean;
  tieResult?: "우승" | "준우승" | "진출" | "탈락" | "3위" | "4위";
  tieScore?: string;
  phase?: string;
  record?: string;
  defending?: boolean;
  finale?: { kind: "league" | "cup"; rank?: number; prevRank?: number; prevCup?: string; repeat?: number; trophies?: number; qualifies?: boolean; champion?: string };
}
type RosterLine = { uid: string; name: string };
export interface PressState {
  last?: PressMatch;
  meetings?: Record<string, PastMeeting>;
  stories?: Story[];
  rosters?: Record<string, RosterLine[]>;
}

const ownPress = (s: GameState) => (s.press ??= {});
const pick = <T,>(seed: string, values: readonly T[]): T => new Rng(seed).pick(values);
const labelOf = (m: Pick<PressMatch, "label">) => m.label.replace(/\s*\((?:더블배틀|더블|3판 2선승)\)$/, "");
const isLeague = (label: string) => label.includes(" 리그 ") || /^리그 \d+R$/.test(label);
const isThirdPlace = (label: string) => /3·4위전|3위 결정전/.test(label);
const isFinal = (p: PendingMatch) => p.tie?.kind === "cup" ? p.tie.key === "F"
  : !!p.tie && ["pwtFinal", "pctFinal", "ectFinal", "super", "world"].includes(p.tie.kind) || p.tie?.kind === "psb" && p.tie.key === "final";
const gimmickName: Record<GimmickKind, string> = { mega: "메가진화", z: "Z기술", tera: "테라스탈", dynamax: "다이맥스" };
const appearanceLabel = (r: ScheduleRow) => r.label || (r.comp === "friendly" ? "친선경기" : "경기");
const teamFame = (s: GameState, id: string) => {
  if (id === s.player.slotId) return s.player.reputation;
  const t = trainerById(id);
  return s.npcs?.[id]?.reputation ?? (t ? trainerFame(t) : 35);
};
const opinion = (s: GameState, id: string, mine: TeamMember[], theirs: TeamMember[]) =>
  (teamRating(mine) - teamRating(theirs)) / 5 + (teamFame(s, s.player.slotId) - teamFame(s, id)) * 0.7;
const lastPlace = (s: GameState, id: string) => s.prev.virtual ? undefined
  : s.prev.tables[trainerById(id)?.region ?? s.player.region]?.find(row => row.id === id)?.rank;

/** Persists the original context before XP, supporter changes, or the rest of the round can alter it. */
export function rememberPlayerPressGame(s: GameState, p: PendingMatch, teams: [TeamMember[], TeamMember[]], result: MatchResult, tie?: Tie) {
  const press = ownPress(s);
  const lg = s.leagues[s.player.region];
  const oppRegion = trainerById(p.opponent)?.region;
  const oppLeague = oppRegion ? s.leagues[oppRegion] : undefined;
  const finale = isFinal(p);
  const wonTie = tie?.winner === s.player.slotId;
  const tieResult = tie?.winner && (isThirdPlace(p.label) ? wonTie ? "3위" : "4위"
    : finale ? wonTie ? "우승" : "준우승" : wonTie ? "진출" : "탈락");
  const star = ([0, 1] as const).flatMap(side => Object.entries(result.kos?.[side] ?? {}).map(([index, kos]) => ({
    name: teams[side][Number(index)] ? monName(teams[side][Number(index)]) : "",
    side, kos,
  }))).filter(x => x.kos >= 3 && x.name).sort((a, b) => b.kos - a.kos)[0];
  const before = s.player.streak ?? 0;
  const prevHolder = p.tie?.kind === "cup" ? s.prev.cupWinners?.[s.player.region]
    : p.label.startsWith("PWT") ? s.prev.champion
    : p.label.startsWith("PST") ? s.prev.pctChampion
    : p.label.startsWith("PCT") ? s.prev.ectChampion
    : oppLeague?.region === s.player.region && !s.prev.virtual ? s.prev.tables[s.player.region]?.[0]?.id : undefined;
  press.last = {
    day: s.day, season: s.season, opponent: p.opponent, label: p.label, w: result.winner, score: result.remaining.join("–"),
    rankBefore: isLeague(p.label) && lg.table[s.player.slotId]?.p ? rankOf(lg, s.player.slotId) : undefined,
    oppRank: oppLeague?.table[p.opponent]?.p ? rankOf(oppLeague, p.opponent) : lastPlace(s, p.opponent),
    margin: opinion(s, p.opponent, teams[0], teams[1]),
    streakBefore: p.friendly ? undefined : before,
    streakAfter: p.friendly ? undefined : result.winner === 0 ? Math.max(0, before) + 1 : result.winner === 1 ? Math.min(0, before) - 1 : 0,
    star, gimmicks: result.gimmicks, turns: result.turns, comeback: result.comeback, defending: prevHolder === p.opponent,
    tieResult: tieResult || undefined,
    tieScore: tie?.winner && tie.format !== "single" ? tieText(tie, s.player.slotId).replaceAll(":", "–") : undefined,
  };
  (press.meetings ??= {})[p.opponent] = { day: s.day, w: result.winner, score: press.last.score, label: p.label };
}

export function finishPlayerPressMatch(s: GameState, extra: Partial<Pick<PressMatch, "rankAfter" | "streakAfter" | "phase" | "record" | "finale">>) {
  if (s.press?.last?.day === s.day) Object.assign(s.press.last, extra);
}

export function addPressStory(s: GameState, topic: PressTopic, key: string, title: string, body: string, region?: string, outlet?: string) {
  const press = ownPress(s);
  const id = `${s.day}:${topic}:${key}`;
  const stories = press.stories ??= [];
  const entry = { id, day: s.day, topic, title, body, region, outlet };
  const index = stories.findIndex(x => x.id === id);
  if (index >= 0) stories[index] = entry;
  else stories.unshift(entry);
  if (stories.length > 120) stories.length = 120;
}

export function recordPressPurchase(s: GameState, name: string) {
  addPressStory(s, "purchase", "player", `${s.player.name} 측, ${name} 확보`, `새로 확보한 ${josa(name, "을를")} 어느 경기에서 활용할지 관심이 모인다.`, s.player.region);
}

export function recordNpcPressGame(s: GameState, ids: [string, string], label: string, r: MatchResult, ranks?: [number, number]) {
  if (r.winner === -1 || ids.includes(s.player.slotId)) return;
  const w = r.winner;
  const l = w === 0 ? 1 : 0;
  const who = displayName(s, ids[w]);
  const other = displayName(s, ids[l]);
  const region = trainerById(ids[w])?.region;
  const key = ids.join(":") + label;
  if (r.comeback) addPressStory(s, "comeback", key, `${who}, 0–2에서 3–2 역전`, `${label}에서 먼저 두 마리를 잃었지만 ${other}의 포켓몬 세 마리를 연달아 쓰러뜨렸다.`, region);
  if (ranks && ranks[l] === 1 && ranks[w] >= 11) {
    addPressStory(s, "upset", key, `${ranks[w]}위 ${who}, 선두 ${other} 제압`, `${label}에서 ${r.remaining[w]}–${r.remaining[l]}로 승리하며 선두 경쟁에 변수를 만들었다.`, region);
  }
}

function publicEntry(s: GameState): TeamMember[] {
  const p = s.player;
  const selected = p.entry.map(uid => p.squad.find(m => m.uid === uid)).filter(m => m !== undefined);
  return (selected.length >= Math.min(3, p.squad.length) ? selected : p.squad).slice(0, 6);
}
const lineup = (s: GameState, id: string) => (id === s.player.slotId ? publicEntry(s) : teamOf(s, id)).map(m => ({ uid: m.uid, name: monName(m) }));
function lineupChange(before: RosterLine[], after: RosterLine[]): { in: string[]; out: string[] } {
  const keys = (rows: RosterLine[]) => new Set(rows.map(x => x.uid));
  const old = keys(before);
  const current = keys(after);
  return { in: after.filter(x => !old.has(x.uid)).map(x => x.name), out: before.filter(x => !current.has(x.uid)).map(x => x.name) };
}
function lineupStory(s: GameState, id: string, before: RosterLine[], after: RosterLine[]) {
  const diff = lineupChange(before, after);
  if (!diff.in.length && !diff.out.length) return;
  const who = displayName(s, id);
  const title = `${who}, 엔트리 변경`;
  const body = [diff.in.length && `합류: ${diff.in.join("·")}`, diff.out.length && `제외: ${diff.out.join("·")}`].filter(Boolean).join(" · ") + ".";
  return { title, body };
}

/** Compare the six public entries, ignoring changes to ordering or the selected three. */
export function capturePressRosters(s: GameState, all = false) {
  const press = ownPress(s);
  const previous = press.rosters ??= {};
  const me = s.player.slotId;
  const ids = all ? [me, ...Object.values(s.leagues).flatMap(lg => standings(lg).filter(row => row.p > 0).slice(0, 3).map(row => row.id))] : [me];
  for (const id of new Set(ids)) {
    const current = lineup(s, id);
    const old = previous[id];
    const story = old && lineupStory(s, id, old, current);
    if (story) addPressStory(s, "entry", id, story.title, story.body, id === me ? s.player.region : trainerById(id)?.region);
    previous[id] = current;
  }
  if (all) for (const id of Object.keys(previous)) if (!ids.includes(id)) delete previous[id];
}

const rumorPairs = [
  ["galar-단델", "galar-소니아박사"],
  ["paldea-투로박사", "paldea-올림박사"],
  ["kalos-플라타느박사", "kalos-카르네"],
  ["hoenn-성호", "sinnoh-난천"],
] as const;

/** One occasional item, sometimes two. Dates and subjects are fixed for this save and season. */
export function maybePressRumor(s: GameState) {
  const rng = new Rng(`${s.seed}:${s.season}:press-rumor`);
  const days = [rng.int(40, 170)];
  if (rng.chance(0.36)) days.push(rng.int(190, 325));
  const slot = days.indexOf(s.day - seasonStart(s.season));
  if (slot === -1) return;
  const pairs = rng.shuffle(rumorPairs.filter(pair => pair.every(id => id !== s.player.slotId && trainerById(id))));
  const pair = pairs[slot];
  if (!pair) return;
  const [a, b] = pair.map(id => displayName(s, id));
  addPressStory(s, "rumor", `rumor:${slot}`, `${a}·${b} 열애설, 양측 확인 없어`,
    pick(`${s.seed}:${s.day}`, [
      "두 트레이너의 이름이 함께 거론됐다. 교제 여부는 확인되지 않았다.",
      "두 사람의 관계를 두고 추측이 이어졌다. 구단이나 당사자의 공식 입장은 나오지 않았다.",
    ]), trainerById(pair[0])?.region);
}

function legacyMatch(s: GameState, schedule: ScheduleRow[]): PressMatch | undefined {
  const r = schedule.filter(x => x.opp && x.result).at(-1);
  if (!r?.opp || !r.result) return;
  const score = r.result.match(/\d+:\d+/)?.[0].replace(":", "–");
  if (!score) return;
  const w = r.result.startsWith("승") ? 0 : r.result.startsWith("패") ? 1 : -1;
  const league = r.comp === "league" && r.label === `리그 ${LEAGUE_ROUNDS}R`;
  const cup = r.comp === "cup" && r.label.startsWith("컵 결승");
  const third = isThirdPlace(r.label);
  const lg = s.leagues[s.player.region];
  return {
    day: r.day, season: s.season, label: appearanceLabel(r), opponent: r.opp, w, score,
    tieResult: w === -1 ? undefined : third ? w === 0 ? "3위" : "4위" : cup ? w === 0 ? "우승" : "준우승" : undefined,
    finale: league ? { kind: "league", rank: rankOf(lg, s.player.slotId), prevRank: lastPlace(s, s.player.slotId), champion: standings(lg)[0]?.id }
      : cup ? { kind: "cup", repeat: w === 0 && s.prev.cupWinners?.[s.player.region] === s.player.slotId ? 2 : undefined } : undefined,
  };
}

function matchReport(s: GameState, m: PressMatch): { lead: PressArticle; extra?: PressArticle } {
  const me = s.player.name;
  const opp = displayName(s, m.opponent);
  const event = labelOf(m);
  const won = m.w === 0;
  const id = `match:${m.season}:${m.day}:${m.label}`;
  const seeded = <T,>(key: string, options: readonly T[]) => pick(`${s.seed}:${id}:${key}`, options);
  const lead = (title: string, body: string, suffix = ""): PressArticle => ({ id: id + suffix, title, body, outlet: pressOutlet(s.player.region, id, true) });
  const diff = m.score.split("–").map(Number);
  const gap = Math.abs(diff[0] - diff[1]);
  const verdict = m.w === -1 ? "무승부" : gap >= 3 ? won ? seeded("blowout", ["완승", "압승", "압도적 승리"]) : seeded("heavyLoss", ["완패", "무너지다", "대패"])
    : gap === 1 ? won ? seeded("narrowWin", ["신승", "접전 끝 승리", "한 끗 승리"]) : seeded("narrowLoss", ["접전 끝 패배", "한 끗 차 패배", "석패"]) : won ? "승리" : "패배";
  const scoreLine = m.w === -1
    ? `${event}에서 두 팀이 ${m.score}로 비겼다.`
    : seeded("score", [
      `${event}에서 ${josa(me, "은는")} ${opp}에 ${m.score}로 ${won ? "이겼다" : "졌다"}.`,
      `${josa(me, "이가")} ${opp} 상대 ${event}를 ${m.score} ${won ? "승리" : "패배"}로 마쳤다.`,
      `${me}의 ${event}, 스코어는 ${m.score}로 ${won ? me : opp}의 승리였다.`,
    ]);
  const expectation = m.w !== -1 && Math.abs(m.margin ?? 0) >= 9
    ? (m.margin! > 0) === won ? seeded("expected", ["전력 우세가 결과로", "예상대로 흘러간 승부", "우세 전망이 맞았다"])
      : seeded("unexpected", ["예상을 뒤집은 결과", "뜻밖의 승부", "예상 밖 이변"])
    : "";
  const details: string[] = [];
  const streak = m.streakAfter ?? 0;
  const prev = m.streakBefore ?? 0;
  if (Math.abs(streak) >= 3) details.push(seeded("run", [`${Math.abs(streak)}연${streak > 0 ? "승" : "패"}째다.`, `연속 ${streak > 0 ? "승리" : "패배"}가 ${Math.abs(streak)}경기로 늘었다.`]));
  else if (Math.abs(prev) >= 3 && Math.sign(streak) !== Math.sign(prev)) details.push(seeded("endRun", [`${Math.abs(prev)}연${prev > 0 ? "승" : "패"}가 끊겼다.`, `${Math.abs(prev)}경기 연속 ${prev > 0 ? "승리" : "패배"}에 마침표를 찍었다.`]));
  if (m.star) {
    const name = m.star.side === 0 ? me : opp;
    details.push(seeded("star", [
      `${name}의 ${josa(m.star.name, "이가")} ${m.star.kos}KO를 기록했다.`,
      `단일 경기 ${m.star.kos}KO의 주인공은 ${name}의 ${m.star.name}였다.`,
    ]));
  }
  if (m.rankBefore && m.rankAfter && m.rankBefore !== m.rankAfter) details.push(`순위는 ${m.rankBefore}위에서 ${m.rankAfter}위로 ${m.rankAfter < m.rankBefore ? "올랐다" : "내려갔다"}.`);
  if (m.phase) details.push(m.phase);
  if (m.record) details.push(m.record);
  if (m.comeback) details.push(`${won ? me : opp} 측이 0–2에서 3–2로 뒤집었다.`);
  const used = [...new Set(m.gimmicks?.[0] ?? [])].map(x => gimmickName[x]);
  if (used.length) details.push(`${me} 측은 ${used.join("·")} 전략을 꺼냈다.`);
  if (m.defending && (m.tieResult || m.finale || m.oppRank === 1)) details.push(`상대 ${josa(opp, "은는")} 이 대회 전 시즌 우승자다.`);
  else if (m.oppRank && m.oppRank <= 5 && isLeague(event)) details.push(`경기 전 ${josa(opp, "은는")} 리그 ${m.oppRank}위였다.`);
  if (m.turns && m.turns >= 35) details.push(`승부는 ${m.turns}턴까지 이어졌다.`);
  const body = (base: string) => [base, ...new Rng(`${s.seed}:${id}:details`).shuffle(details).slice(0, 2)].join(" ");
  const matchTitle = expectation
    ? seeded("forecastHeadline", [`${me}, ${opp}전 ${m.score} ${verdict}… ${expectation}`, `${me}·${opp} ${m.score}, ${expectation}`])
    : seeded("matchHeadline", [`${me}, ${opp}전 ${m.score} ${verdict}`, `${event}서 ${me} ${verdict}… ${opp}전 ${m.score}`, `${me}·${opp} ${m.score}… ${me} ${verdict}`]);
  if (m.finale) {
    const f = m.finale;
    const change = f.prevRank && f.rank && f.prevRank !== f.rank ? `전 시즌 ${f.prevRank}위에서 ${f.rank}위로 ${f.rank < f.prevRank ? "올랐다" : "내려갔다"}.`
      : f.prevRank && f.prevRank === f.rank && f.rank !== 1 ? `전 시즌에 이어 ${f.rank}위로 마쳤다.` : "";
    const repeat = (f.repeat ?? 0) > 1 ? ` ${f.repeat}연속 우승을 달성했다.` : "";
    const multi = (f.trophies ?? 0) > 1 ? ` 올 시즌 ${f.trophies}관왕이다.` : "";
    const decisive = m.w === -1 ? `최종전에서는 ${josa(opp, "과와")} ${m.score}로 비겼다.` : `최종전에서는 ${opp}에 ${m.score}로 ${won ? "승리했다" : "패했다"}.`;
    if (f.kind === "league") {
      const league = `${regionById(s.player.region).name} 리그`;
      const title = f.rank === 1 ? `${me}, ${league} ${repeat ? `${f.repeat}연속 우승` : "우승"}` : `${me}, ${league} 최종 ${f.rank}위`;
      const summary = f.rank === 1 ? `${josa(me, "이가")} 리그 정상에 올랐다.` : f.champion ? `리그 트로피는 ${displayName(s, f.champion)}에게 돌아갔다.` : "";
      const qual = f.qualifies ? " 다음 시즌 PWT 출전권을 확보했다." : "";
      return { lead: lead(title, `${decisive} ${change}${repeat}${multi}${qual}`.trim()), extra: lead(matchTitle, body(scoreLine + (summary ? ` ${summary}` : "")), ":detail") };
    }
    const title = `${me}, ${event} ${m.tieResult ?? (won ? "우승" : "준우승")}`;
    const cupHistory = f.prevCup ? ` 전 시즌 성적은 ${f.prevCup}이었다.` : "";
    const series = m.tieScore ? ` 결승 시리즈는 ${m.tieScore}로 끝났다.` : "";
    const opponent = `결승 상대는 ${opp}였다.`;
    return { lead: lead(title, `${m.tieScore ? opponent + series : decisive}${cupHistory}${repeat}${multi}`.trim()), extra: lead(matchTitle, body(scoreLine), ":detail") };
  }
  if (m.tieResult) {
    const tie = m.tieScore ? ` 시리즈 스코어는 ${m.tieScore}.` : "";
    if (m.tieResult === "3위" || m.tieResult === "4위") {
      return { lead: lead(`${me}, ${event}서 ${m.tieResult} 확정`, body(scoreLine)) };
    }
    return { lead: lead(`${me}, ${event} ${m.tieResult === "진출" ? "통과" : m.tieResult}`, body(scoreLine + tie)) };
  }
  return { lead: lead(matchTitle, body(scoreLine)) };
}

function ace(team: TeamMember[]): TeamMember | undefined {
  return team.reduce<TeamMember | undefined>((best, m) => !best || teamRating([m]) > teamRating([best]) ? m : best, undefined);
}
function tactics(team: TeamMember[]): string {
  const moves = team.flatMap(m => m.moves.map(name => dex.moves.get(name)));
  const has = (...ids: string[]) => moves.some(move => ids.includes(move.id));
  if (has("tailwind", "trickroom")) return "스피드 조절";
  if (has("stealthrock", "spikes", "stickyweb", "toxicspikes")) return "설치기 압박";
  if (has("voltswitch", "uturn", "flipturn", "partingshot")) return "교대기 운영";
  if (has("dragondance", "swordsdance", "nastyplot", "quiverdance", "calmmind")) return "랭크업 전술";
  if (has("recover", "roost", "slackoff", "wish", "synthesis")) return "회복을 통한 장기전";
  const physical = moves.filter(m => m.category === "Physical").length;
  const special = moves.filter(m => m.category === "Special").length;
  return physical > special * 1.3 ? "물리 화력" : special > physical * 1.3 ? "특수 화력" : "혼합 공격";
}

function leagueStakes(s: GameState, row: ScheduleRow): string {
  const lg = s.leagues[s.player.region];
  if (!lg.nextRound) return "개막전 승점 3점이 걸려 있다.";
  const table = standings(lg);
  const me = table.find(x => x.id === s.player.slotId);
  const theirs = table.find(x => x.id === row.opp);
  if (!me) return "";
  const place = table.indexOf(me) + 1;
  const above = table[place - 2];
  const left = LEAGUE_ROUNDS - lg.nextRound;
  const third = table[2];
  if (left <= 4 && table[0].pts - me.pts <= 3 && table[0].pts > me.pts) return "선두와 승점 3점 차 이내라 우승 경쟁에 영향을 줄 수 있다.";
  if (left <= 4 && third && Math.abs(me.pts - third.pts) <= 3) return "PWT 직행권 경쟁에서 승점 3점의 가치가 크다.";
  if (theirs && row.opp && theirs.pts - me.pts < 3 && theirs.pts >= me.pts && table.indexOf(theirs) < table.indexOf(me)) {
    return `승리하면 승점에서 ${josa(displayName(s, row.opp), "을를")} 앞선다.`;
  }
  if (above && above.pts - me.pts <= 3) return `현재 ${place}위. 승리하면 윗순위 팀의 결과에 따라 승점 차를 좁힐 수 있다.`;
  return `현재 ${place}위에서 승점을 보탤 기회다.`;
}

function preview(s: GameState, schedule: ScheduleRow[]): PressArticle {
  const p = s.pending;
  const firstLegDone = p?.tie?.leg === 0 && ["ko", "pctKo", "ectKo", "kpo"].includes(p.tie.kind) && p.games.length > 0;
  const pendingDone = !!p?.games.length && (p.comp === "fx" || firstLegDone || s.press?.last?.day === s.day && !!s.press.last.tieResult);
  const scheduled = schedule.find(row => !row.result && row.day >= s.day && !(pendingDone && row.day === s.day && row.opp === p?.opponent));
  const row = p && !pendingDone
    ? { day: s.day, label: p.label, opp: p.opponent, home: p.home, comp: scheduled?.day === s.day ? scheduled.comp : undefined }
    : scheduled;
  const id = `preview:${row?.day ?? s.season}:${row?.label ?? "offseason"}`;
  const outlet = pressOutlet(s.player.region, id, true);
  if (!row) return { id, outlet, title: "다음 경기 전망 · 차기 일정 대기", body: "남은 확정 경기가 없다. 새 시즌 일정과 대진이 공개되면 다음 상대를 확인할 수 있다." };
  const event = row.label || "프리시즌 친선경기";
  const when = dateLabel(row.day, false);
  if (!row.opp) return { id, outlet, title: `프리뷰 | ${event}, 상대는 아직 미정`, body: `${when} 일정이 잡혔다. 대진이 결정되면 상대와 전력을 비교할 수 있다.` };
  const opponent = displayName(s, row.opp);
  const comp = row.comp;
  const registered = comp === "psb" ? "cup" : comp;
  const inComp = registered && registered !== "friendly" && registrationOf(s, registered as Competition) ? registeredEntry(s, registered as Competition) : [];
  const mine = inComp.length ? inComp : publicEntry(s);
  const theirs = teamOf(s, row.opp);
  const ours = teamRating(mine);
  const theirsRating = teamRating(theirs);
  const previous = s.press?.meetings?.[row.opp];
  const prior = previous && previous.day <= row.day ? previous : undefined;
  const fromSchedule = schedule.filter(x => x.opp === row.opp && x.result && x.day <= row.day).sort((a, b) => b.day - a.day)[0]?.result;
  const trend = prior?.w ?? (fromSchedule?.startsWith("승") ? 0 : fromSchedule?.startsWith("패") ? 1 : -1);
  const last = prior ? `직전 맞대결 ${prior.score} ${prior.w === 0 ? "승" : prior.w === 1 ? "패" : "무승부"}.` : fromSchedule ? `직전 맞대결 ${fromSchedule.split(" · ")[0].replaceAll(":", "–")}.` : "";
  const fav = opinion(s, row.opp, mine, theirs) + (trend === 0 ? 3 : trend === 1 ? -3 : 0) + (row.home === null ? 0 : row.home ? 1 : -1);
  const outlook = Math.abs(fav) < 9 ? "전력 전망은 박빙이다." : `${fav > 0 ? s.player.name : opponent} 측 우세가 점쳐진다.`;
  const baseline = `전력 지수 ${ours}–${theirsRating}, 명성 ${Math.round(s.player.reputation)}–${Math.round(teamFame(s, row.opp))}. ${outlook}`;
  const aces = [ace(mine), ace(theirs)];
  const keyDuel = aces[0] && aces[1] ? `주목할 포켓몬은 ${monName(aces[0])}·${monName(aces[1])}. 양측은 각각 ${josa(tactics(mine), "과와")} ${josa(tactics(theirs), "을를")} 활용할 수 있다.` : "";
  const stakes = comp === "league" ? leagueStakes(s, row as ScheduleRow)
    : isThirdPlace(event) ? "승자는 대회 3위, 패자는 4위로 마친다."
    : event.includes("윙 결승") ? "승자는 지방 컵 결승에 오른다."
    : event.includes("지구 결승") ? "승자는 PSB 결승에 오른다."
    : event.startsWith("PSB") && event.includes("4강") ? "승자는 지구 결승에 오른다."
    : event.includes("준결승") || event.includes("4강") ? "이 라운드를 넘으면 결승에 오른다."
    : event.includes("결승") || event === "슈퍼컵" || event === "전국 슈퍼컵" ? "이 대회 트로피가 걸렸다."
    : event.includes("2차전") && (event.includes("플레이오프") || /\d+강/.test(event)) ? "1차전과 합산해 다음 라운드 진출팀을 가린다."
    : event.includes("1차전") && (event.includes("플레이오프") || /\d+강/.test(event)) ? "홈과 원정 두 경기 중 첫 경기다."
    : event === "PWT 플레이오프" ? "승자는 PWT 조별리그에 진출한다."
    : event.includes("조별") ? "조별리그 승점 경쟁이 걸린 경기다." : "";
  const title = pick(`${s.seed}:${id}`, [
    `프리뷰 | ${s.player.name}–${opponent}, ${event}`,
    `${when} ${event} · ${opponent}전 전망`,
    `다음 상대 ${opponent}, ${Math.abs(fav) < 9 ? "접전 예고" : fav > 0 ? `${s.player.name} 근소 우세` : "도전자의 승부"}`,
  ]);
  const rest = new Rng(`${s.seed}:${id}:detail`).shuffle([last, keyDuel, stakes].filter(Boolean));
  return { id, title, body: [baseline, ...rest].join(" "), outlet };
}

const PRIORITY: Record<PressTopic, number> = { award: 9, draw: 7, result: 8, run: 3, record: 8, comeback: 6, upset: 7, entry: 4, purchase: 3, rumor: 7 };

function extraStories(s: GameState): Story[] {
  const me = s.player.slotId;
  const local = s.player.region;
  const list = (s.press?.stories ?? []).filter(x => s.day - x.day <= (x.topic === "award" ? 55 : 22)).slice();
  const prev = s.press?.rosters?.[me];
  const entry = prev && lineupStory(s, me, prev, lineup(s, me));
  if (entry) list.unshift({ ...entry, id: "entry:player", day: s.day, topic: "entry", region: local });
  const covered = new Set(Object.values(s.leagues).flatMap(lg => standings(lg).filter(row => row.p > 0).slice(0, 3).map(row => row.id)));
  for (const id of covered) {
    if (id === me) continue;
    const item = s.npcs?.[id]?.log.find(x => s.day - x.day <= 12 && x.text.includes(" 구입 → "));
    if (!item) continue;
    const [name, mon] = item.text.split(" 구입 → ");
    const who = displayName(s, id);
    list.push({ id: `item:${id}:${item.day}`, day: item.day, topic: "purchase", region: trainerById(id)?.region,
      title: `${who}의 ${mon}, ${name} 도입설`, body: `${name} 구입 소식이 전해졌다. ${mon}에게 어떤 전술을 맡길지는 아직 확정되지 않았다.` });
  }
  const latestFan = s.player.satLog?.[0];
  if (latestFan && s.day - latestFan.day < 16) {
    const sat = Math.round(s.player.satisfaction ?? 50);
    list.push({ id: `fans:${latestFan.day}`, day: latestFan.day, topic: "run", region: local,
      title: `${s.player.name} 팬심, ${latestFan.d > 0 ? "만족도 상승" : "만족도 하락"}`,
      body: `팬 만족도는 ${sat}/100. 최근 변화 요인은 ${latestFan.text}이었다.` });
  }
  for (const m of s.inbox.slice(0, 35)) {
    if (m.kind !== "news" || s.day - m.t > 15 || !/^\[(도메스틱 더블|더블|트레블)/.test(m.title)) continue;
    list.push({ id: `headline:${m.t}:${m.title}`, day: m.t, topic: "result", title: m.title, body: m.body.split("\n")[0] });
  }
  return list;
}

export function majorArticles(s: GameState, schedule: ScheduleRow[]): PressArticle[] {
  const local = s.player.region;
  const fromSave = s.press?.last;
  const fromSchedule = legacyMatch(s, schedule);
  const last = fromSave && fromSave.day >= (fromSchedule?.day ?? -1) ? fromSave : fromSchedule;
  const report = last && matchReport(s, last);
  const first = report ? [report.lead, ...(report.extra ? [report.extra] : []), preview(s, schedule)] : [preview(s, schedule)];
  const stories = extraStories(s);
  const score = (x: Story) => (x.topic === "award" && s.day - x.day <= 12 ? 35 : 0) + PRIORITY[x.topic]
    + Math.max(0, 13 - (s.day - x.day)) + (x.region === local ? 3 : 0) + hashStr(`${s.seed}:${x.id}`) % 4;
  const used = new Set<PressTopic>();
  const target = stories.length ? 5 : 3;
  for (const story of stories.sort((a, b) => score(b) - score(a))) {
    if (first.length >= target) break;
    if (used.has(story.topic)) continue;
    used.add(story.topic);
    first.push({ ...story, outlet: story.outlet || pressOutlet(story.region ?? local, story.id, story.topic === "result") });
  }
  const team = publicEntry(s);
  const top = ace(team);
  const lg = s.leagues[local];
  const table = standings(lg);
  const region = regionById(local).name;
  const firstPlace = table[0];
  const fallback = [
    lg.nextRound && firstPlace ? { title: `${region} 리그, 선두는 ${displayName(s, firstPlace.id)}`, body: `${lg.nextRound}라운드까지 진행됐다. 선두 승점은 ${firstPlace.pts}점이다.` }
      : { title: `${region} 리그 개막을 앞둔 ${lg.teams.length}팀`, body: "프리시즌을 마치면 정규 리그 순위 경쟁이 시작된다." },
    top ? { title: `${s.player.name}의 ${monName(top)}, 관전 포인트는 ${tactics(team)}`, body: `현재 엔트리에서 ${josa(monName(top), "은는")} 전력 지수가 가장 높다.` }
      : { title: `${s.player.name}, 시즌 엔트리 준비 중`, body: "경기 엔트리가 확정되면 주전 경쟁을 살펴볼 수 있다." },
  ];
  for (const [i, item] of fallback.entries()) {
    if (first.length >= 3) break;
    const id = `season:${s.season}:context:${i}`;
    first.push({ ...item, id, outlet: pressOutlet(local, id) });
  }
  return first;
}

export function leagueFinalePress(s: GameState, rank: number): NonNullable<PressMatch["finale"]> {
  const me = s.player.slotId;
  const history = s.player.history.filter(row => row.region === s.player.region);
  let repeat = rank === 1 ? 1 : 0;
  while (repeat && history.some(row => row.season === s.season - repeat && row.rank === 1)) repeat++;
  return {
    kind: "league", rank, prevRank: lastPlace(s, me), repeat,
    trophies: s.player.titles.filter(t => t.startsWith(`시즌 ${s.season} `)).length,
    champion: standings(s.leagues[s.player.region])[0]?.id,
    qualifies: rank <= 3,
  };
}

export function cupFinalePress(s: GameState, competition: string, won: boolean, historyKey?: "cup" | "pwt" | "pct" | "ect"): NonNullable<PressMatch["finale"]> {
  let repeat = won ? 1 : 0;
  const label = `${competition} 우승`;
  while (repeat && s.player.titles.includes(`시즌 ${s.season - repeat} ${label}`)) repeat++;
  const last = s.player.history.find(row => row.season === s.season - 1);
  const prevCup = (historyKey && last?.[historyKey]) || (s.player.titles.includes(`시즌 ${s.season - 1} ${label}`) ? "우승" : undefined);
  return { kind: "cup", repeat, prevCup: prevCup && prevCup !== "-" ? prevCup : undefined, trophies: s.player.titles.filter(t => t.startsWith(`시즌 ${s.season} `)).length };
}
