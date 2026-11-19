# Rock bird voice notes

A Next.js app where you talk to a cursor-following character and your words appear as text below it.

- **Speech to text runs locally** in the browser with [Whisper](https://huggingface.co/onnx-community/whisper-base) via [Transformers.js](https://github.com/huggingface/transformers.js). No Google speech service and no API keys, so it works in Chrome, Edge, Safari, Firefox, Brave and Arc.
- **The bird** comes from the Figma component *Rock bird • hover + blink*. Its Open, Closed, Pressed and Rebound variants are animated with springs.

## Run

Requires Node 20+.

```sh
npm install
npm run dev        # http://localhost:3000
# or a production build
npm run build && npm start
```

The first load downloads the speech model (about 200 MB). The browser caches it, so later loads are fast. Mic access needs `localhost` or HTTPS.

## Using it

| Action | What happens |
|---|---|
| Tap the bird or press Space | Start or stop recording. The bird squeezes harder on the press that starts it |
| Hold the bird or Space | Push to talk: records while held |
| Move the cursor | Eyes track it, the body drifts and leans toward it |
| Stop moving the cursor | The bird holds still and blinks a little more often |
| Speak | The bird hops and stretches with your voice. Grey preview text turns solid when the phrase is final |

## Project structure

```
app/
  layout.tsx            root layout + metadata
  page.tsx              home page
  globals.css           white theme, listening ring, transcript
  icon.svg              favicon
components/
  VoiceBird.tsx         wires bird, voice engine and input (tap/hold, Space)
  Bird.tsx              bird SVG + imperative handle around BirdAnimator
  Transcript.tsx        final + live preview text
  TranscriptControls.tsx copy / clear
lib/
  bird/geometry.ts      Figma variant geometry (Open, Closed, Pressed, Rebound)
  bird/BirdAnimator.ts  springs, cursor tracking, blinking, press, voice reaction
  voice/VoiceEngine.ts  voice activity detection, phrase queue, worker messaging
  voice/audio.ts        mic capture (AudioWorklet), resampling
  voice/messages.ts     typed worker protocol
workers/
  whisper.worker.ts     Whisper model running in a Web Worker
```

Animation and audio run outside React state: `BirdAnimator` writes SVG attributes each frame, so the bird never causes re-renders.

To change the language, set `LANGUAGE` in `workers/whisper.worker.ts` (for example `'hindi'`, or `undefined` to auto-detect).
