import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getPlatformProxy, type PlatformProxy } from "wrangler";
import app from "../src/server/index";

let proxy: PlatformProxy<CloudflareBindings>;
beforeAll(async () => {
  proxy = await getPlatformProxy<CloudflareBindings>({
    persist: false,
    remoteBindings: false,
    envFiles: [],
  });
});
afterAll(async () => {
  await proxy?.dispose();
});

describe("middleware on paths with encoded line terminators", () => {
  it.each(["%0A", "%0D", "%E2%80%A8", "%E2%80%A9"])(
    "keeps authentication and response protections for %s",
    async (encoded) => {
      for (const prefix of ["characters", "connections"]) {
        const response = await app.request(
          `https://mythos.test/api/${prefix}/${encoded}/unknown`,
          {},
          proxy.env,
        );
        expect(response.status).toBe(401);
        expect(response.headers.get("Cache-Control")).toBe("no-store");
        expect(response.headers.get("Content-Security-Policy")).toContain(
          "frame-ancestors 'none'",
        );
      }
      const retired = await app.request(
        `https://mythos.test/api/tokens/${encoded}`,
        {},
        proxy.env,
      );
      expect(retired.status).toBe(410);
      expect(retired.headers.get("Cache-Control")).toBe("no-store");
      const unknown = await app.request(
        `https://mythos.test/oauth/${encoded}/unknown`,
        {},
        proxy.env,
      );
      expect(unknown.status).toBe(404);
      expect(unknown.headers.get("Cache-Control")).toBe("no-store");
      expect(unknown.headers.get("Referrer-Policy")).toBe("same-origin");
      expect(unknown.headers.get("Content-Security-Policy")).toContain(
        "frame-ancestors 'none'",
      );
    },
  );

  it("keeps API cache protection on a prefix wildcard handler", async () => {
    const response = await app.request(
      "https://mythos.test/api/tokens/retired",
      {},
      proxy.env,
    );
    expect(response.status).toBe(410);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it.each(["%0A", "%0D", "%E2%80%A8", "%E2%80%A9"])(
    "keeps the origin check and request size limit for %s",
    async (encoded) => {
      const url = `https://mythos.test/unknown/${encoded}`;
      const crossOrigin = await app.request(
        url,
        { method: "POST", headers: { Origin: "https://evil.test" } },
        proxy.env,
      );
      expect(crossOrigin.status).toBe(403);
      const oversized = await app.request(
        url,
        { method: "POST", body: "x".repeat(256 * 1024 + 1) },
        proxy.env,
      );
      expect(oversized.status).toBe(413);
      expect(oversized.headers.get("X-Content-Type-Options")).toBe("nosniff");
    },
  );
});
