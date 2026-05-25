# NDI接続エラー修正計画

## 問題の概要

ビルド済みアプリ（`NDI Multisite.app`）で全拠点に「NDIエラー - Cannot find module '/Applications/NDI Mu...」が表示される問題。

## 原因分析

### 根本原因：3つの問題

#### 1. `receiverWorker.js` がビルド出力にコピーされない（最重要）

- `receiverWorker.js` は純粋なJSファイル（TypeScriptではない）
- `tsc` は `.js` ファイルをデフォルトではコピーしない
- 結果、`dist/main/ndi/receiverWorker.js` が存在しない
- `ndiReceiver.ts` が `path.join(__dirname, 'receiverWorker.js')` でWorkerを起動しようとするが、ファイルが見つからず即座に失敗

#### 2. メインプロセスでのgrandiose require がasar内から実行される

- `discoveryManager.ts` と `ndiSender.ts` で `require('@stagetimerio/grandiose')` を使用
- grandioseはネイティブモジュール（`.node` バイナリ）を含む
- `asarUnpack` でgrandioseは `app.asar.unpacked` に展開されているが、メインプロセスのrequireはasar内のパスから解決しようとする場合がある
- `bindings` モジュールが `module_root` を使ってネイティブバインディングを探すため、パス解決に失敗する可能性がある

#### 3. `receiverWorker.js` 内のgrandioseパス計算が不正確

- Worker内で `path.dirname(asarUnpackedPath)` → `../../..` → `node_modules/@stagetimerio/grandiose` と辿るが、ディレクトリ階層が合わない
- Worker自身が `dist/main/ndi/receiverWorker.js` にあるため、`../../..` は `dist` の親（app root）に上がる
- `app.asar.unpacked` の場合のパスは正しいが、開発モードでは余分な階層移動になる

## 修正方針

### 修正1: tsconfig.main.jsonに `allowJs` を追加

`receiverWorker.js` をtscがdistにコピーするようにする。

### 修正2: grandioseのrequireにapp.asar.unpackedフォールバックを追加

`discoveryManager.ts` と `ndiSender.ts` で、パッケージ済みアプリの場合は `app.asar.unpacked` 側のパスを優先してrequireする。

### 修正3: `receiverWorker.js` のパス解決ロジックを修正

Worker内でのgrandioseパス計算を、実際のディレクトリ構造に合わせて修正する。

---

## 修正対象ファイル

### ビルド設定

#### [MODIFY] [tsconfig.main.json](file:///Users/kiroku_keizo/開発/会議室連携システム/ndi-multisite/tsconfig.main.json)
- `allowJs: true` を追加し、`receiverWorker.js` が `dist/` にコピーされるようにする

---

### NDIモジュール

#### [MODIFY] [discoveryManager.ts](file:///Users/kiroku_keizo/開発/会議室連携システム/ndi-multisite/src/main/ndi/discoveryManager.ts)
- `require('@stagetimerio/grandiose')` を、`app.asar.unpacked` パスを優先するヘルパー関数に置き換え

#### [MODIFY] [ndiSender.ts](file:///Users/kiroku_keizo/開発/会議室連携システム/ndi-multisite/src/main/ndi/ndiSender.ts)
- 同上：`require('@stagetimerio/grandiose')` を修正

#### [NEW] [requireNative.ts](file:///Users/kiroku_keizo/開発/会議室連携システム/ndi-multisite/src/main/ndi/requireNative.ts)
- ネイティブモジュールのrequireを `app.asar.unpacked` パスで解決する共通ヘルパー

#### [MODIFY] [receiverWorker.js](file:///Users/kiroku_keizo/開発/会議室連携システム/ndi-multisite/src/main/ndi/receiverWorker.js)
- grandioseパス解決ロジックを修正

---

## 検証計画

### ビルド検証
1. `npm run build` が成功し、`dist/main/ndi/receiverWorker.js` が生成されることを確認
2. `npm run dist:mac` でビルドし、`app.asar.unpacked` 内のファイル構造を確認

### 動作検証
1. ビルドしたアプリを起動し、NDIエラーが解消されることを確認
2. 2台のマシン間でNDI接続が確立されることを確認
