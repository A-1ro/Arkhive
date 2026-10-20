# Arkhive 探索者ノート

クトゥルフ神話TRPG（第6版）・新クトゥルフ神話TRPG（第7版）の非公式キャラクターシート作成サイトです。

- 公開サイト: https://arkhive.hiyori-schedule.com
- GitHub: https://github.com/A-1ro/Arkhive
- Hono / Cloudflare Workers / Cloudflare D1 / Cloudflare R2
- React / TypeScript / Vite
- Discord OAuth2（identifyのみ）
- MCP Streamable HTTP（DiscordログインによるOAuth連携）

## 機能

- 第6版・第7版の能力値を一括・個別ロール。直接編集も可能。
- HP・MP・SAN・幸運・DB・第7版のビルドと移動率、技能の1/2・1/5値を自動計算。
- 職業ポイントは標準でEDU×20（第6版）/ EDU×4（第7版）。任意の能力値と係数を最大8項目組み合わせ、または数値と算出根拠を直接入力。
- 興味ポイントはINT×10（第6版）/ INT×2（第7版）。職業・興味・成長・補正を分けて管理。各能力値にも独立した正負の補正を入力可能。
- 第7版の背景項目を1つキーコネクションに指定。装備・所持品は名前／数量／備考の行で管理し、武器は使用技能・ダメージ・射程・攻撃回数・装弾数・故障No.・耐久力・備考を記録。
- ロスト状態を設定・解除し、一覧・詳細・公開シート・印刷で表示。探索者の削除とは独立。
- 日本語の基本技能を五十音順に表示、括弧内の自由入力、自由技能の追加、検索・カテゴリ表示。
- 端末への自動保存、Discordログイン後の非公開クラウド保存、複数探索者、JSON入出力、印刷・PDF。
- 編集画面の「CCFOLIAコマ出力」で現在の入力内容をココフォリア用JSONとしてコピー。第6版・第7版のHP・MP・SAN、能力値、技能のチャットパレットに対応。ルームの盤面に貼り付けて使用します。画像・メモ・プロフィール・公開URLは含みません。自動コピーできない場合は表示されたJSONを手動でコピーできます。既存のJSON出力はバックアップ用です。
- 探索者画像の登録・差し替え・削除。ブラウザーでWebPに圧縮して非公開のR2へ保存し、基本情報・サマリー・印刷プレビューに表示。
- 探索者ごとの公開モード。URLを知っていればログインなしでシート・画像を閲覧でき、編集・公開設定変更は管理者のみ。公開停止とURLの失効に対応。
- PC・モバイル対応。深緑とアンティークゴールドの記録庫UI、ロール時の控えめなフィードバック、動きを減らす設定への対応。
- 探索者一覧で名前・職業・プレイヤー検索、版の絞り込み、更新順・名前順の並び替え。編集画面では5つのタブと常時確認できるサマリーを用意。

技能一覧はKADOKAWAの[公式探索者シート](https://product.kadokawa.co.jp/cthulhu/contents/coc_material/)の日本語表記と初期値を参照。括弧付き技能の専門分野は括弧内に直接入力でき、自由技能も追加できます。年齢による能力値の減少とEDUの上達、職業固有の推奨技能・信用の範囲は自動適用しません。ルールブックとキーパーの裁定に従って入力してください。第7版の移動率の年齢補正は自動適用します。

## デザインシステム

共有トークンは `public/brand/theme.css`、コンポーネント・レスポンシブ・印刷スタイルは `src/style.css` で管理します。MCPのOAuth許可画面も同じトークンを読み込みます。本文は端末の日本語Sans Serif、ブランド名と限定的な記録番号はSerif、数値は等幅数字で表示します。外部フォントの取得は不要です。

提供されたブランド画像は `public/brand/arkhive.png` に配置し、ヘッダー・ナビゲーション・印刷プレビュー・OAuth画面で再利用します。差し替える場合は `public/favicon.png`（48px）、`public/apple-touch-icon.png`（180px）も更新してください。PWAとOGPは現時点では実装していません。

## 開発

Node.js 22以降と pnpm 10.34.7 が必要です。公開操作には Cloudflare にログインした Wrangler を使います。
`packageManager` と `pnpm-workspace.yaml` で pnpm を固定し、異なるバージョンでは停止します。
初回は `npm install --global pnpm@10.34.7 --ignore-scripts` などで固定版を用意し、`pnpm --version` を確認してください。
npm はこの初回導入にだけ使用し、プロジェクト依存の管理には pnpm を使用します。既存の npm の `node_modules` がある場合は、作業中の変更を退避してから削除してインストールし直してください。

```sh
pnpm install --frozen-lockfile
pnpm run build
pnpm run db:local
pnpm run dev:worker
```

http://localhost:8787 を開きます。ホットリロードを使う場合は、別ターミナルで `pnpm run dev` を実行して http://localhost:5173 を開きます。APIは8787へプロキシします。

ローカルでDiscord認証も利用する場合は `.dev.vars.example` を `.dev.vars` にコピーし、開発用アプリの値を設定します。Discord側に同じコールバックURLを登録してください。`.dev.vars` はGit管理対象外です。

```sh
pnpm run cf-typegen
pnpm run typecheck
pnpm run build
pnpm test
```

依存更新は `pnpm add <package>` / `pnpm update <package>` で行い、`pnpm-lock.yaml` と設定の差分をレビューしてください。
CI と Workers Builds は `pnpm install --frozen-lockfile` を使い、lockfile の不整合では停止します。
依存の install script はバージョン付き許可リストで制限し、未確認の script はインストールエラーにします。
許可を求められた場合はパッケージ内容と必要性を確認し、`pnpm-workspace.yaml` の該当バージョンだけを更新してください。
`--no-optional` は TypeScript 7、esbuild、sharp、workerd のプラットフォーム別バイナリを欠落させるため使用しません。
`pnpm audit --audit-level=low` で開発・任意依存も監査します。pnpm 単体はパッケージの安全性を保証しません。
設定の根拠・限界と本番への切替手順は [pnpm 移行手順](.github/pnpm-migration.md)を参照してください。

結合テストはWranglerの独立したローカルD1で実行し、本番データは変更しません。テスト対象は版別計算、ポイント制限、保存・更新、所有権、期限切れセッション、CSRF、不正入力、MCPの接続・探索者作成、OAuth認可・PKCE・認証コードの再利用防止・更新・連携解除です。

## 補正・背景・所持品・武器・ロストの保存形式

能力値は `stats` の基本値と `statModifiers` の補正、技能は既存の初期値・職業・興味・成長と `modifier` の補正を別々に保存します。補正は整数（−999〜999）で、未指定は `null`、明示的なゼロは `0`。合計は基本値と補正の和で、能力値の補正は第6版なら従来の3〜18等の尺度、第7版なら百分率の尺度で入力します。HP・MP・SAN・DB・移動率・回避／母国語の初期値・職業／興味ポイントの上限も補正後の能力値を使います。手動指定の職業ポイントは入力値を使用します。技能補正自体は職業／興味ポイントを消費せず、成長にも加算しません。合計が0未満、または技能合計が99を超える場合は保存エラーとして表示します。CCFOLIAの能力値・イニシアティブ・技能コマンドも補正後の値です。

`keyConnection` は既存の背景項目のキー（`appearance`、`belief`、`importantPeople`、`meaningfulPlaces`、`treasuredPossessions`、`traits`）を1つ、または未指定の `null` とします。第7版でのみ選択・表示します。第6版へ切り替えても指定はデータ内に保持されますが適用されません。版の切り替えでは基本能力値と能力補正を同じ倍率で換算・四捨五入し、既存仕様どおり技能一覧・割り振り・技能補正を初期化します。

`inventory` は `{ "name": "ロープ", "quantity": 1, "notes": "10m" }` の配列です。数量は0〜999の整数で、空欄の `null` と残数0を区別します。`weapons` は `name`、`skill`、`damage`、`range`、`attacks`、`ammo`、`malfunction`、`durability`、`notes` を持つ配列です。武器の数値に見える項目も文字列として扱い、`1(3)`、`6+1`、`00`、`連射` などの表記をそのまま保存します。空文字列は未指定で、文字列 `"0"` は明示された値です。これらの項目はWeb・JSON・REST API・MCPで共通です。CCFOLIA出力には背景・所持品・武器・ロスト状態を追加せず、従来の出力範囲を維持します。

`lost` は真偽値で、未指定の旧データは `false` になります。チェックを外すか、API/MCPから `false` で保存すると解除できます。ロストによって削除・公開停止は行いません。

旧JSON・端末保存・D1の探索者は共通スキーマで読み込み、新項目は未指定／空配列／`false` に補完します。旧所持品の自由記述 `equipment` は読み込み結果から除外し、自動分割や移行専用の保持欄は設けません。既存の背景・メモ・技能配分などは保持します。D1の読み取りで元の行を書き換えることはなく、次回の通常保存で新形式に更新します（端末データは既存の自動保存に従います）。SQLマイグレーションや本番DBの一括更新は不要です。旧形式へ戻して保存するクライアントでは追加項目が失われるため、MCP更新時は最新の `get_character` を取得して変更してください。

## 探索者画像

Discordログイン後、基本情報の「画像を登録」からJPEG・PNG・WebP（元画像20MBまで）を選択します。画像の登録時に現在の探索者もクラウドへ保存します。

ブラウザーで縦横比を維持して長辺を最大1,024pxに縮小し、WebPへ再エンコードします。品質82%から調整し、必要ならさらに縮小して、保存サイズを必ず256KiB（262,144バイト）以下に抑えます。小さい画像は拡大せず、透過を保持します。元画像やEXIF情報は送信・保存しません。WebPに変換できないブラウザーではエラーを表示します。

Worker側でもサイズ・WebPコンテナー・実画像の寸法を検証し、アニメーション・不正な形式・EXIF/XMPなどの余分なメタデータを拒否します。ブラウザーの圧縮処理が付ける標準のカラープロファイル（ICCP）は受け付けます。R2にはユーザーと探索者ごとに1つだけ保存し、差し替え時は上書き、画像や探索者の削除時はR2からも削除します。D1には画像の参照情報だけを別カラムに保存し、通常保存やMCP更新から画像の紐付けを変更できないようにしています。

画像の更新・削除には所有者のログインが必要です。取得は所有者、または公開中のシートの公開URLを知っている人だけに許可します。バケットの公開アクセスは有効にしないでください。JSON出力には画像本体を含まず、JSONを新しい探索者として読み込んだ場合は画像の再登録が必要です。非公開シートの画像はログアウト中やオフラインでは表示できません。

ローカル開発・テストはWranglerが模擬するR2を使用します。圧縮、画像の認証・所有権・CSRF、サイズや形式の検証、差し替え、画像・探索者の削除時の後片付けもテストします。

## キャラクターシートの公開モード

探索者の編集画面で「公開設定」を開き、「保存して公開する」を押すと、現在の内容をクラウドへ保存し、専用の `/shared/<ランダムID>` URLを発行します。Discordログインが必要です。URLをコピーして共有できます。

URLを知っていれば、ログインなしでシート全体（画像・プレイヤー名・装備・メモを含む）を閲覧できます。公開ページはサイト共通の深緑とゴールドのテーマを使用し、印刷ボタンはありません。技能は初期状態で「割り振り・補正あり」（職業・興味・成長のいずれかが1以上、または正負の補正あり）だけを表示し、閲覧時に「すべて」へ切り替えられます。各技能には技能値と、初期値・職業・興味・成長・補正の内訳を表示します。公開ページは閲覧専用で、管理者だけに編集画面へのリンクを表示します。保存・画像変更・削除・公開設定のAPIは引き続き所有者だけが操作できます。公開ページには検索エンジン向けのnoindexを付け、シート・画像はキャッシュに保存させません。

公開ページにはクラウドに保存した最新内容を表示します。初期状態は非公開です。「公開を停止する」でシートと画像の公開URLが失効し、再公開すると新しいURLを発行します。通常保存・JSON読込・MCP更新では公開設定を変更しません。既に閲覧者が保存したコピーは回収できません。

公開前に `pnpm run db:remote` で `0004_character_sharing.sql` を適用してください。既存の探索者はすべて非公開のままです。

## 公開

このプロジェクトの `wrangler.jsonc` は現在の公開WorkerとD1に接続しています。別アカウントに公開する場合は `wrangler d1 create` で自分のDBを作成し、`database_id` を変更してください。

```sh
pnpm run db:remote
pnpm run deploy
```

画像機能の初回公開前に、同じCloudflareアカウントで `pnpm exec wrangler r2 bucket create arkhive-character-images` を実行して非公開バケットを作成してください。`wrangler.jsonc` の `CHARACTER_IMAGES` バインディングが接続先です。既存環境にも `pnpm run db:remote` で `0003_character_images.sql` を適用してから公開します。

GitHub Actions では型検査・ビルド・テスト・依存監査・CodeQL を実行します。Cloudflare Workers Builds の main 用トリガーでも検証後に公開する構成です。pnpm への切替には [本番設定の適用手順](.github/pnpm-migration.md#cloudflare-workers-builds-の切替未実施)の実施が必要です。ローカルからの公開は `pnpm run deploy` を使います（`pnpm deploy` は pnpm 自体の別コマンドです）。

旧URLのWorkerは `wrangler.legacy.jsonc` で管理します。`pnpm run deploy:legacy` で転送処理を公開できます。D1は改名前から同じデータベースを使用しています。

旧URL（workers.dev）で端末保存した探索者は、新URLを開いた際にブラウザー内の通信で取り込みます。ブラウザーの制限などで取り込めない場合は、[改名前のURLのデータ書き出し](https://cthulhu-charactersheet.aaa-4e2k3.workers.dev/migrate) または [Arkhiveの旧URLのデータ書き出し](https://arkhive.aaa-4e2k3.workers.dev/migrate)を同じブラウザーで開き、JSONを出力して新URLの「読み込み」から追加できます。移行済みデータを再度取り込まないよう、端末内に完了状態を保存します。

## Discordログインの有効化

アプリ作成は利用者本人が行います。認証コードは実装済みですが、Client ID / Client Secretを登録するまではログインとクラウド保存・MCP連携は利用できません。

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

ChatGPTやClaudeなど、OAuth対応のリモートMCPクライアントから接続します。

1. クライアントのMCP連携設定に以下のURLを追加します。認証方式を選べる場合は **OAuth** を指定してください。

   ```text
   https://arkhive.hiyori-schedule.com/mcp
   ```

2. Arkhiveの許可画面で、接続元の名前・リダイレクト先・操作を確認します。
3. 「Discordでログインして連携」からDiscordログインを完了すると、クライアントへ戻ります。ログイン済みの場合は「連携を許可」で完了します。
4. サイトと同じDiscordアカウントの探索者を利用できます。端末内の探索者は、あらかじめクラウドへ保存してください。

手動のトークン発行・コピーは不要です。接続済みアプリは、サイトでログインして「MCP連携」から個別に解除できます。連携は30日で期限切れになり、再連携が必要です。クライアントの設定画面や利用可否は、契約プラン・管理者設定に依存します。

実装はOAuth認可コード + PKCE（S256）、動的クライアント登録（DCR）、Protected Resource / Authorization Serverメタデータ、自動更新・失効に対応しています。アクセストークンは最長1時間、認可コードは1分、ログイン前の連携リクエストは10分で失効します。資格情報はD1にハッシュのみ保存し、DiscordのアクセストークンはMCPクライアントに渡しません。更新資格情報は毎回ローテーションし、再利用を検出した連携は失効します。

既存環境では、公開前に `pnpm run db:remote` で `0002_mcp_oauth.sql` を適用してください。以前の手動トークンは削除・無効化され、クライアント側でOAuthによる再連携が必要です。DiscordのRedirectsは既存の `/auth/discord/callback` を引き続き使うため、追加登録は不要です。

参考：[OpenAIのMCP認証要件](https://developers.openai.com/plugins/build/auth)、[MCP認可仕様](https://modelcontextprotocol.io/specification/latest/basic/authorization)。

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

探索者は初期状態では非公開です。管理者が公開を有効にしたシートは専用URLで誰でも閲覧できます。編集には所有者のセッションまたはMCPトークンが必要です。端末に保存されたデータはブラウザーデータの消去で失われるため、必要に応じてJSONを出力してください。

本ツールは非公式です。Call of Cthulhuの権利はChaosium Inc.に、日本語版の権利は各権利者に帰属します。公式のルール説明文やPDF、イラストは配布していません。

参照: [KADOKAWA公式探索者シート](https://product.kadokawa.co.jp/cthulhu/contents/coc_material/) / [Hono](https://hono.dev/docs/getting-started/cloudflare-workers) / [Cloudflare D1](https://developers.cloudflare.com/d1/) / [Discord OAuth2](https://discord.com/developers/docs/topics/oauth2) / [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
