// Sponsor contract and August offers, with FM-style negotiation (monthly pay, bonus, length).
import { useState } from "preact/hooks";
import type { GameState } from "../game/state";
import { dateLabel } from "../game/calendar";
import { SIZE_KO, regionLabel, respond, signOffer, sponsorOf, sponsorScore, villainOrgFor, type SponsorOffer } from "../game/sponsor";
import { update } from "./store";
import { Money, Win } from "./components";

export function SponsorPanel({ g, toast }: { g: GameState; toast: (s: string) => void }) {
  const sp = sponsorOf(g);
  const c = sp.contract;
  const score = sp.score ?? sponsorScore(g);
  const [open, setOpen] = useState<number | null>(null);
  const active = c && (c.fixed || c.toSeason >= g.season) ? c : null;
  return (
    <Win title="스폰서" right={<span class="tiny muted">평가 {score.score}점 (명성 {score.rep} · 최근 3시즌 성적 {score.perf})</span>}>
      {active ? (
        <div class="card" style={{ cursor: "default" }}>
          <div class="row">
            <b>{active.name}</b>
            <span class="chip">{SIZE_KO[active.size]}</span>
            <span class="tiny muted">{regionLabel(active.region)}</span>
            <span class="right tiny muted">{active.fixed ? "소속 조직 · 영구 계약" : `${active.fromSeason}~${active.toSeason}시즌`}</span>
          </div>
          <div class="row small" style={{ marginTop: 4 }}>
            월 지급 <b>
              <Money v={active.monthly} />
            </b>
            {!active.fixed && (
              <>
                · 시즌 성과급 최대 <b>
                  <Money v={active.bonus} />
                </b>
              </>
            )}
            <span class="right tiny muted">누적 수령 ₽{active.paidTotal.toLocaleString()}</span>
          </div>
          {active.fixed ? (
            <div class="tiny muted">악의 조직은 소속 보스·조직원만 후원합니다. 성과 목표 없이 명성에 따라 매 시즌 월 지급액이 정해지고, 다른 스폰서 제의는 오지 않습니다.</div>
          ) : (
            <div class="col tiny" style={{ gap: 2, marginTop: 4 }}>
              {active.objectives.map(o => {
                const r = active.log.find(l => l.season === g.season && l.label === o.label);
                return (
                  <div key={o.label} class="row">
                    · {o.label} <span class="muted">(성과급의 {Math.round(o.share * 100)}% = ₽{Math.round((active.bonus * o.share) / 500) * 500 > 0 ? (Math.round((active.bonus * o.share) / 500) * 500).toLocaleString() : 0})</span>
                    <span class={`right ${r ? (r.ok ? "good" : "bad") : "muted"}`}>{r ? (r.ok ? `달성 +₽${r.paid.toLocaleString()}` : "실패") : "진행 중"}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div class="small muted">{villainOrgFor(g) ? "" : "현재 스폰서가 없습니다."}</div>
      )}
      {sp.offers.length > 0 && (
        <>
          <div class="row small" style={{ marginTop: 8 }}>
            <b>스폰서 제의 {sp.offers.filter(o => o.status === "open").length}건</b>
            <span class="tiny muted right">{dateLabel(sp.offersUntil)}까지 유효 · 한 곳과만 계약할 수 있습니다</span>
          </div>
          <div class="col" style={{ gap: 4, marginTop: 4 }}>
            {sp.offers.map((o, i) => (
              <OfferCard key={o.name} o={o} idx={i} open={open === i} setOpen={v => setOpen(v ? i : null)} toast={toast} locked={!!active} />
            ))}
          </div>
        </>
      )}
      {!active && !sp.offers.length && !villainOrgFor(g) && <div class="tiny muted">매년 8월 첫 월요일에 명성과 최근 3시즌 성적에 따라 스폰서 제의가 도착합니다.</div>}
    </Win>
  );
}

function OfferCard({ o, idx, open, setOpen, toast, locked }: { o: SponsorOffer; idx: number; open: boolean; setOpen: (v: boolean) => void; toast: (s: string) => void; locked: boolean }) {
  const [monthly, setMonthly] = useState(o.monthly);
  const [bonus, setBonus] = useState(o.bonus);
  const [len, setLen] = useState(o.len);
  const [msg, setMsg] = useState<string>(o.message || "");
  const [agreed, setAgreed] = useState<null | { monthly: number; bonus: number; len: number }>(null);
  const out = o.status !== "open";
  const sign = (terms?: { monthly: number; bonus: number; len: number }) =>
    update(st => {
      const err = signOffer(st, idx, terms);
      toast(err ?? `${o.name}와(과) 계약했습니다.`);
    });
  const propose = () =>
    update(st => {
      const so = sponsorOf(st).offers[idx];
      const r = respond(so, { monthly, bonus, len });
      so.message = r.message;
      setMsg(r.message);
      if (r.kind === "accept") setAgreed({ monthly, bonus, len });
      else setAgreed(null);
      if (r.counter) {
        setMonthly(r.counter.monthly);
        setBonus(r.counter.bonus);
        setLen(r.counter.len);
      }
    });
  return (
    <div class="card" style={{ cursor: "default", opacity: out ? 0.5 : 1 }}>
      <div class="row">
        <b>{o.name}</b>
        <span class="chip">{SIZE_KO[o.size]}</span>
        <span class="tiny muted">
          {o.industry} · {regionLabel(o.region)}
        </span>
        <span class="right small">
          월 <Money v={o.monthly} /> · 성과급 <Money v={o.bonus} /> · {o.len}시즌
        </span>
      </div>
      <div class="tiny muted">목표: {o.objectives.map(x => x.label).join(" / ")}</div>
      {out ? (
        <div class="tiny bad">{o.message || "제의를 거두었습니다."}</div>
      ) : (
        <div class="row" style={{ marginTop: 4 }}>
          <button class="btn small primary" disabled={locked} onClick={() => sign()}>
            이 조건으로 계약
          </button>
          <button class={`btn small ${open ? "sel" : ""}`} disabled={locked} onClick={() => setOpen(!open)}>
            협상
          </button>
          <span class="tiny muted right">인내심 {"●".repeat(o.patience)}{"○".repeat(3 - o.patience)}</span>
        </div>
      )}
      {open && !out && !locked && (
        <div class="col small" style={{ gap: 4, marginTop: 6, borderTop: "1px solid #ffffff22", paddingTop: 6 }}>
          <label class="row">
            월 지급액 ₽
            <input type="number" step={500} min={500} value={monthly} style={{ width: 110 }} onInput={e => setMonthly(Number((e.target as HTMLInputElement).value) || 0)} />
          </label>
          <label class="row">
            시즌 성과급 ₽
            <input type="number" step={500} min={0} value={bonus} style={{ width: 110 }} onInput={e => setBonus(Number((e.target as HTMLInputElement).value) || 0)} />
            <span class="tiny muted">목표별로 나눠 지급</span>
          </label>
          <label class="row">
            계약 기간
            <select value={len} onChange={e => setLen(Number((e.target as HTMLSelectElement).value))}>
              {[1, 2, 3].map(n => (
                <option key={n} value={n}>
                  {n}시즌
                </option>
              ))}
            </select>
            <span class="tiny muted">
              {o.size === "big" ? "대기업은 긴 계약을 선호합니다" : o.size === "mid" ? "보통 2시즌을 원합니다" : "짧은 계약을 선호합니다"}
            </span>
          </label>
          <div class="row">
            <button class="btn small" onClick={propose}>
              제안하기
            </button>
            {agreed && (
              <button class="btn small primary" onClick={() => sign(agreed)}>
                합의한 조건으로 계약
              </button>
            )}
          </div>
          {msg && <div class="tiny">{msg}</div>}
          <div class="tiny muted">요구가 지나치면 인내심이 줄고, 바닥나면 제의를 거둡니다. 월 지급액을 낮추면 성과급이나 기간에서 양보를 받기 쉽습니다.</div>
        </div>
      )}
    </div>
  );
}
