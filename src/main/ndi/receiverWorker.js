const { workerData, parentPort } = require('worker_threads');

let receiver = null;
let running = true;
let lastFpsTime = Date.now();
let frameCount = 0;

async function run() {
  const { source } = workerData;

  let grandiose;
  try {
    // asar パッケージ内からは native module を require できないため
    // app.asar.unpacked 側のパスを優先して試みる
    const path = require('path');

    // __dirname = .../app.asar.unpacked/dist/main/ndi (パッケージ済み)
    //           = .../dist/main/ndi                   (開発モード)
    // どちらの場合も 3階層上 → アプリルート → node_modules
    const unpackedDir = __dirname.replace(/app\.asar([/\\])/, 'app.asar.unpacked$1');
    const grandioseUnpackedPath = path.resolve(
      unpackedDir,
      '..', '..', '..',
      'node_modules', '@stagetimerio', 'grandiose'
    );
    try {
      grandiose = require(grandioseUnpackedPath);
    } catch (_) {
      grandiose = require('@stagetimerio/grandiose');
    }
  } catch (err) {
    parentPort.postMessage({ type: 'error', error: `NDI SDK not available: ${err.message}` });
    return;
  }

  try {
    parentPort.postMessage({ type: 'log', message: `Connecting to NDI source: ${JSON.stringify(source)}` });
    receiver = await grandiose.receive({
      source,
      colorFormat: grandiose.COLOR_FORMAT_BGRX_BGRA,
      bandwidth: grandiose.BANDWIDTH_HIGHEST,
      allowVideoFields: false,
    });
    parentPort.postMessage({ type: 'ready' });
  } catch (err) {
    parentPort.postMessage({ type: 'error', error: `Failed to create receiver: ${err.message}` });
    return;
  }

  parentPort.on('message', (msg) => {
    if (msg.type === 'stop') running = false;
  });

  // grandiose が timeout で throw するエラーメッセージのパターン
  const TIMEOUT_PATTERNS = [
    'No video data received in the requested time interval',
    'No audio data received in the requested time interval',
    'time interval',
    'timed out',
  ];
  const isTimeout = (msg) => TIMEOUT_PATTERNS.some(p => msg && msg.includes(p));

  while (running) {
    // --- Video ---
    try {
      const videoFrame = await receiver.video(100); // 100ms timeout
      if (videoFrame) {
        frameCount++;
        const now = Date.now();
        const elapsed = now - lastFpsTime;
        let fps;
        if (elapsed >= 1000) {
          fps = Math.round((frameCount * 1000) / elapsed);
          frameCount = 0;
          lastFpsTime = now;
        }
        const buf = Buffer.from(videoFrame.data);
        parentPort.postMessage({
          type: 'video',
          data: buf,
          width: videoFrame.xres,
          height: videoFrame.yres,
          fps,
        });
      }
    } catch (err) {
      if (!running) break;
      if (!isTimeout(err.message)) {
        // タイムアウト以外の本物のエラーだけ報告
        parentPort.postMessage({ type: 'error', error: err.message });
        await new Promise(r => setTimeout(r, 2000));
      }
      // タイムアウトは無視してループ継続
    }

    // --- Audio ---
    try {
      const audioFrame = await receiver.audio(50); // 50ms timeout
      if (audioFrame) {
        parentPort.postMessage({
          type: 'audio',
          data: Buffer.from(audioFrame.data),
          sampleRate: audioFrame.sampleRate,
          channels: audioFrame.noChannels,
        });
      }
    } catch (_) {
      // audio timeout は常に無視
    }
  }

  if (receiver) try { receiver.destroy?.(); } catch (_) {}
}

run().catch(err => {
  parentPort.postMessage({ type: 'error', error: err.message });
});
