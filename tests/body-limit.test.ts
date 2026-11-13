import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";

describe("bodyLimit resource bounds (GHSA-39q9-qp46-w8xg)", () => {
  // Keep this fixture small: detect per-transfer-chunk retention without OOM.
  const maxSize = 256 * 1024;
  const payloadSize = 32 * 1024;

  it("does not forward tens of thousands of tiny retained body objects", async () => {
    const app = new Hono();
    app.use("*", bodyLimit({ maxSize }));
    app.post("/upload", async (c) => {
      const reader = c.req.raw.body!.getReader();
      let chunks = 0;
      let bytes = 0;
      let sum = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks++;
        bytes += value.byteLength;
        for (const byte of value) sum += byte;
      }
      return c.json({ chunks, bytes, sum });
    });
    let sent = 0;
    const request = new Request("https://local.test/upload", {
      method: "POST",
      // No Content-Length: exercise the stream-reading size guard.
      body: new ReadableStream<Uint8Array>({
        pull(controller) {
          if (sent === payloadSize) return controller.close();
          controller.enqueue(new Uint8Array([sent++ % 251]));
        },
      }),
      duplex: "half",
    } as RequestInit);
    const response = await app.fetch(request);
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.bytes).toBe(payloadSize);
    expect(result.sum).toBe(
      Array.from({ length: payloadSize }, (_, i) => i % 251).reduce(
        (a, b) => a + b,
        0,
      ),
    );
    // Permit bounded buffering strategies; reject one retained object per byte.
    expect(result.chunks).toBeLessThanOrEqual(32);
  });
});
