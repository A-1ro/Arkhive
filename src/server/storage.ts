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
  c.updatedAt = new Date().toISOString();
  const r = await db
    .prepare(
      "INSERT INTO characters (id,user_id,data,updated_at) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at WHERE characters.user_id=excluded.user_id",
    )
    .bind(c.id, userId, JSON.stringify(c), c.updatedAt)
    .run();
  if (!r.meta.changes) throw new Error("この探索者を編集する権限がありません");
  return c;
}
export async function listCharacters(db: D1Database, userId: string) {
  const rows = await db
    .prepare(
      "SELECT data FROM characters WHERE user_id=? ORDER BY updated_at DESC LIMIT 200",
    )
    .bind(userId)
    .all<{ data: string }>();
  return rows.results.map((row) => JSON.parse(row.data) as Character);
}
export async function getCharacter(db: D1Database, userId: string, id: string) {
  const row = await db
    .prepare("SELECT data FROM characters WHERE id=? AND user_id=?")
    .bind(id, userId)
    .first<{ data: string }>();
  return row ? (JSON.parse(row.data) as Character) : null;
}
