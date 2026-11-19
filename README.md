# Rock bird voice notes

A tiny page where you talk to a cursor-following character and your words appear as text below it.

- **Speech to text runs locally** in the browser with [Whisper](https://huggingface.co/onnx-community/whisper-base) via [Transformers.js](https://github.com/huggingface/transformers.js). No Google speech service and no API keys, so it works in Chrome, Edge, Safari, Firefox, Brave and Arc.
- **The bird** comes from the Figma component *Rock bird • hover + blink*. Its Open, Closed, Pressed and Rebound variants are animated with springs.

## Run

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

The first load downloads the speech model (about 200 MB). The browser caches it, so later loads are fast. Opening `index.html` as a file will not work, because the mic and the worker need `http://`.

## Using it

| Action | What happens |
|---|---|
| Tap the bird or press Space | Start or stop recording. The bird squeezes harder on the press that starts it |
| Hold the bird or Space | Push to talk: records while held |
| Move the cursor | Eyes track it, the body drifts and leans toward it |
| Stop moving the cursor | The bird holds still and blinks a little more often |
| Speak | The bird hops and stretches with your voice. Grey preview text turns white when the phrase is final |

## Files

- `index.html`: markup, including the bird SVG
- `style.css`: white theme, listening ring, transcript
- `bird.js`: character animation (cursor tracking, blinking, press, voice reaction)
- `script.js`: mic capture, voice activity detection, transcript UI
- `worker.js`: Whisper model in a Web Worker

To change the language, set `LANGUAGE` in `worker.js` (for example `'hindi'`, or `null` to auto-detect).
