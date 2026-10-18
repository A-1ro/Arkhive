# Arkhive 探索者ノート

クトゥルフ神話TRPG（第6版）・新クトゥルフ神話TRPG（第7版）の非公式キャラクターシート作成サイトです。

- 公開サイト: https://arkhive.hiyori-schedule.com
- GitHub: https://github.com/A-1ro/Arkhive
- Hono / Cloudflare Workers / Cloudflare D1
- React / TypeScript / Vite
- Discord OAuth2（identifyのみ）
- MCP Streamable HTTP（ユーザー別Bearerトークン）

## 機能

- 第6版・第7版の能力値を一括・個別ロール。直接編集も可能。
- HP・MP・SAN・幸運・DB・第7版のビルドと移動率、技能の1/2・1/5値を自動計算。
- 職業ポイントは標準でEDU×20（第6版）/ EDU×4（第7版）。任意の能力値と係数を最大8項目組み合わせ、または数値と算出根拠を直接入力。
- 興味ポイントはINT×10（第6版）/ INT×2（第7版）。職業・興味・成長を分けて管理。
- 日本語の基本技能、自由技能の追加、検索・カテゴリ表示。
- 端末への自動保存、Discordログイン後の非公開クラウド保存、複数探索者、JSON入出力、印刷・PDF。
- PC・モバイル対応。白基調の控えめなグラスUI、ロールアニメーション、全画面スケルトン、動きを減らす設定への対応。
- キャッチコピーや紹介バナーを置かず、編集操作を中心にした構成。

技能一覧はKADOKAWAの[公式探索者シート](https://product.kadokawa.co.jp/cthulhu/contents/coc_material/)の日本語表記と初期値を参照。専門分野は自由技能として追加できます。年齢による能力値の減少とEDUの上達、職業固有の推奨技能・信用の範囲は自動適用しません。ルールブックとキーパーの裁定に従って入力してください。第7版の移動率の年齢補正は自動適用します。

## 開発

Node.js 22以降、npm、CloudflareにログインしたWranglerが必要です。

```sh
npm ci
npm run build
npm run db:local
npm run dev:worker
```

http://localhost:8787 を開きます。ホットリロードを使う場合は、別ターミナルで `npm run dev` を実行して http://localhost:5173 を開きます。APIは8787へプロキシします。

ローカルでDiscord認証も利用する場合は `.dev.vars.example` を `.dev.vars` にコピーし、開発用アプリの値を設定します。Discord側に同じコールバックURLを登録してください。`.dev.vars` はGit管理対象外です。

```sh
npm run cf-typegen
npm run typecheck
npm run build
npm test
```

結合テストはWranglerの独立したローカルD1で実行し、本番データは変更しません。テスト対象は版別計算、ポイント制限、保存・更新、所有権、期限切れセッション、CSRF、不正入力、MCPの接続・探索者作成、トークンのハッシュ保存・失効です。

## 公開

このプロジェクトの `wrangler.jsonc` は現在の公開WorkerとD1に接続しています。別アカウントに公開する場合は `wrangler d1 create` で自分のDBを作成し、`database_id` を変更してください。

```sh
npm run db:remote
npm run deploy
```

GitHub Actionsでは型検査・ビルド・テストを実行します。Cloudflareへの公開はローカルのWranglerから実行します。

旧URLのWorkerは `wrangler.legacy.jsonc` で管理します。`npm run deploy:legacy` で転送処理を公開できます。D1は改名前から同じデータベースを使用しています。

旧URL（workers.dev）で端末保存した探索者は、新URLを開いた際にブラウザー内の通信で取り込みます。ブラウザーの制限などで取り込めない場合は、[改名前のURLのデータ書き出し](https://cthulhu-charactersheet.aaa-4e2k3.workers.dev/migrate) または [Arkhiveの旧URLのデータ書き出し](https://arkhive.aaa-4e2k3.workers.dev/migrate)を同じブラウザーで開き、JSONを出力して新URLの「読み込み」から追加できます。移行済みデータを再度取り込まないよう、端末内に完了状態を保存します。

## Discordログインの有効化

アプリ作成は利用者本人が行います。認証コードは実装済みですが、Client ID / Client Secretを登録するまではログインとクラウド保存・MCPトークン発行は利用できません。

1. [Discord Developer Portal](https://discord.com/developers/applications)でアプリを作成。
2. OAuth2 → Redirectsに以下を登録して保存。

```text
https://arkhive.hiyori-schedule.com/auth/discord/callback
```

3. このリポジトリのディレクトリで次を実行。

```sh
python3 scripts/configure-discord.py
```

Client IDとClient Secretを端末のプロンプトに入力します。Secretは画面表示・ファイル保存せず、stdinでWranglerへ渡してWorkers Secretsに保存します。チャットやリポジトリに秘密情報を貼らないでください。Botトークンは不要です。

旧URLをDiscordのRedirectsに登録済みの場合は、上記の新URLも追加してください。

4. 公開サイトを再読み込みして「Discordでログイン」。

OAuth2はstate照合、10分のstate Cookie、HttpOnly / Secure / SameSite=LaxのセッションCookie、SHA-256でハッシュ化したD1セッションを使用します。セッション有効期限は30日です。各APIはユーザー所有権を検証します。

## MCP接続

公開サイトの「MCP連携」からDiscordログイン後にトークンを発行します。トークンは発行時のみ表示し、D1にはSHA-256のハッシュのみ保存します。トークンは画面から失効できます。

Bearerヘッダー付きStreamable HTTPに対応したMCPクライアントへ設定してください。OAuthによる自動登録には対応しません。

```json
{
  "mcpServers": {
    "arkhive": {
      "url": "https://arkhive.hiyori-schedule.com/mcp",
      "headers": {
        "Authorization": "Bearer <発行したトークン>"
      }
    }
  }
}
```

| ツール             | 内容                                           |
| ------------------ | ---------------------------------------------- |
| `get_rules`        | 版別の日本語基本技能と標準計算式               |
| `list_characters`  | 自分の探索者の一覧                             |
| `get_character`    | 自分の探索者を取得                             |
| `create_character` | 版・名前・職業などからロールして作成・D1へ保存 |
| `update_character` | 取得済みキャラシのJSONを更新・保存             |

`create_character`の例:

```json
{ "edition": "7", "name": "山田 太郎", "occupation": "私立探偵", "age": 28 }
```

MCPで作成した探索者は同じDiscordアカウントのWeb画面に表示されます。探索者数は一覧取得で直近200件まで、トークンは各ユーザー10個まで、JSONの最大サイズは256KBです。

## データと権利表記

探索者は公開URLで一般公開されません。閲覧・編集には所有者のセッションまたはMCPトークンが必要です。端末に保存されたデータはブラウザーデータの消去で失われるため、必要に応じてJSONを出力してください。

本ツールは非公式です。Call of Cthulhuの権利はChaosium Inc.に、日本語版の権利は各権利者に帰属します。公式のルール説明文やPDF、イラストは配布していません。

参照: [KADOKAWA公式探索者シート](https://product.kadokawa.co.jp/cthulhu/contents/coc_material/) / [Hono](https://hono.dev/docs/getting-started/cloudflare-workers) / [Cloudflare D1](https://developers.cloudflare.com/d1/) / [Discord OAuth2](https://discord.com/developers/docs/topics/oauth2) / [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
