/// <reference lib="webworker" />
// Runs Whisper speech-to-text locally in the browser (Transformers.js).
// Lives in a Web Worker so model inference never blocks the bird animation.
import { pipeline as loadPipeline, env, type AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers';
import type { WorkerRequest, WorkerResponse } from '@/lib/voice/messages';

env.allowLocalModels = false; // always fetch from the Hugging Face hub (cached by the browser after first load)

const MODEL = 'onnx-community/whisper-base';
const LANGUAGE: string | undefined = 'english'; // undefined = auto-detect, or e.g. 'hindi', 'telugu'

const ctx = self as unknown as DedicatedWorkerGlobalScope;
const post = (msg: WorkerResponse, transfer: Transferable[] = []) => ctx.postMessage(msg, transfer);

let transcriber: AutomaticSpeechRecognitionPipeline | null = null;

async function hasWebGPU(): Promise<boolean> {
  try {
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
    return !!(gpu && (await gpu.requestAdapter()));
  } catch {
    return false;
  }
}

type Progress = { status: string; file?: string; loaded?: number; total?: number };

function progressReporter() {
  const files: Record<string, { loaded: number; total: number }> = {};
  return (p: Progress) => {
    if (p.status === 'progress' && p.total && p.file) {
      files[p.file] = { loaded: p.loaded ?? 0, total: p.total };
      let loaded = 0, total = 0;
      for (const f of Object.values(files)) { loaded += f.loaded; total += f.total; }
      post({ type: 'progress', loaded, total });
    }
  };
}

type LoadConfig = { device: 'webgpu' | 'wasm'; dtype: string | Record<string, string> };

// pipeline()'s overloads build a union too large for TypeScript to check here,
// so call it through a narrow signature for the one task we use
const pipeline = loadPipeline as unknown as (
  task: 'automatic-speech-recognition',
  model: string,
  options: { device: LoadConfig['device']; dtype: LoadConfig['dtype']; progress_callback: (p: Progress) => void },
) => Promise<AutomaticSpeechRecognitionPipeline>;

async function load() {
  const gpu = await hasWebGPU();
  const configs: LoadConfig[] = gpu
    ? [{ device: 'webgpu', dtype: { encoder_model: 'fp32', decoder_model_merged: 'q4' } },
       { device: 'wasm', dtype: 'q8' }]
    : [{ device: 'wasm', dtype: 'q8' }];

  let lastErr: unknown;
  for (const cfg of configs) {
    try {
      transcriber = await pipeline('automatic-speech-recognition', MODEL, {
        device: cfg.device,
        dtype: cfg.dtype,
        progress_callback: progressReporter(),
      });
      // warm-up pass compiles kernels so the first real phrase is fast
      await transcriber(new Float32Array(16000), { language: LANGUAGE, task: 'transcribe' });
      post({ type: 'ready', device: cfg.device });
      return;
    } catch (err) {
      lastErr = err;
    }
  }
  post({ type: 'error', message: String((lastErr as Error)?.message ?? lastErr) });
}

ctx.onmessage = async ({ data }: MessageEvent<WorkerRequest>) => {
  if (data.type === 'load') return load();

  if (data.type === 'transcribe') {
    const base = { type: 'result' as const, id: data.id, final: data.final, phrase: data.phrase };
    try {
      if (!transcriber) throw new Error('model not loaded');
      const out = await transcriber(data.audio, { language: LANGUAGE, task: 'transcribe', chunk_length_s: 30 });
      const text = Array.isArray(out) ? out.map(o => o.text).join(' ') : out.text;
      post({ ...base, text: text || '' });
    } catch (err) {
      post({ ...base, text: '', error: String(err) });
    }
  }
};
