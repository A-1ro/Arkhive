// Exercise the optional native packages on the current CI/development platform.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";

const require = createRequire(import.meta.url);
const wranglerRequire = createRequire(require.resolve("wrangler"));
const miniflareRequire = createRequire(wranglerRequire.resolve("miniflare"));

const tsPackage = require.resolve("typescript/package.json");
const ts = require(tsPackage);
const tsVersion = execFileSync(
  process.execPath,
  [resolve(dirname(tsPackage), ts.bin.tsc), "--version"],
  { encoding: "utf8" },
).trim();
assert.equal(tsVersion, `Version ${ts.version}`);
console.log(`TypeScript native: ${tsVersion}`);

const esbuild = wranglerRequire("esbuild");
const transformed = esbuild.transformSync("const value: number = 42", {
  loader: "ts",
});
assert.match(transformed.code, /const value = 42/);
console.log(`esbuild native: ${esbuild.version}`);

const sharp = miniflareRequire("sharp");
const image = await sharp({
  create: { width: 2, height: 2, channels: 4, background: "#006644" },
})
  .webp()
  .toBuffer();
const metadata = await sharp(image).metadata();
assert.equal(metadata.format, "webp");
assert.equal(metadata.width, 2);
assert.equal(metadata.height, 2);
console.log(`sharp native WebP encode/decode: ${sharp.versions.sharp}`);

const workerd = miniflareRequire("workerd");
const workerdVersion = execFileSync(workerd.default, ["--version"], {
  encoding: "utf8",
}).trim();
assert.equal(workerdVersion, `workerd ${workerd.compatibilityDate}`);
console.log(`workerd native: ${workerdVersion}`);
