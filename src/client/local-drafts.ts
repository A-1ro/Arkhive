import { characterSchema, type Character } from "../shared/rules";

export const localKey = "mythos-notebook-v1";
export type LocalDrafts = {
  characters: Character[];
  raw: string | null;
  error: string | null;
};

// Inject storage so regression tests never read or modify real browser data.
export function readLocalDrafts(
  getStorage: () => Pick<Storage, "getItem">,
): LocalDrafts {
  let raw: string | null = null;
  try {
    raw = getStorage().getItem(localKey);
    if (raw === null) return { characters: [], raw, error: null };
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) throw new Error("Invalid draft list");
    const characters: Character[] = [];
    let failures = 0;
    for (const entry of data) {
      const parsed = characterSchema.safeParse(entry);
      if (parsed.success) characters.push(parsed.data);
      else failures++;
    }
    return {
      characters,
      raw,
      error: failures
        ? `${failures}件の探索者を読み込めないため、元の端末データを保護して自動保存を停止しています。元データを書き出して保管してください。編集中の探索者はJSON出力で保管できます。`
        : null,
    };
  } catch {
    return {
      characters: [],
      raw,
      error:
        "端末データを読み込めないため、自動保存を停止しています。元データは上書きしません。編集中の探索者はJSON出力で保管してください。",
    };
  }
}

export function saveLocalDrafts(
  getStorage: () => Pick<Storage, "setItem">,
  characters: unknown,
  readError: string | null,
) {
  if (readError) throw new Error(readError);
  // Only schema validity is required locally. Keep unfinished allocations and
  // large drafts recoverable even when they cannot yet be saved to the cloud.
  const parsed = characterSchema.array().safeParse(characters);
  if (!parsed.success)
    throw new Error(
      "入力内容が保存形式に合わないため、端末の自動保存を停止しました。数値・項目数を確認してください。直前の保存データは上書きしていません。JSON出力で編集内容を保管できます。",
    );
  try {
    getStorage().setItem(localKey, JSON.stringify(parsed.data));
  } catch {
    throw new Error(
      "端末保存に失敗しました。空き容量や保存の許可を確認し、JSON出力で編集内容を保管してください。",
    );
  }
}
