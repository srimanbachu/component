// Page-side client for the intent worker.
import { pickIntent, type IntentResult } from './intents';
import type { IntentRequest, IntentResponse } from './messages';

export class IntentClassifier {
  ready = false;
  private worker: Worker;
  private nextId = 1;
  private pending = new Map<number, (r: IntentResult | null) => void>();
  private loading = false;

  constructor() {
    this.worker = new Worker(new URL('../../workers/intent.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e: MessageEvent<IntentResponse>) => this.onMessage(e.data);
  }

  load() {
    if (this.loading) return;
    this.loading = true;
    this.send({ type: 'load' });
  }

  /** Resolves with the phrase's intent, or null if the model isn't ready (or failed). */
  classify(text: string): Promise<IntentResult | null> {
    if (!this.ready) return Promise.resolve(null);
    const id = this.nextId++;
    return new Promise(resolve => {
      this.pending.set(id, resolve);
      this.send({ type: 'classify', id, text });
    });
  }

  dispose() {
    this.pending.forEach(resolve => resolve(null));
    this.pending.clear();
    this.worker.terminate();
  }

  private send(msg: IntentRequest) { this.worker.postMessage(msg); }

  private onMessage(data: IntentResponse) {
    if (data.type === 'ready') this.ready = true;
    else if (data.type === 'error') console.error('intent model:', data.message);
    else if (data.type === 'result' || data.type === 'failed') {
      const resolve = this.pending.get(data.id);
      this.pending.delete(data.id);
      resolve?.(data.type === 'result' ? pickIntent(data.labels, data.scores) : null);
    }
  }
}
