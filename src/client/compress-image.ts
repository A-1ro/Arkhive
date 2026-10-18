import {
  maxImageBytes,
  maxImageDimension,
  maxSourceImageBytes,
} from "../shared/images";

export async function compressImage(file: File): Promise<Blob> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new Error("JPEG・PNG・WebPの画像を選択してください");
  if (!file.size || file.size > maxSourceImageBytes)
    throw new Error("20MB以下の画像を選択してください");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("画像を読み込めません。別の画像を選択してください");
  }
  const canvas = document.createElement("canvas");
  try {
    const context = canvas.getContext("2d");
    if (!context) throw new Error("このブラウザーでは画像を圧縮できません");
    const scale = Math.min(
      1,
      maxImageDimension / Math.max(bitmap.width, bitmap.height),
    );
    let width = Math.max(1, Math.round(bitmap.width * scale));
    let height = Math.max(1, Math.round(bitmap.height * scale));
    // Re-encoding keeps transparency, flattens animation, and discards source metadata.
    for (let attempt = 0; attempt < 6; attempt++) {
      canvas.width = width;
      canvas.height = height;
      context.imageSmoothingQuality = "high";
      context.drawImage(bitmap, 0, 0, width, height);
      for (const quality of [0.82, 0.7, 0.58]) {
        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, "image/webp", quality),
        );
        if (!blob || blob.type !== "image/webp")
          throw new Error(
            "このブラウザーではWebPに圧縮できません。最新版のブラウザーをお試しください",
          );
        if (blob.size > 0 && blob.size <= maxImageBytes) return blob;
      }
      width = Math.max(1, Math.round(width * 0.75));
      height = Math.max(1, Math.round(height * 0.75));
    }
    throw new Error(
      "画像を256KB以下に圧縮できません。別の画像を選択してください",
    );
  } finally {
    bitmap.close();
    canvas.width = canvas.height = 0;
  }
}
