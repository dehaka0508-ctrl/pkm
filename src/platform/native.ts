// Android app only (loaded lazily from ./index): save files, sharing, the back button and in-app updates.
import { CapacitorHttp, WebView } from "@capacitor/core";
import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { App } from "@capacitor/app";

// ---------- start-up ----------

let started = false;
/** Called once the game has rendered: keeps the running build for the next launch and tidies old ones. */
export async function initApp() {
  if (started) return;
  started = true;
  App.addListener("backButton", ({ canGoBack }) => {
    if (canGoBack) window.history.back();
    else if (window.confirm("게임을 종료할까요? 진행 상황은 자동 저장되어 있습니다.")) App.exitApp();
  });
  try {
    // the build that just started fine becomes the one the app opens next time (an update that fails to
    // start is never kept: closing and reopening the app goes back to the previous one)
    await WebView.persistServerBasePath();
    const keep = await runningBundle();
    const { files } = await Filesystem.readdir({ path: BUNDLES, directory: Directory.Data });
    for (const f of files) if (`${BUNDLES}/${f.name}` !== keep) await removeDir(`${BUNDLES}/${f.name}`);
  } catch {
    // no bundles folder yet
  }
}

// ---------- save files ----------

/** Writes a file into the phone's 문서 (Documents)/포켓리그 folder; returns where it went, for the message.
 *  Text is written as UTF-8; binary data (an Excel file) comes as base64. */
export async function saveToDocuments(name: string, data: string, base64 = false): Promise<string> {
  const write = async (file: string) => {
    const path = `포켓리그/${file}`;
    await Filesystem.writeFile({ path, data, directory: Directory.Documents, recursive: true, ...(base64 ? {} : { encoding: Encoding.UTF8 }) });
    return `문서/${path}`;
  };
  try {
    return await write(name);
  } catch {
    // a file of that name left by an earlier install can't be overwritten: save under a new name
    const t = new Date();
    const stamp = [t.getHours(), t.getMinutes(), t.getSeconds()].map(n => String(n).padStart(2, "0")).join("");
    return write(name.replace(/(\.[^.]+)?$/, m => `_${stamp}${m}`));
  }
}

/** Opens the share sheet with the save attached (메신저, 드라이브 등으로 보내기). */
export async function shareFile(name: string, text: string) {
  const { uri } = await Filesystem.writeFile({ path: `share/${name}`, data: text, directory: Directory.Cache, encoding: Encoding.UTF8, recursive: true });
  try {
    await Share.share({ title: name, files: [uri], dialogTitle: "저장 파일 보내기" });
  } catch (e: any) {
    if (!/cancel/i.test(String(e?.message || e))) throw e;
  }
}

// ---------- updates ----------

/** Written by every build (scripts/app-manifest.mjs). */
export interface AppManifest {
  version: string;
  commit: string | null;
  message: string;
  builtAt: number;
  files: Record<string, { size: number; hash: string }>;
}

/** The deployed web build of the main branch. More addresses can be listed; they are tried in order. */
export const UPDATE_SERVERS = ["https://poke-leagues.vercel.app/"];
const BUNDLES = "bundles";

export async function currentManifest(): Promise<AppManifest | null> {
  try {
    const r = await fetch("./app-manifest.json", { cache: "no-store" });
    return r.ok ? ((await r.json()) as AppManifest) : null;
  } catch {
    return null;
  }
}

export async function latestManifest(): Promise<{ server: string; manifest: AppManifest }> {
  let last: unknown = null;
  for (const server of UPDATE_SERVERS) {
    try {
      const r = await CapacitorHttp.get({
        url: `${server}app-manifest.json`,
        params: { t: String(Date.now()) },
        headers: { "Cache-Control": "no-cache" },
        connectTimeout: 10000,
        readTimeout: 20000,
      });
      if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
      const m = (typeof r.data === "string" ? JSON.parse(r.data) : r.data) as AppManifest;
      if (!m?.version || !m.files?.["index.html"]) throw new Error("버전 정보가 올바르지 않습니다");
      return { server, manifest: m };
    } catch (e) {
      last = e;
    }
  }
  throw last instanceof Error ? last : new Error("업데이트 서버에 연결하지 못했습니다");
}

export const isNewer = (latest: AppManifest, current: AppManifest | null) =>
  !current || (latest.version !== current.version && latest.builtAt > current.builtAt);

/** Files that differ from the running build: only these are downloaded. */
export function changedFiles(latest: AppManifest, current: AppManifest | null): string[] {
  return Object.keys(latest.files).filter(f => current?.files[f]?.hash !== latest.files[f].hash);
}
export const downloadSize = (latest: AppManifest, current: AppManifest | null) =>
  changedFiles(latest, current).reduce((a, f) => a + latest.files[f].size, 0);

export interface UpdateProgress {
  phase: "copy" | "download" | "finish";
  done: number;
  total: number;
}

async function dataRoot(): Promise<string> {
  const { uri } = await Filesystem.getUri({ directory: Directory.Data, path: "" });
  return decodeURIComponent(uri.replace(/^file:\/\//, "")).replace(/\/+$/, "");
}

/** The downloaded build the app is running from ("bundles/…"), or null for the one inside the APK. */
async function runningBundle(): Promise<string | null> {
  const { path } = await WebView.getServerBasePath();
  const root = await dataRoot();
  return path.startsWith(`${root}/${BUNDLES}/`) ? path.slice(root.length + 1) : null;
}

export async function runningDownloaded(): Promise<boolean> {
  return !!(await runningBundle());
}

async function removeDir(path: string) {
  try {
    await Filesystem.rmdir({ path, directory: Directory.Data, recursive: true });
  } catch {}
}

function toBase64(u8: Uint8Array): string {
  let s = "";
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000) as unknown as number[]);
  return btoa(s);
}

/** Copies a file of the build inside the APK (served at ./) into the new build's folder. */
async function copyFromApk(file: string, to: string) {
  const r = await fetch(`./${file}`, { cache: "no-store" });
  if (!r.ok) throw new Error(`${file}: ${r.status}`);
  const u8 = new Uint8Array(await r.arrayBuffer());
  const CHUNK = 3 * 1024 * 1024; // a multiple of 3, so every piece encodes on its own
  await Filesystem.writeFile({ path: to, data: toBase64(u8.subarray(0, CHUNK)), directory: Directory.Data });
  for (let o = CHUNK; o < u8.length; o += CHUNK) await Filesystem.appendFile({ path: to, data: toBase64(u8.subarray(o, o + CHUNK)), directory: Directory.Data });
}

/**
 * Builds the latest version in a new folder (unchanged files copied from the running build, changed ones
 * downloaded), checks every size, then switches the app to it. The app reloads into the new build.
 */
export async function applyUpdate(server: string, latest: AppManifest, onProgress: (p: UpdateProgress) => void): Promise<void> {
  const current = await currentManifest();
  const from = await runningBundle();
  const dir = `${BUNDLES}/${latest.version.replace(/[^\w-]/g, "")}-${Date.now().toString(36)}`;
  const made = new Set<string>();
  const ensureParent = async (path: string) => {
    const parent = path.slice(0, path.lastIndexOf("/"));
    if (made.has(parent)) return;
    try {
      await Filesystem.mkdir({ path: parent, directory: Directory.Data, recursive: true });
    } catch {
      // already there
    }
    made.add(parent);
  };
  const size = async (path: string) => {
    try {
      return (await Filesystem.stat({ path, directory: Directory.Data })).size;
    } catch {
      return -1;
    }
  };
  try {
    const changed = new Set(changedFiles(latest, current));
    const reuse = Object.keys(latest.files).filter(f => !changed.has(f));
    // 1) unchanged files: copy from the running build (no download)
    for (let i = 0; i < reuse.length; i++) {
      const f = reuse[i];
      onProgress({ phase: "copy", done: i, total: reuse.length });
      const to = `${dir}/${f}`;
      await ensureParent(to);
      try {
        if (from) await Filesystem.copy({ from: `${from}/${f}`, to, directory: Directory.Data, toDirectory: Directory.Data });
        else await copyFromApk(f, to);
        if ((await size(to)) !== latest.files[f].size) throw new Error("size");
      } catch {
        changed.add(f); // download it instead
      }
    }
    // 2) changed files: download from the deployed build
    const list = [...changed];
    const total = list.reduce((a, f) => a + latest.files[f].size, 0);
    let done = 0;
    let current_ = 0;
    const listener = await Filesystem.addListener("progress", p => {
      current_ = p.bytes || 0;
      onProgress({ phase: "download", done: done + current_, total });
    });
    try {
      for (const f of list) {
        const to = `${dir}/${f}`;
        await ensureParent(to);
        let ok = false;
        for (let attempt = 0; attempt < 3 && !ok; attempt++) {
          current_ = 0;
          try {
            await Filesystem.downloadFile({
              url: `${server}${f.split("/").map(encodeURIComponent).join("/")}?v=${latest.files[f].hash}`,
              path: to,
              directory: Directory.Data,
              progress: true,
              connectTimeout: 15000,
              readTimeout: 60000,
            });
            ok = (await size(to)) === latest.files[f].size;
          } catch (e) {
            if (attempt === 2) throw e;
          }
        }
        if (!ok) throw new Error(`${f} 크기가 맞지 않습니다`);
        done += latest.files[f].size;
        onProgress({ phase: "download", done, total });
      }
    } finally {
      await listener.remove();
    }
    // 3) the new build's own version file, then switch over
    onProgress({ phase: "finish", done: 1, total: 1 });
    await Filesystem.writeFile({ path: `${dir}/app-manifest.json`, data: JSON.stringify(latest), directory: Directory.Data, encoding: Encoding.UTF8 });
    if ((await size(`${dir}/index.html`)) <= 0) throw new Error("index.html이 없습니다");
    const root = await dataRoot();
    await WebView.setServerBasePath({ path: `${root}/${dir}` });
  } catch (e) {
    await removeDir(dir);
    throw e;
  }
}

/** Goes back to the build that came inside the APK. */
export async function useApkBuild() {
  await WebView.setServerAssetPath({ path: "public" });
}
