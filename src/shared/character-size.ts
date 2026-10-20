// Leave 16 KiB within the existing 256 KiB request cap for MCP/JSON envelopes.
export const maxCloudCharacterBytes = 240 * 1024;
// Includes all schema-valid sheets, even large local-only drafts and indented backups.
export const maxBackupBytes = 5 * 1024 * 1024;

export function utf8Bytes(text: string) {
  return new TextEncoder().encode(text).byteLength;
}
export function characterSizeError(character: unknown): string | null {
  const size = utf8Bytes(JSON.stringify(character));
  return size > maxCloudCharacterBytes
    ? `探索者データがクラウド保存の上限240 KiBを超えています（${size.toLocaleString("ja-JP")}バイト）。所持品・武器・メモなどの内容を減らしてください。端末保存とJSON出力は利用でき、内容は切り捨てません。`
    : null;
}
