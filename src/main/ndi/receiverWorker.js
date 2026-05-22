const { workerData, parentPort } = require('worker_threads');

let receiver = null;
let running = true;
let lastFpsTime = Date.now();
let frameCount = 0;

async function run() {
  const { source } = workerData;

  let grandiose;
  try {
    grandiose = require('@stagetimerio/grandiose');
  } catch (err) {
    parentPort.postMessage({ type: 'error', error: `NDI SDK not available: ${err.message}` });
    return;
  }

  try {
    receiver = await grandiose.receive({
      source,
      colorFormat: grandiose.COLOR_FORMAT_BGRX_BGRA,
      bandwidth: grandiose.BANDWIDTH_HIGHEST,
      allowVideoFields: false,
    });
  } catch (err) {
    parentPort.postMessage({ type: 'error', error: `Failed to create receiver: ${err.message}` });
    return;
  }

  parentPort.on('message', (msg) => {
    if (msg.type === 'stop') running = false;
  });

  while (running) {
    try {
      const videoFrame = await receiver.video(16);
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

      const audioFrame = await receiver.audio(4).catch(() => null);
      if (audioFrame) {
        parentPort.postMessage({
          type: 'audio',
          data: Buffer.from(audioFrame.data),
          sampleRate: audioFrame.sampleRate,
          channels: audioFrame.noChannels,
        });
      }
    } catch (err) {
      if (running) {
        parentPort.postMessage({ type: 'error', error: err.message });
        await new Promise(r => setTimeout(r, 1000));
      }
    }
  }

  if (receiver) try { receiver.destroy?.(); } catch (_) {}
}

run().catch(err => {
  parentPort.postMessage({ type: 'error', error: err.message });
});
