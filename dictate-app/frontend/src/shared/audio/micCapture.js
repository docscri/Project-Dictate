const permissionErrors = new Set(['NotAllowedError', 'PermissionDeniedError', 'NotFoundError', 'DevicesNotFoundError', 'NotReadableError', 'SecurityError']);
const micError = (error) => Object.assign(new Error('Microphone capture failed'), { code: permissionErrors.has(error?.name) ? 'mic_off' : 'server_error' });

export async function requestMicrophoneAccess() {
  if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error('Secure microphone context required'), { code: 'mic_off' });
  try { const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); stream.getTracks().forEach((track) => track.stop()); }
  catch (error) { throw micError(error); }
}

export async function createMicCapture({ onFrame, onUnavailable }) {
  if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error('Secure microphone context required'), { code: 'mic_off' });
  let context, stream, source, processor, mute;
  let enabled = false, stopped = false, flushed;
  async function stop({ flush = false } = {}) {
    if (stopped) return;
    stopped = true;
    if (flush && processor && enabled) {
      await new Promise((resolve) => { flushed = resolve; processor.port.postMessage('flush'); setTimeout(resolve, 150); });
    }
    enabled = false;
    if (processor) { processor.port.onmessage = null; processor.disconnect(); processor.port.close(); }
    source?.disconnect(); mute?.disconnect();
    stream?.getTracks().forEach((track) => { track.onended = null; track.stop(); });
    if (context && context.state !== 'closed') await context.close().catch(() => {});
  }
  try {
    // Create and resume synchronously from the button gesture, before permission awaits.
    const Context = window.AudioContext ?? window.webkitAudioContext;
    context = new Context({ latencyHint: 'interactive' });
    const resumed = context.resume();
    resumed.catch(() => {});
    stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
    await resumed;
    await context.audioWorklet.addModule(new URL('./pcmWorklet.js', import.meta.url));
    processor = new AudioWorkletNode(context, 'dictate-pcm', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
    processor.port.onmessage = ({ data }) => {
      if (data.type === 'audio' && enabled) onFrame(data.frame);
      if (data.type === 'flushed') flushed?.();
    };
    source = context.createMediaStreamSource(stream);
    mute = context.createGain(); mute.gain.value = 0;
    source.connect(processor); processor.connect(mute); mute.connect(context.destination);
    stream.getTracks().forEach((track) => { track.onended = () => { if (!stopped) { stop(); onUnavailable?.(); } }; });
    return { start: () => { enabled = true; }, stop };
  } catch (error) { await stop(); throw micError(error); }
}
