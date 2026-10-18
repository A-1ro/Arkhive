import { characterSchema, type Character } from "./rules";

export const legacyOrigin =
  "https://cthulhu-charactersheet.aaa-4e2k3.workers.dev";
export const canonicalOrigin = "https://arkhive.aaa-4e2k3.workers.dev";
export const legacyImportKey = "arkhive-legacy-import-v1";

export function parseLegacyDrafts(raw: unknown): Character[] | null {
  if (raw === null) return [];
  if (typeof raw !== "string" || raw.length > 5 * 1024 * 1024) return null;
  try {
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data) || data.length > 1000) return null;
    const parsed = characterSchema.array().safeParse(data);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function mergeDrafts(
  current: Character[],
  legacy: Character[],
): Character[] {
  const merged = new Map(current.map((c) => [c.id, c]));
  for (const c of legacy) {
    const existing = merged.get(c.id);
    if (!existing || c.updatedAt > existing.updatedAt) merged.set(c.id, c);
  }
  return [...merged.values()];
}

// Transfer browser-only drafts between our two origins without putting them in URLs or sending them to a server.
export function readLegacyDrafts(): Promise<Character[] | null> {
  try {
    if (
      location.origin !== canonicalOrigin ||
      localStorage.getItem(legacyImportKey)
    )
      return Promise.resolve(null);
  } catch {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    const frame = document.createElement("iframe");
    const nonce = crypto.randomUUID();
    frame.hidden = true;
    frame.title = "旧URLの端末データの移行";
    frame.src = `${legacyOrigin}/migrate`;
    const finish = (data: Character[] | null) => {
      clearTimeout(timer);
      window.removeEventListener("message", onMessage);
      frame.remove();
      resolve(data);
    };
    const onMessage = (event: MessageEvent) => {
      if (
        event.origin !== legacyOrigin ||
        event.source !== frame.contentWindow ||
        event.data?.type !== "arkhive:legacy-drafts" ||
        event.data.nonce !== nonce
      )
        return;
      finish(parseLegacyDrafts(event.data.raw));
    };
    const timer = setTimeout(() => finish(null), 5000);
    window.addEventListener("message", onMessage);
    frame.onload = () =>
      frame.contentWindow?.postMessage(
        { type: "arkhive:request-legacy-drafts", nonce },
        legacyOrigin,
      );
    frame.onerror = () => finish(null);
    document.body.appendChild(frame);
  });
}
