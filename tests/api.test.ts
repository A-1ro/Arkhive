import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getPlatformProxy, type PlatformProxy } from "wrangler";
import { readFile } from "node:fs/promises";
import app from "../src/server/index";
import { hash } from "../src/server/auth";
import { newCharacter } from "../src/shared/rules";
import { canonicalOrigin, legacyOrigins } from "../src/shared/origins";
import { opaqueWebp, alphaWebp } from "./image-fixtures";
import { characterImageKey } from "../src/server/images";
let proxy: PlatformProxy<CloudflareBindings>;
const firstToken = "first-user-local-test-token";
const secondToken = "second-user-local-test-token";
const bearer = "ark_at_" + "1".repeat(64);
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
  await proxy.env.DB.batch([
    proxy.env.DB.prepare(
      "INSERT INTO oauth_clients(id,name,redirect_uris,auth_method,created_at) VALUES ('test-client','Test','[]','none',?)",
    ).bind(Date.now()),
    proxy.env.DB.prepare(
      "INSERT INTO oauth_grants(id,user_id,client_id,resource,scope,created_at,expires_at) VALUES ('test-grant','first','test-client','https://mythos.test/mcp','mcp',?,?)",
    ).bind(Date.now(), Date.now() + 60000),
    proxy.env.DB.prepare(
      "INSERT INTO oauth_tokens(token_hash,grant_id,kind,expires_at) VALUES (?,'test-grant','access',?)",
    ).bind(await hash(bearer), Date.now() + 60000),
  ]);
}, 30000);
afterAll(async () => {
  await proxy?.dispose();
});
const imageRequest = (
  id: string,
  body: Uint8Array = opaqueWebp,
  cookie = firstToken,
  headers: Record<string, string> = {},
) =>
  app.request(
    `https://mythos.test/api/characters/${id}/image`,
    {
      method: "PUT",
      headers: {
        Cookie: `mythos_session=${cookie}`,
        "Content-Type": "image/webp",
        ...headers,
      },
      body,
    },
    proxy.env,
  );

describe("private R2 character images", () => {
  it("stores compressed images, preserves references on stale saves, replaces and cleans up objects", async () => {
    const c = newCharacter();
    await request(`/api/characters/${c.id}`, "PUT", c);
    expect((await request(`/api/characters/${c.id}/image`)).status).toBe(404);
    const upload = await imageRequest(c.id);
    expect(upload.status).toBe(200);
    const { image } = (await upload.json()) as {
      image: { version: string; size: number; width: number; height: number };
    };
    expect(image).toMatchObject({
      size: opaqueWebp.length,
      width: 32,
      height: 48,
    });
    const response = await request(
      `/api/characters/${c.id}/image?v=${image.version}`,
    );
    expect(response.headers.get("Content-Type")).toBe("image/webp");
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(Buffer.from(await response.arrayBuffer())).toEqual(opaqueWebp);
    expect(
      await (await request(`/api/characters/${c.id}`)).json(),
    ).toHaveProperty("image", image);
    expect(await (await request("/api/characters")).json()).toContainEqual(
      expect.objectContaining({ id: c.id, image }),
    );
    // Both browser and MCP saves use this path; their JSON cannot unset or forge an attachment.
    c.name = "Updated after upload";
    const saved = await request(`/api/characters/${c.id}`, "PUT", c);
    expect(await saved.json()).toMatchObject({ name: c.name, image });
    c.image = { ...image, version: crypto.randomUUID() };
    expect(
      await (await request(`/api/characters/${c.id}`, "PUT", c)).json(),
    ).toHaveProperty("image", image);
    const replacement = await imageRequest(c.id, alphaWebp);
    const replaced = (await replacement.json()) as {
      image: { version: string };
    };
    expect(replacement.status).toBe(200);
    expect(replaced.image.version).not.toBe(image.version);
    expect(
      (
        await proxy.env.CHARACTER_IMAGES.list({
          prefix: characterImageKey("first", c.id),
        })
      ).objects,
    ).toHaveLength(1);
    expect(
      Buffer.from(
        await (await request(`/api/characters/${c.id}/image`)).arrayBuffer(),
      ),
    ).toEqual(alphaWebp);
    expect(
      (await request(`/api/characters/${c.id}/image`, "DELETE")).status,
    ).toBe(200);
    expect(
      await (await request(`/api/characters/${c.id}`)).json(),
    ).toHaveProperty("image", null);
    expect(
      await proxy.env.CHARACTER_IMAGES.head(characterImageKey("first", c.id)),
    ).toBeNull();
    await imageRequest(c.id);
    await request(`/api/characters/${c.id}`, "DELETE");
    expect(
      await proxy.env.CHARACTER_IMAGES.head(characterImageKey("first", c.id)),
    ).toBeNull();
  });
  it("requires ownership and rejects CSRF for every image operation", async () => {
    const c = newCharacter();
    await request(`/api/characters/${c.id}`, "PUT", c);
    await imageRequest(c.id);
    for (const method of ["GET", "DELETE"]) {
      expect(
        (await request(`/api/characters/${c.id}/image`, method, undefined, ""))
          .status,
      ).toBe(401);
      expect(
        (
          await request(
            `/api/characters/${c.id}/image`,
            method,
            undefined,
            secondToken,
          )
        ).status,
      ).toBe(404);
    }
    expect((await imageRequest(c.id, opaqueWebp, "")).status).toBe(401);
    expect((await imageRequest(c.id, opaqueWebp, secondToken)).status).toBe(
      404,
    );
    expect(
      (
        await imageRequest(c.id, opaqueWebp, firstToken, {
          Origin: "https://evil.test",
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(
          `/api/characters/${c.id}/image`,
          "DELETE",
          undefined,
          firstToken,
          { Origin: "https://evil.test" },
        )
      ).status,
    ).toBe(403);
    expect((await imageRequest(crypto.randomUUID())).status).toBe(404);
    expect(
      Buffer.from(
        await (await request(`/api/characters/${c.id}/image`)).arrayBuffer(),
      ),
    ).toEqual(opaqueWebp);
    await request(`/api/characters/${c.id}`, "DELETE");
  });
  it("rejects oversized, spoofed, malformed, and animated uploads without replacing the saved image", async () => {
    const c = newCharacter();
    await request(`/api/characters/${c.id}`, "PUT", c);
    await imageRequest(c.id);
    expect(
      (
        await imageRequest(c.id, opaqueWebp, firstToken, {
          "Content-Type": "image/png",
        })
      ).status,
    ).toBe(415);
    expect(
      (await imageRequest(c.id, new Uint8Array(256 * 1024 + 1))).status,
    ).toBe(413);
    const largeDimensions = Buffer.from(opaqueWebp);
    largeDimensions.writeUInt16LE(1025, 26);
    const animated = Buffer.from(alphaWebp);
    animated[20] |= 2;
    for (const invalid of [
      new Uint8Array(),
      Buffer.from("not an image"),
      opaqueWebp.subarray(0, 25),
      largeDimensions,
      animated,
    ])
      expect((await imageRequest(c.id, invalid)).status).toBe(400);
    expect(
      Buffer.from(
        await (await request(`/api/characters/${c.id}/image`)).arrayBuffer(),
      ),
    ).toEqual(opaqueWebp);
    await request(`/api/characters/${c.id}`, "DELETE");
  });
});
describe("D1 persistence and access control", () => {
  it("serves immutable asset responses with security headers", async () => {
    const asset = await fetch("data:text/html,<title>Arkhive</title>");
    expect(() => asset.headers.set("X-Test", "value")).toThrow();
    const response = await app.request(
      `${canonicalOrigin}/`,
      {},
      {
        ...proxy.env,
        ASSETS: { ...proxy.env.ASSETS, fetch: async () => asset },
      },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Content-Security-Policy")).toContain(
      "frame-src",
    );
    expect(await response.text()).toContain("Arkhive");
  });
  it("redirects both retired hosts while keeping their draft export endpoints available", async () => {
    for (const origin of legacyOrigins) {
      const redirect = await app.request(
        `${origin}/?character=example`,
        {},
        proxy.env,
      );
      expect(redirect.status).toBe(308);
      expect(redirect.headers.get("Location")).toBe(
        `${canonicalOrigin}/?character=example`,
      );
      const migration = await app.request(`${origin}/migrate`, {}, proxy.env);
      expect(migration.status).toBe(200);
      expect(migration.headers.get("Content-Security-Policy")).toContain(
        `frame-ancestors ${canonicalOrigin}`,
      );
    }
  });
  it("uses the custom-domain callback for Discord OAuth", async () => {
    const response = await app.request(
      `${canonicalOrigin}/auth/discord`,
      {},
      {
        ...proxy.env,
        DISCORD_CLIENT_ID: "test-client",
        DISCORD_CLIENT_SECRET: "test-secret",
      },
    );
    expect(response.status).toBe(302);
    const authorize = new URL(response.headers.get("Location")!);
    expect(authorize.origin).toBe("https://discord.com");
    expect(authorize.searchParams.get("redirect_uri")).toBe(
      `${canonicalOrigin}/auth/discord/callback`,
    );
  });
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
  it("retires manual API token issuance", async () => {
    expect(
      (await request("/api/tokens", "POST", { name: "test client" })).status,
    ).toBe(410);
    expect(
      (
        await request("/mcp", "POST", {}, firstToken, {
          Authorization: "Bearer mythos_" + "1".repeat(64),
        })
      ).status,
    ).toBe(401);
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
