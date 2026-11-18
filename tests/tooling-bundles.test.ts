import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const wranglerRequire = createRequire(require.resolve("wrangler"));
const { parseWithReadableStreams } = wranglerRequire("miniflare");

describe("Miniflare's bundled deserializer", () => {
  it("preserves ordinary values through the Node/workerd bridge", () => {
    expect(
      parseWithReadableStreams({}, { value: '[{"safe":1},true]' }),
    ).toEqual({ safe: true });
  });

  it("rejects coerced null-object keys (GHSA-4q55-j62x-fr9h)", () => {
    expect(() =>
      parseWithReadableStreams(
        {},
        { value: '[["null",["__proto__"],1],true]' },
      ),
    ).toThrow();
  });
});
