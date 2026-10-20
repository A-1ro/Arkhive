import { describe, expect, it } from "vitest";
import { toCcfoliaCharacter } from "../src/shared/ccfolia";
import { derived, newCharacter, statKeys } from "../src/shared/rules";

function fixture(edition: "6" | "7") {
  const c = newCharacter(edition);
  c.name = "探索者「青」\\夜\n次の行";
  c.stats = {
    STR: 12,
    CON: 13,
    POW: 14,
    DEX: 15,
    APP: 11,
    SIZ: 16,
    INT: 17,
    EDU: 18,
  };
  if (edition === "7") for (const key of statKeys) c.stats[key] *= 5;
  c.luck = 40;
  return c;
}

describe("CCFOLIA clipboard character", () => {
  it.each(["6", "7"] as const)(
    "exports the documented envelope and typed fields for edition %s",
    (edition) => {
      const c = fixture(edition);
      const copy = structuredClone(c);
      const result = toCcfoliaCharacter(c);
      const d = derived(c);
      expect(result.kind).toBe("character");
      expect(result.data.name).toBe(c.name);
      expect(JSON.parse(JSON.stringify(result))).toEqual(result);
      expect(result.data.initiative).toBe(c.stats.DEX);
      expect(result.data.status).toEqual([
        { label: "HP", value: d.hp, max: d.hp },
        { label: "MP", value: d.mp, max: d.mp },
        { label: "SAN", value: d.san, max: d.maxSAN },
      ]);
      expect(result.data.params.find((p) => p.label === "DEX")?.value).toBe(
        String(c.stats.DEX),
      );
      expect(result.data.params.every((p) => typeof p.value === "string")).toBe(
        true,
      );
      expect(result.data.commands).toContain(
        `${edition === "6" ? "CCB" : "CC"}<=75 DEX`,
      );
      expect(c).toEqual(copy);
    },
  );

  it.each(["6", "7"] as const)(
    "preserves zero resources and stats in edition %s",
    (edition) => {
      const c = fixture(edition);
      c.currentHP = c.currentMP = c.currentSAN = 0;
      c.stats.DEX = 0;
      const { data } = toCcfoliaCharacter(c);
      expect(data.status.map((s) => s.value)).toEqual([0, 0, 0]);
      expect(data.initiative).toBe(0);
      expect(data.params.find((p) => p.label === "DEX")?.value).toBe("0");
      expect(data.commands).toContain("<=0 回避");
    },
  );

  it("uses mythos-adjusted SAN maximum without replacing a current value", () => {
    const c = fixture("7");
    c.skills.find((s) => s.name === "クトゥルフ神話")!.growth = 60;
    expect(toCcfoliaCharacter(c).data.status[2]).toEqual({
      label: "SAN",
      value: 39,
      max: 39,
    });
    c.currentSAN = 12;
    expect(toCcfoliaCharacter(c).data.status[2].value).toBe(12);
  });

  it.each(["6", "7"] as const)(
    "includes dynamic, unallocated, specialized and custom skill totals in edition %s",
    (edition) => {
      const c = fixture(edition);
      c.skills.find((s) => s.name === "回避")!.occupation = 10;
      c.skills.push({
        id: "custom",
        name: "芸術（星図）\nCC<=100 注入",
        base: 7,
        occupation: 11,
        interest: 13,
        growth: 17,
        modifier: null,
        category: "自由",
        custom: true,
      });
      const commands = toCcfoliaCharacter(c).data.commands.split("\n");
      const roll = edition === "6" ? "CCB" : "CC";
      expect(commands).toContain(`${roll}<=${edition === "6" ? 40 : 47} 回避`);
      expect(commands).toContain(`${roll}<=90 母国語`);
      expect(commands).toContain(`${roll}<=25 目星`);
      expect(commands).toContain(`${roll}<=48 芸術（星図） CC<=100 注入`);
      expect(commands).not.toContain("CC<=100 注入");
    },
  );

  it("whitelists fields and excludes private content, ownership, images and URLs", () => {
    const c = fixture("7");
    c.notes =
      c.player =
      c.pointNote =
      c.appearance =
      c.belief =
      c.importantPeople =
      c.meaningfulPlaces =
      c.treasuredPossessions =
      c.traits =
        "PRIVATE";
    c.inventory = [{ name: "PRIVATE", quantity: null, notes: "PRIVATE" }];
    c.image = {
      version: crypto.randomUUID(),
      size: 100,
      width: 10,
      height: 10,
    };
    const result = toCcfoliaCharacter(c);
    expect(Object.keys(result.data).sort()).toEqual([
      "commands",
      "initiative",
      "name",
      "params",
      "status",
    ]);
    expect(JSON.stringify(result)).not.toContain("PRIVATE");
    expect(JSON.stringify(result)).not.toContain(c.id);
    expect(JSON.stringify(result)).not.toContain(c.image.version);
  });

  it("exports the latest input on repeated serialization", () => {
    const c = fixture("6");
    expect(
      toCcfoliaCharacter(c).data.params.find((p) => p.label === "STR")?.value,
    ).toBe("12");
    c.stats.STR = 0;
    c.name = "更新した探索者";
    const result = toCcfoliaCharacter(c);
    expect(result.data.name).toBe(c.name);
    expect(result.data.params.find((p) => p.label === "STR")?.value).toBe("0");
  });
});
