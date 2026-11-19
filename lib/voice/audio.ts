// Audio helpers for microphone capture.

export const TARGET_RATE = 16000; // Whisper expects 16 kHz mono

export function concat(chunks: Float32Array[], total: number): Float32Array {
  const out = new Float32Array(total);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

export function resample(input: Float32Array, rate: number): Float32Array {
  if (rate === TARGET_RATE) return input;
  const ratio = rate / TARGET_RATE;
  const out = new Float32Array(Math.floor(input.length / ratio));
  for (let i = 0; i < out.length; i++) {
    // average the source samples covering this output sample (cheap low-pass)
    const start = Math.floor(i * ratio), end = Math.min(input.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = start; j < end; j++) sum += input[j];
    out[i] = sum / Math.max(1, end - start);
  }
  return out;
}

export function rms(chunk: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < chunk.length; i++) sum += chunk[i] * chunk[i];
  return Math.sqrt(sum / chunk.length);
}

// AudioWorklet that forwards mic audio to the main thread in 2048-sample chunks.
// Kept as a string and loaded through a Blob URL so it needs no separate bundle entry.
const TAP_WORKLET = `
class Tap extends AudioWorkletProcessor {
  constructor(){ super(); this.buf = new Float32Array(2048); this.n = 0; }
  process(inputs){
    const ch = inputs[0][0];
    if (ch) {
      for (let i = 0; i < ch.length; i++) {
        this.buf[this.n++] = ch[i];
        if (this.n === this.buf.length) { this.port.postMessage(this.buf.slice()); this.n = 0; }
      }
    }
    return true;
  }
}
registerProcessor('tap', Tap);`;

export type MicTap = { sampleRate: number; stop: () => void };

/**
 * Opens the microphone and calls onChunk with raw Float32 audio.
 * The AudioContext is created synchronously (inside the user's tap) so
 * Chrome's autoplay policy doesn't leave it suspended.
 */
export async function openMic(onChunk: (chunk: Float32Array) => void): Promise<MicTap> {
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const audioCtx = new Ctx();
  let stream: MediaStream | null = null;
  let source: MediaStreamAudioSourceNode | null = null;
  let node: AudioWorkletNode | null = null;

  const stop = () => {
    node?.port.close();
    source?.disconnect();
    node?.disconnect();
    stream?.getTracks().forEach(t => t.stop());
    audioCtx.close().catch(() => {});
  };

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
    });
    if (audioCtx.state === 'suspended') await audioCtx.resume();

    const url = URL.createObjectURL(new Blob([TAP_WORKLET], { type: 'application/javascript' }));
    await audioCtx.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);

    source = audioCtx.createMediaStreamSource(stream);
    node = new AudioWorkletNode(audioCtx, 'tap');
    node.port.onmessage = (e: MessageEvent<Float32Array>) => onChunk(e.data);
    source.connect(node);
    // keep the graph pulling audio without playing it back
    const mute = audioCtx.createGain();
    mute.gain.value = 0;
    node.connect(mute).connect(audioCtx.destination);
  } catch (err) {
    stop();
    throw err;
  }

  return { sampleRate: audioCtx.sampleRate, stop };
}
