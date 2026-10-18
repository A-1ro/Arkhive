import { characterSchema, type Character } from "./rules";
import { canonicalOrigin, legacyOrigins } from "./origins";
export { canonicalOrigin } from "./origins";

export const legacyImportKey = "arkhive-legacy-import-v2";

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

// Transfer browser-only drafts without putting them in URLs or sending them to a server.
export async function readLegacyDrafts(): Promise<{
  drafts: Character[];
  complete: boolean;
} | null> {
  try {
    if (
      location.origin !== canonicalOrigin ||
      localStorage.getItem(legacyImportKey)
    )
      return null;
  } catch {
    return null;
  }
  const results = await Promise.all(legacyOrigins.map(readLegacyOrigin));
  if (results.every((result) => result === null)) return null;
  return {
    drafts: results.reduce<Character[]>(
      (all, result) => mergeDrafts(all, result ?? []),
      [],
    ),
    complete: results.every((result) => result !== null),
  };
}

function readLegacyOrigin(legacyOrigin: string): Promise<Character[] | null> {
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
