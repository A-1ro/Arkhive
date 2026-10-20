# pnpm 移行と適用手順

## 固定バージョンと保護範囲

`packageManager: pnpm@10.34.7` を開発、GitHub Actions、Workers Builds で共通にします。
2026-10-21 の npm 配布タグ `latest-10` と [公式リリース](https://github.com/pnpm/pnpm/releases/tag/v10.34.7)を確認しました。
最新メジャーの 12 系ではなく、[Dependabot の公式対応範囲](https://docs.github.com/en/code-security/reference/supply-chain-security/supported-ecosystems-and-repositories)にある 10 系の安定版を選びました。
Dependabot の `package-ecosystem: npm` は pnpm でも正しいため維持します。
`packageManagerStrictVersion: true` と `managePackageManagerVersions: false` で、古い pnpm の実行や暗黙の切替を避けます。pnpm を更新するときはこの設定、CI、以下の Builds 設定を一緒に見直します。

`pnpm import` で既存 `package-lock.json` を変換しました。
元の 271 個のパッケージ名・バージョンの組と integrity がすべて一致し、追加・削除・更新はありません。
依存宣言の範囲（`latest` を含む）は今回変更していません。通常の再現インストールでは解決し直さず、必ず `--frozen-lockfile` を使用します。
lockfile は `pnpm-lock.yaml` に一本化します。

`pnpm-workspace.yaml` の [pnpm 10 設定](https://pnpm.io/10.x/settings)は以下の制約を追加します。

- `allowBuilds` は esbuild 0.28.2 と workerd 1.20261012.1 だけをバージョン付きで許可。パッケージ更新時はスクリプトを再確認します。
- `strictDepBuilds: true` で未知の lifecycle script をインストールエラーにします。
- fsevents 2.3.3 は明示的に不許可。macOS 用の任意依存で、配布済み `fsevents.node` を利用するため再ビルドは不要です。
- `minimumReleaseAge: 1440` は新たな解決に1日の公開待機時間を設けます。既存の frozen lockfile の安全性を再判定する設定ではありません。
- `blockExoticSubdeps: true` は推移依存の外部 Git / tarball 等の取得元を制限します。

pnpm はサンドボックスやマルウェア検査ではありません。許可した install script、ビルド、テスト、実行時のコードは実行権限を持ちます。
esbuild/workerd の install script は任意依存が欠けると npm や直接ダウンロードにフォールバックするため、`--no-optional` は使いません。今回の通常インストールではフォールバック取得は発生していません。
レビュー、最小権限、依存監査、CodeQL を引き続き必要とします。
未知の脆弱性、公開待機期間を過ぎた侵害、許可済みの悪意あるコードは防げません。

## ネイティブ依存と検証

| パッケージ           | 固定 lock の構成と確認                                                                                                                         |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript 7.0.2     | `@typescript/typescript-*` の任意依存からプラットフォーム別ネイティブコンパイラーを取得。install script なし。`tsc --version` と型検査を実行。 |
| esbuild 0.28.2       | `@esbuild/*` の任意依存を利用。`node install.js` を点検して許可し、TypeScript の変換と Vite ビルドを実行。                                     |
| sharp 0.35.5         | `@img/sharp-*` / libvips の任意依存を利用。install script なし。許可リストには加えず、WebP のエンコードと読み戻しを実行。                      |
| workerd 1.20261012.1 | `@cloudflare/workerd-*` の任意依存を利用。`node install.js` を点検して許可し、バージョン確認とローカル D1/R2 を使う結合テストを実行。          |

`pnpm run check:native` は上記4種類を現在のプラットフォーム上で実行します。Linux の GitHub CI にも含めています。
任意依存のバイナリは OS/CPU ごとに異なるため、別 OS の `node_modules` をコピーせず、その環境でインストールしてください。

```sh
pnpm --version # 10.34.7
pnpm install --frozen-lockfile
pnpm run check:native
pnpm run typecheck
pnpm run build
pnpm test
pnpm audit --audit-level=low
```

GitHub Actions のキャッシュは `pnpm-lock.yaml` をキーにした pnpm store のみです。インストールを省略しません。
監査ジョブはインストールせずに lockfile 全体（開発・任意依存を含む）を監査し、low 以上と監査未完了を失敗にします。
CodeQL の対象言語・security-extended・アップロード権限は維持しています。

## Cloudflare Workers Builds の切替（未実施）

接続済み API の GET で確認した `arkhive` の `Production main deploy` トリガーが対象です。
この PR の作業では設定変更・ビルド起動・公開を行っていません。
以下は承認後に実施する手順です。新しいトークン・資格情報・権限は不要です。

| 設定                                     | 読み取り時の値                                   | 適用する値                                                                                                     |
| ---------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Production branch                        | `main`                                           | `main`                                                                                                         |
| Root directory                           | `/`                                              | `/`                                                                                                            |
| Build variable `PNPM_VERSION`            | 未設定（イメージ既定は 10.11.1）                 | `10.34.7`                                                                                                      |
| Build variable `NODE_VERSION`            | 未設定                                           | `22`（GitHub CI と同じメジャー）                                                                               |
| Build variable `SKIP_DEPENDENCY_INSTALL` | 未設定                                           | `true`                                                                                                         |
| Build command                            | `npm run typecheck && npm run build && npm test` | `pnpm install --frozen-lockfile && pnpm run check:native && pnpm run typecheck && pnpm run build && pnpm test` |
| Deploy command                           | `npx wrangler deploy --keep-vars`                | `pnpm exec wrangler deploy --keep-vars`                                                                        |
| Build caching                            | `true`                                           | `true`（切替時に既存キャッシュをクリア）                                                                       |

Workers Builds に個別の install command 欄はないため、[自動インストールを無効化](https://developers.cloudflare.com/workers/ci-cd/builds/build-image/#skip-dependency-install)し、build command の先頭で frozen install を実行します。
`PNPM_VERSION` を明示しないと既定の 10.11.1 は今回の `allowBuilds` に対応しません。[バージョン指定の公式説明](https://developers.cloudflare.com/workers/ci-cd/builds/build-image/#overriding-default-versions)に従います。

1. PR の CI と差分を確認します。main は自動公開対象なので、この PR をマージする前に上表の設定変更とマージの実施順を承認します。
2. Workers の Settings → Build で上表の変数・コマンドを変更し、キャッシュをクリアします。これらはビルド時変数です。実行時 secrets や既存バインディングを変更しません。
3. 設定を読み戻して確認します。旧 main には pnpm lock がないため、この時点で旧 main の再ビルドを開始せず、他の main 更新とも切替を調整します。
4. PR をマージする許可が出たらマージし、main のビルドログで pnpm 10.34.7、frozen install、4種類のネイティブ確認、型検査・ビルド・全テストの成功を確認します。
5. 公開後の確認は別途許可された作業として実施します。切替失敗時は再公開を止め、最後に成功したデプロイを維持します。

ロールバックする場合は PR を revert して npm lock を復元し、ビルド・公開コマンドを上表の変更前に戻します。今回追加した3つの build variables も変更前の未設定に戻し、キャッシュをクリアしてから確認します。依存管理方式とコマンドは同時に揃えてください。
