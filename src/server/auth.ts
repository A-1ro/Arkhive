import type { Context } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { Hono } from "hono";
export type User = { id: string; name: string; avatar: string | null };
export type Env = {
  Bindings: CloudflareBindings & {
    DISCORD_CLIENT_ID?: string;
    DISCORD_CLIENT_SECRET?: string;
    DISCORD_REDIRECT_URI?: string;
  };
  Variables: { user: User | null };
};
export async function hash(value: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
}
export function randomToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
const cookieOptions = (c: Context<Env>) => ({
  httpOnly: true,
  secure: new URL(c.req.url).protocol === "https:",
  sameSite: "Lax" as const,
  path: "/",
});
export async function sessionUser(c: Context<Env>): Promise<User | null> {
  const token = getCookie(c, "mythos_session");
  if (!token) return null;
  return c.env.DB.prepare(
    "SELECT u.id,u.name,u.avatar FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?",
  )
    .bind(await hash(token), Date.now())
    .first<User>();
}
export const auth = new Hono<Env>();
auth.get("/discord", async (c) => {
  if (!c.env.DISCORD_CLIENT_ID || !c.env.DISCORD_CLIENT_SECRET)
    return c.redirect("/?auth=setup");
  const state = randomToken();
  setCookie(c, "mythos_oauth_state", state, {
    ...cookieOptions(c),
    maxAge: 600,
  });
  const redirect =
    c.env.DISCORD_REDIRECT_URI ||
    `${new URL(c.req.url).origin}/auth/discord/callback`;
  const params = new URLSearchParams({
    client_id: c.env.DISCORD_CLIENT_ID,
    redirect_uri: redirect,
    response_type: "code",
    scope: "identify",
    state,
  });
  return c.redirect(`https://discord.com/oauth2/authorize?${params}`);
});
auth.get("/discord/callback", async (c) => {
  const expected = getCookie(c, "mythos_oauth_state");
  const state = c.req.query("state");
  deleteCookie(c, "mythos_oauth_state", { path: "/" });
  if (
    !expected ||
    !state ||
    (await hash(expected)) !== (await hash(state)) ||
    !c.req.query("code")
  )
    return c.redirect("/?auth=failed");
  if (!c.env.DISCORD_CLIENT_ID || !c.env.DISCORD_CLIENT_SECRET)
    return c.redirect("/?auth=setup");
  try {
    const response = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: c.env.DISCORD_CLIENT_ID,
        client_secret: c.env.DISCORD_CLIENT_SECRET,
        grant_type: "authorization_code",
        code: c.req.query("code")!,
        redirect_uri:
          c.env.DISCORD_REDIRECT_URI ||
          `${new URL(c.req.url).origin}/auth/discord/callback`,
      }),
    });
    if (!response.ok) throw new Error("Discord token exchange failed");
    const token = await response.json<{ access_token: string }>();
    const profileResponse = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    if (!profileResponse.ok) throw new Error("Discord profile failed");
    const profile = await profileResponse.json<{
      id: string;
      username: string;
      global_name?: string;
      avatar: string | null;
    }>();
    const session = randomToken();
    const avatar = profile.avatar
      ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png`
      : null;
    await c.env.DB.batch([
      c.env.DB.prepare(
        "INSERT INTO users (id,name,avatar) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,avatar=excluded.avatar",
      ).bind(profile.id, profile.global_name || profile.username, avatar),
      c.env.DB.prepare(
        "INSERT INTO sessions (token_hash,user_id,expires_at) VALUES (?,?,?)",
      ).bind(await hash(session), profile.id, Date.now() + 30 * 86400000),
      c.env.DB.prepare("DELETE FROM sessions WHERE expires_at<?").bind(
        Date.now(),
      ),
    ]);
    setCookie(c, "mythos_session", session, {
      ...cookieOptions(c),
      maxAge: 30 * 86400,
    });
    return c.redirect("/?auth=success");
  } catch {
    return c.redirect("/?auth=failed");
  }
});
auth.post("/logout", async (c) => {
  const token = getCookie(c, "mythos_session");
  if (token)
    await c.env.DB.prepare("DELETE FROM sessions WHERE token_hash=?")
      .bind(await hash(token))
      .run();
  deleteCookie(c, "mythos_session", { path: "/" });
  return c.json({ ok: true });
});
