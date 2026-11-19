/* =========================================================
   Microphone capture + voice activity detection
   Audio is captured with an AudioWorklet, split into phrases by
   a simple energy-based VAD, resampled to 16 kHz and sent to the
   Whisper worker.
   ========================================================= */
const $ = id => document.getElementById(id);
const statusEl = $('status'), finalEl = $('final'), interimEl = $('interim');
const placeholder = $('placeholder'), transcriptEl = $('transcript');
const orbWrap = $('orbWrap'), micBtn = $('micBtn');

const TARGET_RATE = 16000;
const PREROLL_MS = 300;        // audio kept from just before speech starts
const SILENCE_END_MS = 800;    // pause length that closes a phrase
const MAX_PHRASE_S = 20;       // force-cut very long phrases
const MIN_PHRASE_MS = 350;     // ignore clicks / coughs
const INTERIM_EVERY_MS = 1200; // live preview cadence while speaking

let wantListening = false;
let modelReady = false;
let finalText = '';
let interimText = '';
let level = 0;          // smoothed level for the bird
let rawLevel = 0;

let audioCtx = null, stream = null, workletNode = null, sourceNode = null;
let inRate = 48000;

// VAD state
let noiseFloor = 0.005;
let speaking = false;
let silenceMs = 0;
let phrase = [];        // Float32Array chunks at inRate
let phraseSamples = 0;
let preroll = [];
let prerollSamples = 0;
let lastInterimAt = 0;
let phraseNo = 0;       // id of the phrase being spoken
let interimFor = 0;     // which phrase the grey preview text belongs to

function setStatus(msg, on = false) {
  statusEl.textContent = msg;
  statusEl.classList.toggle('on', on);
}

function render() {
  finalEl.textContent = finalText;
  interimEl.textContent = interimText ? (finalText ? ' ' : '') + interimText : '';
  placeholder.hidden = !!(finalText || interimText);
  transcriptEl.scrollTop = transcriptEl.scrollHeight;
}

const IDLE_MSG = 'Tap or hold the bird to speak';

/* ---------- Whisper worker ---------- */
const worker = new Worker('worker.js', { type: 'module' });
let jobId = 0;
let busy = false;
const finalQueue = [];     // phrases waiting for final transcription

worker.onmessage = ({ data }) => {
  if (data.type === 'progress') {
    const pct = Math.round((data.loaded / data.total) * 100);
    const mb = (data.total / 1e6).toFixed(0);
    setStatus(`Loading speech model… ${pct}% of ${mb} MB`);
  } else if (data.type === 'ready') {
    modelReady = true;
    setStatus(wantListening ? 'Listening…' : IDLE_MSG, wantListening);
  } else if (data.type === 'error') {
    setStatus('Could not load speech model: check your connection and reload');
    console.error(data.message);
  } else if (data.type === 'result') {
    busy = false;
    const text = cleanText(data.text);
    if (data.final) {
      if (text) finalText += (finalText ? ' ' : '') + text;
      // the preview for this phrase is now replaced by the final text
      if (interimFor === data.phrase) interimText = '';
    } else if (speaking && data.phrase === phraseNo) {
      interimText = text;
      interimFor = data.phrase;
    }
    render();
    pump();
  }
};

// Whisper sometimes "hears" captions in near-silence; drop those.
function cleanText(t) {
  t = t.replace(/\[[^\]]*\]|\([^)]*\)|\*[^*]*\*/g, '').replace(/\s+/g, ' ').trim();
  if (/^(you|thank you\.?|thanks for watching!?|\.+)$/i.test(t)) return '';
  return t;
}

function pump() {
  if (busy || !modelReady) return;
  if (finalQueue.length) {
    const { audio, phrase: pNo } = finalQueue.shift();
    busy = true;
    worker.postMessage({ type: 'transcribe', id: ++jobId, final: true, phrase: pNo, audio }, [audio.buffer]);
  }
}

function requestInterim() {
  if (busy || !modelReady || finalQueue.length) return;
  const audio = resample(concat(phrase, phraseSamples), inRate);
  busy = true;
  worker.postMessage({ type: 'transcribe', id: ++jobId, final: false, phrase: phraseNo, audio }, [audio.buffer]);
}

/* ---------- audio helpers ---------- */
function concat(chunks, total) {
  const out = new Float32Array(total);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

function resample(input, rate) {
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

const WORKLET = `
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

async function startMic() {
  // created synchronously inside the tap so Chrome's autoplay policy doesn't suspend it
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  inRate = audioCtx.sampleRate;
  stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
  });
  if (audioCtx.state === 'suspended') await audioCtx.resume();
  const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }));
  await audioCtx.audioWorklet.addModule(url);
  URL.revokeObjectURL(url);

  sourceNode = audioCtx.createMediaStreamSource(stream);
  workletNode = new AudioWorkletNode(audioCtx, 'tap');
  workletNode.port.onmessage = e => onAudio(e.data);
  sourceNode.connect(workletNode);
  // keep the graph pulling audio without playing it back
  const mute = audioCtx.createGain();
  mute.gain.value = 0;
  workletNode.connect(mute).connect(audioCtx.destination);
}

function stopMic() {
  workletNode?.port.close();
  sourceNode?.disconnect();
  workletNode?.disconnect();
  stream?.getTracks().forEach(t => t.stop());
  audioCtx?.close().catch(() => {});
  audioCtx = stream = workletNode = sourceNode = null;
}

/* ---------- VAD ---------- */
function onAudio(chunk) {
  if (!wantListening) return;
  let sum = 0;
  for (let i = 0; i < chunk.length; i++) sum += chunk[i] * chunk[i];
  const rms = Math.sqrt(sum / chunk.length);
  const ms = (chunk.length / inRate) * 1000;

  // track background noise: follow quickly downward, slowly upward
  if (!speaking) noiseFloor += (rms - noiseFloor) * (rms < noiseFloor ? 0.2 : 0.02);
  const threshold = Math.max(0.012, noiseFloor * 3);
  const isVoice = rms > threshold;
  rawLevel = Math.min(1, Math.max(0, (rms - threshold * 0.6) * 8));

  if (!speaking) {
    preroll.push(chunk); prerollSamples += chunk.length;
    while (prerollSamples > (PREROLL_MS / 1000) * inRate) prerollSamples -= preroll.shift().length;
    if (isVoice) {
      speaking = true;
      phraseNo++;
      silenceMs = 0;
      phrase = preroll; phraseSamples = prerollSamples;
      preroll = []; prerollSamples = 0;
      lastInterimAt = performance.now();
    }
    return;
  }

  phrase.push(chunk); phraseSamples += chunk.length;
  silenceMs = isVoice ? 0 : silenceMs + ms;

  if (silenceMs >= SILENCE_END_MS || phraseSamples >= MAX_PHRASE_S * inRate) {
    endPhrase();
  } else if (performance.now() - lastInterimAt > INTERIM_EVERY_MS) {
    lastInterimAt = performance.now();
    requestInterim();
  }
}

function endPhrase() {
  if (!speaking) return;
  speaking = false;
  const voicedMs = (phraseSamples / inRate) * 1000 - silenceMs;
  if (voicedMs >= MIN_PHRASE_MS) {
    finalQueue.push({ audio: resample(concat(phrase, phraseSamples), inRate), phrase: phraseNo });
    pump();
  } else if (interimFor === phraseNo) {
    interimText = '';
    render();
  }
  phrase = []; phraseSamples = 0; silenceMs = 0;
}

/* ---------- listening state ---------- */
async function startListening() {
  if (wantListening) return;
  if (!modelReady) { setStatus('Speech model still loading, one moment…'); return; }
  wantListening = true;
  orbWrap.classList.add('listening');
  window.Bird?.setListening(true);
  micBtn.setAttribute('aria-label', 'Stop listening');
  setStatus('Listening…', true);
  try {
    await startMic();
    if (!wantListening) stopMic();   // released before mic opened
  } catch (err) {
    wantListening = false;
    orbWrap.classList.remove('listening');
    window.Bird?.setListening(false);
    stopMic();
    setStatus(err.name === 'NotAllowedError'
      ? 'Microphone blocked: allow it in the address bar and try again'
      : err.name === 'NotFoundError' ? 'No microphone found' : `Mic error: ${err.message}`);
  }
}

function stopListening() {
  if (!wantListening) return;
  wantListening = false;
  endPhrase();               // transcribe whatever was being said
  stopMic();
  orbWrap.classList.remove('listening');
  window.Bird?.setListening(false);
  micBtn.setAttribute('aria-label', 'Start listening');
  setStatus(IDLE_MSG);
}

/* ---------- render loop ---------- */
// feeds the voice level to the bird so it "breathes" while you talk
function frame() {
  const target = wantListening ? rawLevel : 0;
  level += (target - level) * (target > level ? 0.25 : 0.06);
  window.Bird?.setLevel(level);
  requestAnimationFrame(frame);
}

/* ---------- input: tap to toggle, or hold to talk ---------- */
const HOLD_MS = 350;
let pressAt = 0, startedByPress = false, pressing = false;

function pressDown() {
  if (pressing) return;
  pressing = true;
  pressAt = performance.now();
  startedByPress = !wantListening;
  // a press that actually starts recording squeezes the bird harder
  window.Bird?.press({ deep: startedByPress && modelReady });
  if (startedByPress) startListening();
}

function pressUp() {
  if (!pressing) return;
  pressing = false;
  window.Bird?.release();
  const held = performance.now() - pressAt >= HOLD_MS;
  if (startedByPress ? held : true) stopListening();
}

micBtn.addEventListener('pointerdown', e => {
  if (e.button !== 0) return;
  micBtn.setPointerCapture(e.pointerId);
  pressDown();
});
micBtn.addEventListener('pointerup', pressUp);
micBtn.addEventListener('pointercancel', pressUp);
micBtn.addEventListener('contextmenu', e => e.preventDefault());
micBtn.addEventListener('click', e => e.preventDefault());

document.addEventListener('keydown', e => {
  if (e.code !== 'Space' || e.repeat || e.target.closest('input, textarea, .chip')) return;
  e.preventDefault();
  pressDown();
});
document.addEventListener('keyup', e => {
  if (e.code !== 'Space' || e.target.closest('input, textarea, .chip')) return;
  e.preventDefault();
  pressUp();
});
window.addEventListener('blur', () => { if (pressing) pressUp(); });

$('clearBtn').addEventListener('click', () => { finalText = ''; interimText = ''; render(); });
$('copyBtn').addEventListener('click', async e => {
  if (!finalText) return;
  try {
    await navigator.clipboard.writeText(finalText);
    e.target.textContent = 'Copied';
    setTimeout(() => (e.target.textContent = 'Copy'), 1200);
  } catch {}
});

/* ---------- boot ---------- */
if (location.protocol === 'file:') {
  setStatus('Run: python3 -m http.server 8000, then open http://localhost:8000');
} else {
  setStatus('Loading speech model…');
  worker.postMessage({ type: 'load' });
}
render();
requestAnimationFrame(frame);
