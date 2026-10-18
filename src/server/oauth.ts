import { Hono, type Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { cors } from "hono/cors";
import { html } from "hono/html";
import { z } from "zod";
import {
  hash,
  matchesHash,
  randomToken,
  sessionUser,
  type Env,
  type User,
} from "./auth";

const scope = "mcp";
const browserCookie = (c: Context<Env>) =>
  new URL(c.req.url).protocol === "https:"
    ? "__Host-mythos_mcp_browser"
    : "mythos_mcp_browser";
const accessLifetime = 3600;
const grantLifetime = 30 * 86400000;
type Client = {
  id: string;
  name: string;
  redirect_uris: string;
  auth_method: string;
  secret_hash: string | null;
};
type Authorization = {
  client_id: string;
  redirect_uri: string;
  code_challenge: string;
  resource: string;
  scope: string;
  state?: string;
};
type Pending = { data: string; browser_hash: string; approved: number };
type Grant = {
  id: string;
  client_id: string;
  resource: string;
  scope: string;
  expires_at: number;
};
const origin = (c: Context<Env>) => new URL(c.req.url).origin;
const resource = (c: Context<Env>) => `${origin(c)}/mcp`;
const error = (
  c: Context<Env>,
  code: string,
  description: string,
  status: 400 | 401 = 400,
) => c.json({ error: code, error_description: description }, status);

export async function pkceChallenge(verifier: string) {
  const bytes = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)),
  );
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function validRedirect(value: string) {
  try {
    const url = new URL(value);
    return (
      !url.hash &&
      !url.username &&
      !url.password &&
      (url.protocol === "https:" ||
        (url.protocol === "http:" &&
          ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))
    );
  } catch {
    return false;
  }
}

const registration = z.object({
  client_name: z.string().trim().min(1).max(100).default("MCPクライアント"),
  redirect_uris: z
    .array(z.string().max(2048).refine(validRedirect))
    .min(1)
    .max(10),
  token_endpoint_auth_method: z
    .enum(["none", "client_secret_post", "client_secret_basic"])
    .default("client_secret_basic"),
  grant_types: z
    .array(z.enum(["authorization_code", "refresh_token"]))
    .refine((x) => x.includes("authorization_code"))
    .default(["authorization_code", "refresh_token"]),
  response_types: z.array(z.literal("code")).min(1).default(["code"]),
});

export const oauth = new Hono<Env>();
// These endpoints use OAuth credentials, never browser cookies for authorization.
for (const path of [
  "/.well-known/*",
  "/oauth/register",
  "/oauth/token",
  "/oauth/revoke",
]) {
  oauth.use(
    path,
    cors({
      origin: "*",
      allowMethods: ["GET", "POST", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization"],
    }),
  );
}
for (const path of ["/.well-known/*", "/oauth/*"])
  oauth.use(path, async (c, next) => {
    c.header("Cache-Control", "no-store");
    c.header("Pragma", "no-cache");
    c.header("Referrer-Policy", "no-referrer");
    await next();
  });
for (const path of [
  "/.well-known/oauth-protected-resource",
  "/.well-known/oauth-protected-resource/mcp",
]) {
  oauth.get(path, (c) =>
    c.json({
      resource: resource(c),
      authorization_servers: [origin(c)],
      scopes_supported: [scope],
      bearer_methods_supported: ["header"],
      resource_name: "Arkhive 探索者ノート",
    }),
  );
}
oauth.get("/.well-known/oauth-authorization-server", (c) =>
  c.json({
    issuer: origin(c),
    authorization_endpoint: `${origin(c)}/oauth/authorize`,
    token_endpoint: `${origin(c)}/oauth/token`,
    registration_endpoint: `${origin(c)}/oauth/register`,
    revocation_endpoint: `${origin(c)}/oauth/revoke`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: [
      "none",
      "client_secret_post",
      "client_secret_basic",
    ],
    scopes_supported: [scope],
    authorization_response_iss_parameter_supported: true,
  }),
);
oauth.post("/oauth/register", async (c) => {
  const parsed = registration.safeParse(await c.req.json());
  if (!parsed.success)
    return error(
      c,
      "invalid_client_metadata",
      "クライアントの登録内容を確認してください",
    );
  const metadata = parsed.data;
  const id = crypto.randomUUID();
  const secret =
    metadata.token_endpoint_auth_method === "none" ? undefined : randomToken();
  const issued = Math.floor(Date.now() / 1000);
  await c.env.DB.prepare(
    "INSERT INTO oauth_clients(id,name,redirect_uris,auth_method,secret_hash,created_at) VALUES (?,?,?,?,?,?)",
  )
    .bind(
      id,
      metadata.client_name,
      JSON.stringify(metadata.redirect_uris),
      metadata.token_endpoint_auth_method,
      secret ? await hash(secret) : null,
      Date.now(),
    )
    .run();
  return c.json(
    {
      ...metadata,
      client_id: id,
      client_id_issued_at: issued,
      ...(secret ? { client_secret: secret, client_secret_expires_at: 0 } : {}),
    },
    201,
  );
});

function callback(
  c: Context<Env>,
  data: Authorization,
  values: Record<string, string>,
) {
  const url = new URL(data.redirect_uri);
  for (const [key, value] of Object.entries(values))
    url.searchParams.set(key, value);
  if (data.state !== undefined) url.searchParams.set("state", data.state);
  url.searchParams.set("iss", origin(c));
  return c.redirect(url.href);
}

oauth.get("/oauth/authorize", async (c) => {
  const query = c.req.query();
  const client = await c.env.DB.prepare(
    "SELECT * FROM oauth_clients WHERE id=?",
  )
    .bind(query.client_id || "")
    .first<Client>();
  if (
    !client ||
    !(JSON.parse(client.redirect_uris) as string[]).includes(query.redirect_uri)
  )
    return error(
      c,
      "invalid_request",
      "登録済みクライアントとリダイレクトURIが必要です",
    );
  const data: Authorization = {
    client_id: client.id,
    redirect_uri: query.redirect_uri,
    code_challenge: query.code_challenge || "",
    resource: query.resource || resource(c),
    scope: query.scope || scope,
    ...(query.state !== undefined ? { state: query.state } : {}),
  };
  if (query.response_type !== "code")
    return callback(c, data, { error: "unsupported_response_type" });
  if (
    query.code_challenge_method !== "S256" ||
    !/^[A-Za-z0-9_-]{43}$/.test(data.code_challenge)
  )
    return callback(c, data, {
      error: "invalid_request",
      error_description: "PKCE S256 is required",
    });
  if (data.resource !== resource(c))
    return callback(c, data, { error: "invalid_target" });
  if (data.scope !== scope)
    return callback(c, data, { error: "invalid_scope" });
  if ((data.state?.length || 0) > 2048)
    return error(c, "invalid_request", "stateが長すぎます");
  const browser = getCookie(c, browserCookie(c)) || randomToken();
  setCookie(c, browserCookie(c), browser, {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === "https:",
    sameSite: "Lax",
    path: "/",
    maxAge: 600,
  });
  const request = randomToken();
  const browserHash = await hash(browser);
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM oauth_requests WHERE expires_at<?").bind(
      Date.now(),
    ),
    c.env.DB.prepare(
      "INSERT INTO oauth_requests(request_hash,browser_hash,data,expires_at) VALUES (?,?,?,?)",
    ).bind(
      await hash(request),
      browserHash,
      JSON.stringify(data),
      Date.now() + 600000,
    ),
  ]);
  const user = await sessionUser(c);
  return c.html(
    html`<!doctype html>
      <html lang="ja">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width,initial-scale=1" />
          <title>MCP連携の許可 | Arkhive</title>
          <style>
            body {
              font-family: system-ui, sans-serif;
              background: #f5f3f8;
              color: #332b42;
              margin: 0;
              padding: 32px 20px;
            }
            main {
              max-width: 480px;
              margin: 8vh auto;
              background: white;
              padding: 32px;
              border-radius: 16px;
              box-shadow: 0 8px 36px #332b4212;
            }
            h1 {
              font-size: 22px;
            }
            p {
              line-height: 1.8;
            }
            code {
              overflow-wrap: anywhere;
            }
            small {
              color: #635875;
            }
            button {
              font: inherit;
              border: 0;
              border-radius: 8px;
              padding: 12px 16px;
              cursor: pointer;
              margin: 8px 8px 0 0;
              background: #eee9f5;
            }
            button[value="allow"] {
              background: #725293;
              color: white;
            }
          </style>
        </head>
        <body>
          <main>
            <small>Arkhive 探索者ノート</small>
            <h1>MCP連携を許可しますか？</h1>
            <p>
              接続元の表示名：<strong>${client.name}</strong><br /><small
                >この名前は接続元が登録したものです。</small
              >
            </p>
            <p>
              あなたの探索者の一覧・詳細の取得、新規作成・更新を許可します。削除はできません。
            </p>
            <p>連携先：<br /><code>${data.redirect_uri}</code></p>
            <p>
              ${user ? `${user.name} として連携します。` : "Discordでログインして、あなたのアカウントに連携します。"}
            </p>
            <form method="post" action="/oauth/authorize">
              <input type="hidden" name="request" value="${request}" /><input
                type="hidden"
                name="csrf"
                value="${browserHash}"
              />
              <button name="decision" value="allow">
                ${user ? "連携を許可" : "Discordでログインして連携"}</button
              ><button name="decision" value="deny">キャンセル</button>
            </form>
          </main>
        </body>
      </html>`,
  );
});

async function pending(c: Context<Env>, request: string) {
  const browser = getCookie(c, browserCookie(c));
  if (!browser || !/^[a-f0-9]{64}$/.test(request)) return null;
  return c.env.DB.prepare(
    "SELECT data,browser_hash,approved FROM oauth_requests WHERE request_hash=? AND browser_hash=? AND expires_at>?",
  )
    .bind(await hash(request), await hash(browser), Date.now())
    .first<Pending>();
}

async function complete(c: Context<Env>, request: string, user: User) {
  const browser = getCookie(c, browserCookie(c));
  if (!browser)
    return error(c, "invalid_request", "連携を最初からやり直してください");
  const row = await c.env.DB.prepare(
    "DELETE FROM oauth_requests WHERE request_hash=? AND browser_hash=? AND approved=1 AND expires_at>? RETURNING data",
  )
    .bind(await hash(request), await hash(browser), Date.now())
    .first<{ data: string }>();
  if (!row)
    return error(
      c,
      "invalid_request",
      "連携リクエストが無効または期限切れです",
    );
  const data = JSON.parse(row.data) as Authorization;
  const id = crypto.randomUUID();
  const code = randomToken();
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM oauth_grants WHERE expires_at<?").bind(
      Date.now(),
    ),
    c.env.DB.prepare(
      "INSERT INTO oauth_grants(id,user_id,client_id,resource,scope,created_at,expires_at) VALUES (?,?,?,?,?,?,?)",
    ).bind(
      id,
      user.id,
      data.client_id,
      data.resource,
      data.scope,
      Date.now(),
      Date.now() + grantLifetime,
    ),
    c.env.DB.prepare(
      "INSERT INTO oauth_codes(code_hash,grant_id,redirect_uri,challenge,expires_at) VALUES (?,?,?,?,?)",
    ).bind(
      await hash(code),
      id,
      data.redirect_uri,
      data.code_challenge,
      Date.now() + 60000,
    ),
  ]);
  return callback(c, data, { code });
}

oauth.post("/oauth/authorize", async (c) => {
  const form = await c.req.parseBody();
  const request = String(form.request || "");
  const row = await pending(c, request);
  if (
    !row ||
    form.csrf !== row.browser_hash ||
    !["allow", "deny"].includes(String(form.decision))
  )
    return error(c, "invalid_request", "連携を最初からやり直してください");
  if (form.decision === "deny") {
    await c.env.DB.prepare("DELETE FROM oauth_requests WHERE request_hash=?")
      .bind(await hash(request))
      .run();
    return callback(c, JSON.parse(row.data), { error: "access_denied" });
  }
  await c.env.DB.prepare(
    "UPDATE oauth_requests SET approved=1 WHERE request_hash=?",
  )
    .bind(await hash(request))
    .run();
  const user = await sessionUser(c);
  if (user) return complete(c, request, user);
  return c.redirect(
    `/auth/discord?return_to=${encodeURIComponent(`/oauth/complete?request=${request}`)}`,
  );
});
oauth.get("/oauth/complete", async (c) => {
  const request = c.req.query("request") || "";
  const row = await pending(c, request);
  const user = await sessionUser(c);
  if (!user || !row?.approved)
    return error(c, "invalid_request", "Discordログインと連携の許可が必要です");
  return complete(c, request, user);
});

async function authenticateClient(c: Context<Env>, form: URLSearchParams) {
  let id = form.get("client_id");
  let secret = form.get("client_secret");
  let method = secret ? "client_secret_post" : "none";
  const authorization = c.req.header("Authorization");
  if (authorization) {
    if (!authorization.startsWith("Basic ") || secret) return null;
    try {
      const decoded = atob(authorization.slice(6));
      const split = decoded.indexOf(":");
      if (split < 0) return null;
      const basicId = decodeURIComponent(decoded.slice(0, split));
      if (id && id !== basicId) return null;
      id = basicId;
      secret = decodeURIComponent(decoded.slice(split + 1));
      method = "client_secret_basic";
    } catch {
      return null;
    }
  }
  if (!id) return null;
  const client = await c.env.DB.prepare(
    "SELECT * FROM oauth_clients WHERE id=?",
  )
    .bind(id)
    .first<Client>();
  if (!client || method !== client.auth_method) return null;
  if (
    method !== "none" &&
    (!secret ||
      !client.secret_hash ||
      !(await matchesHash(secret, client.secret_hash)))
  )
    return null;
  return client;
}

async function issueTokens(c: Context<Env>, grant: Grant) {
  const access = `ark_at_${randomToken()}`;
  const refresh = `ark_rt_${randomToken()}`;
  await c.env.DB.batch([
    c.env.DB.prepare(
      "DELETE FROM oauth_tokens WHERE grant_id=? AND kind='access' AND expires_at<?",
    ).bind(grant.id, Date.now()),
    c.env.DB.prepare(
      "INSERT INTO oauth_tokens(token_hash,grant_id,kind,expires_at) VALUES (?,?,'access',?)",
    ).bind(
      await hash(access),
      grant.id,
      Math.min(Date.now() + accessLifetime * 1000, grant.expires_at),
    ),
    c.env.DB.prepare(
      "INSERT INTO oauth_tokens(token_hash,grant_id,kind,expires_at) VALUES (?,?,'refresh',?)",
    ).bind(await hash(refresh), grant.id, grant.expires_at),
  ]);
  return c.json({
    access_token: access,
    token_type: "Bearer",
    expires_in: Math.min(
      accessLifetime,
      Math.floor((grant.expires_at - Date.now()) / 1000),
    ),
    refresh_token: refresh,
    scope: grant.scope,
  });
}

oauth.post("/oauth/token", async (c) => {
  if (
    !c.req
      .header("Content-Type")
      ?.startsWith("application/x-www-form-urlencoded")
  )
    return error(c, "invalid_request", "フォーム形式で送信してください");
  const form = new URLSearchParams(await c.req.text());
  const client = await authenticateClient(c, form);
  if (!client)
    return error(c, "invalid_client", "クライアント認証に失敗しました", 401);
  const target = form.get("resource");
  if (target && target !== resource(c))
    return error(c, "invalid_target", "MCPの接続先が一致しません");
  if (form.get("grant_type") === "authorization_code") {
    const code = form.get("code") || "";
    const row = await c.env.DB.prepare(
      "SELECT c.*,g.client_id,g.resource,g.scope,g.id,g.expires_at AS grant_expires_at FROM oauth_codes c JOIN oauth_grants g ON g.id=c.grant_id WHERE c.code_hash=? AND c.expires_at>? AND g.expires_at>?",
    )
      .bind(await hash(code), Date.now(), Date.now())
      .first<
        Grant & {
          challenge: string;
          redirect_uri: string;
          grant_expires_at: number;
        }
      >();
    const verifier = form.get("code_verifier") || "";
    if (
      !row ||
      row.client_id !== client.id ||
      row.resource !== resource(c) ||
      row.redirect_uri !== form.get("redirect_uri") ||
      !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier) ||
      (await pkceChallenge(verifier)) !== row.challenge
    )
      return error(c, "invalid_grant", "認証コードまたはPKCEが無効です");
    // Atomic consumption prevents two concurrent exchanges from succeeding.
    const consumed = await c.env.DB.prepare(
      "DELETE FROM oauth_codes WHERE code_hash=? AND expires_at>? RETURNING grant_id",
    )
      .bind(await hash(code), Date.now())
      .first();
    if (!consumed) return error(c, "invalid_grant", "認証コードは使用済みです");
    return issueTokens(c, { ...row, expires_at: row.grant_expires_at });
  }
  if (form.get("grant_type") === "refresh_token") {
    const tokenHash = await hash(form.get("refresh_token") || "");
    const row = await c.env.DB.prepare(
      "SELECT g.*,t.consumed_at FROM oauth_tokens t JOIN oauth_grants g ON g.id=t.grant_id WHERE t.token_hash=? AND t.kind='refresh' AND t.expires_at>? AND g.expires_at>?",
    )
      .bind(tokenHash, Date.now(), Date.now())
      .first<Grant & { consumed_at: number | null }>();
    if (!row || row.client_id !== client.id || row.resource !== resource(c))
      return error(c, "invalid_grant", "連携が無効または期限切れです");
    if (form.get("scope") && form.get("scope") !== row.scope)
      return error(c, "invalid_scope", "権限は変更できません");
    const consumed = await c.env.DB.prepare(
      "UPDATE oauth_tokens SET consumed_at=? WHERE token_hash=? AND consumed_at IS NULL RETURNING grant_id",
    )
      .bind(Date.now(), tokenHash)
      .first();
    if (!consumed) {
      // Retain consumed refresh hashes until grant expiry to detect replay.
      await c.env.DB.prepare("DELETE FROM oauth_grants WHERE id=?")
        .bind(row.id)
        .run();
      return error(
        c,
        "invalid_grant",
        "更新資格情報の再利用を検出しました。再連携してください",
      );
    }
    return issueTokens(c, row);
  }
  return error(c, "unsupported_grant_type", "対応していない認証方式です");
});

oauth.post("/oauth/revoke", async (c) => {
  const form = new URLSearchParams(await c.req.text());
  const client = await authenticateClient(c, form);
  if (!client)
    return error(c, "invalid_client", "クライアント認証に失敗しました", 401);
  await c.env.DB.prepare(
    "DELETE FROM oauth_grants WHERE client_id=? AND id IN (SELECT grant_id FROM oauth_tokens WHERE token_hash=?)",
  )
    .bind(client.id, await hash(form.get("token") || ""))
    .run();
  return c.body(null, 200);
});

export async function mcpUser(c: Context<Env>): Promise<User | null> {
  const token = c.req
    .header("Authorization")
    ?.match(/^Bearer (ark_at_[a-f0-9]{64})$/i)?.[1];
  if (!token) return null;
  return c.env.DB.prepare(
    "SELECT u.id,u.name,u.avatar FROM oauth_tokens t JOIN oauth_grants g ON g.id=t.grant_id JOIN users u ON u.id=g.user_id WHERE t.token_hash=? AND t.kind='access' AND t.expires_at>? AND g.expires_at>? AND g.resource=? AND g.scope=?",
  )
    .bind(await hash(token), Date.now(), Date.now(), resource(c), scope)
    .first<User>();
}
