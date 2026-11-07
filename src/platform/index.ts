// Where the game runs: a web browser or the Android app (Capacitor). App-only code is loaded lazily,
// so the web build never pulls it in.
export const IS_APP: boolean = typeof window !== "undefined" && !!(window as any).Capacitor?.isNativePlatform?.();

/** The latest Android build, attached to the rolling GitHub release by the APK workflow. */
export const APK_URL = "https://github.com/dehaka0508-ctrl/pkm/releases/download/android-latest/poke-league.apk";

type Native = typeof import("./native");
let mod: Promise<Native> | null = null;
export const native = (): Promise<Native> => (mod ||= import("./native"));
