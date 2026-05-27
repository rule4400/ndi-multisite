/**
 * receiverWorker.js  -- NDI 受信 Worker Thread
 *
 * Worker Thread として独立プロセスで NDI 受信を行い、
 * メインプロセスへフレームを送る。
 *
 * 重要:
 *   - audio() の正しいシグネチャは audio(params, timeout)。timeout 単独では渡せない。
 *   - bandwidth: 'lowest' (HX/プロキシモード) または 'highest' (フル)。デフォルト lowest。
 *   - 大きなフレームは ArrayBuffer.transfer で 0-copy 転送する（structured clone の負荷を下げる）。
 *   - メインがバックプレッシャー時はフレームをスキップ。
 */

const { workerData, parentPort } = require('worker_threads');
const path = require('path');

const { source, bandwidth = 'lowest' } = workerData || {};

let receiver = null;
let running  = true;
let pending  = 0;          // メインが処理中のフレーム数（バックプレッシャー）
let mainReady = true;       // メインから ACK 受信中フラグ

// 統計
let frameCount = 0;
let lastFpsTime = Date.now();

// grandiose のロード（asar.unpacked パス対応）
function loadGrandiose() {
  // __dirname  = .../app.asar.unpacked/dist/main/ndi  (packaged)
  //            = .../dist/main/ndi                    (dev)
  const unpackedDir = __dirname.replace(/app\.asar([/\\])/, 'app.asar.unpacked$1');
  const grandiosePath = path.resolve(
    unpackedDir, '..', '..', '..',
    'node_modules', '@stagetimerio', 'grandiose',
  );
  try { return require(grandiosePath); } catch (_) {}
  try { return require('@stagetimerio/grandiose'); } catch (e) {
    throw new Error(`NDI SDK (grandiose) ロード失敗: ${e.message}`);
  }
}

function log(message) {
  try { parentPort.postMessage({ type: 'log', message }); } catch (_) {}
}

function reportError(message) {
  try { parentPort.postMessage({ type: 'error', error: String(message) }); } catch (_) {}
}

// メインからの ack で次フレームを送れるようにする
parentPort.on('message', (msg) => {
  if (!msg) return;
  if (msg.type === 'stop')  { running = false; }
  if (msg.type === 'ack')   { pending = Math.max(0, pending - 1); }
  if (msg.type === 'ready') { mainReady = true; }
});

// タイムアウト判定（grandiose は timeout 時にエラーを投げる）
const TIMEOUT_PATTERNS = [
  'No video data received',
  'No audio data received',
  'time interval',
  'timed out',
];
const isTimeoutError = (m) => TIMEOUT_PATTERNS.some(p => m && m.includes(p));

async function run() {
  // 引数チェック
  if (!source || (!source.urlAddress && !source.name)) {
    return reportError('source.urlAddress または source.name が必要です');
  }

  let grandiose;
  try {
    grandiose = loadGrandiose();
  } catch (err) {
    return reportError(err.message);
  }

  // 受信モード
  const bw = bandwidth === 'highest'
    ? grandiose.BANDWIDTH_HIGHEST
    : grandiose.BANDWIDTH_LOWEST;

  log(`grandiose ready / bandwidth=${bandwidth} / source=${JSON.stringify(source)}`);

  // ── レシーバー生成 ──────────────────────────────────────
  try {
    receiver = await grandiose.receive({
      source,
      colorFormat: grandiose.COLOR_FORMAT_BGRX_BGRA,
      bandwidth: bw,
      allowVideoFields: false,
    });
    parentPort.postMessage({ type: 'ready' });
    log('receiver created');
  } catch (err) {
    return reportError(`Failed to create receiver: ${err.message}`);
  }

  // ── 受信ループ ──────────────────────────────────────────
  // video と audio を別タイマーで非同期に取得する。
  // 互いに待ち合わせると片方がブロックされる。
  runVideoLoop(receiver);
  runAudioLoop(receiver);
}

async function runVideoLoop(rx) {
  while (running) {
    try {
      // バックプレッシャー: メインが詰まっていたら短いスリープでフレームをスキップ
      if (pending >= 2) {
        await sleep(33);  // 約1フレーム分待機
        // 蓄積中のフレームをドロップして次の最新フレームを取りに行く
        try { await rx.video(1); } catch (_) {}
        continue;
      }

      // 200ms タイムアウトで video を待つ
      const frame = await rx.video(200);
      if (!running) break;
      if (!frame) continue;

      frameCount++;
      const now = Date.now();
      let fps;
      const elapsed = now - lastFpsTime;
      if (elapsed >= 1000) {
        fps = Math.round((frameCount * 1000) / elapsed);
        frameCount = 0;
        lastFpsTime = now;
      }

      sendVideoFrame(frame, fps);
    } catch (err) {
      if (!running) break;
      if (isTimeoutError(err.message)) continue; // タイムアウトは正常
      reportError(`video: ${err.message}`);
      await sleep(1000);
    }
  }
  cleanup();
}

async function runAudioLoop(rx) {
  while (running) {
    try {
      // 正しいシグネチャ: audio(params?, timeout?)
      // タイムアウトのみ指定したい場合は第1引数 undefined を渡す
      const frame = await rx.audio(undefined, 100);
      if (!running) break;
      if (!frame) continue;

      sendAudioFrame(frame);
    } catch (err) {
      if (!running) break;
      if (isTimeoutError(err.message)) continue;
      // audio エラーは UI に出さない（ノイズ抑制）
      await sleep(500);
    }
  }
}

function sendVideoFrame(frame, fps) {
  try {
    if (!frame.data || frame.data.byteLength === 0) return;
    // Buffer → 独立 ArrayBuffer (transfer 可能)
    const ab = new ArrayBuffer(frame.data.byteLength);
    new Uint8Array(ab).set(new Uint8Array(
      frame.data.buffer, frame.data.byteOffset, frame.data.byteLength,
    ));
    pending++;
    parentPort.postMessage({
      type: 'video',
      buffer: ab,        // ArrayBuffer (transferable)
      width:  frame.xres,
      height: frame.yres,
      fps,
    }, [ab]);           // ← transfer list で 0-copy
  } catch (err) {
    reportError(`sendVideoFrame: ${err.message}`);
  }
}

function sendAudioFrame(frame) {
  try {
    if (!frame.data || frame.data.byteLength === 0) return;
    const ab = new ArrayBuffer(frame.data.byteLength);
    new Uint8Array(ab).set(new Uint8Array(
      frame.data.buffer, frame.data.byteOffset, frame.data.byteLength,
    ));
    parentPort.postMessage({
      type: 'audio',
      buffer: ab,
      sampleRate: frame.sampleRate,
      channels:   frame.channels ?? frame.noChannels,
      samples:    frame.samples ?? Math.floor(frame.data.byteLength / 4 / (frame.channels ?? frame.noChannels ?? 2)),
    }, [ab]);
  } catch (_) {
    // silent
  }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function cleanup() {
  if (receiver) {
    try { receiver.destroy?.(); } catch (_) {}
    receiver = null;
  }
}

run().catch(err => {
  reportError(`fatal: ${err.message}`);
  cleanup();
});
