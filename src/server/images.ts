import { Hono } from "hono";
import {
  maxImageBytes,
  maxImageDimension,
  type CharacterImage,
} from "../shared/images";
import type { Env } from "./auth";
import { getCharacter } from "./storage";

export function characterImageKey(userId: string, characterId: string) {
  // One object per character: replacing an image never accumulates old originals.
  return `characters/${encodeURIComponent(userId)}/${encodeURIComponent(characterId)}.webp`;
}

// Inspect the complete WebP container, not just the client-supplied MIME type.
// No decoder is needed in the Worker; uploads are already bounded and re-encoded.
export function webpDimensions(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const tag = (offset: number) =>
    String.fromCharCode(...bytes.subarray(offset, offset + 4));
  if (
    bytes.length < 20 ||
    tag(0) !== "RIFF" ||
    tag(8) !== "WEBP" ||
    view.getUint32(4, true) + 8 !== bytes.length
  )
    return null;
  let image: { width: number; height: number } | null = null;
  let canvas: { width: number; height: number } | null = null;
  let alpha = false;
  for (let offset = 12; offset < bytes.length;) {
    if (offset + 8 > bytes.length) return null;
    const kind = tag(offset);
    const size = view.getUint32(offset + 4, true);
    const start = offset + 8;
    const end = start + size;
    if (end + (size % 2) > bytes.length || (size % 2 && bytes[end] !== 0))
      return null;
    if (kind === "VP8X") {
      if (offset !== 12 || size !== 10 || bytes[start] & 0x02) return null;
      const uint24 = (at: number) =>
        bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16);
      canvas = { width: uint24(start + 4) + 1, height: uint24(start + 7) + 1 };
    } else if (kind === "ALPH") {
      if (!canvas || alpha || image || size < 1) return null;
      alpha = true;
    } else if (kind === "VP8 ") {
      if (
        image ||
        size < 10 ||
        bytes[start] & 1 ||
        bytes[start + 3] !== 0x9d ||
        bytes[start + 4] !== 0x01 ||
        bytes[start + 5] !== 0x2a
      )
        return null;
      image = {
        width: view.getUint16(start + 6, true) & 0x3fff,
        height: view.getUint16(start + 8, true) & 0x3fff,
      };
    } else if (kind === "VP8L") {
      if (image || alpha || size < 5 || bytes[start] !== 0x2f) return null;
      const bits = view.getUint32(start + 1, true);
      if (bits >>> 29) return null;
      image = {
        width: (bits & 0x3fff) + 1,
        height: ((bits >>> 14) & 0x3fff) + 1,
      };
    } else {
      // Reject animation, metadata, and arbitrary embedded payloads.
      return null;
    }
    offset = end + (size % 2);
  }
  if (
    !image ||
    image.width < 1 ||
    image.height < 1 ||
    image.width > maxImageDimension ||
    image.height > maxImageDimension ||
    (canvas && (canvas.width !== image.width || canvas.height !== image.height))
  )
    return null;
  return image;
}

export const images = new Hono<Env>();
images.use("/:id/image", async (c, next) => {
  if (!(await getCharacter(c.env.DB, c.get("user")!.id, c.req.param("id")!)))
    return c.json({ error: "探索者が見つかりません" }, 404);
  await next();
});
images.get("/:id/image", async (c) => {
  const object = await c.env.CHARACTER_IMAGES.get(
    characterImageKey(c.get("user")!.id, c.req.param("id")),
  );
  if (!object) return c.json({ error: "画像が見つかりません" }, 404);
  return new Response(object.body, {
    headers: {
      "Content-Type": "image/webp",
      "Content-Length": String(object.size),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      ETag: object.httpEtag,
    },
  });
});
images.put("/:id/image", async (c) => {
  if (c.req.header("Content-Type")?.split(";")[0].trim() !== "image/webp")
    return c.json({ error: "圧縮済みのWebP画像を送信してください" }, 415);
  // The global body limiter bounds reads even when Content-Length is absent.
  const buffer = await c.req.arrayBuffer();
  if (buffer.byteLength > maxImageBytes)
    return c.json({ error: "画像は256KB以下にしてください" }, 413);
  const dimensions = webpDimensions(buffer);
  if (!dimensions)
    return c.json(
      { error: "長辺1,024px以下の静止WebP画像を送信してください" },
      400,
    );
  const id = c.req.param("id");
  const userId = c.get("user")!.id;
  const image: CharacterImage = {
    version: crypto.randomUUID(),
    size: buffer.byteLength,
    ...dimensions,
  };
  await c.env.CHARACTER_IMAGES.put(characterImageKey(userId, id), buffer, {
    httpMetadata: {
      contentType: "image/webp",
      cacheControl: "private, no-store",
    },
  });
  const updatedAt = new Date().toISOString();
  const saved = await c.env.DB.prepare(
    "UPDATE characters SET image=?,data=json_set(data,'$.updatedAt',?),updated_at=? WHERE id=? AND user_id=?",
  )
    .bind(JSON.stringify(image), updatedAt, updatedAt, id, userId)
    .run();
  if (!saved.meta.changes) {
    await c.env.CHARACTER_IMAGES.delete(characterImageKey(userId, id));
    return c.json({ error: "探索者が見つかりません" }, 404);
  }
  return c.json({ image, updatedAt });
});
images.delete("/:id/image", async (c) => {
  const id = c.req.param("id");
  const userId = c.get("user")!.id;
  await c.env.CHARACTER_IMAGES.delete(characterImageKey(userId, id));
  const updatedAt = new Date().toISOString();
  await c.env.DB.prepare(
    "UPDATE characters SET image=NULL,data=json_set(data,'$.updatedAt',?),updated_at=? WHERE id=? AND user_id=?",
  )
    .bind(updatedAt, updatedAt, id, userId)
    .run();
  return c.json({ image: null, updatedAt });
});
