import { afterEach, describe, expect, it, vi } from "vitest";
import { compressImage } from "../src/client/compress-image";
import { webpDimensions } from "../src/server/images";
import { opaqueWebp, alphaWebp, losslessWebp } from "./image-fixtures";
import { maxImageBytes } from "../src/shared/images";

afterEach(() => vi.unstubAllGlobals());
function setupCanvas(
  width: number,
  height: number,
  encode: (width: number, quality: number) => Blob | null,
) {
  const bitmap = { width, height, close: vi.fn() };
  const context = { drawImage: vi.fn(), imageSmoothingQuality: "" };
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => context,
    toBlob(
      callback: (blob: Blob | null) => void,
      type: string,
      quality: number,
    ) {
      callback(encode(this.width, quality));
    },
  };
  vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue(bitmap));
  vi.stubGlobal("document", { createElement: () => canvas });
  return { bitmap, context, canvas };
}
const source = () =>
  new File(["source"], "portrait.png", { type: "image/png" });
describe("browser image compression", () => {
  it("resizes with aspect ratio preserved, outputs WebP, and releases decoded pixels", async () => {
    const { bitmap, context, canvas } = setupCanvas(
      3000,
      2000,
      () => new Blob(["encoded"], { type: "image/webp" }),
    );
    const blob = await compressImage(source());
    expect(blob.type).toBe("image/webp");
    expect(context.drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 1024, 683);
    expect(bitmap.close).toHaveBeenCalledOnce();
    expect(canvas.width).toBe(0);
  });
  it("reduces resolution when quality changes alone cannot meet the storage cap", async () => {
    const { bitmap, context } = setupCanvas(
      2048,
      4096,
      (width) =>
        new Blob([new Uint8Array(width > 384 ? maxImageBytes + 1 : 100)], {
          type: "image/webp",
        }),
    );
    expect((await compressImage(source())).size).toBeLessThanOrEqual(
      maxImageBytes,
    );
    expect(context.drawImage).toHaveBeenLastCalledWith(bitmap, 0, 0, 384, 768);
    expect(bitmap.close).toHaveBeenCalledOnce();
  });
  it("does not upscale small source images", async () => {
    const { bitmap, context } = setupCanvas(
      20,
      40,
      () => new Blob(["encoded"], { type: "image/webp" }),
    );
    await compressImage(source());
    expect(context.drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 20, 40);
  });
  it("rejects browsers silently falling back to PNG, and always releases decoded pixels", async () => {
    const { bitmap } = setupCanvas(
      500,
      500,
      () => new Blob(["png"], { type: "image/png" }),
    );
    await expect(compressImage(source())).rejects.toThrow("WebP");
    expect(bitmap.close).toHaveBeenCalledOnce();
  });
  it("rejects unsupported and oversized originals before decoding", async () => {
    const decode = vi.fn();
    vi.stubGlobal("createImageBitmap", decode);
    await expect(
      compressImage(
        new File(["<svg/>"], "image.svg", { type: "image/svg+xml" }),
      ),
    ).rejects.toThrow("JPEG");
    await expect(
      compressImage(
        new File([new Uint8Array(20 * 1024 * 1024 + 1)], "huge.png", {
          type: "image/png",
        }),
      ),
    ).rejects.toThrow("20MB");
    expect(decode).not.toHaveBeenCalled();
  });
});
describe("WebP validation", () => {
  it.each([
    [opaqueWebp, 32, 48],
    [alphaWebp, 48, 32],
    [losslessWebp, 16, 24],
  ] as const)(
    "accepts static lossy, transparent, and lossless encodings",
    (bytes, width, height) => {
      expect(webpDimensions(Uint8Array.from(bytes).buffer)).toEqual({
        width,
        height,
      });
    },
  );
  it("rejects a valid canvas header with an oversized actual image frame", () => {
    const bytes = Buffer.from(alphaWebp);
    bytes.writeUInt16LE(2048, bytes.indexOf("VP8 ") + 8 + 6);
    expect(webpDimensions(Uint8Array.from(bytes).buffer)).toBeNull();
  });
});
