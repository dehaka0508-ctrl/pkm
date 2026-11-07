// Pieces that differ between the web version and the Android app: save slots, save files, updates and
// the APK download link.
import { useEffect, useState } from "preact/hooks";
import { APK_URL, IS_APP, native } from "../platform";
import type { AppManifest, UpdateProgress } from "../platform/native";
import { MAX_SLOTS, deleteSave, getActiveSlot, loadGame, parseSave, saveText, setActiveSlot, slotSummary, type GameState } from "../game/state";
import { dateOf } from "../game/calendar";
import { go, setGame } from "./store";
import { Bar, ConfirmButton, Modal, Win } from "./components";

/** ASCII file name: every browser and file app keeps it (some replace a Korean name with "download"). */
export const saveFileName = (g: GameState) => {
  const d = dateOf(g.day);
  return `pokeleague_s${g.season}_${String(d.month).padStart(2, "0")}${String(d.date).padStart(2, "0")}.json`;
};

/** Picks a save file and reads it. Every file is offered (some file apps don't tag .json); the content decides. */
export function pickSave(): Promise<{ game: GameState | null } | null> {
  return new Promise(res => {
    const inp = document.createElement("input");
    inp.type = "file";
    if (IS_APP) inp.accept = "*/*"; // the Android picker wants an explicit type
    inp.onchange = async () => {
      const f = inp.files?.[0];
      if (!f) return res(null);
      try {
        res({ game: parseSave(await f.text()) });
      } catch {
        res({ game: null });
      }
    };
    inp.click();
  });
}

function bytesToBase64(u8: Uint8Array): string {
  let s = "";
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000) as unknown as number[]);
  return btoa(s);
}

/** Web: the browser downloads the file. App: it goes to the phone's 문서/포켓리그 folder. Returns the message. */
export async function exportFile(name: string, data: string | Uint8Array, type: string): Promise<string> {
  if (IS_APP) {
    const n = await native();
    const where = typeof data === "string" ? await n.saveToDocuments(name, data) : await n.saveToDocuments(name, bytesToBase64(data), true);
    return `${where}에 저장했습니다.`;
  }
  const url = URL.createObjectURL(new Blob([data as BlobPart], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.style.display = "none";
  document.body.appendChild(a); // some browsers ignore the file name on a detached link
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return "파일을 내려받았습니다.";
}

export const exportSave = (g: GameState) => exportFile(saveFileName(g), saveText(g), "application/json");

/** App only: share sheet with the save attached (메신저·드라이브 등). */
export async function shareSave(g: GameState) {
  await (await native()).shareFile(saveFileName(g), saveText(g));
}

const LAST_SLOT = "pl:lastSlot";
function rememberSlot(slot: number) {
  setActiveSlot(slot);
  try {
    localStorage.setItem(LAST_SLOT, String(slot));
  } catch {}
}
function lastSlot(): number {
  try {
    return Number(localStorage.getItem(LAST_SLOT)) || 1;
  } catch {
    return 1;
  }
}

/** Opens a slot's game, or starts a new game in an empty slot. */
export function openSlot(slot: number, toast: (m: string) => void) {
  const g = loadGame(slot);
  if (!g) return toast("저장을 읽지 못했습니다.");
  rememberSlot(slot);
  setGame(g);
  go({ name: "hub" });
}

/** Android title screen: the three save slots. */
export function SaveSlots({ toast }: { toast: (m: string) => void }) {
  const [, redraw] = useState(0);
  const [incoming, setIncoming] = useState<GameState | null>(null);
  const last = lastSlot();
  const fileAction = async (slot: number, share: boolean) => {
    const g = loadGame(slot);
    if (!g) return toast("저장을 읽지 못했습니다.");
    try {
      if (share) await shareSave(g);
      else toast(await exportSave(g));
    } catch (e: any) {
      toast(`저장 파일을 만들지 못했습니다: ${e?.message || e}`);
    }
  };
  const importFile = async () => {
    const r = await pickSave();
    if (!r) return;
    if (!r.game) return toast("포켓 리그 저장 파일이 아닙니다.");
    setIncoming(r.game);
  };
  const importInto = (slot: number) => {
    if (!incoming) return;
    rememberSlot(slot);
    setGame(incoming);
    setIncoming(null);
    go({ name: "hub" });
  };
  const slots = Array.from({ length: MAX_SLOTS }, (_, i) => i + 1);
  return (
    <div class="col">
      {slots.map(slot => {
        const info = slotSummary(slot);
        const d = info ? dateOf(info.day) : null;
        return (
          <div key={slot} class={`save-slot ${info && slot === last ? "last" : ""}`}>
            <div class="row" style={{ justifyContent: "space-between" }}>
              <b>슬롯 {slot}</b>
              {info && d ? (
                <span class="small">
                  {info.name} · 시즌 {info.season} · {d.month}월 {d.date}일
                </span>
              ) : (
                <span class="small muted">비어 있음</span>
              )}
            </div>
            {info ? (
              <div class="row">
                <button class="btn primary" onClick={() => openSlot(slot, toast)}>
                  이어하기
                </button>
                <button class="btn small" onClick={() => fileAction(slot, false)}>
                  파일로 저장
                </button>
                <button class="btn small" onClick={() => fileAction(slot, true)}>
                  공유
                </button>
                <ConfirmButton
                  label="삭제"
                  confirmLabel="한 번 더 누르면 삭제"
                  onConfirm={() => {
                    deleteSave(slot);
                    redraw(x => x + 1);
                  }}
                />
              </div>
            ) : (
              <div class="row">
                <button
                  class="btn"
                  onClick={() => {
                    rememberSlot(slot);
                    go({ name: "new" });
                  }}
                >
                  새 게임
                </button>
              </div>
            )}
          </div>
        );
      })}
      <button class="btn" onClick={importFile}>
        저장 파일 불러오기
      </button>
      {incoming && (
        <Modal onClose={() => setIncoming(null)}>
          <Win title="어느 슬롯에 불러올까요?" right={<button class="btn small" onClick={() => setIncoming(null)}>취소</button>}>
            <div class="small muted" style={{ marginBottom: 6 }}>
              {incoming.player.name} · 시즌 {incoming.season} · {dateOf(incoming.day).month}월 {dateOf(incoming.day).date}일
            </div>
            <div class="col">
              {slots.map(slot => {
                const info = slotSummary(slot);
                return info ? (
                  <ConfirmButton
                    key={slot}
                    class="btn"
                    label={`슬롯 ${slot} (${info.name} · 시즌 ${info.season}) 덮어쓰기`}
                    confirmLabel={`한 번 더 누르면 슬롯 ${slot}을 덮어씁니다`}
                    onConfirm={() => importInto(slot)}
                  />
                ) : (
                  <button key={slot} class="btn primary" onClick={() => importInto(slot)}>
                    슬롯 {slot} (비어 있음)
                  </button>
                );
              })}
            </div>
          </Win>
        </Modal>
      )}
    </div>
  );
}

/** Web only: link to the Android build. */
export function ApkLink() {
  return (
    <a class="btn" href={APK_URL} target="_blank" rel="noopener" style={{ textDecoration: "none", textAlign: "center", display: "block" }}>
      안드로이드 앱 내려받기 (APK)
    </a>
  );
}

const pad = (n: number) => String(n).padStart(2, "0");
const fmtTime = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const mb = (b: number) => `${(b / 1048576).toFixed(1)}MB`;

type UpdateState =
  | { k: "idle" }
  | { k: "checking" }
  | { k: "latest" }
  | { k: "new"; server: string; latest: AppManifest; bytes: number }
  | { k: "error"; msg: string; quiet?: boolean }
  | { k: "applying"; p: UpdateProgress };

let autoChecked = false;

/** App only: shows the running version and updates it to the latest build of the main branch.
 *  With autoCheck (title screen) it looks for a new version once per app start. */
export function AppUpdatePanel({ autoCheck = false }: { autoCheck?: boolean }) {
  const [current, setCurrent] = useState<AppManifest | null>(null);
  const [downloaded, setDownloaded] = useState(false);
  const [st, setSt] = useState<UpdateState>({ k: "idle" });
  const check = async (quiet: boolean) => {
    setSt({ k: "checking" });
    try {
      const n = await native();
      const cur = await n.currentManifest();
      setCurrent(cur);
      const { server, manifest } = await n.latestManifest();
      setSt(n.isNewer(manifest, cur) ? { k: "new", server, latest: manifest, bytes: n.downloadSize(manifest, cur) } : { k: "latest" });
    } catch (e: any) {
      setSt({ k: "error", msg: `업데이트 정보를 받지 못했습니다 (${e?.message || e})`, quiet });
    }
  };
  useEffect(() => {
    native().then(async n => {
      setCurrent(await n.currentManifest());
      setDownloaded(await n.runningDownloaded().catch(() => false));
    });
    if (autoCheck && !autoChecked) {
      autoChecked = true;
      check(true);
    }
  }, []);
  const apply = async (server: string, latest: AppManifest) => {
    setSt({ k: "applying", p: { phase: "copy", done: 0, total: 1 } });
    try {
      await (await native()).applyUpdate(server, latest, p => setSt({ k: "applying", p }));
      // the app reloads into the new version
    } catch (e: any) {
      setSt({ k: "error", msg: `업데이트하지 못했습니다 (${e?.message || e})` });
    }
  };
  const p = st.k === "applying" ? st.p : null;
  return (
    <div class="col small">
      <div>현재 버전: {current ? `${fmtTime(current.builtAt)} · ${current.version.slice(0, 7)}` : "알 수 없음"}</div>
      {st.k === "latest" && <div class="gold">최신 버전입니다.</div>}
      {st.k === "error" && <div class={st.quiet ? "muted" : "bad"}>{st.msg}</div>}
      {st.k === "new" && (
        <div>
          <div class="gold">
            새 버전이 있습니다 · {fmtTime(st.latest.builtAt)} · {st.latest.version.slice(0, 7)}
          </div>
          <div class="tiny muted">받을 용량 {mb(st.bytes)} · 저장 데이터는 그대로 유지됩니다.</div>
        </div>
      )}
      {p && (
        <div class="col" style={{ gap: 4 }}>
          <div>
            {p.phase === "copy" ? `기존 파일 정리 중 ${p.done}/${p.total}` : p.phase === "download" ? `내려받는 중 ${mb(p.done)} / ${mb(p.total)}` : "새 버전으로 바꾸는 중…"}
          </div>
          <Bar v={p.total ? p.done / p.total : 0} />
        </div>
      )}
      <div class="row">
        {st.k === "new" ? (
          <button class="btn primary" onClick={() => apply(st.server, st.latest)}>
            지금 업데이트
          </button>
        ) : (
          <button class="btn" disabled={st.k === "checking" || st.k === "applying"} onClick={() => check(false)}>
            {st.k === "checking" ? "확인 중…" : "업데이트 확인"}
          </button>
        )}
        {downloaded && st.k !== "applying" && (
          <ConfirmButton
            class="btn small"
            label="앱에 들어 있던 버전으로 되돌리기"
            confirmLabel="한 번 더 누르면 되돌립니다"
            onConfirm={() => native().then(n => n.useApkBuild())}
          />
        )}
      </div>
    </div>
  );
}

/** Settings: the active slot, for the save section's message. */
export const activeSlotLabel = () => (IS_APP ? `이 기기의 슬롯 ${getActiveSlot()}` : "이 브라우저");
