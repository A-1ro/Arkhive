import { z } from "zod";

export const statKeys = [
  "STR",
  "CON",
  "POW",
  "DEX",
  "APP",
  "SIZ",
  "INT",
  "EDU",
] as const;
export type StatKey = (typeof statKeys)[number];
export type Edition = "6" | "7";
export const statLabels: Record<StatKey, string> = {
  STR: "筋力",
  CON: "体力",
  POW: "精神力",
  DEX: "敏捷性",
  APP: "外見",
  SIZ: "体格",
  INT: "知性",
  EDU: "教育",
};
const point = z.number().int().min(0).max(999);
export const skillSchema = z.object({
  id: z.string().max(100),
  name: z.string().min(1).max(100),
  base: point,
  occupation: point,
  interest: point,
  growth: point,
  custom: z.boolean().default(false),
  category: z.string().max(30),
});
export const characterSchema = z.object({
  id: z.string().uuid(),
  edition: z.enum(["6", "7"]),
  name: z.string().max(100),
  player: z.string().max(100),
  occupation: z.string().max(100),
  age: z.number().int().min(15).max(99),
  gender: z.string().max(50),
  birthplace: z.string().max(100),
  residence: z.string().max(100),
  stats: z.object({
    STR: point,
    CON: point,
    POW: point,
    DEX: point,
    APP: point,
    SIZ: point,
    INT: point,
    EDU: point,
  }),
  luck: point,
  pointMode: z.enum(["edu", "combination", "manual"]),
  terms: z
    .array(
      z.object({
        stat: z.enum(statKeys),
        multiplier: z.number().min(0).max(100),
      }),
    )
    .max(8),
  manualPoints: point,
  pointNote: z.string().max(1000),
  skills: z.array(skillSchema).max(180),
  notes: z.string().max(20000),
  equipment: z.string().max(10000),
  appearance: z.string().max(4000),
  belief: z.string().max(4000),
  importantPeople: z.string().max(4000),
  meaningfulPlaces: z.string().max(4000),
  treasuredPossessions: z.string().max(4000),
  traits: z.string().max(4000),
  currentHP: z.number().int().min(0).max(999).nullable(),
  currentMP: z.number().int().min(0).max(999).nullable(),
  currentSAN: z.number().int().min(0).max(999).nullable(),
  updatedAt: z.string().max(50),
});
export type Character = z.infer<typeof characterSchema>;
export type Skill = z.infer<typeof skillSchema>;

// Skill labels and initial chances follow KADOKAWA's official Japanese sheets.
const common: [string, number, string][] = [
  ["目星", 25, "探索"],
  ["聞き耳", 25, "探索"],
  ["図書館", 25, "探索"],
  ["応急手当", 30, "探索"],
  ["追跡", 10, "探索"],
  ["登攀", 40, "行動"],
  ["水泳", 25, "行動"],
  ["跳躍", 25, "行動"],
  ["投擲", 25, "戦闘"],
  ["回避", 0, "戦闘"],
  ["言いくるめ", 5, "交渉"],
  ["説得", 15, "交渉"],
  ["信用", 15, "交渉"],
  ["母国語", 0, "交渉"],
  ["ほかの言語", 1, "交渉"],
  ["心理学", 5, "知識"],
  ["精神分析", 1, "知識"],
  ["医学", 5, "知識"],
  ["オカルト", 5, "知識"],
  ["クトゥルフ神話", 0, "知識"],
  ["歴史", 20, "知識"],
  ["人類学", 1, "知識"],
  ["考古学", 1, "知識"],
  ["法律", 5, "知識"],
  ["経理", 10, "知識"],
  ["機械修理", 20, "技術"],
  ["電気修理", 10, "技術"],
  ["電子工学", 1, "技術"],
  ["コンピューター", 1, "技術"],
  ["重機械操作", 1, "技術"],
  ["鍵開け", 1, "技術"],
  ["変装", 1, "技術"],
  ["運転（自動車）", 20, "行動"],
  ["操縦", 1, "行動"],
  ["乗馬", 5, "行動"],
  ["ナビゲート", 10, "行動"],
];
const six: [string, number, string][] = [
  ["こぶし（パンチ）", 50, "戦闘"],
  ["キック", 25, "戦闘"],
  ["組み付き", 25, "戦闘"],
  ["頭突き", 10, "戦闘"],
  ["マーシャルアーツ", 1, "戦闘"],
  ["拳銃", 20, "戦闘"],
  ["サブマシンガン", 15, "戦闘"],
  ["ショットガン", 30, "戦闘"],
  ["マシンガン", 15, "戦闘"],
  ["ライフル", 25, "戦闘"],
  ["隠す", 15, "探索"],
  ["隠れる", 10, "探索"],
  ["忍び歩き", 10, "行動"],
  ["写真術", 10, "技術"],
  ["芸術", 5, "技術"],
  ["製作", 5, "技術"],
  ["化学", 1, "知識"],
  ["生物学", 1, "知識"],
  ["地質学", 1, "知識"],
  ["天文学", 1, "知識"],
  ["博物学", 10, "知識"],
  ["物理学", 1, "知識"],
  ["薬学", 1, "知識"],
  ["値切り", 5, "交渉"],
];
const seven: [string, number, string][] = [
  ["近接戦闘（格闘）", 25, "戦闘"],
  ["射撃（拳銃）", 20, "戦闘"],
  ["射撃（ライフル／ショットガン）", 25, "戦闘"],
  ["隠密", 20, "行動"],
  ["手さばき", 10, "技術"],
  ["鑑定", 5, "知識"],
  ["威圧", 15, "交渉"],
  ["魅惑", 15, "交渉"],
  ["芸術／製作", 5, "技術"],
  ["科学", 1, "知識"],
  ["自然", 10, "知識"],
  ["サバイバル", 10, "行動"],
];
const sevenBases: Record<string, number> = {
  聞き耳: 20,
  図書館: 20,
  登攀: 20,
  水泳: 20,
  跳躍: 20,
  投擲: 20,
  説得: 10,
  信用: 0,
  心理学: 10,
  医学: 1,
  歴史: 5,
  経理: 5,
  機械修理: 10,
  コンピューター: 5,
  変装: 5,
};
export function makeSkills(edition: Edition): Skill[] {
  return [...common, ...(edition === "6" ? six : seven)].map(
    ([name, base, category], i) => ({
      id: `skill-${edition}-${i}`,
      name,
      base: edition === "7" ? (sevenBases[name] ?? base) : base,
      category,
      occupation: 0,
      interest: 0,
      growth: 0,
      custom: false,
    }),
  );
}
export function newCharacter(edition: Edition = "7"): Character {
  return {
    id: crypto.randomUUID(),
    edition,
    name: "",
    player: "",
    occupation: "",
    age: 25,
    gender: "",
    birthplace: "",
    residence: "",
    stats: { STR: 0, CON: 0, POW: 0, DEX: 0, APP: 0, SIZ: 0, INT: 0, EDU: 0 },
    luck: 0,
    pointMode: "edu",
    terms: [
      { stat: "EDU", multiplier: edition === "7" ? 2 : 10 },
      { stat: "DEX", multiplier: edition === "7" ? 2 : 10 },
    ],
    manualPoints: 0,
    pointNote: "",
    skills: makeSkills(edition),
    notes: "",
    equipment: "",
    appearance: "",
    belief: "",
    importantPeople: "",
    meaningfulPlaces: "",
    treasuredPossessions: "",
    traits: "",
    currentHP: null,
    currentMP: null,
    currentSAN: null,
    updatedAt: new Date().toISOString(),
  };
}
export function die(sides = 6): number {
  const limit = Math.floor(0x100000000 / sides) * sides;
  const a = new Uint32Array(1);
  do {
    crypto.getRandomValues(a);
  } while (a[0] >= limit);
  return (a[0] % sides) + 1;
}
export function rollStat(key: StatKey | "LUCK", edition: Edition) {
  const two =
    key === "SIZ" || key === "INT" || (edition === "7" && key === "EDU");
  const dice = Array.from({ length: two ? 2 : 3 }, () => die());
  const bonus = two ? 6 : key === "EDU" && edition === "6" ? 3 : 0;
  return {
    dice,
    bonus,
    value:
      (dice.reduce((a, b) => a + b, 0) + bonus) * (edition === "7" ? 5 : 1),
  };
}
export function rollAll(c: Character): Character {
  const stats = { ...c.stats };
  for (const k of statKeys) stats[k] = rollStat(k, c.edition).value;
  return {
    ...c,
    stats,
    luck: c.edition === "7" ? rollStat("LUCK", "7").value : stats.POW * 5,
    currentHP: null,
    currentMP: null,
    currentSAN: null,
  };
}
export function occupationPoints(c: Character) {
  if (c.pointMode === "manual") return c.manualPoints;
  if (c.pointMode === "combination")
    return Math.floor(
      c.terms.reduce((n, t) => n + c.stats[t.stat] * t.multiplier, 0),
    );
  return c.stats.EDU * (c.edition === "7" ? 4 : 20);
}
export function interestPoints(c: Character) {
  return c.stats.INT * (c.edition === "7" ? 2 : 10);
}
export function skillBase(s: Skill, c: Character) {
  if (!s.custom && s.name === "回避")
    return c.edition === "7" ? Math.floor(c.stats.DEX / 2) : c.stats.DEX * 2;
  if (!s.custom && s.name === "母国語")
    return Math.min(99, c.stats.EDU * (c.edition === "7" ? 1 : 5));
  return s.base;
}
export function skillTotal(s: Skill, c: Character) {
  return skillBase(s, c) + s.occupation + s.interest + s.growth;
}
export function derived(c: Character) {
  const s = c.stats;
  const seven = c.edition === "7";
  const sum = (s.STR + s.SIZ) * (seven ? 1 : 5);
  let db = "0",
    build = 0;
  if (sum < 65) {
    db = "−2";
    build = -2;
  } else if (sum < 85) {
    db = "−1";
    build = -1;
  } else if (sum < 125) {
    db = "0";
  } else if (sum < 165) {
    db = "+1D4";
    build = 1;
  } else {
    const dice = sum <= 204 ? 1 : 2 + Math.floor((sum - 205) / 80);
    build = dice + 1;
    db = `+${dice}D6`;
  }
  if (!seven) {
    const total = s.STR + s.SIZ;
    db =
      total <= 12
        ? "−1D6"
        : total <= 16
          ? "−1D4"
          : total <= 24
            ? "0"
            : total <= 32
              ? "+1D4"
              : `+${1 + Math.floor((total - 33) / 16)}D6`;
  }
  const mythos = c.skills.find((x) => x.name === "クトゥルフ神話");
  const maxSAN = Math.max(0, 99 - (mythos ? skillTotal(mythos, c) : 0));
  return {
    hp: seven
      ? Math.floor((s.CON + s.SIZ) / 10)
      : Math.ceil((s.CON + s.SIZ) / 2),
    mp: seven ? Math.floor(s.POW / 5) : s.POW,
    san: Math.min(maxSAN, s.POW * (seven ? 1 : 5)),
    maxSAN,
    luck: seven ? c.luck : s.POW * 5,
    idea: Math.min(99, s.INT * (seven ? 1 : 5)),
    knowledge: Math.min(99, s.EDU * (seven ? 1 : 5)),
    db,
    build,
    mov: Math.max(
      1,
      (s.DEX < s.SIZ && s.STR < s.SIZ
        ? 7
        : s.DEX > s.SIZ && s.STR > s.SIZ
          ? 9
          : 8) - Math.max(0, Math.floor(c.age / 10) - 3),
    ),
  };
}
export function validateAllocation(c: Character): string[] {
  const errors: string[] = [];
  if (c.skills.reduce((a, s) => a + s.occupation, 0) > occupationPoints(c))
    errors.push("職業ポイントが上限を超えています");
  if (c.skills.reduce((a, s) => a + s.interest, 0) > interestPoints(c))
    errors.push("興味ポイントが上限を超えています");
  if (c.skills.some((s) => skillTotal(s, c) > 99))
    errors.push("技能値が99を超えています");
  if (
    c.skills.some(
      (s) => s.name === "クトゥルフ神話" && s.occupation + s.interest > 0,
    )
  )
    errors.push("クトゥルフ神話には職業・興味ポイントを割り振れません");
  return errors;
}
