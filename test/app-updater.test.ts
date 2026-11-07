// The Android updater (src/platform/native.ts) against in-memory stand-ins for the Capacitor plugins:
// which files it copies, which it downloads, where it switches the app to, and what it cleans up.
import { beforeEach, describe, expect, it, vi } from "vitest";

const ROOT = "/data/user/0/io.github.dehaka0508.pokeleague/files";
const fs = new Map<string, number>(); // "DATA:path" -> size
const calls: string[] = [];
let serverPath = "public";
let persisted: string | null = null;
let remote: any = null;
let failDownload: string | null = null;
let builtin: Record<string, number> = {};
let local: any = null;

const key = (dir: string | undefined, path: string) => `${dir || "DATA"}:${path.replace(/^\/+/, "")}`;
const b64len = (s: string) => Math.floor((s.length * 3) / 4) - (s.endsWith("==") ? 2 : s.endsWith("=") ? 1 : 0);

vi.mock("@capacitor/core", () => ({
  CapacitorHttp: {
    get: vi.fn(async ({ url }: { url: string }) => {
      calls.push(`http ${url}`);
      if (!remote) return { status: 404, data: "" };
      return { status: 200, data: remote };
    }),
  },
  WebView: {
    getServerBasePath: async () => ({ path: serverPath }),
    setServerBasePath: async ({ path }: { path: string }) => {
      calls.push(`serve ${path}`);
      serverPath = path;
    },
    setServerAssetPath: async ({ path }: { path: string }) => {
      calls.push(`asset ${path}`);
      serverPath = path;
    },
    persistServerBasePath: async () => {
      persisted = serverPath;
    },
  },
}));

const progressListeners: ((p: any) => void)[] = [];
vi.mock("@capacitor/filesystem", () => ({
  Directory: { Data: "DATA", Documents: "DOCUMENTS", Cache: "CACHE" },
  Encoding: { UTF8: "utf8" },
  Filesystem: {
    getUri: async ({ path }: any) => ({ uri: `file://${ROOT}${path ? "/" + path : ""}` }),
    mkdir: async ({ path, directory }: any) => {
      if ([...fs.keys()].some(k => k.startsWith(key(directory, path) + "/"))) throw new Error("exists");
    },
    copy: async ({ from, to, directory, toDirectory }: any) => {
      const s = fs.get(key(directory, from));
      if (s === undefined) throw new Error(`no ${from}`);
      calls.push(`copy ${from}`);
      fs.set(key(toDirectory, to), s);
    },
    stat: async ({ path, directory }: any) => {
      const s = fs.get(key(directory, path));
      if (s === undefined) throw new Error(`no ${path}`);
      return { size: s };
    },
    writeFile: async ({ path, data, directory, encoding }: any) => {
      fs.set(key(directory, path), encoding ? new TextEncoder().encode(data).length : b64len(data));
      return { uri: `file://${ROOT}/${path}` };
    },
    appendFile: async ({ path, data, directory }: any) => {
      fs.set(key(directory, path), (fs.get(key(directory, path)) || 0) + b64len(data));
    },
    downloadFile: async ({ url, path, directory }: any) => {
      calls.push(`download ${url}`);
      const file = decodeURIComponent(url.replace(/^https:\/\/[^/]+\//, "").replace(/\?.*$/, ""));
      if (failDownload === file) throw new Error("network down");
      const size = remote.files[file].size;
      progressListeners.forEach(l => l({ url, bytes: size, contentLength: size }));
      fs.set(key(directory, path), size);
      return { path };
    },
    addListener: async (_: string, l: any) => {
      progressListeners.push(l);
      return { remove: async () => progressListeners.splice(progressListeners.indexOf(l), 1) };
    },
    readdir: async ({ path, directory }: any) => {
      const pre = key(directory, path) + "/";
      const names = new Set([...fs.keys()].filter(k => k.startsWith(pre)).map(k => k.slice(pre.length).split("/")[0]));
      if (!names.size) throw new Error("no dir");
      return { files: [...names].map(name => ({ name, type: "directory" })) };
    },
    rmdir: async ({ path, directory }: any) => {
      calls.push(`rmdir ${path}`);
      const pre = key(directory, path) + "/";
      for (const k of [...fs.keys()]) if (k.startsWith(pre)) fs.delete(k);
    },
  },
}));
vi.mock("@capacitor/share", () => ({ Share: { share: async () => {} } }));
vi.mock("@capacitor/app", () => ({ App: { addListener: () => {}, exitApp: () => {} } }));

// the running build's own files, served at ./
(globalThis as any).fetch = async (url: string) => {
  const file = url.replace(/^\.\//, "");
  if (file === "app-manifest.json") {
    // a downloaded bundle serves its own manifest from its folder
    const m = serverPath.startsWith(ROOT) ? fs.has(key("DATA", serverPath.slice(ROOT.length + 1) + "/app-manifest.json")) && remoteAtSwitch : local;
    return m ? { ok: true, status: 200, json: async () => m } : { ok: false, status: 404 };
  }
  if (!(file in builtin)) return { ok: false, status: 404 };
  return { ok: true, status: 200, arrayBuffer: async () => new Uint8Array(builtin[file]).buffer };
};
let remoteAtSwitch: any = null;

const man = (version: string, builtAt: number, files: Record<string, [number, string]>) => ({
  version,
  commit: version,
  message: `build ${version}`,
  builtAt,
  files: Object.fromEntries(Object.entries(files).map(([f, [size, hash]]) => [f, { size, hash }])),
});

describe("app updater", () => {
  beforeEach(() => {
    fs.clear();
    calls.length = 0;
    serverPath = "public";
    persisted = null;
    failDownload = null;
    remoteAtSwitch = null;
    builtin = { "index.html": 700, "assets/index-a.js": 5_000_000, "assets/pokemon/f1.json": 1_100_000, "assets/ui/items.png": 137_550 };
    local = man("aaaaaaa", 1000, { "index.html": [700, "h1"], "assets/index-a.js": [5_000_000, "h2"], "assets/pokemon/f1.json": [1_100_000, "h3"], "assets/ui/items.png": [137_550, "h4"] });
    remote = man("bbbbbbb", 2000, {
      "index.html": [710, "h1b"], // changed
      "assets/index-b.js": [5_100_000, "h5"], // new
      "assets/pokemon/f1.json": [1_100_000, "h3"], // same
      "assets/ui/items.png": [137_550, "h4"], // same
    });
  });

  it("first update from the APK's build: copies unchanged files locally, downloads only the changed ones", async () => {
    const n = await import("../src/platform/native");
    const cur = await n.currentManifest();
    const { server, manifest } = await n.latestManifest();
    expect(server).toBe("https://poke-leagues.vercel.app/");
    expect(n.isNewer(manifest, cur)).toBe(true);
    expect(n.changedFiles(manifest, cur).sort()).toEqual(["assets/index-b.js", "index.html"]);
    expect(n.downloadSize(manifest, cur)).toBe(5_100_710);
    const seen: string[] = [];
    await n.applyUpdate(server, manifest, p => seen.push(p.phase));
    const dir = serverPath.slice(ROOT.length + 1);
    expect(serverPath.startsWith(`${ROOT}/bundles/bbbbbbb-`)).toBe(true);
    for (const [f, i] of Object.entries(remote.files) as [string, any][]) expect(fs.get(`DATA:${dir}/${f}`)).toBe(i.size);
    expect(fs.has(`DATA:${dir}/app-manifest.json`)).toBe(true);
    expect(calls.filter(c => c.startsWith("download")).length).toBe(2);
    expect(calls.some(c => c.includes("download https://poke-leagues.vercel.app/assets/index-b.js?v=h5"))).toBe(true);
    expect(seen).toContain("copy");
    expect(seen).toContain("download");
    expect(seen[seen.length - 1]).toBe("finish");
  });

  it("later updates copy unchanged files from the downloaded build natively", async () => {
    const n = await import("../src/platform/native");
    // running from a downloaded bundle
    for (const [f, i] of Object.entries(local.files) as [string, any][]) fs.set(`DATA:bundles/old/${f}`, i.size);
    fs.set("DATA:bundles/old/app-manifest.json", 10);
    serverPath = `${ROOT}/bundles/old`;
    remoteAtSwitch = local;
    await n.applyUpdate("https://poke-leagues.vercel.app/", remote, () => {});
    expect(calls.filter(c => c.startsWith("copy bundles/old/")).length).toBe(2);
    expect(calls.filter(c => c.startsWith("download")).length).toBe(2);
  });

  it("the second server is tried when the first one fails", async () => {
    const core: any = await import("@capacitor/core");
    core.CapacitorHttp.get.mockImplementationOnce(async () => {
      throw new Error("down");
    });
    const n = await import("../src/platform/native");
    const { server } = await n.latestManifest();
    expect(server).toBe("https://pkm-kappa.vercel.app/");
  });

  it("a failed download leaves the app where it was and removes the half-made build", async () => {
    const n = await import("../src/platform/native");
    failDownload = "assets/index-b.js";
    await expect(n.applyUpdate("https://poke-leagues.vercel.app/", remote, () => {})).rejects.toThrow();
    expect(serverPath).toBe("public");
    expect([...fs.keys()].some(k => k.startsWith("DATA:bundles/"))).toBe(false);
  });

  it("start-up keeps the running build for next time and deletes the others", async () => {
    const n = await import("../src/platform/native");
    fs.set("DATA:bundles/old/index.html", 1);
    fs.set("DATA:bundles/new/index.html", 1);
    serverPath = `${ROOT}/bundles/new`;
    await n.initApp();
    expect(persisted).toBe(`${ROOT}/bundles/new`);
    expect(fs.has("DATA:bundles/old/index.html")).toBe(false);
    expect(fs.has("DATA:bundles/new/index.html")).toBe(true);
  });

  it("same version or an older build is not offered", async () => {
    const n = await import("../src/platform/native");
    expect(n.isNewer(local, local)).toBe(false);
    expect(n.isNewer({ ...remote, builtAt: 500 }, local)).toBe(false);
    expect(n.isNewer(remote, null)).toBe(true);
  });
});
