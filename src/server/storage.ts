import {
  characterSchema,
  validateAllocation,
  type Character,
} from "../shared/rules";
export async function saveCharacter(
  db: D1Database,
  userId: string,
  input: unknown,
) {
  const c = characterSchema.parse(input);
  const errors = validateAllocation(c);
  if (errors.length) throw new Error(errors.join("・"));
  // Image references are managed exclusively by the image API, including for MCP saves.
  c.image = null;
  c.updatedAt = new Date().toISOString();
  const r = await db
    .prepare(
      "INSERT INTO characters (id,user_id,data,updated_at) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at WHERE characters.user_id=excluded.user_id",
    )
    .bind(c.id, userId, JSON.stringify(c), c.updatedAt)
    .run();
  if (!r.meta.changes) throw new Error("この探索者を編集する権限がありません");
  return (await getCharacter(db, userId, c.id))!;
}
export function readCharacter(row: {
  data: string;
  image: string | null;
}): Character {
  return characterSchema.parse({
    ...JSON.parse(row.data),
    image: row.image ? JSON.parse(row.image) : null,
  });
}
export async function listCharacters(db: D1Database, userId: string) {
  const rows = await db
    .prepare(
      "SELECT data,image FROM characters WHERE user_id=? ORDER BY updated_at DESC LIMIT 200",
    )
    .bind(userId)
    .all<{ data: string; image: string | null }>();
  return rows.results.map(readCharacter);
}
export async function getCharacter(db: D1Database, userId: string, id: string) {
  const row = await db
    .prepare("SELECT data,image FROM characters WHERE id=? AND user_id=?")
    .bind(id, userId)
    .first<{ data: string; image: string | null }>();
  return row ? readCharacter(row) : null;
}
