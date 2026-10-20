import { newCharacter } from "../src/shared/rules";
import { utf8Bytes } from "../src/shared/character-size";

/** A schema-valid sheet with exactly the requested UTF-8 JSON byte count. */
export function sizedCharacter(bytes: number) {
  const c = newCharacter();
  c.inventory = Array.from({ length: 90 }, () => ({
    name: "装備",
    quantity: null,
    notes: "",
  }));
  let remaining = bytes - utf8Bytes(JSON.stringify(c));
  for (const item of c.inventory) {
    const length = Math.min(3000, remaining);
    item.notes =
      "あ".repeat(Math.floor(length / 3)) +
      (length % 3 === 2 ? "é" : length % 3 === 1 ? "x" : "");
    remaining -= length;
  }
  if (remaining !== 0) throw new Error("Fixture size is out of range");
  return c;
}
