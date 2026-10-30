/** Bridge to the desktop shell (Tauri). Everything here is a no-op in a normal browser. */
type Internals = { invoke: (cmd: string, args?: unknown) => Promise<unknown> };

function internals(): Internals | null {
  if (typeof window === "undefined") return null;
  const i = (window as unknown as { __TAURI_INTERNALS__?: Internals }).__TAURI_INTERNALS__;
  return i && typeof i.invoke === "function" ? i : null;
}

export const isDesktop = () => internals() !== null;

export async function desktopInvoke<T>(cmd: string): Promise<T | null> {
  const i = internals();
  if (!i) return null;
  try { return (await i.invoke(cmd)) as T; } catch { return null; }
}

export type UpdateState =
  | { state: "none" }
  | { state: "available"; version: string; notes?: string; current?: string }
  | { state: "downloading"; version: string; percent: number }
  | { state: "installing" | "restarting"; version: string }
  | { state: "error"; message: string };
