# Rock bird voice notes

A Next.js app with two talking characters. Your spoken words appear as text below them.

- **`/`: morphing blob assistant.** A black character that follows your cursor and reacts as you speak. Its shapes and poses come from a reference animation: sphere, thinking dots, pen nib, exclamation mark, egg, hexagon, triangle and rainbow orbits.
- **`/bird`: Rock bird.** Comes from the Figma component *Rock bird • hover + blink*. Its Open, Closed, Pressed and Rebound variants are animated with springs.
- **Speech to text runs locally** in the browser with [Whisper](https://huggingface.co/onnx-community/whisper-base) via [Transformers.js](https://github.com/huggingface/transformers.js). No Google speech service and no API keys, so it works in Chrome, Edge, Safari, Firefox, Brave and Arc.

## Run

Requires Node 20+.

```sh
npm install
npm run dev        # http://localhost:3000
# or a production build
npm run build && npm start
```

The first load downloads the speech model (about 200 MB). The browser caches it, so later loads are fast. Mic access needs `localhost` or HTTPS.

## The blob (`/`)

| You do | The blob does |
|---|---|
| Move the cursor | Eyes track it across the sphere, the body drifts and leans toward it |
| Stop moving the cursor | Holds still and blinks a little more often |
| Tap the blob or press Space | Starts or stops listening: rainbow orbits appear and pulse with your voice |
| Hold the blob or Space | Push to talk |
| A spoken phrase is transcribed | Blue notification badge pops; the phrase is added as a 🎙 message |

**Copy** and **Clear** sit at the bottom of the page. Users with *reduce motion* turned on get gentler movement.

## The bird (`/bird`)

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
  page.tsx              blob assistant (home)
  bird/page.tsx         Rock bird
  layout.tsx, globals.css, icon.svg
components/
  BlobAssistant.tsx     blob page: wires blob, voice engine, messages, copy/clear
  MorphBlob.tsx         <svg> host + imperative handle for the blob animator
  MessageList.tsx       spoken messages with live voice preview
  VoiceBird.tsx         bird page
  Bird.tsx, Transcript.tsx, TranscriptControls.tsx
lib/
  blob/shapes.ts        body silhouettes as radii at 128 angles (morph = interpolate)
  blob/poses.ts         named poses read off the reference animation
  blob/eyes.ts          eyes projected onto a 3D sphere
  blob/orbits.ts        rainbow ribbons split into behind/in-front halves
  blob/BlobAnimator.ts  springs + SVG drawing
  blob/InteractiveBlob.ts  cursor, blink, listening state, reactions
  bird/geometry.ts, bird/BirdAnimator.ts
  voice/VoiceEngine.ts  voice activity detection, phrase queue, worker messaging
  voice/audio.ts, voice/messages.ts
workers/
  whisper.worker.ts     Whisper model running in a Web Worker
```

Both characters animate outside React state: the animators write SVG attributes each frame, so animation never causes re-renders.

To change the language, set `LANGUAGE` in `workers/whisper.worker.ts` (for example `'hindi'`, or `undefined` to auto-detect).
