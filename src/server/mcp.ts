import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import {
  characterSchema,
  backgroundKeys,
  derived,
  makeSkills,
  newCharacter,
  occupationPoints,
  interestPoints,
  rollAll,
} from "../shared/rules";
import { getCharacter, listCharacters, saveCharacter } from "./storage";

export function createMcpServer(
  db: D1Database,
  userId: string,
  origin: string,
) {
  const server = new McpServer({
    name: "arkhive-investigator-notebook",
    version: "1.0.0",
  });
  const result = (data: unknown) => ({
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  });
  server.registerTool(
    "list_characters",
    {
      description: "ログイン中のユーザーの探索者一覧を取得。",
      annotations: { readOnlyHint: true },
      inputSchema: {},
    },
    async () => result(await listCharacters(db, userId)),
  );
  server.registerTool(
    "get_character",
    {
      description: "自分の探索者を取得。",
      annotations: { readOnlyHint: true },
      inputSchema: { id: z.string().uuid() },
    },
    async ({ id }) => {
      const c = await getCharacter(db, userId, id);
      return c
        ? result(c)
        : { ...result({ error: "探索者が見つかりません" }), isError: true };
    },
  );
  server.registerTool(
    "get_rules",
    {
      description:
        "第6版または第7版の日本語基本技能一覧と職業ポイントの標準計算式を取得。",
      annotations: { readOnlyHint: true },
      inputSchema: { edition: z.enum(["6", "7"]) },
    },
    async ({ edition }) =>
      result({
        edition,
        skills: makeSkills(edition),
        occupationFormula: edition === "7" ? "EDU × 4" : "EDU × 20",
        interestFormula: edition === "7" ? "INT × 2" : "INT × 10",
        modifierNote:
          "能力値は stats + statModifiers、技能は初期値 + 職業 + 興味 + 成長 + modifier。補正の未指定はnull、明示的な0は0。能力値の合計を派生値・動的初期値・ポイント上限に使用。",
        keyConnectionFields: edition === "7" ? backgroundKeys : [],
        saveSizeNote:
          "探索者JSONはUTF-8で240 KiBまで（MCPリクエスト本体は256 KiBまで）。上限超過時は内容を減らしてから再保存。内容の切り捨ては行わない。",
      }),
  );
  server.registerTool(
    "create_character",
    {
      description:
        "第6版・第7版の探索者をダイスロール付きで作成し、自分のアカウントに保存。年齢補正はルールブックに従い update_character で調整。",
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
      inputSchema: {
        edition: z.enum(["6", "7"]),
        name: z.string().min(1).max(100),
        occupation: z.string().max(100).optional(),
        age: z.number().int().min(15).max(99).default(25),
        stats: characterSchema.shape.stats.partial().optional(),
        statModifiers: characterSchema.shape.statModifiers.optional(),
        keyConnection: characterSchema.shape.keyConnection.optional(),
        inventory: characterSchema.shape.inventory.optional(),
        weapons: characterSchema.shape.weapons.optional(),
        lost: characterSchema.shape.lost.optional(),
        notes: z.string().max(20000).optional(),
      },
    },
    async (input) => {
      const c = rollAll(newCharacter(input.edition));
      Object.assign(c, {
        name: input.name,
        occupation: input.occupation || "",
        age: input.age,
        notes: input.notes || "",
        stats: { ...c.stats, ...input.stats },
        statModifiers: input.statModifiers ?? c.statModifiers,
        keyConnection: input.keyConnection ?? null,
        inventory: input.inventory ?? [],
        weapons: input.weapons ?? [],
        lost: input.lost ?? false,
      });
      await saveCharacter(db, userId, c);
      return result({
        character: c,
        derived: derived(c),
        occupationPoints: occupationPoints(c),
        interestPoints: interestPoints(c),
        url: `${origin}/?character=${c.id}`,
      });
    },
  );
  server.registerTool(
    "update_character",
    {
      description:
        "探索者を完全なキャラシJSONで更新。get_characterで取得してから必要項目を変更する。能力補正はstatModifiers、技能補正はmodifier（null=未指定、0=明示ゼロ）。inventoryは名前・数量・備考、weaponsの攻撃回数・装弾数などは文字列。旧equipmentの自由記述は読み込み時に除外（自動分割なし）。keyConnectionは7版のみ有効。lostは解除可能で削除とは別。自由技能はcustom:true。所有権とポイント上限を検証。",
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
      },
      inputSchema: { character: characterSchema },
    },
    async ({ character }) => {
      if (!(await getCharacter(db, userId, character.id)))
        return {
          ...result({ error: "探索者が見つかりません" }),
          isError: true,
        };
      try {
        return result(await saveCharacter(db, userId, character));
      } catch (e) {
        return {
          ...result({
            error: e instanceof Error ? e.message : "更新できません",
          }),
          isError: true,
        };
      }
    },
  );
  return server;
}
export async function handleMcp(
  request: Request,
  db: D1Database,
  userId: string,
) {
  const server = createMcpServer(db, userId, new URL(request.url).origin);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
    maxRequestBodySize: 256 * 1024,
  });
  await server.connect(transport);
  try {
    return await transport.handleRequest(request);
  } finally {
    await server.close();
  }
}
