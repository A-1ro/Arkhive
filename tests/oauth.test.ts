import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { getPlatformProxy, type PlatformProxy } from "wrangler";
import { readFile } from "node:fs/promises";
import app from "../src/server/index";
import { hash } from "../src/server/auth";
import { pkceChallenge } from "../src/server/oauth";
import {
  auth,
  type OAuthClientProvider,
} from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  OAuthClientInformationMixed,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";

let proxy: PlatformProxy<CloudflareBindings>;
const base = "https://mythos.test";
const redirect = "https://chatgpt.com/connector_platform_oauth_redirect";
const verifier = "v".repeat(64);
const browserSession = "oauth-test-browser";
type Credentials = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
};
type Client = { client_id: string; client_secret?: string };
const env = () => ({
  ...proxy.env,
  DISCORD_CLIENT_ID: "discord-client",
  DISCORD_CLIENT_SECRET: "discord-secret",
});

function jar(response: Response, previous = "") {
  const cookies = new Map(
    previous
      .split("; ")
      .filter(Boolean)
      .map((part) => {
        const split = part.indexOf("=");
        return [part.slice(0, split), part.slice(split + 1)];
      }),
  );
  for (const part of response.headers.getSetCookie()) {
    const [pair] = part.split(";");
    const split = pair.indexOf("=");
    cookies.set(pair.slice(0, split), pair.slice(split + 1));
  }
  return [...cookies].map(([name, value]) => `${name}=${value}`).join("; ");
}
function req(path: string, init: RequestInit = {}) {
  return app.request(`${base}${path}`, init, env());
}
function form(
  path: string,
  body: Record<string, string>,
  cookie = "",
  headers: Record<string, string> = {},
) {
  return req(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: cookie,
      ...headers,
    },
    body: new URLSearchParams(body),
  });
}
async function register(method = "none", uri = redirect) {
  const response = await req("/oauth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: "Test client <script>",
      redirect_uris: [uri],
      token_endpoint_auth_method: method,
    }),
  });
  expect(response.status).toBe(201);
  return response.json() as Promise<Client>;
}
async function authorize(
  client: Client,
  cookie = `mythos_session=${browserSession}`,
  overrides: Record<string, string> = {},
) {
  const query = new URLSearchParams({
    client_id: client.client_id,
    redirect_uri: redirect,
    response_type: "code",
    code_challenge: await pkceChallenge(verifier),
    code_challenge_method: "S256",
    resource: `${base}/mcp`,
    scope: "mcp",
    state: "client-state",
    ...overrides,
  });
  const response = await req(`/oauth/authorize?${query}`, {
    headers: { Cookie: cookie },
  });
  const body = await response.text();
  return {
    response,
    body,
    cookie: jar(response, cookie),
    request: body.match(/name="request"\s+value="([a-f0-9]+)"/)?.[1] || "",
    csrf: body.match(/name="csrf"\s+value="([a-f0-9]+)"/)?.[1] || "",
  };
}
async function approval(client: Client) {
  const flow = await authorize(client);
  const response = await form(
    "/oauth/authorize",
    { request: flow.request, csrf: flow.csrf, decision: "allow" },
    flow.cookie,
    { Origin: base },
  );
  expect(response.status).toBe(302);
  const location = new URL(response.headers.get("Location")!);
  expect(location.origin).toBe("https://chatgpt.com");
  expect(location.searchParams.get("state")).toBe("client-state");
  expect(location.searchParams.get("iss")).toBe(base);
  return location.searchParams.get("code")!;
}
function exchange(
  client: Client,
  code: string,
  overrides: Record<string, string> = {},
  headers: Record<string, string> = {},
) {
  return form(
    "/oauth/token",
    {
      grant_type: "authorization_code",
      client_id: client.client_id,
      code,
      redirect_uri: redirect,
      code_verifier: verifier,
      resource: `${base}/mcp`,
      ...overrides,
    },
    "",
    headers,
  );
}
async function connected() {
  const client = await register();
  const code = await approval(client);
  const response = await exchange(client, code);
  expect(response.status).toBe(200);
  return { client, code, tokens: (await response.json()) as Credentials };
}
function refresh(
  client: Client,
  token: string,
  extra: Record<string, string> = {},
) {
  return form("/oauth/token", {
    grant_type: "refresh_token",
    client_id: client.client_id,
    refresh_token: token,
    resource: `${base}/mcp`,
    ...extra,
  });
}
function mcp(token: string, method = "tools/list", params: unknown = {}) {
  return req("/mcp", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
      "MCP-Protocol-Version": "2025-03-26",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
}

beforeAll(async () => {
  proxy = await getPlatformProxy<CloudflareBindings>({
    persist: false,
    remoteBindings: false,
    envFiles: [],
  });
  for (const migration of [
    "0001_initial.sql",
    "0002_mcp_oauth.sql",
    "0003_character_images.sql",
  ]) {
    const sql = await readFile(
      new URL(`../migrations/${migration}`, import.meta.url),
      "utf8",
    );
    for (const statement of sql
      .split(";")
      .map((x) => x.trim())
      .filter(Boolean))
      await proxy.env.DB.prepare(statement).run();
  }
  await proxy.env.DB.prepare(
    "INSERT INTO users(id,name) VALUES ('oauth-user','Test user'),('other-user','Other user')",
  ).run();
  await proxy.env.DB.prepare(
    "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES (?,'oauth-user',?)",
  )
    .bind(await hash(browserSession), Date.now() + 3600000)
    .run();
  await proxy.env.DB.prepare(
    "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES (?,'other-user',?)",
  )
    .bind(await hash("other-session"), Date.now() + 3600000)
    .run();
}, 30000);
afterEach(() => vi.unstubAllGlobals());
afterAll(async () => {
  await proxy?.dispose();
});

describe("MCP OAuth via Discord", () => {
  it("completes discovery, DCR, PKCE and renewal with the official MCP SDK OAuth client", async () => {
    let information: OAuthClientInformationMixed | undefined;
    let tokens: OAuthTokens | undefined;
    let codeVerifier = "";
    let authorizationUrl: URL | undefined;
    const provider: OAuthClientProvider = {
      redirectUrl: redirect,
      clientMetadata: {
        client_name: "MCP SDK",
        redirect_uris: [redirect],
        token_endpoint_auth_method: "none",
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
      },
      state: () => "sdk-state",
      clientInformation: () => information,
      saveClientInformation: (value) => {
        information = value;
      },
      tokens: () => tokens,
      saveTokens: (value) => {
        tokens = value;
      },
      saveCodeVerifier: (value) => {
        codeVerifier = value;
      },
      codeVerifier: () => codeVerifier,
      redirectToAuthorization: (url) => {
        authorizationUrl = url;
      },
    };
    const fetchFn: typeof fetch = (input, init) => {
      const url = input instanceof Request ? input.url : String(input);
      expect(new URL(url).origin).toBe(base);
      return app.request(url, init, env());
    };
    const options = { serverUrl: `${base}/mcp`, fetchFn };
    expect(await auth(provider, options)).toBe("REDIRECT");
    expect(information?.client_id).toBeTruthy();
    const response = await req(
      `${authorizationUrl!.pathname}${authorizationUrl!.search}`,
      { headers: { Cookie: `mythos_session=${browserSession}` } },
    );
    const body = await response.text();
    const cookie = jar(response, `mythos_session=${browserSession}`);
    const allowed = await form(
      "/oauth/authorize",
      {
        request: body.match(/name="request"\s+value="([a-f0-9]+)"/)![1],
        csrf: body.match(/name="csrf"\s+value="([a-f0-9]+)"/)![1],
        decision: "allow",
      },
      cookie,
    );
    const destination = new URL(allowed.headers.get("Location")!);
    expect(destination.searchParams.get("state")).toBe("sdk-state");
    expect(
      await auth(provider, {
        ...options,
        authorizationCode: destination.searchParams.get("code")!,
      }),
    ).toBe("AUTHORIZED");
    expect((await mcp(tokens!.access_token)).status).toBe(200);
    const previous = tokens!.refresh_token;
    expect(await auth(provider, options)).toBe("AUTHORIZED");
    expect(tokens!.refresh_token).not.toBe(previous);
    expect((await mcp(tokens!.access_token)).status).toBe(200);
  });
  it("advertises resource and authorization metadata from the unauthenticated challenge", async () => {
    const response = await req("/mcp");
    expect(response.status).toBe(401);
    expect(response.headers.get("WWW-Authenticate")).toContain(
      `${base}/.well-known/oauth-protected-resource/mcp`,
    );
    for (const path of [
      "/.well-known/oauth-protected-resource",
      "/.well-known/oauth-protected-resource/mcp",
    ]) {
      const metadata = (await (await req(path)).json()) as Record<
        string,
        unknown
      >;
      expect(metadata.resource).toBe(`${base}/mcp`);
      expect(metadata.authorization_servers).toEqual([base]);
    }
    const metadata = (await (
      await req("/.well-known/oauth-authorization-server")
    ).json()) as Record<string, unknown>;
    expect(metadata.code_challenge_methods_supported).toEqual(["S256"]);
    expect(metadata.authorization_response_iss_parameter_supported).toBe(true);
    expect(metadata.issuer).toBe(base);
  });
  it("validates DCR redirect URIs, escapes untrusted client names, and requires explicit consent", async () => {
    for (const uri of [
      "https://example.com/callback#fragment",
      "https://user:pass@example.com/callback",
      "http://example.com/callback",
      "javascript:alert(1)",
    ]) {
      const response = await req("/oauth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ redirect_uris: [uri] }),
      });
      expect(response.status).toBe(400);
    }
    const client = await register();
    const flow = await authorize(client, "");
    expect(flow.response.status).toBe(200);
    expect(flow.body).toContain("Test client &lt;script&gt;");
    expect(flow.body).toContain("Discordでログインして連携");
    expect(flow.response.headers.get("Content-Security-Policy")).toContain(
      "frame-ancestors 'none'",
    );
    const bad = await authorize(client, "", {
      redirect_uri: "https://evil.test/callback",
    });
    expect(bad.response.status).toBe(400);
    expect(bad.response.headers.get("Location")).toBeNull();
    expect(
      (
        await req(`/oauth/complete?request=${flow.request}`, {
          headers: { Cookie: flow.cookie },
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await form(
          "/oauth/authorize",
          { request: flow.request, csrf: flow.csrf, decision: "allow" },
          `mythos_session=${browserSession}`,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await form(
          "/oauth/authorize",
          { request: flow.request, csrf: "wrong", decision: "allow" },
          flow.cookie,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await form(
          "/oauth/authorize",
          { request: flow.request, csrf: flow.csrf, decision: "allow" },
          flow.cookie,
          { Origin: "https://evil.test" },
        )
      ).status,
    ).toBe(403);
  });
  it("preserves the MCP request through Discord login and resumes the client callback", async () => {
    const client = await register();
    const flow = await authorize(client, "");
    const allow = await form(
      "/oauth/authorize",
      { request: flow.request, csrf: flow.csrf, decision: "allow" },
      flow.cookie,
    );
    expect(allow.status).toBe(302);
    const login = await req(allow.headers.get("Location")!, {
      headers: { Cookie: flow.cookie },
    });
    const discord = new URL(login.headers.get("Location")!);
    expect(discord.origin).toBe("https://discord.com");
    expect(discord.searchParams.get("scope")).toBe("identify");
    const loginCookie = jar(login, flow.cookie);
    const external = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url === "https://discord.com/api/oauth2/token")
        return Response.json({ access_token: "discord-private-token" });
      if (url === "https://discord.com/api/users/@me")
        return Response.json({
          id: "discord-user",
          username: "Discord user",
          avatar: null,
        });
      throw new Error(`Unexpected URL: ${url}`);
    });
    vi.stubGlobal("fetch", external);
    const callback = await req(
      `/auth/discord/callback?code=discord-code&state=${discord.searchParams.get("state")}`,
      { headers: { Cookie: loginCookie } },
    );
    expect(callback.headers.get("Location")).toBe(
      `/oauth/complete?request=${flow.request}`,
    );
    const complete = await req(callback.headers.get("Location")!, {
      headers: { Cookie: jar(callback, loginCookie) },
    });
    const destination = new URL(complete.headers.get("Location")!);
    expect(destination.origin).toBe("https://chatgpt.com");
    const token = await exchange(client, destination.searchParams.get("code")!);
    expect(token.status).toBe(200);
    expect(JSON.stringify(await token.json())).not.toContain(
      "discord-private-token",
    );
    expect(external).toHaveBeenCalledTimes(2);
    expect(
      (
        await req(callback.headers.get("Location")!, {
          headers: { Cookie: jar(callback, loginCookie) },
        })
      ).status,
    ).toBe(400);
  });
  it("does not accept an external post-login redirect", async () => {
    const response = await req("/auth/discord?return_to=https://evil.test");
    expect(
      response.headers
        .getSetCookie()
        .some((x) => x.startsWith("mythos_login_return=https")),
    ).toBe(false);
  });
  it("returns cancellation to the client with state and issuer without creating a grant", async () => {
    const client = await register();
    const flow = await authorize(client);
    const response = await form(
      "/oauth/authorize",
      { request: flow.request, csrf: flow.csrf, decision: "deny" },
      flow.cookie,
    );
    const destination = new URL(response.headers.get("Location")!);
    expect(destination.searchParams.get("error")).toBe("access_denied");
    expect(destination.searchParams.get("state")).toBe("client-state");
    expect(destination.searchParams.get("iss")).toBe(base);
    expect(
      await proxy.env.DB.prepare(
        "SELECT id FROM oauth_grants WHERE client_id=?",
      )
        .bind(client.client_id)
        .first(),
    ).toBeNull();
  });
  it("rejects missing PKCE, unexpected resource, scopes, and expired requests", async () => {
    const client = await register();
    for (const overrides of [
      { code_challenge_method: "plain" },
      { resource: "https://other.test/mcp" },
      { scope: "admin" },
    ]) {
      const flow = await authorize(client, "", overrides);
      expect(flow.response.status).toBe(302);
      expect(
        new URL(flow.response.headers.get("Location")!).searchParams.has(
          "error",
        ),
      ).toBe(true);
    }
    const flow = await authorize(client);
    await proxy.env.DB.prepare(
      "UPDATE oauth_requests SET expires_at=1 WHERE request_hash=?",
    )
      .bind(await hash(flow.request))
      .run();
    expect(
      (
        await form(
          "/oauth/authorize",
          { request: flow.request, csrf: flow.csrf, decision: "allow" },
          flow.cookie,
        )
      ).status,
    ).toBe(400);
  });
  it("binds codes to PKCE, client, redirect, resource, expiry, and consumes them once under concurrency", async () => {
    const client = await register();
    const code = await approval(client);
    for (const overrides of [
      { code_verifier: "x".repeat(64) },
      { redirect_uri: "https://evil.test" },
      { resource: "https://evil.test/mcp" },
      { client_id: (await register()).client_id },
    ]) {
      expect((await exchange(client, code, overrides)).status).toBe(400);
    }
    const results = await Promise.all([
      exchange(client, code),
      exchange(client, code),
    ]);
    expect(results.map((x) => x.status).sort()).toEqual([200, 400]);
    const expiredCode = await approval(client);
    await proxy.env.DB.prepare(
      "UPDATE oauth_codes SET expires_at=1 WHERE code_hash=?",
    )
      .bind(await hash(expiredCode))
      .run();
    expect((await exchange(client, expiredCode)).status).toBe(400);
  });
  it("supports confidential client registration and rejects missing or wrong secrets", async () => {
    for (const method of ["client_secret_post", "client_secret_basic"]) {
      const client = await register(method);
      const code = await approval(client);
      expect((await exchange(client, code)).status).toBe(401);
      expect(
        (await exchange(client, code, { client_secret: "wrong" })).status,
      ).toBe(401);
      const response =
        method === "client_secret_post"
          ? await exchange(client, code, {
              client_secret: client.client_secret!,
            })
          : await exchange(
              client,
              code,
              {},
              {
                Authorization: `Basic ${btoa(`${client.client_id}:${client.client_secret}`)}`,
              },
            );
      expect(response.status).toBe(200);
      const stored = await proxy.env.DB.prepare(
        "SELECT secret_hash FROM oauth_clients WHERE id=?",
      )
        .bind(client.client_id)
        .first<{ secret_hash: string }>();
      expect(stored?.secret_hash).toBe(await hash(client.client_secret!));
    }
  });
  it("allows OAuth credentials to access MCP, keeps ownership, and rejects other token types or audiences", async () => {
    const { tokens } = await connected();
    expect(tokens.expires_in).toBeLessThanOrEqual(3600);
    expect((await mcp(tokens.access_token)).status).toBe(200);
    const created = await mcp(tokens.access_token, "tools/call", {
      name: "create_character",
      arguments: { edition: "7", name: "OAuth investigator" },
    });
    const body = (await created.json()) as {
      result: { content: { text: string }[] };
    };
    const character = JSON.parse(body.result.content[0].text).character;
    expect(
      (
        await req(`/api/characters/${character.id}`, {
          headers: { Cookie: `mythos_session=${browserSession}` },
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await req(`/api/characters/${character.id}`, {
          headers: { Cookie: "mythos_session=other-session" },
        })
      ).status,
    ).toBe(404);
    expect((await mcp(tokens.refresh_token)).status).toBe(401);
    expect((await mcp("mythos_" + "1".repeat(64))).status).toBe(401);
    const tokenHash = await hash(tokens.access_token);
    expect(
      await proxy.env.DB.prepare(
        "SELECT token_hash FROM oauth_tokens WHERE token_hash=?",
      )
        .bind(tokenHash)
        .first(),
    ).toEqual({ token_hash: tokenHash });
    expect(
      (
        await app.request(
          "https://different.test/mcp",
          {
            method: "POST",
            headers: { Authorization: `Bearer ${tokens.access_token}` },
          },
          env(),
        )
      ).status,
    ).toBe(401);
    await proxy.env.DB.prepare(
      "UPDATE oauth_tokens SET expires_at=1 WHERE token_hash=?",
    )
      .bind(tokenHash)
      .run();
    const expired = await mcp(tokens.access_token);
    expect(expired.status).toBe(401);
    expect(expired.headers.get("WWW-Authenticate")).toContain(
      'error="invalid_token"',
    );
  });
  it("rotates refresh credentials and revokes the entire connection on replay", async () => {
    const { client, tokens } = await connected();
    expect((await refresh(await register(), tokens.refresh_token)).status).toBe(
      400,
    );
    expect(
      (
        await refresh(client, tokens.refresh_token, {
          resource: "https://other.test/mcp",
        })
      ).status,
    ).toBe(400);
    const response = await refresh(client, tokens.refresh_token);
    expect(response.status).toBe(200);
    const next = (await response.json()) as Credentials;
    expect(next.refresh_token).not.toBe(tokens.refresh_token);
    expect((await mcp(next.access_token)).status).toBe(200);
    expect((await refresh(client, tokens.refresh_token)).status).toBe(400);
    expect((await mcp(next.access_token)).status).toBe(401);
    expect((await refresh(client, next.refresh_token)).status).toBe(400);
  });
  it("lists and revokes only the current user's connections and invalidates all their credentials", async () => {
    const { client, tokens } = await connected();
    const grant = await proxy.env.DB.prepare(
      "SELECT id FROM oauth_grants WHERE client_id=?",
    )
      .bind(client.client_id)
      .first<{ id: string }>();
    const connections = await req("/api/connections", {
      headers: { Cookie: `mythos_session=${browserSession}` },
    });
    expect(
      ((await connections.json()) as { id: string }[]).some(
        (x) => x.id === grant!.id,
      ),
    ).toBe(true);
    expect((await req("/api/connections")).status).toBe(401);
    await req(`/api/connections/${grant!.id}`, {
      method: "DELETE",
      headers: { Cookie: "mythos_session=other-session" },
    });
    expect((await mcp(tokens.access_token)).status).toBe(200);
    await req(`/api/connections/${grant!.id}`, {
      method: "DELETE",
      headers: { Cookie: `mythos_session=${browserSession}` },
    });
    expect((await mcp(tokens.access_token)).status).toBe(401);
    expect((await refresh(client, tokens.refresh_token)).status).toBe(400);
  });
  it("supports the OAuth revocation endpoint and does not let another client revoke a connection", async () => {
    const { client, tokens } = await connected();
    const other = await register();
    expect(
      (
        await form("/oauth/revoke", {
          client_id: other.client_id,
          token: tokens.access_token,
        })
      ).status,
    ).toBe(200);
    expect((await mcp(tokens.access_token)).status).toBe(200);
    expect(
      (
        await form("/oauth/revoke", {
          client_id: client.client_id,
          token: tokens.refresh_token,
        })
      ).status,
    ).toBe(200);
    expect((await mcp(tokens.access_token)).status).toBe(401);
  });
  it("provides CORS for metadata, registration, token exchange and approved MCP origins", async () => {
    const response = await req("/oauth/token", {
      method: "OPTIONS",
      headers: {
        Origin: "https://chatgpt.com",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "Content-Type",
      },
    });
    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    const { client } = await connected();
    const code = await approval(client);
    const exchanged = await exchange(
      client,
      code,
      {},
      { Origin: "https://claude.ai" },
    );
    expect(exchanged.status).toBe(200);
    const tokens = (await exchanged.json()) as Credentials;
    const mcpResponse = await req("/mcp", {
      method: "GET",
      headers: {
        Origin: "https://chatgpt.com",
        Authorization: `Bearer ${tokens.access_token}`,
      },
    });
    expect(mcpResponse.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://chatgpt.com",
    );
    expect(
      (
        await req("/mcp", {
          method: "POST",
          headers: { Origin: "https://evil.test" },
        })
      ).status,
    ).toBe(403);
    expect(
      (await req("/mcp", { headers: { Origin: "https://evil.test" } })).status,
    ).toBe(403);
  });
});
