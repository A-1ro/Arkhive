import { describe, expect, it } from "vitest";
import {
  characterSchema,
  makeSkills,
  newCharacter,
  skillName,
  skillSpecialty,
  skillTotal,
  sortSkills,
} from "../src/shared/rules";

describe("skill names and display order", () => {
  it.each(["6", "7"] as const)(
    "sorts edition %s skills by reading, including existing sheets",
    (edition) => {
      const names = [
        "言いくるめ",
        "医学",
        "運転（自動車）",
        "応急手当",
        "オカルト",
        "回避",
        "鍵開け",
        "機械修理",
        "聞き耳",
        "クトゥルフ神話",
        "経理",
        "考古学",
        "コンピューター",
        "重機械操作",
        "乗馬",
        "信用",
        "心理学",
        "人類学",
        "水泳",
        "精神分析",
        "説得",
        "操縦",
        "跳躍",
        "追跡",
        "電気修理",
        "電子工学",
        "投擲",
        "登攀",
        "図書館",
        "ナビゲート",
        "変装",
        "法律",
        "ほかの言語（）",
        "母国語",
        "目星",
        "歴史",
      ];
      const skills = makeSkills(edition);
      expect(
        skills.filter((s) => names.includes(s.name)).map((s) => s.name),
      ).toEqual(names);
      // Old sheets retain their stored order and IDs when displayed.
      const oldOrder = [...skills].reverse();
      const before = structuredClone(oldOrder);
      const labels = (entries: typeof skills) =>
        entries.map((s) => skillSpecialty(s.name)?.label ?? s.name);
      expect(labels(sortSkills(oldOrder))).toEqual(labels(skills));
      expect(oldOrder).toEqual(before);
      expect(skills.find((s) => s.name === "目星")?.id).toBe(
        `skill-${edition}-0`,
      );
    },
  );

  it.each([
    ["6", "芸術（）", 5],
    ["6", "製作（）", 5],
    ["7", "芸術／製作（）", 5],
    ["7", "科学（）", 1],
    ["6", "ほかの言語（）", 1],
    ["7", "ほかの言語（）", 1],
    ["7", "サバイバル（）", 10],
  ] as const)(
    "provides edition %s %s with an editable specialty",
    (edition, name, base) => {
      const skill = makeSkills(edition).find((s) => s.name === name)!;
      expect(skill.base).toBe(base);
      expect(skillSpecialty(skill.name)?.specialty).toBe("");
      // Previously saved names did not contain parentheses.
      const legacyName = name.replace("（）", "");
      expect(skillSpecialty(legacyName)).toEqual(skillSpecialty(name));
      expect(skillName({ ...skill, name: legacyName })).toBe(name);
    },
  );

  it.each([
    ["運転（自動車）", "運転", "自動車"],
    ["近接戦闘（格闘）", "近接戦闘", "格闘"],
    ["射撃（ライフル／ショットガン）", "射撃", "ライフル／ショットガン"],
    ["科学(生物学)", "科学", "生物学"],
    ["芸術（彫刻（木彫））", "芸術", "彫刻（木彫）"],
    ["科学（）", "科学", ""],
    ["ほかの言語（英語）", "ほかの言語", "英語"],
    ["サバイバル（森林）", "サバイバル", "森林"],
  ])("extracts editable text from %s", (name, label, specialty) => {
    expect(skillSpecialty(name)).toEqual({ label, specialty });
  });

  it("leaves ordinary skills without a specialty field", () => {
    expect(skillSpecialty("目星")).toBeNull();
    expect(skillSpecialty("クトゥルフ神話")).toBeNull();
    expect(skillSpecialty("こぶし")).toBeNull();
  });

  it.each(["こぶし（パンチ）", "こぶし(パンチ)", "こぶし（変更済み）"])(
    "displays the legacy %s as a plain fist skill without changing allocations",
    (name) => {
      const c = newCharacter("6");
      const fist = c.skills.find((s) => s.name === "こぶし")!;
      fist.name = name;
      fist.occupation = 20;
      fist.interest = 10;
      const saved = characterSchema.parse(JSON.parse(JSON.stringify(c)));
      const loaded = saved.skills.find((s) => s.id === fist.id)!;
      expect(skillName(loaded)).toBe("こぶし");
      expect(skillSpecialty(loaded.name)).toBeNull();
      expect(loaded).toEqual(fist);
      expect(skillTotal(loaded, saved)).toBe(80);
      expect(sortSkills(saved.skills).map((s) => s.id)).toEqual(
        c.skills.map((s) => s.id),
      );
    },
  );

  it.each(["6", "7"] as const)(
    "preserves edited specialties, allocations and order through JSON in edition %s",
    (edition) => {
      const c = newCharacter(edition);
      const beforeIds = c.skills.map((s) => s.id);
      const art = c.skills.find((s) => s.name.startsWith("芸術"))!;
      const label = skillSpecialty(art.name)!.label;
      art.name = `${label}（絵画）`;
      art.occupation = 30;
      art.interest = 10;
      art.growth = 2;
      const saved = characterSchema.parse(JSON.parse(JSON.stringify(c)));
      expect(saved.skills.find((s) => s.id === art.id)).toEqual(art);
      expect(skillTotal(art, saved)).toBe(47);
      expect(sortSkills(saved.skills).map((s) => s.id)).toEqual(beforeIds);
      expect(saved.skills.some((s) => s.name.includes("絵画"))).toBe(true);
    },
  );
});
