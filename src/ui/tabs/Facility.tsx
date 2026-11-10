import { useState } from "preact/hooks";
import type { GameState } from "../../game/state";
import {
  FACILITY_KO,
  FACILITY_MAX,
  MAX_SEATS,
  PRICE_MAX,
  PRICE_MIN,
  SEAT_TIERS,
  STADIUM_NAME_MAX,
  UPKEEP_PER_LEVEL,
  bestPrice,
  buyGround,
  capacityOf,
  expandStadium,
  expansionCost,
  gateAt,
  defaultGroundName,
  groundName,
  groundPrice,
  merchMult,
  playerRented,
  playerSeats,
  refPrice,
  seatPrice,
  stadiumName,
  stadiumRent,
  stadiumUpkeep,
  ticketDemand,
  upgradeCost,
  upgradeFacility,
  weeklyIncome,
} from "../../game/finance";
import { moodFactor, priceJolt, satOf, setTicketPrice, type MoodEntry } from "../../game/fans";
import { dateLabel } from "../../game/calendar";
import { nextTicketForecast } from "../../game/season";
import { update } from "../store";
import { Bar, Modal, Money, Win, useToast } from "../components";

/** Facilities: fans' mood and fame, the ticket price, the home ground, training / scouting / merch shop. */
export function FacilityTab({ g }: { g: GameState }) {
  const [toast, showToast] = useToast();
  return (
    <>
      <div class="grid2">
        <MoodPanel g={g} />
        <GroundPanel g={g} />
      </div>
      <TicketPanel g={g} toast={showToast} />
      {playerSeats(g.player.facilities) > 0 ? <StadiumBuilder g={g} toast={showToast} /> : <BuyGround g={g} toast={showToast} />}
      <FacilitiesPanel g={g} toast={showToast} />
      {toast}
    </>
  );
}

function LogList({ log, empty }: { log?: MoodEntry[]; empty: string }) {
  if (!log?.length) return <div class="tiny muted">{empty}</div>;
  return (
    <div class="col" style={{ gap: 0 }}>
      {log.slice(0, 5).map((e, i) => (
        <div key={i} class="row tiny" style={{ gap: 6, flexWrap: "nowrap" }}>
          <span class={e.d > 0 ? "good" : "bad"} style={{ minWidth: 34, textAlign: "right" }}>
            {e.d > 0 ? "+" : ""}
            {e.d}
          </span>
          <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.text}</span>
          <span class="right muted">{dateLabel(e.day, false)}</span>
        </div>
      ))}
    </div>
  );
}

function MoodPanel({ g }: { g: GameState }) {
  const p = g.player;
  const sat = satOf(g);
  return (
    <Win title="팬 만족도·명성">
      <div class="col small" style={{ gap: 6 }}>
        <div class="row">
          팬 수 <b class="right">{p.fans.toLocaleString()}명</b>
        </div>
        <div>
          <div class="row">
            <span title="최근 성적과 구단의 결정에 빠르게 반응합니다. 굿즈 매출과 팬 증가 속도, 적정 표값(조금)에 영향">팬 만족도</span>
            <b class="right">{Math.round(sat)}/100</b>
          </div>
          <Bar v={sat / 100} />
          <LogList log={p.satLog} empty="아직 변화가 없습니다." />
        </div>
        <div>
          <div class="row">
            <span title="구단의 대외적인 위상. 긴 연승·연패, 우승, 시즌 기대 대비 성적, 대출 연체로 천천히 바뀝니다. 적정 표값과 스폰서에 영향">명성</span>
            <b class="right">{Math.round(p.reputation)}/100</b>
          </div>
          <Bar v={p.reputation / 100} />
          <LogList log={p.fameLog} empty="아직 변화가 없습니다." />
        </div>
      </div>
    </Win>
  );
}

function GroundPanel({ g }: { g: GameState }) {
  const p = g.player;
  const seats = playerSeats(p.facilities);
  const rented = playerRented(p.facilities);
  return (
    <Win title="홈 경기장">
      <div class="col small" style={{ gap: 6 }}>
        <div class="row">
          경기장 <b class="right">{groundName(p.replaced, seats, p.facilities.name)}</b>
        </div>
        <div class="row">
          좌석 <span class="right">
            {capacityOf(seats, rented).toLocaleString()}석{seats === 0 && <span class="muted tiny"> (빌린 경기장)</span>}
          </span>
        </div>
        <div class="row">
          {seats > 0 ? "경기장 유지비 (주)" : "경기장 임대료 (주)"} <span class="right bad">-₽{(seats > 0 ? stadiumUpkeep(seats) : stadiumRent(seats, rented)).toLocaleString()}</span>
        </div>
      </div>
    </Win>
  );
}

/** Ticket price: what it brings, and the crowd the club would draw at its ideal price with seats to spare. */
function TicketPanel({ g, toast }: { g: GameState; toast: (s: string) => void }) {
  const p = g.player;
  const sat = satOf(g);
  const cap = capacityOf(playerSeats(p.facilities), playerRented(p.facilities));
  const [draft, setDraft] = useState(p.ticketPrice);
  const cur = nextTicketForecast(g, draft);
  const ideal = ticketDemand(p.fans, p.reputation, sat, refPrice(p.reputation, sat));
  const jolt = priceJolt(g, draft);
  return (
    <Win title="입장료">
      <div class="col small" style={{ gap: 6 }}>
        <div class="row" style={{ gap: 6 }}>
          <span>입장료</span>
          <input type="range" min={PRICE_MIN} max={PRICE_MAX} step={1} value={draft} style={{ flex: 1, minWidth: 120 }} onInput={e => setDraft(Number((e.target as HTMLInputElement).value))} />
          <b>₽{draft}</b>
        </div>
        <div class="row">
          예상 관중 수 <b class="right">{cur.attendance.toLocaleString()}명</b>
        </div>
        <div class="row">
          예상 입장료 수익 <b class="right">
            <Money v={cur.income} />
          </b>
        </div>
        {cur.row && <div class="tiny muted">
          {dateLabel(cur.row.day, false)} {cur.row.label || "친선경기"} 기준
          {cur.importance !== 0 && ` · 경기 중요도 ${cur.importance > 0 ? "+" : ""}${cur.importance}%`}
          {cur.row.splitGate && " · 수입 배분 반영"}
          {cur.row.splitGate && "host" in cur.row.splitGate && !cur.row.home && " · 개최팀 입장료 기준"}
        </div>}
        {cur.mayRepeat && cur.importance > -5 && <div class="tiny muted">같은 선발을 또 내보내 팬 만족도가 떨어지면 경기 보정은 −5%가 됩니다.</div>}
        <div class="row">
          최적 관중 수 <b class={`right ${ideal > cap ? "gold" : ""}`}>{ideal.toLocaleString()}명</b>
        </div>
        <div class="row" style={{ gap: 6 }}>
          {jolt !== 0 && <span class={`tiny ${jolt > 0 ? "good" : "bad"}`}>팬 만족도 {jolt > 0 ? "+" : ""}{jolt}</span>}
          <span class="right" />
          <button class="btn small" onClick={() => setDraft(p.ticketPrice)} disabled={draft === p.ticketPrice}>
            되돌리기
          </button>
          <button
            class="btn small primary"
            disabled={draft === p.ticketPrice}
            onClick={() =>
              update(st => {
                const d = setTicketPrice(st, draft);
                toast(`입장료 ₽${draft}로 변경${d ? ` · 팬 만족도 ${d > 0 ? "+" : ""}${d}` : ""}`);
              })
            }
          >
            적용 (지금 ₽{p.ticketPrice})
          </button>
        </div>
      </div>
    </Win>
  );
}

function BuyGround({ g, toast }: { g: GameState; toast: (s: string) => void }) {
  const p = g.player;
  const size = playerRented(p.facilities);
  const price = groundPrice(size);
  const inheritedName = defaultGroundName(p.replaced);
  const [step, setStep] = useState<"choice" | "custom" | "default" | null>(null);
  const [name, setName] = useState("");
  const close = () => setStep(null);
  const purchase = (chosenName?: string) => {
    update(st => toast(buyGround(st, chosenName) || "전용 경기장을 마련했습니다."));
    close();
  };
  return (
    <Win title="전용 경기장">
      <div class="col small" style={{ gap: 6 }}>
        <div>
          지금은 {size.toLocaleString()}석 경기장을 빌려 쓰며 주 ₽{stadiumRent(0, size).toLocaleString()}의 임대료를 냅니다. ₽{price.toLocaleString()}에 {size.toLocaleString()}석 전용 경기장을 사면 임대료 대신 주 ₽{stadiumUpkeep(size).toLocaleString()}의 유지비만 내고, 그 뒤로 좌석을 늘릴 수 있습니다.
        </div>
        <button class="btn primary" disabled={p.money < price} onClick={() => {
          setName("");
          setStep("choice");
        }}>
          {p.money < price ? "자금 부족" : "전용 경기장 사기"} <Money v={price} />
        </button>
      </div>
      {step && (
        <Modal onClose={close}>
          <Win title="전용 경기장 이름">
            <div class="col small" style={{ gap: 8 }}>
              {step === "choice" ? (
                <>
                  <div>새 전용 경기장에 이름을 지을까요?</div>
                  <div class="row">
                    <button class="btn primary" onClick={() => setStep("custom")}>이름 짓기</button>
                    <button class="btn" onClick={() => setStep("default")}>짓지 않기</button>
                    <button class="btn" onClick={close}>취소</button>
                  </div>
                </>
              ) : (
                <form class="col" style={{ gap: 8 }} onSubmit={e => {
                  e.preventDefault();
                  if (step === "default" || name.trim()) purchase(step === "custom" ? name : undefined);
                }}>
                  {step === "custom" ? (
                    <input aria-label="경기장 이름" autoFocus maxLength={STADIUM_NAME_MAX} value={name}
                      onInput={e => setName(e.currentTarget.value)} />
                  ) : (
                    <div>이어받은 트레이너의 경기장 이름인 ‘{inheritedName}’으로 확정할까요?</div>
                  )}
                  <div class="row">
                    <button type="submit" class="btn primary" disabled={step === "custom" && !name.trim()}>
                      확정하고 구매 <Money v={price} />
                    </button>
                    <button type="button" class="btn" onClick={() => setStep("choice")}>뒤로</button>
                  </div>
                </form>
              )}
            </div>
          </Win>
        </Modal>
      )}
    </Win>
  );
}

/** Choose how many seats to add and see what it costs and what it brings in. */
function StadiumBuilder({ g, toast }: { g: GameState; toast: (s: string) => void }) {
  const p = g.player;
  const sat = satOf(g);
  const seats = playerSeats(p.facilities);
  const room = MAX_SEATS - seats;
  // the crowd that would come at the reference price (where takings peak with seats to spare)
  const want = gateAt(p.fans, p.reputation, sat, MAX_SEATS, Math.round(refPrice(p.reputation, sat))).demand;
  const toDemand = Math.max(0, Math.ceil((want - seats) / 100) * 100);
  const [add, setAdd] = useState(Math.min(room, Math.max(100, toDemand || 500)));
  const n = Math.max(0, Math.min(room, Math.round(add / 100) * 100));
  const to = seats + n;
  const cost = expansionCost(seats, to);
  // best takings per home game before and after (the price moves with the seats)
  const now = gateAt(p.fans, p.reputation, sat, seats, bestPrice(p.fans, p.reputation, sat, seats)).income;
  const after = gateAt(p.fans, p.reputation, sat, to, bestPrice(p.fans, p.reputation, sat, to)).income;
  const gain = after - now;
  const weekly = stadiumUpkeep(to) - stadiumUpkeep(seats);
  const quick = [500, 1000, 5000].filter(v => v <= room);
  return (
    <Win title="경기장 증축">
      <div class="col small" style={{ gap: 6 }}>
        <div class="tiny muted">
          100석 단위로 늘립니다. 1석당 건설비: {SEAT_TIERS.slice(1).map(([upto, price], i) => `${(SEAT_TIERS[i][0] + 1).toLocaleString()}~${upto.toLocaleString()}석 ₽${price}`).join(" · ")}. 유지비 1석당 주 ₽0.15.
        </div>
        {room <= 0 ? (
          <div class="gold">최대 {MAX_SEATS.toLocaleString()}석입니다.</div>
        ) : (
          <>
            <div class="row" style={{ gap: 6 }}>
              <span>늘릴 좌석</span>
              <input type="number" min={100} max={room} step={100} value={add} style={{ width: 96 }} onInput={e => setAdd(Number((e.target as HTMLInputElement).value) || 0)} />
              <span>석</span>
              {quick.map(v => (
                <button key={v} class="btn small" onClick={() => setAdd(v)}>
                  +{v.toLocaleString()}
                </button>
              ))}
              {toDemand >= 100 && toDemand <= room && (
                <button class="btn small" title="좌석이 남을 때의 적정 표값으로 올 관중만큼" onClick={() => setAdd(toDemand)}>
                  수요만큼
                </button>
              )}
            </div>
            <input type="range" min={100} max={Math.min(room, 20000)} step={100} value={Math.min(add, 20000)} onInput={e => setAdd(Number((e.target as HTMLInputElement).value))} />
            <div class="col" style={{ gap: 2 }}>
              <div class="row">
                {seats.toLocaleString()}석 → <b>{to.toLocaleString()}석</b> <span class="muted tiny">({stadiumName(to)})</span>
                <b class="right">
                  <Money v={cost} />
                </b>
              </div>
              <div class="tiny muted">
                1석당 평균 ₽{n ? Math.round(cost / n) : 0} (다음 좌석 ₽{seatPrice(to + 1)}) · 유지비 주 +₽{weekly.toLocaleString()}
              </div>
              <div class="tiny">
                {gain > 0 ? (
                  <>
                    표값을 다시 맞추면 홈 경기마다 <span class="good">+₽{gain.toLocaleString()}</span> · 약 {Math.ceil(cost / gain)}경기면 본전
                  </>
                ) : (
                  <span class="muted">지금 팬 수로는 늘린 좌석이 수입을 늘리지 못합니다. 팬이 늘어야 합니다.</span>
                )}
              </div>
            </div>
            <button
              class="btn primary"
              disabled={n < 100 || cost > p.money}
              onClick={() =>
                update(st => {
                  const err = expandStadium(st, n);
                  toast(err || `경기장을 ${to.toLocaleString()}석으로 늘렸습니다.`);
                })
              }
            >
              {cost > p.money ? "자금 부족" : "증축하기"} <Money v={cost} />
            </button>
          </>
        )}
      </div>
    </Win>
  );
}

function FacilitiesPanel({ g, toast }: { g: GameState; toast: (s: string) => void }) {
  const p = g.player;
  const merchNow = weeklyIncome(g).merch;
  return (
    <Win title="시설">
      <div class="grid3">
        {(Object.keys(FACILITY_MAX) as (keyof typeof FACILITY_MAX)[]).map(k => {
          const lv = p.facilities[k] ?? 1;
          const max = FACILITY_MAX[k];
          const cost = upgradeCost(k, lv);
          const merchNext = Math.round(p.fans * 0.5 * moodFactor(satOf(g)) * merchMult(lv + 1));
          return (
            <div key={k} class="card" style={{ cursor: "default" }}>
              <b>{FACILITY_KO[k]}</b> <span class="gold">Lv.{lv}</span>
              <span class="tiny muted">/{max}</span>
              <div class="tiny muted" style={{ minHeight: 34 }}>
                {k === "training" && "주간 훈련 경험치·노력치 증가"}
                {k === "scouting" && "후보 수·레벨·개체값, ★ 정확도, 동시 파견 수 증가"}
                {k === "merch" && (
                  <>
                    단계마다 굿즈 매출 +40% · 지금 주 ₽{merchNow.toLocaleString()}
                    {lv < max && ` → ₽${merchNext.toLocaleString()}`}
                  </>
                )}
              </div>
              <div class="tiny muted">
                유지비 주 ₽{((lv - 1) * UPKEEP_PER_LEVEL[k]).toLocaleString()}
                {lv < max && ` → 다음 단계 ₽${(lv * UPKEEP_PER_LEVEL[k]).toLocaleString()}`}
              </div>
              <button
                class="btn small primary"
                disabled={lv >= max}
                onClick={() =>
                  update(st => {
                    const err = upgradeFacility(st, k);
                    toast(err || `${FACILITY_KO[k]}을(를) 업그레이드했습니다.`);
                  })
                }
              >
                {lv >= max ? "최고 단계" : <>업그레이드 <Money v={cost} /></>}
              </button>
            </div>
          );
        })}
      </div>
    </Win>
  );
}
