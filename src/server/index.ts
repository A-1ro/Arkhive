import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import { bodyLimit } from "hono/body-limit";
import { HTTPException } from "hono/http-exception";
import { cors } from "hono/cors";
import { ZodError } from "zod";
import { auth, sessionUser, type Env } from "./auth";
import { oauth, mcpUser } from "./oauth";
import { listCharacters, getCharacter, saveCharacter } from "./storage";
import { handleMcp } from "./mcp";
import legacy from "./legacy";
import { legacyOrigins } from "../shared/origins";
import { characterImageKey, images } from "./images";
import { sharing, publicCharacters } from "./sharing";

const app = new Hono<Env>();
const mcpOrigins = [
  "https://chatgpt.com",
  "https://claude.ai",
  "https://claude.com",
];
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
app.use(
  "/mcp",
  cors({
    origin: mcpOrigins,
    allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowHeaders: [
      "Authorization",
      "Content-Type",
      "MCP-Protocol-Version",
      "Mcp-Session-Id",
    ],
    exposeHeaders: [
      "WWW-Authenticate",
      "MCP-Protocol-Version",
      "Mcp-Session-Id",
    ],
  }),
);
app.use("*", async (c, next) => {
  if (
    c.req.path === "/mcp" ||
    !["GET", "HEAD", "OPTIONS"].includes(c.req.method)
  ) {
    // OAuth machine endpoints authenticate the client independently of cookies.
    if (
      ["/oauth/register", "/oauth/token", "/oauth/revoke"].includes(c.req.path)
    ) {
      await next();
      return;
    }
    const origin = c.req.header("Origin");
    const expected = new URL(c.req.url).origin;
    // Vite development proxy has the configured callback origin.
    const redirectOrigin = c.env.DISCORD_REDIRECT_URI
      ? new URL(c.env.DISCORD_REDIRECT_URI).origin
      : null;
    if (
      origin &&
      origin !== expected &&
      origin !== redirectOrigin &&
      !(c.req.path === "/mcp" && mcpOrigins.includes(origin))
    )
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
app.route("/", oauth);
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
app.route("/api/public/characters", publicCharacters);
app.get("/api/characters", async (c) =>
  c.json(await listCharacters(c.env.DB, c.get("user")!.id)),
);
app.route("/api/characters", images);
app.route("/api/characters", sharing);
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
  const userId = c.get("user")!.id;
  const id = c.req.param("id");
  // Local-only or already-deleted sheets must still be removable from the browser.
  if (!(await getCharacter(c.env.DB, userId, id))) return c.json({ ok: true });
  await c.env.CHARACTER_IMAGES.delete(characterImageKey(userId, id));
  await c.env.DB.prepare("DELETE FROM characters WHERE id=? AND user_id=?")
    .bind(id, userId)
    .run();
  return c.json({ ok: true });
});
app.use("/api/connections*", async (c, next) => {
  if (!c.get("user"))
    return c.json({ error: "Discordログインが必要です" }, 401);
  await next();
});
app.get("/api/connections", async (c) => {
  const r = await c.env.DB.prepare(
    "SELECT g.id,c.name,g.created_at,g.expires_at FROM oauth_grants g JOIN oauth_clients c ON c.id=g.client_id WHERE g.user_id=? AND g.expires_at>? ORDER BY g.created_at DESC",
  )
    .bind(c.get("user")!.id, Date.now())
    .all();
  return c.json(r.results);
});
app.delete("/api/connections/:id", async (c) => {
  await c.env.DB.prepare("DELETE FROM oauth_grants WHERE id=? AND user_id=?")
    .bind(c.req.param("id"), c.get("user")!.id)
    .run();
  return c.json({ ok: true });
});
app.all("/api/tokens*", (c) =>
  c.json(
    {
      error:
        "手動トークン発行は終了しました。クライアントからDiscordログインで連携してください",
    },
    410,
  ),
);
app.all("/mcp", async (c) => {
  c.header("Cache-Control", "no-store");
  const user = await mcpUser(c);
  if (!user)
    return c.json(
      { error: "DiscordログインでMCP連携を許可してください" },
      401,
      {
        "WWW-Authenticate": `Bearer resource_metadata="${new URL(c.req.url).origin}/.well-known/oauth-protected-resource/mcp", scope="mcp"${c.req.header("Authorization") ? ', error="invalid_token"' : ""}`,
      },
    );
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
app.get("*", async (c) => {
  if (
    c.req.path.startsWith("/api/") ||
    c.req.path.startsWith("/auth/") ||
    c.req.path.startsWith("/oauth/") ||
    c.req.path.startsWith("/.well-known/") ||
    c.req.path === "/mcp"
  ) {
    return c.json({ error: "Not found" }, 404);
  }
  const response = await c.env.ASSETS.fetch(c.req.raw);
  // Asset responses have immutable headers; middleware needs a mutable copy.
  const result = new Response(response.body, response);
  if (c.req.path.startsWith("/shared/")) {
    result.headers.set("Cache-Control", "no-store");
    result.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  }
  return result;
});
app.notFound((c) => c.json({ error: "Not found" }, 404));
export default app;
