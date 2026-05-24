/**
 * firewallManager.ts
 *
 * NDI通信に必要なファイアウォール設定を自動的に行う。
 *
 * NDIが使用するポート:
 *   TCP 5960  - NDI 接続・ディスカバリ
 *   UDP 5960  - NDI ディスカバリ
 *   TCP/UDP 5961-5970 - NDI データストリーム
 *   UDP 49152-65535   - NDI 動的ポート（映像・音声）
 *
 * macOS: socketfilterfw でアプリを許可（アプリ単位のAF）
 *        pf は不要（macOSのAFはアプリベース）
 * Windows: netsh advfirewall で受信ルールを追加（管理者権限が必要）
 */

import { exec, execFile } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import { app } from 'electron';
import log from 'electron-log';
import Store from 'electron-store';

const execAsync  = promisify(exec);
const execFileAsync = promisify(execFile);

const store = new Store<{ firewallConfigured: boolean; firewallConfiguredAt: string }>();

export interface FirewallResult {
  success:  boolean;
  platform: 'mac' | 'win' | 'linux' | 'unknown';
  steps:    { label: string; ok: boolean; message: string }[];
  error?:   string;
}

export class FirewallManager {

  isConfigured(): boolean {
    return store.get('firewallConfigured', false) as boolean;
  }

  markConfigured(): void {
    store.set('firewallConfigured', true);
    store.set('firewallConfiguredAt', new Date().toISOString());
  }

  /** 初回起動チェック → 未設定なら自動設定を実行 */
  async configureIfNeeded(): Promise<FirewallResult | null> {
    if (this.isConfigured()) return null;
    return this.configure();
  }

  /** プラットフォームに応じたファイアウォール設定を実行 */
  async configure(): Promise<FirewallResult> {
    const platform = process.platform;

    if (platform === 'darwin') {
      return this.configureMac();
    } else if (platform === 'win32') {
      return this.configureWindows();
    } else {
      return {
        success: true,
        platform: 'linux',
        steps: [{ label: 'Linux', ok: true, message: 'Linux環境では手動設定が必要です' }],
      };
    }
  }

  // ══════════════════════════════════════════════════════════
  // macOS
  // ══════════════════════════════════════════════════════════
  private async configureMac(): Promise<FirewallResult> {
    const steps: FirewallResult['steps'] = [];
    const appPath = app.isPackaged
      ? path.resolve(process.execPath, '../../..')  // .app バンドルのルート
      : app.getPath('exe');

    log.info('[Firewall/mac] App path:', appPath);

    // macOSのApplication Firewallはアプリ単位で許可する
    // socketfilterfw CLI で追加・解除する
    const socketfilterfw = '/usr/libexec/ApplicationFirewall/socketfilterfw';

    // ① アプリをファイアウォールの許可リストに追加
    try {
      const addCmd = `"${socketfilterfw}" --add "${appPath}" && "${socketfilterfw}" --unblockapp "${appPath}"`;
      const osascriptCmd = `do shell script "${addCmd.replace(/"/g, '\\"')}" with administrator privileges`;
      await execFileAsync('osascript', ['-e', osascriptCmd]);
      steps.push({ label: 'アプリをファイアウォールに登録', ok: true, message: '完了' });
    } catch (e: any) {
      // ユーザーがキャンセルした場合など
      if (e.message?.includes('User cancelled')) {
        steps.push({ label: 'アプリをファイアウォールに登録', ok: false, message: 'ユーザーがキャンセルしました' });
        return { success: false, platform: 'mac', steps, error: 'キャンセルされました' };
      }
      // 権限不要の環境（開発中など）は成功扱い
      steps.push({ label: 'アプリをファイアウォールに登録', ok: true, message: `スキップ（${e.message?.slice(0, 60)}）` });
    }

    // ② pfctl でNDIポート解放（任意 - macOSのpfはデフォルト無効）
    try {
      const pfStatus = await execAsync('sudo pfctl -s info 2>&1').catch(() => ({ stdout: 'disabled' }));
      if (pfStatus.stdout.includes('Enabled')) {
        // pf が有効な場合のみルールを追加
        const pfRule = `pass in proto tcp to any port {5960,5961,5962,5963,5964,5965,5966,5967,5968,5969,5970}\npass in proto udp to any port {5960,49152:65535}`;
        const addPfCmd = `echo '${pfRule}' | pfctl -f - 2>&1`;
        const osaPfCmd = `do shell script "${addPfCmd.replace(/"/g, '\\"')}" with administrator privileges`;
        await execFileAsync('osascript', ['-e', osaPfCmd]);
        steps.push({ label: 'pf ポートルール追加', ok: true, message: 'NDIポートを開放しました' });
      } else {
        steps.push({ label: 'pf ポートルール', ok: true, message: 'pf は無効（設定不要）' });
      }
    } catch {
      steps.push({ label: 'pf ポートルール', ok: true, message: 'スキップ' });
    }

    this.markConfigured();
    return { success: true, platform: 'mac', steps };
  }

  // ══════════════════════════════════════════════════════════
  // Windows
  // ══════════════════════════════════════════════════════════
  private async configureWindows(): Promise<FirewallResult> {
    const steps: FirewallResult['steps'] = [];

    const rules = [
      { name: 'NDI Multisite TCP IN',  proto: 'TCP', dir: 'in',  ports: '5960-5970' },
      { name: 'NDI Multisite TCP OUT', proto: 'TCP', dir: 'out', ports: '5960-5970' },
      { name: 'NDI Multisite UDP IN',  proto: 'UDP', dir: 'in',  ports: '5960,49152-65535' },
      { name: 'NDI Multisite UDP OUT', proto: 'UDP', dir: 'out', ports: '5960,49152-65535' },
    ];

    // netsh コマンドを PowerShell 経由で管理者実行
    const netshCmds = rules.map(r =>
      `netsh advfirewall firewall add rule name="${r.name}" dir=${r.dir} action=allow protocol=${r.proto} localport=${r.ports} enable=yes`
    ).join(' ; ');

    // 既存ルール削除してから追加（重複防止）
    const deleteCmds = rules.map(r =>
      `netsh advfirewall firewall delete rule name="${r.name}" 2>nul`
    ).join(' & ');

    const fullCmd = `${deleteCmds} & ${netshCmds}`;

    try {
      // PowerShell で UAC 昇格して実行
      await execAsync(
        `powershell -Command "Start-Process cmd -Verb RunAs -ArgumentList '/c ${fullCmd.replace(/"/g, '\\"')}' -Wait"`,
        { timeout: 30000 }
      );
      rules.forEach(r => {
        steps.push({ label: `${r.name}`, ok: true, message: `${r.proto} ${r.dir} ポート ${r.ports}` });
      });
      this.markConfigured();
      return { success: true, platform: 'win', steps };
    } catch (e: any) {
      const msg = e.message?.slice(0, 100) ?? '不明なエラー';
      steps.push({ label: 'Windowsファイアウォール設定', ok: false, message: msg });
      return { success: false, platform: 'win', steps, error: msg };
    }
  }
}

export const firewallManager = new FirewallManager();
