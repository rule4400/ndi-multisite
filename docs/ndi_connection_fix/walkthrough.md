# NDI接続エラー修正 ウォークスルー

## 問題

ビルド済みアプリで全拠点に「NDIエラー - Cannot find module '/Applications/NDI Mu...」が表示される。

## 原因

| # | 原因 | 影響箇所 |
|---|------|---------|
| 1 | `receiverWorker.js`（純粋JS）がtscでdistにコピーされない | NDI受信Worker起動失敗 |
| 2 | メインプロセスのgrandiose requireがasar内から実行される | Discovery/Sender初期化失敗 |
| 3 | Worker内のgrandioseパス計算で`__filename`ベースの不正パス | Worker内モジュールロード失敗 |

## 変更内容

### [NEW] [requireNative.ts](file:///Users/kiroku_keizo/開発/会議室連携システム/ndi-multisite/src/main/ndi/requireNative.ts)
- `app.asar.unpacked` パスを優先してgrandioseをrequireする共通ヘルパー
- 開発モードでは通常requireにフォールバック

### [MODIFY] [tsconfig.main.json](file:///Users/kiroku_keizo/開発/会議室連携システム/ndi-multisite/tsconfig.main.json)
- `allowJs: true` を追加 → `receiverWorker.js` がdistにコピーされるように

render_diffs(file:///Users/kiroku_keizo/開発/会議室連携システム/ndi-multisite/tsconfig.main.json)

### [MODIFY] [discoveryManager.ts](file:///Users/kiroku_keizo/開発/会議室連携システム/ndi-multisite/src/main/ndi/discoveryManager.ts)
- `require('@stagetimerio/grandiose')` → `requireGrandiose()` に変更

render_diffs(file:///Users/kiroku_keizo/開発/会議室連携システム/ndi-multisite/src/main/ndi/discoveryManager.ts)

### [MODIFY] [ndiSender.ts](file:///Users/kiroku_keizo/開発/会議室連携システム/ndi-multisite/src/main/ndi/ndiSender.ts)
- 同上

render_diffs(file:///Users/kiroku_keizo/開発/会議室連携システム/ndi-multisite/src/main/ndi/ndiSender.ts)

### [MODIFY] [receiverWorker.js](file:///Users/kiroku_keizo/開発/会議室連携システム/ndi-multisite/src/main/ndi/receiverWorker.js)
- `__filename` ベース → `__dirname` ベースに変更
- `path.join` → `path.resolve` で安全なパス解決

render_diffs(file:///Users/kiroku_keizo/開発/会議室連携システム/ndi-multisite/src/main/ndi/receiverWorker.js)

## 検証結果

- ✅ `npm run build:main` 成功
- ✅ `dist/main/ndi/receiverWorker.js` が正しく生成
- ✅ `dist/main/ndi/requireNative.js` が正しく生成
- ✅ コンパイル済みコードのパス解決ロジックが正しい

## 次のステップ

`npm run dist:mac` でパッケージをビルドし、2台のマシンでNDI接続テストを実施してください。
