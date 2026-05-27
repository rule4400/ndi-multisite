/**
 * ndiNaming.ts
 *
 * NDIソース名の自動生成・解決ロジック。
 *
 * ユーザーには「拠点名」だけ意識してもらい、内部で NDI 名称を扱う。
 *
 * NDI プロトコル上のフルネーム形式:
 *   "<MACHINE_NAME> (<SOURCE_NAME>)"
 *   例: "MacBook-Pro (本部)"
 *
 * - 送信側: grandiose.send({ name }) の name は「カッコ内」の部分。
 *   フルネームの前段は OS のホスト名が自動的に付く。
 * - 受信側: 接続先指定は urlAddress (IP:port) を優先する。
 *   IP直接接続なら NDI 名前マッチに頼らないため最も確実。
 */
import * as os from 'os';
import { Site } from '../../shared/types';

/**
 * 自拠点が NDI 送信時に名乗る名前。
 * - selfSite が見つかればその拠点名を使用
 * - 見つからなければ config.siteName をフォールバック
 */
export function getSenderName(siteName: string): string {
  // 日本語含めて利用可能。空白などは含まれていても OK
  const cleaned = (siteName ?? '').trim();
  return cleaned || `NDI-Multisite (${os.hostname()})`;
}

/**
 * 受信側で NDI ソースを検索する際の「予想されるフルネーム」のヒント。
 * mDNS で見つかった他拠点ソースとマッチさせるのに使う。
 *
 * 例: site.name="本部" → "* (本部)" の部分一致で検索
 */
export function siteToNdiNameHint(site: Site): string {
  return (site.ndiSourceName?.trim() || site.name).trim();
}

/**
 * NDI ソース名が指定サイトに合致するか判定。
 *
 * NDI のフルネームは "<machine> (<source>)" 形式なので、
 * カッコ内の名前またはフルネーム全体で部分一致を判定する。
 */
export function ndiSourceMatchesSite(ndiName: string, site: Site): boolean {
  if (!ndiName) return false;
  const hint = siteToNdiNameHint(site).toLowerCase();
  if (!hint) return false;
  const lower = ndiName.toLowerCase();

  // 1) 明示的に "(<hint>)" を含む（NDI 標準フォーマット）
  if (lower.includes(`(${hint})`)) return true;

  // 2) ユーザーが直接指定したフルネームと完全一致
  if (lower === hint) return true;

  return false;
}
