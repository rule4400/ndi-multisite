# NDI Multisite 動作確認手順

## 前提条件

- NDI SDK（5.x）を [https://ndi.tv/tools/](https://ndi.tv/tools/) からダウンロードしてインストール
- Node.js 20.x 以上
- Windows 11: Visual Studio Build Tools（C++ ワークロード）
- macOS: Xcode Command Line Tools (`xcode-select --install`)

## セットアップ

```bash
cd ndi-multisite
npm install          # grandiose を含むネイティブモジュールのビルドも実行
```

### Apple Silicon (arm64) の場合

```bash
npx electron-rebuild -a arm64
```

---

## チェックリスト

### ビルド・起動

- [ ] **Windows 11 でビルド・起動**
  ```bash
  npm run build
  npm run dist:win
  # release/ に NSIS インストーラが生成されることを確認
  ```

- [ ] **macOS (Intel) でビルド・起動**
  ```bash
  npm run build
  npm run dist:mac
  # release/ に .dmg が生成されることを確認
  ```

- [ ] **macOS (Apple Silicon) でビルド・起動**
  - 上記 arm64 リビルド後に `npm run dist:mac`
  - `.dmg` を開き、Rosetta なしでネイティブ起動すること

---

### 初回起動・認証

- [ ] **初回起動時にパスワード設定画面が表示される**
  - Full Access パスワードと View Only パスワードを両方設定
  - 設定後にログイン画面へ遷移すること

- [ ] **Full Access でログイン → カメラ・マイク UI が表示される**
  - ControlPanel にカメラ・マイク・スピーカーボタンが全て表示される
  - 設定ボタンが表示される

- [ ] **View Only でログイン → カメラ・マイク UI が非表示になる**
  - ControlPanel にスピーカー・音量のみ表示される
  - 設定ボタンが非表示になる

- [ ] **View Only ログイン中に NDI 送信が行われていない（Main 側ガード確認）**
  - NDI Studio Monitor などで自拠点ソースが現れないことを確認

---

### NDI 映像・音声

- [ ] **カメラ映像が NDI 送信される**
  - NDI Studio Monitor（別 PC またはループバック）で自拠点ソースを受信できる

- [ ] **マイク音声が NDI 送信される**
  - NDI Studio Monitor の音声インジケータで音声レベルが動いていること

- [ ] **他 PC の NDI ソースが自動検出される**
  - 同一 VPN セグメントに NDI 機器を接続し、設定 > ネットワーク > 再スキャンで検出されること

---

### UI

- [ ] **13 拠点分の VideoGrid が表示される**
  - 設定 > 拠点設定 で 13 拠点を追加
  - 自動グリッド計算で 4×4 レイアウトになること

- [ ] **カメラ ON/OFF が即座に反映される（黒フレーム差し替え）**
  - カメラ OFF → 受信側で黒フレームになること（1 秒以内）

- [ ] **マイク ON/OFF が即座に反映される（無音差し替え）**
  - マイク OFF → 音声がゼロになること

- [ ] **スピーカー ON/OFF が機能する**
  - スピーカー OFF → 受信音声が再生されないこと

- [ ] **拠点を追加すると再起動なしに Grid に追加される**
  - 設定画面から追加 → ダイアログを閉じた直後に Grid に追加セルが現れること

---

### ネットワーク復旧

- [ ] **VPN 切断 → 再接続後にストリームが自動復旧する**
  - VPN を意図的に切断（数秒待機） → 再接続
  - 受信側で StatusIndicator が赤 → 緑に戻ること（最大 10 秒以内）

---

### パフォーマンス

- [ ] **CPU 使用率が 13 拠点接続時に 80% を超えない（720p/30fps 時）**
  - Windows: タスクマネージャー、macOS: アクティビティモニタで確認
  - Worker Thread 分離により Main スレッドへの負荷が最小化されていること

---

## ファイアウォール確認（Windows）

インストール後、以下のルールが存在することを確認：

```powershell
netsh advfirewall firewall show rule name="NDI Multisite TCP"
netsh advfirewall firewall show rule name="NDI Multisite UDP"
netsh advfirewall firewall show rule name="NDI Multisite Discovery"
netsh advfirewall firewall show rule name="NDI Multisite mDNS"
```

---

## macOS 権限確認

1. システム設定 > プライバシーとセキュリティ > カメラ
   - 「NDI Multisite」にチェックが入っていること
2. 同 > マイク
   - 「NDI Multisite」にチェックが入っていること

---

## ログ確認

- Windows: `%APPDATA%\ndi-multisite\logs\main.log`
- macOS: `~/Library/Logs/ndi-multisite/main.log`
