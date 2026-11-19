/// <reference lib="webworker" />
// Zero-shot intent classification of spoken phrases with DeBERTa-v3 (NLI),
// running locally in its own worker so it never blocks speech-to-text or the blob.
import { pipeline as loadPipeline, env, type ZeroShotClassificationPipeline } from '@huggingface/transformers';
import type { IntentRequest, IntentResponse } from '@/lib/intent/messages';
import { HYPOTHESIS, INTENT_LABELS } from '@/lib/intent/intents';

env.allowLocalModels = false;

const MODEL = 'Xenova/DeBERTa-v3-xsmall-mnli-fever-anli-ling-binary';

const ctx = self as unknown as DedicatedWorkerGlobalScope;
const post = (msg: IntentResponse) => ctx.postMessage(msg);

type Progress = { status: string; file?: string; loaded?: number; total?: number };

// pipeline()'s overloads are too broad for TypeScript here; narrow to our task
const pipeline = loadPipeline as unknown as (
  task: 'zero-shot-classification',
  model: string,
  options: { device: 'wasm'; dtype: 'q8'; progress_callback: (p: Progress) => void },
) => Promise<ZeroShotClassificationPipeline>;

let classifier: ZeroShotClassificationPipeline | null = null;

async function load() {
  const files: Record<string, { loaded: number; total: number }> = {};
  try {
    classifier = await pipeline('zero-shot-classification', MODEL, {
      device: 'wasm',   // small model: CPU is ~30 ms per phrase, no need for WebGPU
      dtype: 'q8',
      progress_callback: p => {
        if (p.status !== 'progress' || !p.total || !p.file) return;
        files[p.file] = { loaded: p.loaded ?? 0, total: p.total };
        let loaded = 0, total = 0;
        for (const f of Object.values(files)) { loaded += f.loaded; total += f.total; }
        post({ type: 'progress', loaded, total });
      },
    });
    await classifier('hello', INTENT_LABELS, { hypothesis_template: HYPOTHESIS });   // warm-up
    post({ type: 'ready' });
  } catch (err) {
    post({ type: 'error', message: String((err as Error)?.message ?? err) });
  }
}

ctx.onmessage = async ({ data }: MessageEvent<IntentRequest>) => {
  if (data.type === 'load') return load();
  if (data.type === 'classify') {
    try {
      if (!classifier) throw new Error('intent model not loaded');
      // multi_label stays off: this binary NLI model has no "contradiction" class
      const out = await classifier(data.text, INTENT_LABELS, { hypothesis_template: HYPOTHESIS });
      const r = Array.isArray(out) ? out[0] : out;
      post({ type: 'result', id: data.id, labels: r.labels, scores: r.scores });
    } catch (err) {
      post({ type: 'failed', id: data.id, message: String(err) });
    }
  }
};
