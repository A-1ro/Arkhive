import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "./auth";
import { characterImageKey } from "./images";
import { readCharacter } from "./storage";

// Sharing is separate from character JSON so ordinary saves, imports and MCP
// updates cannot accidentally publish a sheet or restore a revoked URL.
export const sharing = new Hono<Env>();
sharing.get("/:id/sharing", async (c) => {
  const row = await c.env.DB.prepare(
    "SELECT share_id FROM characters WHERE id=? AND user_id=?",
  )
    .bind(c.req.param("id"), c.get("user")!.id)
    .first<{ share_id: string | null }>();
  return row
    ? c.json({ shareId: row.share_id })
    : c.json({ error: "探索者が見つかりません" }, 404);
});
sharing.put("/:id/sharing", async (c) => {
  const { enabled } = z
    .object({ enabled: z.boolean() })
    .strict()
    .parse(await c.req.json());
  const row = await c.env.DB.prepare(
    "UPDATE characters SET share_id=CASE WHEN ? THEN COALESCE(share_id,?) ELSE NULL END WHERE id=? AND user_id=? RETURNING share_id",
  )
    .bind(
      enabled ? 1 : 0,
      crypto.randomUUID(),
      c.req.param("id"),
      c.get("user")!.id,
    )
    .first<{ share_id: string | null }>();
  return row
    ? c.json({ shareId: row.share_id })
    : c.json({ error: "探索者が見つかりません" }, 404);
});

export const publicCharacters = new Hono<Env>();
publicCharacters.use("*", async (c, next) => {
  c.header("X-Robots-Tag", "noindex, nofollow, noarchive");
  await next();
});
async function findPublic(db: D1Database, shareId: string) {
  if (!z.uuid().safeParse(shareId).success) return null;
  return db
    .prepare("SELECT id,user_id,data,image FROM characters WHERE share_id=?")
    .bind(shareId)
    .first<{
      id: string;
      user_id: string;
      data: string;
      image: string | null;
    }>();
}
publicCharacters.get("/:shareId", async (c) => {
  const row = await findPublic(c.env.DB, c.req.param("shareId"));
  if (!row)
    return c.json({ error: "このシートは非公開、または削除されています" }, 404);
  return c.json({
    character: readCharacter(row),
    canEdit: c.get("user")?.id === row.user_id,
  });
});
publicCharacters.get("/:shareId/image", async (c) => {
  const row = await findPublic(c.env.DB, c.req.param("shareId"));
  if (!row?.image) return c.json({ error: "画像が見つかりません" }, 404);
  const object = await c.env.CHARACTER_IMAGES.get(
    characterImageKey(row.user_id, row.id),
  );
  if (!object) return c.json({ error: "画像が見つかりません" }, 404);
  return new Response(object.body, {
    headers: {
      "Content-Type": "image/webp",
      "Content-Length": String(object.size),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
    },
  });
});
