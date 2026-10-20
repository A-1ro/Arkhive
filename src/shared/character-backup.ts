import { characterSchema } from "./rules";
import { maxBackupBytes, utf8Bytes } from "./character-size";

export function parseCharacterBackup(text: string) {
  if (utf8Bytes(text) > maxBackupBytes)
    throw new Error(
      "JSONの読み込み上限5 MiBを超えています。元のファイルは変更していません。",
    );
  return characterSchema.parse(JSON.parse(text));
}
