import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getPlatformProxy, type PlatformProxy } from "wrangler";
import { readFile } from "node:fs/promises";
import app from "../src/server/index";
import { hash } from "../src/server/auth";
import { newCharacter } from "../src/shared/rules";
let proxy: PlatformProxy<CloudflareBindings>;
const firstToken = "first-user-local-test-token";
const secondToken = "second-user-local-test-token";
const bearer = "mythos_" + "1".repeat(64);
const request = (
  path: string,
  method = "GET",
  body?: unknown,
  cookie = firstToken,
  headers: Record<string, string> = {},
) =>
  app.request(
    `https://mythos.test${path}`,
    {
      method,
      headers: {
        Cookie: `mythos_session=${cookie}`,
        "Content-Type": "application/json",
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    proxy.env,
  );
beforeAll(async () => {
  proxy = await getPlatformProxy<CloudflareBindings>({
    persist: false,
    remoteBindings: false,
    envFiles: [],
  });
  const sql = await readFile(
    new URL("../migrations/0001_initial.sql", import.meta.url),
    "utf8",
  );
  for (const statement of sql
    .split(";")
    .map((x) => x.trim())
    .filter(Boolean))
    await proxy.env.DB.prepare(statement).run();
  for (const [id, token] of [
    ["first", firstToken],
    ["second", secondToken],
  ]) {
    await proxy.env.DB.prepare("INSERT INTO users(id,name) VALUES (?,?)")
      .bind(id, id)
      .run();
    await proxy.env.DB.prepare(
      "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES (?,?,?)",
    )
      .bind(await hash(token), id, Date.now() + 60000)
      .run();
  }
  await proxy.env.DB.prepare(
    "INSERT INTO api_tokens(id,user_id,token_hash,name) VALUES (?,?,?,?)",
  )
    .bind("test-token", "first", await hash(bearer), "local-test")
    .run();
}, 30000);
afterAll(async () => {
  await proxy?.dispose();
});
describe("D1 persistence and access control", () => {
  it("checks D1 health and rejects anonymous access", async () => {
    expect((await request("/api/health")).status).toBe(200);
    expect(
      (await request("/api/characters", "GET", undefined, "invalid")).status,
    ).toBe(401);
  });
  it("persists characters and enforces ownership on reads and writes", async () => {
    const c = newCharacter("7");
    c.name = "Ownership test";
    const saved = await request(`/api/characters/${c.id}`, "PUT", c);
    expect(saved.status).toBe(200);
    expect((await request(`/api/characters/${c.id}`)).status).toBe(200);
    expect(
      (await request(`/api/characters/${c.id}`, "GET", undefined, secondToken))
        .status,
    ).toBe(404);
    expect(
      (await request(`/api/characters/${c.id}`, "PUT", c, secondToken)).status,
    ).toBe(400);
    await request(`/api/characters/${c.id}`, "DELETE", undefined, secondToken);
    expect((await request(`/api/characters/${c.id}`)).status).toBe(200);
  });
  it("rejects cross-origin writes, malformed input, and point overspending", async () => {
    const c = newCharacter();
    expect(
      (
        await request(`/api/characters/${c.id}`, "PUT", c, firstToken, {
          Origin: "https://evil.test",
        })
      ).status,
    ).toBe(403);
    expect(
      (await request(`/api/characters/${c.id}`, "PUT", { id: c.id })).status,
    ).toBe(400);
    c.skills[0].occupation = 90;
    expect((await request(`/api/characters/${c.id}`, "PUT", c)).status).toBe(
      400,
    );
  });
  it("rejects mismatched IDs and expired sessions", async () => {
    const c = newCharacter();
    expect(
      (await request(`/api/characters/${crypto.randomUUID()}`, "PUT", c))
        .status,
    ).toBe(400);
    await proxy.env.DB.prepare(
      "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES (?,?,?)",
    )
      .bind(await hash("expired"), "first", 1)
      .run();
    expect(
      (await request("/api/characters", "GET", undefined, "expired")).status,
    ).toBe(401);
  });
  it("requires an MCP bearer token, not a browser session", async () => {
    expect((await request("/mcp", "POST", {})).status).toBe(401);
    expect(
      (
        await request("/mcp", "POST", {}, firstToken, {
          Authorization: "Bearer mythos_" + "2".repeat(64),
        })
      ).status,
    ).toBe(401);
  });
  it("initializes MCP, lists tools, and creates a character over Streamable HTTP", async () => {
    const rpc = (method: string, params: unknown, id = 1) =>
      request("/mcp", "POST", { jsonrpc: "2.0", id, method, params }, "", {
        Authorization: `Bearer ${bearer}`,
        Accept: "application/json, text/event-stream",
        "MCP-Protocol-Version": "2025-03-26",
      });
    const init = await rpc("initialize", {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "test", version: "1" },
    });
    expect(init.status).toBe(200);
    expect(await init.json()).toHaveProperty(
      "result.serverInfo.name",
      "arkhive-investigator-notebook",
    );
    const tools = (await (await rpc("tools/list", {})).json()) as {
      result: { tools: { name: string }[] };
    };
    expect(tools.result.tools.map((x) => x.name)).toContain("create_character");
    const created = (await (
      await rpc("tools/call", {
        name: "create_character",
        arguments: { edition: "7", name: "MCP test", occupation: "探偵" },
      })
    ).json()) as { result: { content: { text: string }[] } };
    const data = JSON.parse(created.result.content[0].text);
    expect(data.character.name).toBe("MCP test");
    expect(data.character.stats.EDU).toBeGreaterThan(0);
    expect((await request(`/api/characters/${data.character.id}`)).status).toBe(
      200,
    );
    expect(
      (
        await request(
          `/api/characters/${data.character.id}`,
          "GET",
          undefined,
          secondToken,
        )
      ).status,
    ).toBe(404);
  });
  it("issues hashed API tokens and revokes them", async () => {
    const r = await request("/api/tokens", "POST", { name: "test client" });
    expect(r.status).toBe(201);
    const token = (await r.json()) as { id: string; token: string };
    const row = await proxy.env.DB.prepare(
      "SELECT token_hash FROM api_tokens WHERE id=?",
    )
      .bind(token.id)
      .first<{ token_hash: string }>();
    expect(row?.token_hash).not.toBe(token.token);
    expect(row?.token_hash).toBe(await hash(token.token));
    await request(`/api/tokens/${token.id}`, "DELETE");
    expect(
      await proxy.env.DB.prepare("SELECT id FROM api_tokens WHERE id=?")
        .bind(token.id)
        .first(),
    ).toBeNull();
  });
  it("handles missing Discord configuration and invalid OAuth state safely", async () => {
    const res = await request("/auth/discord");
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/?auth=setup");
    const callback = await request(
      "/auth/discord/callback?code=fake&state=wrong",
    );
    expect(callback.headers.get("Location")).toBe("/?auth=failed");
  });
});
