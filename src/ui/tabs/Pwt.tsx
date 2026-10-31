import { REGIONS } from "../../data/dex";
import type { GameState, PwtMatch } from "../../game/state";
import { displayName } from "../../game/state";
import { KO_NAMES, slotsPerRegion } from "../../game/pwt";
import { standings } from "../../game/league";
import { Win } from "../components";

export function PwtTab({ g }: { g: GameState }) {
  const pwt = g.pwt;
  const me = g.player.slotId;
  const slots = slotsPerRegion(g);
  if (!pwt) {
    return (
      <Win title="포켓몬 월드 토너먼트 (PWT)">
        <p class="small">
          9월 리그가 끝나면 각 지방 상위 3명(지방 계수 상위 5개 지방은 4명), 모두 32명이 11월 PWT에 나갑니다. 스위스 스테이지(3승 진출 · 3패 탈락)를 거쳐 16명이 12월 3판 2선승 토너먼트로 세계 챔피언을 가립니다.
        </p>
        <table class="tbl">
          <thead>
            <tr>
              <th>지방</th>
              <th class="n">계수</th>
              <th class="n">출전권</th>
              <th>현재 진출권 순위</th>
            </tr>
          </thead>
          <tbody>
            {REGIONS.map(r => (
              <tr key={r.id} class={r.id === g.player.region ? "me" : ""}>
                <td>{r.name}</td>
                <td class="n">{g.coefficients[r.id]}</td>
                <td class="n">{slots[r.id]}</td>
                <td class="small">
                  {standings(g.leagues[r.id])
                    .slice(0, slots[r.id])
                    .map(x => displayName(g, x.id))
                    .join(", ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Win>
    );
  }
  const rec = pwt.records;
  const sorted = pwt.entrants.slice().sort((a, b) => rec[b].w - rec[a].w || rec[a].l - rec[b].l);
  return (
    <>
      {pwt.champion && (
        <Win class="w2" title="PWT 챔피언">
          <b class="gold">🏆 {displayName(g, pwt.champion)}</b> <span class="muted">({pwt.seeds[pwt.champion]})</span>
        </Win>
      )}
      {pwt.ko.length > 0 && (
        <Win title="토너먼트 (3판 2선승)">
          <div class="row" style={{ alignItems: "flex-start", gap: 12, overflowX: "auto" }}>
            {pwt.ko.map((round, i) => (
              <div key={i} class="col" style={{ gap: 6, minWidth: 170 }}>
                <b class="small gold">{KO_NAMES[i]}</b>
                {round.map((m, j) => (
                  <KoCard key={j} g={g} m={m} me={me} />
                ))}
              </div>
            ))}
          </div>
        </Win>
      )}
      <Win title={`스위스 스테이지 (${pwt.swiss.length}라운드 진행)`}>
        <div class="tbl-wrap">
          <table class="tbl">
            <thead>
              <tr>
                <th>트레이너</th>
                <th>자격</th>
                <th class="n">승-패</th>
                <th>상태</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(id => (
                <tr key={id} class={id === me ? "me" : ""}>
                  <td>{displayName(g, id)}</td>
                  <td class="small muted">{pwt.seeds[id]}</td>
                  <td class="n">
                    {rec[id].w}-{rec[id].l}
                  </td>
                  <td class="small">{pwt.advanced.includes(id) ? <span class="good">진출</span> : pwt.eliminated.includes(id) ? <span class="bad">탈락</span> : "진행 중"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Win>
    </>
  );
}

function KoCard({ g, m, me }: { g: GameState; m: PwtMatch; me: string }) {
  const a = m.games.filter(x => x.w === 0).length;
  const b = m.games.filter(x => x.w === 1).length;
  const line = (id: string, score: number) => (
    <div class={`row small ${m.winner === id ? "gold" : m.winner ? "muted" : ""}`} style={{ fontWeight: id === me ? 700 : 400 }}>
      <span class="grow">{displayName(g, id)}</span>
      <span class="num">{m.games.length ? score : ""}</span>
    </div>
  );
  return (
    <div class="card" style={{ cursor: "default", padding: 6 }}>
      {line(m.a, a)}
      {line(m.b, b)}
    </div>
  );
}
