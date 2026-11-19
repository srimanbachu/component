// Messages exchanged between the page and the Whisper worker.

export type WorkerRequest =
  | { type: 'load' }
  | { type: 'transcribe'; id: number; final: boolean; phrase: number; audio: Float32Array };

export type WorkerResponse =
  | { type: 'progress'; loaded: number; total: number }
  | { type: 'ready'; device: 'webgpu' | 'wasm' }
  | { type: 'error'; message: string }
  | { type: 'result'; id: number; final: boolean; phrase: number; text: string; error?: string };
