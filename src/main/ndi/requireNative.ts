/**
 * requireNative.ts
 *
 * Electron パッケージ済みアプリ（asar）内ではネイティブモジュール（.node）を
 * 直接 require できないため、app.asar.unpacked 側のパスを優先して解決する。
 */
import * as path from 'path';
import log from 'electron-log';

/**
 * ネイティブモジュールを asar.unpacked 優先で require する。
 *
 * 1. __dirname を app.asar → app.asar.unpacked に書き換えたパスで試す
 * 2. 失敗したら通常の require にフォールバック
 */
export function requireGrandiose(): any {
  // ── 1) app.asar.unpacked 側から読む ──
  try {
    const unpackedDir = __dirname.replace(/app\.asar([/\\])/, 'app.asar.unpacked$1');
    const grandioseUnpackedPath = path.resolve(
      unpackedDir,
      '..', '..', '..',           // dist/main/ndi → ルートへ
      'node_modules', '@stagetimerio', 'grandiose',
    );
    return require(grandioseUnpackedPath);
  } catch (_) {
    // unpacked パスが存在しない（開発モードなど）
  }

  // ── 2) 通常の require ──
  try {
    return require('@stagetimerio/grandiose');
  } catch (err) {
    log.error('Failed to load @stagetimerio/grandiose:', err);
    throw err;
  }
}
