// 대회 > 기록: this season's top 10s per competition, league awards, and all-time league records.
import { useState } from "preact/hooks";
import { REGIONS, koSpecies, regionById } from "../../data/dex";
import { displayName, type GameState } from "../../game/state";
import { AWARD_KO, compOf, leagueRecords, recordsOf, topOf, type MonStat, type MonTable } from "../../game/stats";
import { MonIcon, Win } from "../components";
import { GoldenMonName } from "../GoldenMonName";
import { GOLDEN_MASTER_BALL } from "../../game/golden-master-ball";

type Kind = keyof Omit<MonStat, "s">;
const COMPS: ["league" | "cup" | "pwt" | "pct" | "ect", string][] = [
  ["league", "리그"],
  ["cup", "지방 컵"],
  ["pwt", "PWT"],
  ["pct", "PST"],
  ["ect", "PCT"],
];
const TITLE: Record<Kind, string> = { k: "최다 KO", d: "최다 입힌 피해", t: "최다 받은 피해", a: "최다 출전" };
const fmt = (kind: Kind, v: number) => (kind === "k" ? `${v} KO` : kind === "a" ? `${v}경기` : `${v.toLocaleString()}`);

function MonRank({ g, table, kind }: { g: GameState; table: MonTable | undefined; kind: Kind }) {
  const rows = topOf(table, kind, 10);
  const me = g.player.slotId;
  const nick = (uid: string) => g.player.squad.find(m => m.uid === uid)?.nickname;
  return (
    <div class="col" style={{ gap: 2, minWidth: 0 }}>
      <b class="small">{TITLE[kind]}</b>
      {rows.length === 0 ? (
        <div class="tiny muted">아직 기록이 없습니다.</div>
      ) : (
        <table class="tbl">
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.key} class={r.owner === me ? "me" : ""}>
                <td class="num tiny muted" style={{ width: 18 }}>{i + 1}</td>
                <td style={{ width: 34 }}>
                  <MonIcon species={r.s} scale={0.8} />
                </td>
                <td>
                  <div class="small"><GoldenMonName g={g} owner={r.owner} uid={r.uid} species={r.s}>{(r.owner === me && nick(r.uid)) || koSpecies(r.s)}</GoldenMonName></div>
                  <div class="tiny muted">{displayName(g, r.owner)}</div>
                </td>
                <td class="n num small" style={{ whiteSpace: "nowrap" }}>{fmt(kind, r[kind])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function TrainerRank({ g, title, rows }: { g: GameState; title: string; rows: { owner: string; value: string; note?: string }[] }) {
  const me = g.player.slotId;
  return (
    <div class="col" style={{ gap: 2, minWidth: 0 }}>
      <b class="small">{title}</b>
      {rows.length === 0 ? (
        <div class="tiny muted">아직 기록이 없습니다.</div>
      ) : (
        <table class="tbl">
          <tbody>
            {rows.slice(0, 10).map((r, i) => (
              <tr key={i} class={r.owner === me ? "me" : ""}>
                <td class="num tiny muted" style={{ width: 18 }}>{i + 1}</td>
                <td>
                  <div class="small">{displayName(g, r.owner)}</div>
                  {r.note && <div class="tiny muted">{r.note}</div>}
                </td>
                <td class="n num small" style={{ whiteSpace: "nowrap" }}>{r.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function RecordsTab({ g }: { g: GameState }) {
  const [view, setView] = useState<"season" | "all">("season");
  const [region, setRegion] = useState(g.player.region);
  const [comp, setComp] = useState<(typeof COMPS)[number][0]>("league");
  const rec = recordsOf(g);
  const regional = view === "all" || comp === "league" || comp === "cup";
  const table = rec.comps[compOf(comp, region)!];
  const L = leagueRecords(g, region);
  const awards = rec.awards.filter(a => a.region === region && !a.comp).slice().reverse();
  const goldenMasterBalls = g.goldenMasterBalls?.filter(a => view === "all" || a.season === g.season).reverse() ?? [];
  return (
    <Win title="기록">
      <div class="col" style={{ gap: 8 }}>
        <div class="row" style={{ gap: 4 }}>
          <button class={`btn small ${view === "season" ? "sel" : ""}`} onClick={() => setView("season")}>
            시즌 {g.season} 기록
          </button>
          <button class={`btn small ${view === "all" ? "sel" : ""}`} onClick={() => setView("all")}>
            역대 기록
          </button>
        </div>
        {view === "season" && (
          <div class="row" style={{ gap: 4 }}>
            {COMPS.map(([id, label]) => (
              <button key={id} class={`btn small ${comp === id ? "sel" : ""}`} onClick={() => setComp(id)}>
                {label}
              </button>
            ))}
          </div>
        )}
        {regional && (
          <div class="row" style={{ gap: 4 }}>
            {REGIONS.map(r => (
              <button key={r.id} class={`btn small ${r.id === region ? "sel" : ""}`} onClick={() => setRegion(r.id)}>
                {r.name}
              </button>
            ))}
          </div>
        )}
        {view === "season" ? (
          <>
            <div class="tiny muted">입힌 피해·받은 피해는 상대와 주고받은 HP(기술·접촉 효과)입니다. 리그는 최다 KO·최다 피해·최다 피해 흡수 포켓몬을 시상합니다. 지방 컵·PWT·PST·PCT·PSB는 최다 KO상을 시상합니다.</div>
            <div class="rec-grid">
              {(["k", "d", "t"] as Kind[]).map(k => (
                <MonRank key={k} g={g} table={table} kind={k} />
              ))}
            </div>
            {(comp === "league" || awards.length > 0) && (
              <div class="col" style={{ gap: 2 }}>
                <b class="small">{regionById(region).name} 리그 개인상</b>
                {awards.length === 0 ? (
                  <div class="tiny muted">리그가 끝나면 발표됩니다.</div>
                ) : (
                  awards.map((a, i) => (
                    <div key={i} class={`small ${a.owner === g.player.slotId ? "gold" : ""}`}>
                      시즌 {a.season} · {AWARD_KO[a.kind]} — {displayName(g, a.owner)}의 <GoldenMonName g={g} owner={a.owner} uid={a.uid} species={a.species}>{(a.owner === g.player.slotId && g.player.squad.find(m => m.uid === a.uid)?.nickname) || koSpecies(a.species)}</GoldenMonName> ({a.kind === "k" ? `${a.value} KO` : `${a.value.toLocaleString()} HP`})
                    </div>
                  ))
                )}
              </div>
            )}
          </>
        ) : (
          <>
            <div class="tiny muted">{regionById(region).name} 리그의 모든 시즌을 합친 기록입니다 (리그 경기만).</div>
            <div class="rec-grid">
              {(["k", "a", "d", "t"] as Kind[]).map(k => (
                <MonRank key={k} g={g} table={L.mons} kind={k} />
              ))}
            </div>
            <div class="rec-grid">
              <TrainerRank g={g} title="최다 우승" rows={Object.entries(L.titles).sort((a, b) => b[1] - a[1]).map(([owner, n]) => ({ owner, value: `${n}회` }))} />
              <TrainerRank g={g} title="최다 승점 우승" rows={L.champPts.map(c => ({ owner: c.owner, value: `${c.pts}점`, note: `시즌 ${c.season}` }))} />
              <TrainerRank g={g} title="최다 연승" rows={Object.entries(L.bestW).sort((a, b) => b[1].len - a[1].len).map(([owner, r]) => ({ owner, value: `${r.len}연승`, note: `시즌 ${r.season}` }))} />
              <TrainerRank g={g} title="최다 연패" rows={Object.entries(L.bestL).sort((a, b) => b[1].len - a[1].len).map(([owner, r]) => ({ owner, value: `${r.len}연패`, note: `시즌 ${r.season}` }))} />
            </div>
          </>
        )}
        {!!goldenMasterBalls.length && <div class="col" style={{ gap: 2 }}>
          <b class="small">{GOLDEN_MASTER_BALL} 수상 기록</b>
          {goldenMasterBalls.map(a => <div key={a.season} class="small">
            시즌 {a.season} · {a.trainerName}의 <GoldenMonName g={g} owner={a.owner} uid={a.uid} species={a.species}>{a.pokemonName}</GoldenMonName> · {a.kos} KO{a.trophies.length > 0 && ` · ${a.trophies.join(", ")} 우승`}
          </div>)}
        </div>}
      </div>
    </Win>
  );
}
