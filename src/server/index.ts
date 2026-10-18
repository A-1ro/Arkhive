import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import { bodyLimit } from "hono/body-limit";
import { HTTPException } from "hono/http-exception";
import { z, ZodError } from "zod";
import {
  auth,
  hash,
  randomToken,
  sessionUser,
  type Env,
  type User,
} from "./auth";
import { listCharacters, getCharacter, saveCharacter } from "./storage";
import { handleMcp } from "./mcp";
import legacy from "./legacy";
import { legacyOrigins } from "../shared/origins";

const app = new Hono<Env>();
app.use("*", async (c, next) => {
  if (legacyOrigins.some((origin) => origin === new URL(c.req.url).origin)) {
    return legacy.fetch(c.req.raw);
  }
  await next();
});
app.use(
  "*",
  secureHeaders({
    referrerPolicy: "same-origin",
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https://cdn.discordapp.com"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      frameAncestors: ["'none'"],
      frameSrc: [...legacyOrigins],
    },
  }),
);
app.use(
  "*",
  bodyLimit({
    maxSize: 256 * 1024,
    onError: (c) => c.json({ error: "データサイズが大きすぎます" }, 413),
  }),
);
app.use("*", async (c, next) => {
  if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method)) {
    const origin = c.req.header("Origin");
    const expected = new URL(c.req.url).origin;
    // Vite development proxy has the configured callback origin.
    const redirectOrigin = c.env.DISCORD_REDIRECT_URI
      ? new URL(c.env.DISCORD_REDIRECT_URI).origin
      : null;
    if (origin && origin !== expected && origin !== redirectOrigin)
      return c.json({ error: "許可されていないオリジンです" }, 403);
  }
  await next();
});
app.use("/api/*", async (c, next) => {
  c.header("Cache-Control", "no-store");
  c.set("user", await sessionUser(c));
  await next();
});
app.use("/auth/*", async (c, next) => {
  c.header("Cache-Control", "no-store");
  await next();
});
app.route("/auth", auth);
app.get("/api/health", async (c) => {
  await c.env.DB.prepare("SELECT 1").first();
  return c.json({ ok: true, database: "D1" });
});
app.get("/api/me", (c) =>
  c.json({
    user: c.get("user"),
    discordConfigured: !!(
      c.env.DISCORD_CLIENT_ID && c.env.DISCORD_CLIENT_SECRET
    ),
  }),
);
app.use("/api/characters*", async (c, next) => {
  if (!c.get("user"))
    return c.json({ error: "Discordログインが必要です" }, 401);
  await next();
});
app.get("/api/characters", async (c) =>
  c.json(await listCharacters(c.env.DB, c.get("user")!.id)),
);
app.get("/api/characters/:id", async (c) => {
  const row = await getCharacter(
    c.env.DB,
    c.get("user")!.id,
    c.req.param("id"),
  );
  return row ? c.json(row) : c.json({ error: "探索者が見つかりません" }, 404);
});
app.put("/api/characters/:id", async (c) => {
  const body = await c.req.json();
  if (body.id !== c.req.param("id"))
    return c.json({ error: "IDが一致しません" }, 400);
  try {
    return c.json(await saveCharacter(c.env.DB, c.get("user")!.id, body));
  } catch (e) {
    if (e instanceof ZodError) throw e;
    return c.json(
      { error: e instanceof Error ? e.message : "保存できません" },
      400,
    );
  }
});
app.delete("/api/characters/:id", async (c) => {
  await c.env.DB.prepare("DELETE FROM characters WHERE id=? AND user_id=?")
    .bind(c.req.param("id"), c.get("user")!.id)
    .run();
  return c.json({ ok: true });
});
app.use("/api/tokens*", async (c, next) => {
  if (!c.get("user"))
    return c.json({ error: "Discordログインが必要です" }, 401);
  await next();
});
app.get("/api/tokens", async (c) => {
  const r = await c.env.DB.prepare(
    "SELECT id,name,created_at FROM api_tokens WHERE user_id=? ORDER BY created_at DESC",
  )
    .bind(c.get("user")!.id)
    .all();
  return c.json(r.results);
});
app.post("/api/tokens", async (c) => {
  const body = z
    .object({ name: z.string().min(1).max(100) })
    .parse(await c.req.json());
  const count = await c.env.DB.prepare(
    "SELECT count(*) as n FROM api_tokens WHERE user_id=?",
  )
    .bind(c.get("user")!.id)
    .first<{ n: number }>();
  if ((count?.n || 0) >= 10)
    return c.json({ error: "トークンは10個までです" }, 400);
  const token = `mythos_${randomToken()}`;
  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    "INSERT INTO api_tokens (id,user_id,token_hash,name) VALUES (?,?,?,?)",
  )
    .bind(id, c.get("user")!.id, await hash(token), body.name)
    .run();
  return c.json({ id, token, name: body.name }, 201);
});
app.delete("/api/tokens/:id", async (c) => {
  await c.env.DB.prepare("DELETE FROM api_tokens WHERE id=? AND user_id=?")
    .bind(c.req.param("id"), c.get("user")!.id)
    .run();
  return c.json({ ok: true });
});
app.all("/mcp", async (c) => {
  c.header("Cache-Control", "no-store");
  const bearer = c.req
    .header("Authorization")
    ?.match(/^Bearer (mythos_[a-f0-9]{64})$/)?.[1];
  if (!bearer)
    return c.json({ error: "MCP設定で発行したBearerトークンが必要です" }, 401, {
      "WWW-Authenticate": 'Bearer realm="Arkhive"',
    });
  const user = await c.env.DB.prepare(
    "SELECT u.id,u.name,u.avatar FROM api_tokens t JOIN users u ON u.id=t.user_id WHERE t.token_hash=?",
  )
    .bind(await hash(bearer))
    .first<User>();
  if (!user) return c.json({ error: "無効なトークンです" }, 401);
  if (c.req.method !== "POST")
    return c.json({ error: "POSTのみ対応しています" }, 405, { Allow: "POST" });
  return handleMcp(c.req.raw, c.env.DB, user.id);
});
app.onError((error, c) => {
  if (error instanceof ZodError)
    return c.json(
      {
        error: "入力内容を確認してください",
        details: error.issues.map((i) => ({
          path: i.path,
          message: i.message,
        })),
      },
      400,
    );
  if (error instanceof SyntaxError)
    return c.json({ error: "JSON形式が正しくありません" }, 400);
  if (error instanceof HTTPException) return error.getResponse();
  console.error(
    JSON.stringify({
      event: "request_failed",
      path: c.req.path,
      name: error.name,
    }),
  );
  return c.json(
    { error: "処理に失敗しました。しばらくしてから再試行してください" },
    500,
  );
});
app.get("*", (c) => {
  if (
    c.req.path.startsWith("/api/") ||
    c.req.path.startsWith("/auth/") ||
    c.req.path === "/mcp"
  ) {
    return c.json({ error: "Not found" }, 404);
  }
  return c.env.ASSETS.fetch(c.req.raw);
});
app.notFound((c) => c.json({ error: "Not found" }, 404));
export default app;
