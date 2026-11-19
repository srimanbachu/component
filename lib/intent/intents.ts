// What the character can understand from your words. Each spoken phrase is
// scored against these with a zero-shot NLI model
// (Xenova/DeBERTa-v3-xsmall-mnli-fever-anli-ling-binary): the model checks how
// well "The speaker <label>." follows from the phrase, no training needed.
// Label wording was picked by probing sample phrases (speaker-descriptions
// classified far better than bare nouns like "sadness").

export const HYPOTHESIS = 'The speaker {}.';

export const INTENTS = [
  { id: 'greeting', label: 'is greeting someone',  caption: 'greeting' },
  { id: 'question', label: 'is asking a question', caption: 'question' },
  { id: 'excited',  label: 'is excited',           caption: 'excited' },
  { id: 'thanks',   label: 'is thankful',          caption: 'thanks' },
  { id: 'sad',      label: 'is sad',               caption: 'sad' },
  { id: 'confused', label: 'is confused',          caption: 'confused' },
  { id: 'goodbye',  label: 'is saying goodbye',    caption: 'goodbye' },
  { id: 'create',   label: 'wants something made', caption: 'make something' },
  { id: 'story',    label: 'is telling a story',   caption: 'statement' },
] as const;

export type IntentId = (typeof INTENTS)[number]['id'];
export type IntentResult = { id: IntentId; caption: string; score: number };

export const INTENT_LABELS: string[] = INTENTS.map(i => i.label);

const MIN_CONFIDENCE = 0.3;   // below this, treat the phrase as a plain statement

/** Turns raw zero-shot output into one intent, with a couple of tie-break rules. */
export function pickIntent(labels: string[], scores: number[]): IntentResult {
  const score: Record<string, number> = {};
  labels.forEach((l, i) => {
    const intent = INTENTS.find(x => x.label === l);
    if (intent) score[intent.id] = scores[i];
  });
  const ranked = (Object.keys(score) as IntentId[]).sort((a, b) => score[b] - score[a]);
  let id = ranked[0] ?? 'story';

  // nothing stands out: it's a plain statement
  if ((score[id] ?? 0) < MIN_CONFIDENCE) id = 'story';
  // "Can you draw me a cat?" reads as a question first; prefer the request
  else if (id === 'question' && (score.create ?? 0) >= 0.2) id = 'create';
  // "Hi there, how are you?" is a greeting even though it ends with a question mark
  else if (id === 'question' && (score.greeting ?? 0) >= score.question - 0.12) id = 'greeting';

  const intent = INTENTS.find(x => x.id === id)!;
  return { id, caption: intent.caption, score: score[id] ?? 0 };
}
