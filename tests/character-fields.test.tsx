import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  backgroundFields,
  characterSchema,
  derived,
  hasSkillInvestment,
  interestPoints,
  isKeyConnection,
  newCharacter,
  occupationPoints,
  rollAll,
  skillBase,
  skillTotal,
  statTotal,
  validateAllocation,
  weaponSchema,
} from "../src/shared/rules";
import { parseLegacyDrafts } from "../src/shared/legacy-drafts";
import { readCharacter } from "../src/server/storage";
import { PublicSheet } from "../src/client/PublicSheet";
import {
  EquipmentDetails,
  EquipmentEditor,
  LostBadge,
} from "../src/client/SheetExtras";
import { OptionalNumberInput } from "../src/client/OptionalNumberInput";
import { toCcfoliaCharacter } from "../src/shared/ccfolia";

function legacyFixture() {
  const { statModifiers, inventory, weapons, lost, keyConnection, ...c } =
    newCharacter("7");
  return {
    ...c,
    equipment: "拳銃、弾薬 6発\nロープ／古い鍵\n  数量は不明\n",
    skills: c.skills.map(({ modifier, ...skill }) => skill),
  };
}

describe("backwards-compatible sheet data", () => {
  it("loads old JSON, browser drafts and D1 rows while dropping legacy equipment only from normalized data", () => {
    const old = legacyFixture();
    const raw = JSON.stringify(old);
    const loaded = characterSchema.parse(JSON.parse(raw));
    const row = { data: raw, image: null };
    expect(readCharacter(row)).toEqual(loaded);
    expect(parseLegacyDrafts(JSON.stringify([old]))).toEqual([loaded]);
    expect(row.data).toBe(raw);
    expect(loaded).not.toHaveProperty("equipment");
    expect(loaded.notes).toBe(old.notes);
    expect(loaded.inventory).toEqual([]);
    expect(loaded.weapons).toEqual([]);
    expect(loaded.lost).toBe(false);
    expect(loaded.keyConnection).toBeNull();
    expect(Object.values(loaded.statModifiers)).toEqual(Array(8).fill(null));
    expect(loaded.skills.every((s) => s.modifier === null)).toBe(true);
    expect(characterSchema.parse(JSON.parse(JSON.stringify(loaded)))).toEqual(
      loaded,
    );
  });

  it("keeps explicit zeros distinct from unspecified corrections and quantities", () => {
    const c = newCharacter();
    c.statModifiers.STR = 0;
    c.skills[0].modifier = 0;
    c.inventory = [
      { name: "空の容器", quantity: 0, notes: "残数なし" },
      { name: "古い鍵", quantity: null, notes: "数量不明\n借り物" },
    ];
    const loaded = characterSchema.parse(JSON.parse(JSON.stringify(c)));
    expect(loaded).toEqual(c);
    expect(loaded.statModifiers.STR).toBe(0);
    expect(loaded.statModifiers.CON).toBeNull();
    expect(loaded.skills[0].modifier).toBe(0);
    expect(loaded.skills[1].modifier).toBeNull();
    expect(loaded.inventory.map((x) => x.quantity)).toEqual([0, null]);
    for (const value of [0, null]) {
      const html = renderToStaticMarkup(
        <OptionalNumberInput
          aria-label="補正"
          value={value}
          min={-999}
          max={999}
          onValueChange={() => {}}
        />,
      );
      expect(html).toContain(`value="${value === null ? "" : "0"}"`);
    }
  });

  it("preserves rules expressions and validates new data rather than coercing strings to numbers", () => {
    const c = newCharacter();
    c.weapons = [
      weaponSchema.parse({
        name: "拳銃",
        skill: "射撃（拳銃）",
        damage: "1D10+DB",
        range: "15/30/60m",
        attacks: "1(3)／連射",
        ammo: "6+1",
        malfunction: "00",
        durability: "8",
        notes: "特殊弾\n残弾0",
      }),
    ];
    expect(
      characterSchema.parse(JSON.parse(JSON.stringify(c))).weapons,
    ).toEqual(c.weapons);
    for (const patch of [
      { inventory: [{ name: "鍵", quantity: -1, notes: "" }] },
      { inventory: [{ name: "鍵", quantity: "0", notes: "" }] },
      { weapons: [{ name: "拳銃", attacks: 3 }] },
      { weapons: [{ name: "拳銃", ammo: 0 }] },
      { statModifiers: { STR: 1.5 } },
      { lost: "false" },
      { keyConnection: "equipment" },
    ])
      expect(characterSchema.safeParse({ ...c, ...patch }).success).toBe(false);
  });
});

describe("independent characteristic and skill modifiers", () => {
  it.each(["6", "7"] as const)(
    "uses edition %s totals consistently without changing bases or allocations",
    (edition) => {
      const c = newCharacter(edition);
      const factor = edition === "6" ? 1 : 5;
      c.stats = {
        STR: 12 * factor,
        CON: 12 * factor,
        POW: 12 * factor,
        DEX: 12 * factor,
        APP: 12 * factor,
        SIZ: 12 * factor,
        INT: 12 * factor,
        EDU: 12 * factor,
      };
      c.statModifiers = {
        STR: 2 * factor,
        CON: -2 * factor,
        POW: 2 * factor,
        DEX: -2 * factor,
        APP: 0,
        SIZ: 2 * factor,
        INT: 2 * factor,
        EDU: -2 * factor,
      };
      const dodge = c.skills.find((s) => s.name === "回避")!;
      const language = c.skills.find((s) => s.name === "母国語")!;
      const spot = c.skills.find((s) => s.name === "目星")!;
      spot.occupation = 10;
      spot.interest = 5;
      spot.growth = 2;
      spot.modifier = -8;
      dodge.modifier = 3;
      const original = structuredClone(c);
      expect(statTotal(c, "DEX")).toBe(10 * factor);
      expect(occupationPoints(c)).toBe(200);
      expect(interestPoints(c)).toBe(140);
      c.pointMode = "combination";
      expect(occupationPoints(c)).toBe(200);
      c.pointMode = "manual";
      c.manualPoints = 123;
      expect(occupationPoints(c)).toBe(123);
      c.pointMode = original.pointMode;
      c.manualPoints = original.manualPoints;
      expect(skillBase(dodge, c)).toBe(edition === "6" ? 20 : 25);
      expect(skillTotal(dodge, c)).toBe(edition === "6" ? 23 : 28);
      expect(skillBase(language, c)).toBe(50);
      expect(skillTotal(spot, c)).toBe(34);
      expect(derived(c)).toMatchObject({
        hp: 12,
        mp: 14,
        san: 70,
        db: "+1D4",
        idea: 70,
        knowledge: 50,
      });
      expect(validateAllocation(c)).toEqual([]);
      const exported = toCcfoliaCharacter(c).data;
      expect(exported.initiative).toBe(10 * factor);
      expect(exported.params.find((p) => p.label === "DEX")?.value).toBe(
        String(10 * factor),
      );
      expect(exported.commands).toContain("<=50 DEX");
      expect(exported.commands).toContain("<=34 目星");
      expect(c).toEqual(original);
      expect(rollAll(c).statModifiers).toEqual(c.statModifiers);
    },
  );

  it("includes correction-only skills and mythos corrections without spending skill points", () => {
    const c = newCharacter("7");
    const mythos = c.skills.find((s) => s.name === "クトゥルフ神話")!;
    const spot = c.skills.find((s) => s.name === "目星")!;
    mythos.modifier = 10;
    spot.modifier = -5;
    expect(derived(c).maxSAN).toBe(89);
    expect(hasSkillInvestment(spot)).toBe(true);
    expect(hasSkillInvestment({ ...spot, modifier: 0 })).toBe(false);
    expect(hasSkillInvestment({ ...spot, modifier: null })).toBe(false);
    expect(validateAllocation(c)).toEqual([]);
    spot.occupation = 1;
    expect(validateAllocation(c)).toContain("職業ポイントが上限を超えています");
    spot.occupation = 0;
    spot.modifier = 75;
    expect(validateAllocation(c)).toContain("技能値が99を超えています");
    spot.modifier = -26;
    expect(validateAllocation(c)).toContain("補正後の技能値が0未満です");
    c.statModifiers.STR = -1;
    expect(validateAllocation(c)).toContain("補正後の能力値が0未満です");
  });
});

describe("edition backgrounds, equipment and lost display", () => {
  it.each(backgroundFields)(
    "marks %s as the key connection in seventh edition only",
    (key, label) => {
      const c = newCharacter("7");
      c[key] = "大切な記録";
      c.keyConnection = key;
      expect(isKeyConnection(c, key)).toBe(true);
      const html = renderToStaticMarkup(
        <PublicSheet c={c} portraitUrl={null} canEdit={false} />,
      );
      expect(html).toContain(`${label} ★ キーコネクション`);
      c.edition = "6";
      expect(isKeyConnection(c, key)).toBe(false);
      const six = characterSchema.parse(JSON.parse(JSON.stringify(c)));
      expect(six.keyConnection).toBe(key);
      expect(
        renderToStaticMarkup(
          <PublicSheet c={six} portraitUrl={null} canEdit={false} />,
        ),
      ).not.toContain("キーコネクション");
    },
  );

  it("renders correction-only skills, structured items, weapon notation and a reversible lost badge", () => {
    const c = newCharacter();
    c.lost = true;
    c.statModifiers.STR = 0;
    c.inventory = [
      { name: "鍵", quantity: 0, notes: "壊れた鍵" },
      { name: "紙", quantity: null, notes: "" },
    ];
    c.weapons = [
      weaponSchema.parse({
        name: "銃",
        ammo: "6+1",
        attacks: "1(3)",
        malfunction: "00",
      }),
    ];
    c.skills.find((s) => s.name === "目星")!.modifier = -5;
    const html = renderToStaticMarkup(
      <PublicSheet c={c} portraitUrl={null} canEdit={false} />,
    );
    for (const value of [
      "ロスト",
      "目星",
      "20",
      "-5",
      "鍵",
      "壊れた鍵",
      "未指定",
      "6+1",
      "1(3)",
      "00",
    ])
      expect(html).toContain(value);
    expect(html).toContain("基本 0 / 補正 0");
    const details = renderToStaticMarkup(<EquipmentDetails c={c} />);
    expect(details).toContain("<td>0</td>");
    expect(details).toContain("<td>未指定</td>");
    const editor = renderToStaticMarkup(
      <EquipmentEditor c={c} onChange={() => {}} />,
    );
    expect(editor).not.toContain("以前の装備・所持品の記録");
    expect(editor).toContain("所持品1の名前");
    c.lost = false;
    expect(renderToStaticMarkup(<LostBadge lost={c.lost} />)).toBe("");
    expect(
      renderToStaticMarkup(
        <PublicSheet c={c} portraitUrl={null} canEdit={false} />,
      ),
    ).not.toContain('class="lost-badge"');
  });
});
