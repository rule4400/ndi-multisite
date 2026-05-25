# NDI接続エラー修正タスク

- [x] tsconfig.main.json に `allowJs: true` を追加
- [x] `requireNative.ts` ヘルパーを作成
- [x] `discoveryManager.ts` のrequire修正
- [x] `ndiSender.ts` のrequire修正
- [x] `receiverWorker.js` のパス解決ロジック修正
- [x] ビルド検証（`npm run build:main`）
- [x] dist内のreceiverWorker.js存在確認
