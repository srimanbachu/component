// Messages exchanged between the page and the intent worker.

export type IntentRequest =
  | { type: 'load' }
  | { type: 'classify'; id: number; text: string };

export type IntentResponse =
  | { type: 'progress'; loaded: number; total: number }
  | { type: 'ready' }
  | { type: 'error'; message: string }
  | { type: 'result'; id: number; labels: string[]; scores: number[] }
  | { type: 'failed'; id: number; message: string };
