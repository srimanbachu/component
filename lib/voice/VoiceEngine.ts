// Microphone -> voice activity detection -> Whisper worker -> transcript.
// Framework-agnostic: the React layer subscribes through the callbacks below.
import { concat, openMic, resample, rms, type MicTap } from './audio';
import type { WorkerRequest, WorkerResponse } from './messages';

const PREROLL_MS = 300;        // audio kept from just before speech starts
const SILENCE_END_MS = 800;    // pause length that closes a phrase
const MAX_PHRASE_S = 20;       // force-cut very long phrases
const MIN_PHRASE_MS = 350;     // ignore clicks / coughs
const INTERIM_EVERY_MS = 1200; // live preview cadence while speaking

export const IDLE_MSG = 'Tap or hold the bird to speak';

export type Status = { text: string; on: boolean };
export type Transcript = { final: string; interim: string };

export type VoiceEngineEvents = {
  onStatus: (s: Status) => void;
  onTranscript: (t: Transcript) => void;
  onListening: (listening: boolean) => void;
};

// Whisper sometimes "hears" captions in near-silence; drop those.
function cleanText(t: string): string {
  t = t.replace(/\[[^\]]*\]|\([^)]*\)|\*[^*]*\*/g, '').replace(/\s+/g, ' ').trim();
  if (/^(you|thank you\.?|thanks for watching!?|\.+)$/i.test(t)) return '';
  return t;
}

export class VoiceEngine {
  modelReady = false;
  wantListening = false;
  /** latest raw voice level 0..1 (unsmoothed); read every frame by the UI */
  rawLevel = 0;

  private worker: Worker;
  private events: VoiceEngineEvents;
  private mic: MicTap | null = null;
  private inRate = 48000;

  private finalText = '';
  private interimText = '';

  // worker queue
  private jobId = 0;
  private busy = false;
  private finalQueue: { audio: Float32Array; phrase: number }[] = [];

  // VAD state
  private noiseFloor = 0.005;
  private speaking = false;
  private silenceMs = 0;
  private phrase: Float32Array[] = [];
  private phraseSamples = 0;
  private preroll: Float32Array[] = [];
  private prerollSamples = 0;
  private lastInterimAt = 0;
  private phraseNo = 0;    // id of the phrase being spoken
  private interimFor = 0;  // which phrase the grey preview text belongs to

  constructor(events: VoiceEngineEvents) {
    this.events = events;
    this.worker = new Worker(new URL('../../workers/whisper.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e: MessageEvent<WorkerResponse>) => this.onWorker(e.data);
  }

  load() {
    this.setStatus('Loading speech model…');
    this.send({ type: 'load' });
  }

  dispose() {
    this.wantListening = false;
    this.mic?.stop();
    this.mic = null;
    this.worker.terminate();
  }

  clear() {
    this.finalText = '';
    this.interimText = '';
    this.emitTranscript();
  }

  get text() { return this.finalText; }

  /* ---------- listening state ---------- */
  async startListening() {
    if (this.wantListening) return;
    if (!this.modelReady) { this.setStatus('Speech model still loading, one moment…'); return; }
    this.wantListening = true;
    this.events.onListening(true);
    this.setStatus('Listening…', true);
    try {
      // no await before openMic: the AudioContext must be created inside the tap
      const mic = await openMic(chunk => this.onAudio(chunk));
      if (!this.wantListening) { mic.stop(); return; }   // released before mic opened
      this.mic = mic;
      this.inRate = mic.sampleRate;
    } catch (err) {
      this.wantListening = false;
      this.events.onListening(false);
      const e = err as DOMException;
      this.setStatus(e.name === 'NotAllowedError'
        ? 'Microphone blocked: allow it in the address bar and try again'
        : e.name === 'NotFoundError' ? 'No microphone found' : `Mic error: ${e.message}`);
    }
  }

  stopListening() {
    if (!this.wantListening) return;
    this.wantListening = false;
    this.endPhrase();          // transcribe whatever was being said
    this.mic?.stop();
    this.mic = null;
    this.rawLevel = 0;
    this.events.onListening(false);
    this.setStatus(IDLE_MSG);
  }

  /* ---------- worker ---------- */
  private send(msg: WorkerRequest, transfer: Transferable[] = []) {
    this.worker.postMessage(msg, transfer);
  }

  private onWorker(data: WorkerResponse) {
    if (data.type === 'progress') {
      const pct = Math.round((data.loaded / data.total) * 100);
      const mb = (data.total / 1e6).toFixed(0);
      this.setStatus(`Loading speech model… ${pct}% of ${mb} MB`);
    } else if (data.type === 'ready') {
      this.modelReady = true;
      this.setStatus(this.wantListening ? 'Listening…' : IDLE_MSG, this.wantListening);
    } else if (data.type === 'error') {
      this.setStatus('Could not load speech model: check your connection and reload');
      console.error(data.message);
    } else if (data.type === 'result') {
      this.busy = false;
      const text = cleanText(data.text);
      if (data.final) {
        if (text) this.finalText += (this.finalText ? ' ' : '') + text;
        // the preview for this phrase is now replaced by the final text
        if (this.interimFor === data.phrase) this.interimText = '';
      } else if (this.speaking && data.phrase === this.phraseNo) {
        this.interimText = text;
        this.interimFor = data.phrase;
      }
      this.emitTranscript();
      this.pump();
    }
  }

  private pump() {
    if (this.busy || !this.modelReady) return;
    const next = this.finalQueue.shift();
    if (!next) return;
    this.busy = true;
    this.send({ type: 'transcribe', id: ++this.jobId, final: true, phrase: next.phrase, audio: next.audio }, [next.audio.buffer]);
  }

  private requestInterim() {
    if (this.busy || !this.modelReady || this.finalQueue.length) return;
    const audio = resample(concat(this.phrase, this.phraseSamples), this.inRate);
    this.busy = true;
    this.send({ type: 'transcribe', id: ++this.jobId, final: false, phrase: this.phraseNo, audio }, [audio.buffer]);
  }

  /* ---------- VAD ---------- */
  private onAudio(chunk: Float32Array) {
    if (!this.wantListening) return;
    const level = rms(chunk);
    const ms = (chunk.length / this.inRate) * 1000;

    // track background noise: follow quickly downward, slowly upward
    if (!this.speaking) this.noiseFloor += (level - this.noiseFloor) * (level < this.noiseFloor ? 0.2 : 0.02);
    const threshold = Math.max(0.012, this.noiseFloor * 3);
    const isVoice = level > threshold;
    this.rawLevel = Math.min(1, Math.max(0, (level - threshold * 0.6) * 8));

    if (!this.speaking) {
      this.preroll.push(chunk); this.prerollSamples += chunk.length;
      while (this.prerollSamples > (PREROLL_MS / 1000) * this.inRate) {
        this.prerollSamples -= this.preroll.shift()!.length;
      }
      if (isVoice) {
        this.speaking = true;
        this.phraseNo++;
        this.silenceMs = 0;
        this.phrase = this.preroll; this.phraseSamples = this.prerollSamples;
        this.preroll = []; this.prerollSamples = 0;
        this.lastInterimAt = performance.now();
      }
      return;
    }

    this.phrase.push(chunk); this.phraseSamples += chunk.length;
    this.silenceMs = isVoice ? 0 : this.silenceMs + ms;

    if (this.silenceMs >= SILENCE_END_MS || this.phraseSamples >= MAX_PHRASE_S * this.inRate) {
      this.endPhrase();
    } else if (performance.now() - this.lastInterimAt > INTERIM_EVERY_MS) {
      this.lastInterimAt = performance.now();
      this.requestInterim();
    }
  }

  private endPhrase() {
    if (!this.speaking) return;
    this.speaking = false;
    const voicedMs = (this.phraseSamples / this.inRate) * 1000 - this.silenceMs;
    if (voicedMs >= MIN_PHRASE_MS) {
      this.finalQueue.push({ audio: resample(concat(this.phrase, this.phraseSamples), this.inRate), phrase: this.phraseNo });
      this.pump();
    } else if (this.interimFor === this.phraseNo) {
      this.interimText = '';
      this.emitTranscript();
    }
    this.phrase = []; this.phraseSamples = 0; this.silenceMs = 0;
  }

  /* ---------- events ---------- */
  private setStatus(text: string, on = false) {
    this.events.onStatus({ text, on });
  }

  private emitTranscript() {
    this.events.onTranscript({ final: this.finalText, interim: this.interimText });
  }
}
