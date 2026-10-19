import {
  derived,
  skillName,
  skillTotal,
  sortSkills,
  statKeys,
  type Character,
} from "./rules";

/** CCFOLIA Clipboard API v1.19.0: https://docs.ccfolia.com/developer-api/clipboard-api */
export type CcfoliaCharacter = {
  kind: "character";
  data: {
    name: string;
    initiative: number;
    status: { label: string; value: number; max: number }[];
    params: { label: string; value: string }[];
    commands: string;
  };
};

// Skill labels are user editable. Keep each roll on one chat-palette line.
const singleLine = (value: string) =>
  value.replace(/[\r\n\u2028\u2029]+/g, " ");

export function toCcfoliaCharacter(c: Character): CcfoliaCharacter {
  const d = derived(c);
  const roll = c.edition === "6" ? "CCB" : "CC";
  const params: CcfoliaCharacter["data"]["params"] = statKeys.map((key) => ({
    label: key,
    value: String(c.stats[key]),
  }));
  params.push(
    { label: "幸運", value: String(d.luck) },
    { label: "DB", value: d.db },
  );
  if (c.edition === "7") {
    params.push(
      { label: "ビルド", value: String(d.build) },
      { label: "MOV", value: String(d.mov) },
    );
  }
  return {
    kind: "character",
    data: {
      name: c.name || "名前のない探索者",
      initiative: c.stats.DEX,
      status: [
        { label: "HP", value: c.currentHP ?? d.hp, max: d.hp },
        { label: "MP", value: c.currentMP ?? d.mp, max: d.mp },
        { label: "SAN", value: c.currentSAN ?? d.san, max: d.maxSAN },
      ],
      params,
      commands: [
        `${roll}<={SAN} SANチェック`,
        `${roll}<=${d.luck} 幸運`,
        `${roll}<=${d.idea} アイデア`,
        `${roll}<=${d.knowledge} 知識`,
        ...statKeys.map(
          (key) =>
            `${roll}<=${c.stats[key] * (c.edition === "6" ? 5 : 1)} ${key}${c.edition === "6" ? "×5" : ""}`,
        ),
        ...sortSkills(c.skills).map(
          (skill) =>
            `${roll}<=${skillTotal(skill, c)} ${singleLine(skillName(skill))}`,
        ),
      ].join("\n"),
    },
  };
}
