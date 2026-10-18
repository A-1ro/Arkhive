import { describe, expect, it } from "vitest";
import {
  derived,
  interestPoints,
  makeSkills,
  newCharacter,
  occupationPoints,
  rollStat,
  rollAll,
  skillBase,
  statKeys,
  validateAllocation,
} from "../src/shared/rules";
describe("edition-specific character rules", () => {
  it("rolls sixth edition dice within the appropriate ranges", () => {
    for (let i = 0; i < 100; i++)
      for (const k of statKeys) {
        const r = rollStat(k, "6");
        const min = k === "SIZ" || k === "INT" ? 8 : k === "EDU" ? 6 : 3;
        const max = k === "SIZ" || k === "INT" ? 18 : k === "EDU" ? 21 : 18;
        expect(r.value).toBeGreaterThanOrEqual(min);
        expect(r.value).toBeLessThanOrEqual(max);
        expect(r.value).toBe(r.dice.reduce((a, b) => a + b, 0) + r.bonus);
      }
  });
  it("rolls seventh edition characteristics on the 5-point scale", () => {
    for (let i = 0; i < 100; i++)
      for (const k of statKeys) {
        const r = rollStat(k, "7");
        expect(r.value % 5).toBe(0);
        expect(r.value).toBeGreaterThanOrEqual(
          ["SIZ", "INT", "EDU"].includes(k) ? 40 : 15,
        );
        expect(r.value).toBeLessThanOrEqual(90);
      }
  });
  it("uses POW for sixth edition luck and separate seventh edition luck", () => {
    const six = rollAll(newCharacter("6"));
    expect(derived(six).luck).toBe(six.stats.POW * 5);
    const seven = rollAll(newCharacter("7"));
    expect(seven.luck).toBeGreaterThanOrEqual(15);
  });
  it("uses EDU by default, arbitrary stat terms, and manual points", () => {
    const c = newCharacter("7");
    c.stats.EDU = 65;
    c.stats.DEX = 70;
    c.stats.INT = 60;
    expect(occupationPoints(c)).toBe(260);
    expect(interestPoints(c)).toBe(120);
    c.pointMode = "combination";
    c.terms = [
      { stat: "EDU", multiplier: 2 },
      { stat: "DEX", multiplier: 2 },
    ];
    expect(occupationPoints(c)).toBe(270);
    c.pointMode = "manual";
    c.manualPoints = 315;
    expect(occupationPoints(c)).toBe(315);
    const six = newCharacter("6");
    six.stats.EDU = 15;
    six.stats.INT = 12;
    expect(occupationPoints(six)).toBe(300);
    expect(interestPoints(six)).toBe(120);
  });
  it("rounds HP differently in the two editions", () => {
    const six = newCharacter("6");
    six.stats.CON = 12;
    six.stats.SIZ = 13;
    expect(derived(six).hp).toBe(13);
    const seven = newCharacter("7");
    seven.stats.CON = 60;
    seven.stats.SIZ = 65;
    expect(derived(seven).hp).toBe(12);
  });
  it("calculates damage bonus and build at boundaries", () => {
    const c = newCharacter("7");
    for (const [total, db, build] of [
      [64, "−2", -2],
      [65, "−1", -1],
      [84, "−1", -1],
      [85, "0", 0],
      [124, "0", 0],
      [125, "+1D4", 1],
      [164, "+1D4", 1],
      [165, "+1D6", 2],
      [204, "+1D6", 2],
      [205, "+2D6", 3],
      [284, "+2D6", 3],
      [285, "+3D6", 4],
    ] as const) {
      c.stats.STR = total;
      c.stats.SIZ = 0;
      expect(derived(c).db).toBe(db);
      expect(derived(c).build).toBe(build);
    }
  });
  it("derives Dodge and Own Language without overwriting allocations", () => {
    for (const edition of ["6", "7"] as const) {
      const c = newCharacter(edition);
      c.stats.DEX = edition === "6" ? 13 : 65;
      c.stats.EDU = edition === "6" ? 15 : 75;
      const dodge = c.skills.find((s) => s.name === "回避")!;
      const lang = c.skills.find((s) => s.name === "母国語")!;
      expect(skillBase(dodge, c)).toBe(edition === "6" ? 26 : 32);
      expect(skillBase(lang, c)).toBe(75);
    }
  });
  it("uses official edition-specific Japanese names and bases", () => {
    const six = makeSkills("6");
    const seven = makeSkills("7");
    expect(six.find((s) => s.name === "こぶし")?.base).toBe(50);
    expect(six.find((s) => s.name === "図書館")?.base).toBe(25);
    expect(seven.find((s) => s.name === "図書館")?.base).toBe(20);
    expect(seven.find((s) => s.name === "近接戦闘（格闘）")?.base).toBe(25);
    expect(seven.some((s) => s.name === "隠れる")).toBe(false);
    expect(new Set(seven.map((s) => s.name)).size).toBe(seven.length);
  });
  it("rejects overspending, excessive skill totals, and Mythos point allocation", () => {
    const c = newCharacter("7");
    c.skills[0].occupation = 100;
    expect(validateAllocation(c)).toContain("職業ポイントが上限を超えています");
    expect(validateAllocation(c)).toContain("技能値が99を超えています");
    c.skills.find((s) => s.name === "クトゥルフ神話")!.interest = 1;
    expect(validateAllocation(c)).toContain(
      "クトゥルフ神話には職業・興味ポイントを割り振れません",
    );
  });
  it("allows an EDU 21 sixth-edition investigator to be saved", () => {
    const c = newCharacter("6");
    c.stats.EDU = 21;
    expect(
      skillBase(
        c.skills.find((s) => s.name === "母国語")!,
        c,
      ),
    ).toBe(99);
    expect(derived(c).knowledge).toBe(99);
    expect(validateAllocation(c)).toEqual([]);
  });
  it("subtracts Mythos knowledge from maximum SAN", () => {
    const c = newCharacter("7");
    c.stats.POW = 90;
    c.skills.find((s) => s.name === "クトゥルフ神話")!.growth = 30;
    expect(derived(c).maxSAN).toBe(69);
    expect(derived(c).san).toBe(69);
  });
});
