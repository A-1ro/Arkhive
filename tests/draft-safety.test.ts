import { describe, expect, it } from "vitest";
import {
  characterSchema,
  convertEdition,
  derived,
  newCharacter,
  resourceInputLimit,
  statKeys,
  validateAllocation,
} from "../src/shared/rules";
import {
  localKey,
  readLocalDrafts,
  saveLocalDrafts,
} from "../src/client/local-drafts";
import {
  characterSizeError,
  maxCloudCharacterBytes,
  utf8Bytes,
} from "../src/shared/character-size";
import { parseCharacterBackup } from "../src/shared/character-backup";

class MemoryStorage {
  raw: string | null;
  writes = 0;
  constructor(raw: string | null) {
    this.raw = raw;
  }
  getItem(key: string) {
    expect(key).toBe(localKey);
    return this.raw;
  }
  setItem(key: string, value: string) {
    expect(key).toBe(localKey);
    this.writes++;
    this.raw = value;
  }
}

describe("edition conversion data loss regression", () => {
  it("rejects the sixth edition STR +200 conversion before it can replace a saved investigator", () => {
    const c = newCharacter("6");
    for (const key of statKeys) c.stats[key] = 12;
    c.statModifiers.STR = 200;
    expect(characterSchema.safeParse(c).success).toBe(true);
    const original = structuredClone(c);
    expect(() => convertEdition(c)).toThrow("STRの補正値");
    expect(c).toEqual(original);
  });

  it.each(statKeys)(
    "checks both signed modifier and base bounds for %s, without changing the original",
    (key) => {
      for (const modifier of [200, -200, 999, -999]) {
        const c = newCharacter("6");
        c.stats[key] = 12;
        c.statModifiers[key] = modifier;
        c.currentHP = 5;
        c.skills[0].growth = 10;
        const original = structuredClone(c);
        expect(() => convertEdition(c)).toThrow(`${key}の補正値`);
        expect(c).toEqual(original);
      }
      const c = newCharacter("6");
      c.stats[key] = 200;
      expect(() => convertEdition(c)).toThrow(`${key}の基本値`);
    },
  );

  it("round trips supported boundary values through conversion, save and reload, keeping null and zero distinct", () => {
    const c = newCharacter("6");
    c.stats.STR = 199;
    c.statModifiers.STR = 199;
    c.statModifiers.CON = -199;
    c.statModifiers.POW = 0;
    const converted = convertEdition(c);
    expect(converted.stats.STR).toBe(995);
    expect(converted.statModifiers).toMatchObject({
      STR: 995,
      CON: -995,
      POW: 0,
      DEX: null,
    });
    const store = new MemoryStorage(null);
    saveLocalDrafts(() => store, [converted], null);
    expect(readLocalDrafts(() => store)).toMatchObject({
      characters: [converted],
      error: null,
    });
    const restored = convertEdition(converted);
    expect(restored.stats).toEqual(c.stats);
    expect(restored.statModifiers).toEqual(c.statModifiers);
  });

  it("keeps all last-saved sheets when a conversion is rejected", () => {
    const c = newCharacter("6");
    c.stats.STR = 12;
    c.statModifiers.STR = 200;
    const raw = JSON.stringify([c, newCharacter()]);
    const store = new MemoryStorage(raw);
    const loaded = readLocalDrafts(() => store);
    expect(() => convertEdition(loaded.characters[0])).toThrow();
    saveLocalDrafts(() => store, loaded.characters, loaded.error);
    expect(JSON.parse(store.raw!)).toEqual(JSON.parse(raw));
    expect(readLocalDrafts(() => store).characters.map((x) => x.id)).toContain(
      c.id,
    );
  });

  it("caps editable current resource values at the schema limit without changing high derived values", () => {
    const c = newCharacter("6");
    c.stats.CON = c.stats.SIZ = c.stats.POW = 999;
    c.statModifiers.CON = c.statModifiers.SIZ = c.statModifiers.POW = 999;
    const d = derived(c);
    expect(d.hp).toBe(1998);
    expect(d.mp).toBe(1998);
    expect(resourceInputLimit(d.hp)).toBe(999);
    expect(resourceInputLimit(d.mp)).toBe(999);
    expect(resourceInputLimit(12)).toBe(12);
    expect(resourceInputLimit(-1)).toBe(0);
    c.currentHP = resourceInputLimit(d.hp);
    c.currentMP = resourceInputLimit(d.mp);
    expect(characterSchema.safeParse(c).success).toBe(true);
    expect(derived(c)).toEqual(d);
  });
});

describe("local draft preservation", () => {
  it("protects mixed valid and invalid original records from startup and later autosaves", () => {
    const invalid = { ...newCharacter("7"), statModifiers: { STR: 1000 } };
    const valid = newCharacter();
    const raw = JSON.stringify([invalid, valid], null, 2);
    const store = new MemoryStorage(raw);
    const loaded = readLocalDrafts(() => store);
    expect(loaded.characters).toEqual([valid]);
    expect(loaded.raw).toBe(raw);
    expect(loaded.error).toContain("1件");
    expect(() =>
      saveLocalDrafts(() => store, loaded.characters, loaded.error),
    ).toThrow("自動保存を停止");
    expect(() =>
      saveLocalDrafts(() => store, [newCharacter()], loaded.error),
    ).toThrow();
    expect(store.raw).toBe(raw);
    expect(store.writes).toBe(0);
  });

  it.each(["{bad", "{}", "null", "", '[{"id":"bad"}]'])(
    "preserves unparseable or entirely invalid input %j even when a fresh sheet is created",
    (raw) => {
      const store = new MemoryStorage(raw);
      const loaded = readLocalDrafts(() => store);
      expect(loaded.characters).toEqual([]);
      expect(loaded.raw).toBe(raw);
      expect(loaded.error).not.toBeNull();
      expect(() =>
        saveLocalDrafts(() => store, [newCharacter()], loaded.error),
      ).toThrow();
      expect(store.raw).toBe(raw);
      expect(store.writes).toBe(0);
    },
  );

  it("blocks writes when access to storage failed during read", () => {
    const loaded = readLocalDrafts(() => {
      throw new Error("read denied");
    });
    expect(loaded.error).not.toBeNull();
    const store = new MemoryStorage(null);
    expect(() =>
      saveLocalDrafts(() => store, [newCharacter()], loaded.error),
    ).toThrow();
    expect(store.writes).toBe(0);
  });

  it("validates every numeric upper bound before writing, and resumes after correction", () => {
    const c = newCharacter();
    const raw = JSON.stringify([c]);
    const store = new MemoryStorage(raw);
    const invalid = [
      { ...c, stats: { ...c.stats, STR: 1000 } },
      { ...c, statModifiers: { STR: 1000 } },
      { ...c, statModifiers: { STR: -1000 } },
      { ...c, luck: 1000 },
      { ...c, manualPoints: 1000 },
      { ...c, age: 100 },
      { ...c, currentHP: 1000 },
      { ...c, currentMP: 1000 },
      { ...c, currentSAN: 1000 },
      { ...c, terms: [{ stat: "STR", multiplier: 101 }] },
      { ...c, skills: [{ ...c.skills[0], growth: 1000 }] },
      { ...c, skills: [{ ...c.skills[0], modifier: -1000 }] },
      { ...c, inventory: [{ name: "鍵", quantity: 1000, notes: "" }] },
      { ...c, inventory: [{ name: "鍵", quantity: 1.5, notes: "" }] },
      {
        ...c,
        inventory: Array(181).fill({ name: "", quantity: null, notes: "" }),
      },
      { ...c, weapons: Array(101).fill({ name: "" }) },
      { ...c, skills: Array(181).fill(c.skills[0]) },
      { ...c, terms: Array(9).fill({ stat: "STR", multiplier: 1 }) },
    ];
    for (const bad of invalid) {
      expect(() => saveLocalDrafts(() => store, [bad], null)).toThrow(
        "保存形式",
      );
      expect(store.raw).toBe(raw);
    }
    expect(store.writes).toBe(0);
    c.name = "修正後";
    saveLocalDrafts(() => store, [c], null);
    expect(readLocalDrafts(() => store).characters[0].name).toBe("修正後");
  });

  it("allows a new or empty store and keeps edits recoverable on quota failure", () => {
    for (const raw of [null, "[]"]) {
      const store = new MemoryStorage(raw);
      const loaded = readLocalDrafts(() => store);
      expect(loaded.error).toBeNull();
      saveLocalDrafts(() => store, [newCharacter()], loaded.error);
      expect(readLocalDrafts(() => store).characters).toHaveLength(1);
    }
    expect(() =>
      saveLocalDrafts(
        () => ({
          setItem: () => {
            throw new Error("quota");
          },
        }),
        [newCharacter()],
        null,
      ),
    ).toThrow("JSON出力");
  });
});

describe("UTF-8 cloud size limits and recoverable backups", () => {
  it("preserves all 90 Japanese notes locally and through a pretty-printed backup while explaining the cloud limit", () => {
    const c = newCharacter();
    c.inventory = Array.from({ length: 90 }, (_, i) => ({
      name: `装備${i}`,
      quantity: null,
      notes: "あ".repeat(1000),
    }));
    const before = structuredClone(c);
    expect(characterSchema.safeParse(c).success).toBe(true);
    expect(utf8Bytes(JSON.stringify(c))).toBeGreaterThan(270000);
    expect(characterSizeError(c)).toContain("240 KiB");
    expect(validateAllocation(c)).toContain(characterSizeError(c));
    const store = new MemoryStorage(null);
    saveLocalDrafts(() => store, [c], null);
    expect(readLocalDrafts(() => store).characters).toEqual([before]);
    expect(parseCharacterBackup(JSON.stringify(c, null, 2))).toEqual(before);
    c.inventory = c.inventory.slice(0, 1);
    expect(characterSizeError(c)).toBeNull();
    saveLocalDrafts(() => store, [c], null);
    expect(readLocalDrafts(() => store).characters).toEqual([c]);
  });

  it("checks exact byte boundaries and multibyte content rather than character counts", () => {
    const base = utf8Bytes(JSON.stringify({ text: "" }));
    expect(
      characterSizeError({ text: "x".repeat(maxCloudCharacterBytes - base) }),
    ).toBeNull();
    expect(
      characterSizeError({
        text: "x".repeat(maxCloudCharacterBytes - base + 1),
      }),
    ).not.toBeNull();
    expect(characterSizeError({ text: "あ".repeat(90000) })).not.toBeNull();
    expect(characterSizeError({ text: "x".repeat(90000) })).toBeNull();
  });

  it("can read its own largest structured backup including maximum skill, item and weapon counts", () => {
    const c = newCharacter();
    c.notes = "あ".repeat(20000);
    for (const key of [
      "appearance",
      "belief",
      "importantPeople",
      "meaningfulPlaces",
      "treasuredPossessions",
      "traits",
    ] as const)
      c[key] = "あ".repeat(4000);
    c.skills = Array.from({ length: 180 }, (_, i) => ({
      ...c.skills[0],
      id: String(i),
      name: "あ".repeat(100),
      category: "あ".repeat(30),
    }));
    c.inventory = Array.from({ length: 180 }, () => ({
      name: "あ".repeat(100),
      quantity: 999,
      notes: "あ".repeat(1000),
    }));
    const text = "あ".repeat(100);
    c.weapons = Array.from({ length: 100 }, () => ({
      name: text,
      skill: text,
      damage: text,
      range: text,
      attacks: text,
      ammo: text,
      malfunction: text,
      durability: text,
      notes: "あ".repeat(1000),
    }));
    expect(characterSchema.safeParse(c).success).toBe(true);
    expect(parseCharacterBackup(JSON.stringify(c, null, 2))).toEqual(c);
  });

  it("still rejects malformed or excessively large backup files without changing an existing store", () => {
    expect(() => parseCharacterBackup("{bad")).toThrow();
    expect(() =>
      parseCharacterBackup(
        JSON.stringify({
          ...newCharacter(),
          notes: "あ".repeat(2 * 1024 * 1024),
        }),
      ),
    ).toThrow("5 MiB");
    expect(() =>
      parseCharacterBackup(
        JSON.stringify({ ...newCharacter(), statModifiers: { STR: 1000 } }),
      ),
    ).toThrow();
  });
});
