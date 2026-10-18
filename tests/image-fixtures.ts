import { readFileSync } from "node:fs";

// Real static WebP bitstreams (opaque, alpha, and lossless).
export const opaqueWebp = Buffer.from(
  "UklGRkAAAABXRUJQVlA4IDQAAADwAgCdASogADAAPmEwlEekIyIhJWgAgAwJZwAAKUNt8AD+6Di//kl6k/KwnvbJ3iAAAAAA",
  "base64",
);
export const alphaWebp = Buffer.from(
  "UklGRmgAAABXRUJQVlA4WAoAAAAQAAAALwAAHwAAQUxQSAoAAAABB1DAiAhERP8DVlA4IDgAAAAQAwCdASowACAAPmEulEekIqIhJWgAgAwJZwAAKa1mgAAA/u5DH/9qflZ7vvu/gy22exslSwAAAA==",
  "base64",
);
export const losslessWebp = Buffer.from(
  "UklGRhoAAABXRUJQVlA4TA0AAAAvD8AFEAcQERGIiP4HAA==",
  "base64",
);
// Actual Chrome Canvas.toBlob output, including the encoder's ICCP chunk.
export const canvasSrgbWebp = readFileSync(
  new URL("./fixtures/canvas-srgb.webp", import.meta.url),
);
export const canvasP3Webp = readFileSync(
  new URL("./fixtures/canvas-display-p3.webp", import.meta.url),
);
