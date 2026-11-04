// 경영 tab: loans (three tiers of lenders) and treatment bills.
import { useState } from "preact/hooks";
import type { GameState } from "../game/state";
import { borrow, canBorrow, fameBack, fameLostOn, instalment, lendersFor, loansOf, monthlyRate, pctLabel, principalLeft, repayAll, roomWith, TIER_FAME, TIER_KO, type LenderDef, type LoanTier } from "../game/loan";
import { condLabel, hasNurse, treatmentCost, treatSquad } from "../game/clinic";
import { koSpecies } from "../data/dex";
import { weeklyCosts } from "../game/finance";
import { update } from "./store";
import { Money, MonIcon, Win } from "./components";

export function LoanPanel({ g, toast }: { g: GameState; toast: (s: string) => void }) {
  const p = g.player;
  const loans = loansOf(g);
  const lenders = lendersFor(p.region);
  const [pick, setPick] = useState<LenderDef | null>(null);
  const [amount, setAmount] = useState(0);
  const owed = loans.reduce((a, l) => a + l.balance, 0);
  return (
    <Win title="대출">
      <div class="col small" style={{ gap: 6 }}>
        <div class="tiny muted">명성 {Math.round(p.reputation)} · 제1금융권은 명성 50, 제2금융권은 20 이상 · 매달 1일 원리금을 나눠 갚고, 못 갚으면 명성이 떨어집니다.</div>
        {loans.length > 0 && (
          <div class="col" style={{ gap: 4 }}>
            <b>
              갚을 돈 <Money v={owed} />
            </b>
            {loans.map(l => (
              <div key={l.id} class="row" style={{ gap: 6, flexWrap: "nowrap", alignItems: "flex-start" }}>
                <div class="grow">
                  {l.name} <span class="tiny muted">{TIER_KO[l.tier]}</span>
                  <div class="tiny">
                  남은 빚 <Money v={l.balance} /> (원금 ₽{principalLeft(l).toLocaleString()}) · 월 ₽{l.payment.toLocaleString()} · {l.monthsLeft}개월
                  {l.missed > 0 && (
                    <span class="bad">
                      {" "}
                      · 연체 {l.missed}회 (명성 −{fameLostOn(l)}, 완납하면 +{fameBack(l)} 회복)
                    </span>
                  )}
                  </div>
                </div>
                <button class="btn small" onClick={() => update(st => toast(repayAll(st, l.id) || "대출을 모두 갚았습니다."))}>
                  완납
                </button>
              </div>
            ))}
          </div>
        )}
        {([1, 2, 3] as LoanTier[]).map(tier => (
          <div key={tier} class="col" style={{ gap: 2 }}>
            <div style={{ marginTop: 6 }}>
              <b>{TIER_KO[tier]}</b> <span>{TIER_FAME[tier] ? `명성 ${TIER_FAME[tier]} 이상` : "누구나"}</span>
            </div>
            {lenders
              .filter(l => l.tier === tier)
              .map(l => {
                const err = canBorrow(g, l);
                const room = roomWith(g, l);
                const has = loans.some(x => x.lender === l.id);
                return (
                  <div key={l.id} class="row" style={{ gap: 6, flexWrap: "nowrap", alignItems: "flex-start", padding: "2px 0", borderTop: "1px solid rgba(87,74,110,.35)" }}>
                    <div class="grow">
                      <div>{l.name}</div>
                      <div class="tiny muted">
                        한도 ₽{l.limit.toLocaleString()}
                        {has && <span class="gold"> (남은 한도 ₽{room.toLocaleString()})</span>} · 월 이자 {pctLabel(monthlyRate(l.annual))} · {l.months}개월
                      </div>
                      <div class="tiny muted">{l.note}</div>
                    </div>
                    <button
                      class="btn small"
                      disabled={!!err}
                      title={err || ""}
                      onClick={() => {
                        setPick(l);
                        const short = p.money < 0 ? -p.money + weeklyCosts(g).total : room / 2;
                        setAmount(Math.min(room, Math.max(1000, Math.ceil(short / 1000) * 1000)));
                      }}
                    >
                      {has ? "추가 대출" : "빌리기"}
                    </button>
                  </div>
                );
              })}
          </div>
        ))}
        {pick && (
          <div class="card" style={{ cursor: "default" }}>
            <b>{pick.name}</b> <span class="tiny muted">{pick.note}</span>
            <label class="col" style={{ gap: 2, marginTop: 4 }}>
              <span>
                빌릴 금액 <b>₽{amount.toLocaleString()}</b>
              </span>
              <input type="range" min={1000} max={roomWith(g, pick)} step={1000} value={Math.min(amount, roomWith(g, pick))} onInput={e => setAmount(Number((e.target as HTMLInputElement).value))} />
              <span class="tiny muted">
                한도 ₽{pick.limit.toLocaleString()} 중 빌릴 수 있는 원금 ₽{roomWith(g, pick).toLocaleString()} (이자는 한도에 들어가지 않습니다)
              </span>
            </label>
            <div class="tiny">
              월 이자 {pctLabel(monthlyRate(pick.annual))} · {pick.months}개월 동안 매달 1일 ₽{instalment(amount, pick.annual, pick.months).toLocaleString()} 상환 (총 ₽{(instalment(amount, pick.annual, pick.months) * pick.months).toLocaleString()})
            </div>
            <div class="row" style={{ marginTop: 4 }}>
              <button
                class="btn primary small"
                onClick={() =>
                  update(st => {
                    const err = borrow(st, pick.id, amount);
                    toast(err || `₽${amount.toLocaleString()}을 빌렸습니다.`);
                    if (!err) setPick(null);
                  })
                }
              >
                대출 받기
              </button>
              <button class="btn small" onClick={() => setPick(null)}>
                취소
              </button>
            </div>
          </div>
        )}
      </div>
    </Win>
  );
}

/** Pokémon still hurt from the last battle and what treating them costs. */
export function TreatmentPanel({ g, toast }: { g: GameState; toast: (s: string) => void }) {
  const hurt = g.player.squad.filter(m => m.cond);
  return (
    <Win title="포켓몬 치료">
      <div class="col small" style={{ gap: 4 }}>
        <div class="tiny muted">
          경기 뒤 치료비 = 깎인 체력 비율 × 그 포켓몬의 주간 먹이값 + 쓴 PP 1당 ₽50. 돈이 모자라면 치료하지 못한 채 다음 경기에 나섭니다.
          {hasNurse(g) ? " 간호사 포켓몬이 있어 치료비가 반값입니다." : " 해피너스 계열·다부니·푸크린 계열·큐아링·에써르가 스쿼드에 있으면 반값."}
        </div>
        {hurt.length === 0 ? (
          <div class="muted">모든 포켓몬이 건강합니다.</div>
        ) : (
          <>
            {hurt.map(m => (
              <div key={m.uid} class="row" style={{ gap: 6 }}>
                <MonIcon species={m.species} />
                <span>{m.nickname || koSpecies(m.species)}</span>
                <span class="bad tiny">{condLabel(m)}</span>
                <span class="right">
                  <Money v={treatmentCost(g, m)} />
                </span>
              </div>
            ))}
            <button
              class="btn small primary"
              onClick={() =>
                update(st => {
                  const r = treatSquad(st);
                  toast(r.healed.length ? `${r.healed.length}마리 치료 (₽${r.paid.toLocaleString()})` : "치료비가 부족합니다.");
                })
              }
            >
              지금 치료
            </button>
          </>
        )}
      </div>
    </Win>
  );
}
