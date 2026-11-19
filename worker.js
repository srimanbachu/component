// Runs Whisper speech-to-text locally in the browser (Transformers.js).
// Lives in a Web Worker so model inference never blocks the orb animation.
import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.6/dist/transformers.min.js';

env.allowLocalModels = false;   // always fetch from the Hugging Face hub (cached by the browser after first load)

const MODEL = 'onnx-community/whisper-base';
const LANGUAGE = 'english';     // set to null for auto-detect, or e.g. 'hindi', 'telugu'

let transcriber = null;

async function hasWebGPU() {
  try { return !!(navigator.gpu && await navigator.gpu.requestAdapter()); }
  catch { return false; }
}

function progressReporter() {
  const files = {};
  return p => {
    if (p.status === 'progress' && p.total) {
      files[p.file] = { loaded: p.loaded, total: p.total };
      let loaded = 0, total = 0;
      for (const f of Object.values(files)) { loaded += f.loaded; total += f.total; }
      self.postMessage({ type: 'progress', loaded, total });
    }
  };
}

async function load() {
  const gpu = await hasWebGPU();
  const configs = gpu
    ? [{ device: 'webgpu', dtype: { encoder_model: 'fp32', decoder_model_merged: 'q4' } },
       { device: 'wasm',   dtype: 'q8' }]
    : [{ device: 'wasm',   dtype: 'q8' }];

  let lastErr;
  for (const cfg of configs) {
    try {
      transcriber = await pipeline('automatic-speech-recognition', MODEL, {
        ...cfg,
        progress_callback: progressReporter(),
      });
      // warm-up pass compiles kernels so the first real phrase is fast
      await transcriber(new Float32Array(16000), { language: LANGUAGE, task: 'transcribe' });
      self.postMessage({ type: 'ready', device: cfg.device });
      return;
    } catch (err) {
      lastErr = err;
    }
  }
  self.postMessage({ type: 'error', message: String(lastErr?.message || lastErr) });
}

self.onmessage = async ({ data }) => {
  if (data.type === 'load') return load();

  if (data.type === 'transcribe') {
    try {
      const out = await transcriber(data.audio, {
        language: LANGUAGE,
        task: 'transcribe',
        chunk_length_s: 30,
      });
      self.postMessage({ type: 'result', id: data.id, final: data.final, phrase: data.phrase, text: out.text || '' });
    } catch (err) {
      self.postMessage({ type: 'result', id: data.id, final: data.final, phrase: data.phrase, text: '', error: String(err) });
    }
  }
};
