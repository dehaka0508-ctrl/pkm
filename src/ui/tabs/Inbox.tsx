import { useEffect, useState } from "preact/hooks";
import type { GameState } from "../../game/state";
import { dateLabel, seasonOf } from "../../game/calendar";
import { update } from "../store";
import { Win } from "../components";

const KIND: Record<string, string> = { info: "📋", match: "⚔", scout: "🔍", train: "💪", money: "₽", pwt: "🏆", news: "📰" };

export function InboxTab({ g }: { g: GameState }) {
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    const t = setTimeout(() => update(st => st.inbox.forEach(m => (m.read = true))), 400);
    return () => clearTimeout(t);
  }, []);
  return (
    <Win title="소식">
      {g.inbox.length === 0 && <div class="muted">소식이 없습니다.</div>}
      <div class="col" style={{ gap: 4 }}>
        {g.inbox.slice(0, 80).map(m => {
          return (
            <div key={m.id} class="card" style={{ padding: 6 }} onClick={() => setOpen(open === m.id ? null : m.id)}>
              <div class="row">
                <span>{KIND[m.kind] || "·"}</span>
                <b class={m.read ? "" : "gold"}>{m.title}</b>
                <span class="tiny muted right">
                  시즌 {seasonOf(m.t)} · {dateLabel(m.t, false)}
                </span>
              </div>
              {open === m.id && m.body && <div class="small" style={{ whiteSpace: "pre-wrap", marginTop: 4 }}>{m.body}</div>}
            </div>
          );
        })}
      </div>
    </Win>
  );
}
