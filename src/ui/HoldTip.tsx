// A tooltip that opens when the mouse rests on something, or when a finger holds it (a long press);
// the press then does not count as a tap.
import type { ComponentChildren } from "preact";
import { createPortal } from "preact/compat";
import { useEffect, useRef, useState } from "preact/hooks";

const HOLD_MS = 450;
let closeOpen: (() => void) | null = null; // one tooltip at a time

export function HoldTip({ tip, children, class: cls = "", style }: { tip: () => ComponentChildren; children: ComponentChildren; class?: string; style?: any }) {
  const ref = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<DOMRect | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const hideTimer = useRef<number | undefined>(undefined);
  const held = useRef(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const close = () => setAt(null);
  const open = () => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    if (closeOpen && closeOpen !== close) closeOpen();
    closeOpen = close;
    setAt(r);
  };
  useEffect(() => {
    if (!at) return;
    const off = () => close();
    window.addEventListener("scroll", off, true);
    return () => window.removeEventListener("scroll", off, true);
  }, [at]);
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      clearTimeout(hideTimer.current);
      if (closeOpen === close) closeOpen = null;
    },
    [],
  );
  const W = 300;
  const pos = at
    ? {
        left: Math.max(8, Math.min(at.left, window.innerWidth - W - 8)),
        ...(at.top > 170 ? { bottom: window.innerHeight - at.top + 6 } : { top: at.bottom + 6 }),
      }
    : null;
  return (
    <div
      ref={ref}
      class={`holdable ${cls}`}
      style={style}
      onPointerEnter={e => e.pointerType === "mouse" && open()}
      onPointerLeave={e => e.pointerType === "mouse" && close()}
      onTouchStart={e => {
        held.current = false;
        clearTimeout(timer.current);
        clearTimeout(hideTimer.current);
        const t = e.touches[0];
        start.current = t ? { x: t.clientX, y: t.clientY } : null;
        timer.current = window.setTimeout(() => {
          held.current = true;
          open();
        }, HOLD_MS);
      }}
      onTouchMove={e => {
        const t = e.touches[0];
        if (start.current && t && Math.hypot(t.clientX - start.current.x, t.clientY - start.current.y) > 10) clearTimeout(timer.current);
      }}
      onTouchEnd={e => {
        clearTimeout(timer.current);
        if (held.current) {
          e.preventDefault(); // the long press is not a tap
          hideTimer.current = window.setTimeout(close, 2500);
        }
      }}
      onTouchCancel={() => clearTimeout(timer.current)}
      onClickCapture={e => {
        if (held.current) {
          held.current = false;
          e.preventDefault();
          e.stopPropagation();
        }
      }}
      onContextMenu={e => e.preventDefault()}
    >
      {children}
      {at && pos && createPortal(<div class="hold-tip" style={{ ...pos, maxWidth: W }}>{tip()}</div>, document.body)}
    </div>
  );
}
