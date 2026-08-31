export type WordGameAudioLine = Readonly<{
  id: string;
  source: string;
  text: string;
}>;

export type WordGameItem = Readonly<{
  id: string;
  label: string;
  prompt: string;
  teachingLabel: string;
  successSentence: string;
  alt: string;
  visual:
    | Readonly<{ kind: "image"; src: string }>
    | Readonly<{ kind: "swatch"; color: string }>;
  audio: Readonly<{
    prompt: WordGameAudioLine;
    label: WordGameAudioLine;
    correct: WordGameAudioLine;
  }>;
}>;

export type WordGameTopic = Readonly<{
  id: string;
  title: string;
  description: string;
  theme: string;
  items: readonly WordGameItem[];
}>;

export type WordGameRound = Readonly<{
  target: WordGameItem;
  choices: readonly WordGameItem[];
}>;

type ItemDefinition = Readonly<{
  id: string;
  label: string;
  prompt: string;
  teachingLabel: string;
  successSentence: string;
  alt: string;
  color?: string;
}>;

const MEDIA_BASE = "https://media.parrotbook.com/assets/v8/word-games";

function audioLine(id: string, text: string): WordGameAudioLine {
  return { id, source: `/assets/audio/${id}.mp3`, text };
}

function topic(
  id: string,
  title: string,
  description: string,
  theme: string,
  definitions: readonly ItemDefinition[],
): WordGameTopic {
  return {
    id,
    title,
    description,
    theme,
    items: definitions.map((definition) => {
      const audioId = `word-game-${id}-${definition.id}`;
      return {
        ...definition,
        visual: definition.color
          ? { kind: "swatch", color: definition.color }
          : { kind: "image", src: `${MEDIA_BASE}/${id}/${definition.id}.webp` },
        audio: {
          prompt: audioLine(`${audioId}-prompt`, definition.prompt),
          label: audioLine(`${audioId}-label`, definition.teachingLabel),
          correct: audioLine(`${audioId}-correct`, definition.successSentence),
        },
      };
    }),
  };
}

export const WORD_GAME_TOPICS: readonly WordGameTopic[] = deepFreeze([
  topic("animals", "Animals", "Listen and find the animals.", "sky", [
    { id: "cat", label: "cat", prompt: "Which is the cat?", teachingLabel: "This is a cat.", successSentence: "Yes, this is a cat.", alt: "A friendly cat." },
    { id: "dog", label: "dog", prompt: "Which is the dog?", teachingLabel: "This is a dog.", successSentence: "Yes, this is a dog.", alt: "A friendly dog." },
    { id: "bird", label: "bird", prompt: "Which is the bird?", teachingLabel: "This is a bird.", successSentence: "Yes, this is a bird.", alt: "A friendly bird." },
    { id: "fish", label: "fish", prompt: "Which is the fish?", teachingLabel: "This is a fish.", successSentence: "Yes, this is a fish.", alt: "A friendly fish." },
    { id: "duck", label: "duck", prompt: "Which is the duck?", teachingLabel: "This is a duck.", successSentence: "Yes, this is a duck.", alt: "A friendly duck." },
    { id: "frog", label: "frog", prompt: "Which is the frog?", teachingLabel: "This is a frog.", successSentence: "Yes, this is a frog.", alt: "A friendly frog." },
  ]),
  topic("colors", "Colors", "Listen and find the colors.", "rainbow", [
    { id: "red", label: "red", prompt: "Where is red?", teachingLabel: "This is red.", successSentence: "Yes, this is red.", alt: "The color red.", color: "#ef4444" },
    { id: "blue", label: "blue", prompt: "Where is blue?", teachingLabel: "This is blue.", successSentence: "Yes, this is blue.", alt: "The color blue.", color: "#3b82f6" },
    { id: "yellow", label: "yellow", prompt: "Where is yellow?", teachingLabel: "This is yellow.", successSentence: "Yes, this is yellow.", alt: "The color yellow.", color: "#eab308" },
    { id: "green", label: "green", prompt: "Where is green?", teachingLabel: "This is green.", successSentence: "Yes, this is green.", alt: "The color green.", color: "#22c55e" },
    { id: "orange", label: "orange", prompt: "Where is orange?", teachingLabel: "This is orange.", successSentence: "Yes, this is orange.", alt: "The color orange.", color: "#f97316" },
    { id: "purple", label: "purple", prompt: "Where is purple?", teachingLabel: "This is purple.", successSentence: "Yes, this is purple.", alt: "The color purple.", color: "#a855f7" },
  ]),
  topic("body-parts", "Body Parts", "Listen and find the body parts.", "rose", [
    { id: "eyes", label: "eyes", prompt: "Where are the eyes?", teachingLabel: "These are the eyes.", successSentence: "Yes, these are the eyes.", alt: "A pair of eyes." },
    { id: "ears", label: "ears", prompt: "Where are the ears?", teachingLabel: "These are the ears.", successSentence: "Yes, these are the ears.", alt: "A pair of ears." },
    { id: "nose", label: "nose", prompt: "Which is the nose?", teachingLabel: "This is a nose.", successSentence: "Yes, this is a nose.", alt: "A nose." },
    { id: "mouth", label: "mouth", prompt: "Which is the mouth?", teachingLabel: "This is a mouth.", successSentence: "Yes, this is a mouth.", alt: "A mouth." },
    { id: "hand", label: "hand", prompt: "Which is the hand?", teachingLabel: "This is a hand.", successSentence: "Yes, this is a hand.", alt: "A hand." },
    { id: "foot", label: "foot", prompt: "Which is the foot?", teachingLabel: "This is a foot.", successSentence: "Yes, this is a foot.", alt: "A foot." },
  ]),
  topic("food", "Food", "Listen and find the food.", "orange", [
    { id: "apple", label: "apple", prompt: "Which is the apple?", teachingLabel: "This is an apple.", successSentence: "Yes, this is an apple.", alt: "An apple." },
    { id: "banana", label: "banana", prompt: "Which is the banana?", teachingLabel: "This is a banana.", successSentence: "Yes, this is a banana.", alt: "A banana." },
    { id: "carrot", label: "carrot", prompt: "Which is the carrot?", teachingLabel: "This is a carrot.", successSentence: "Yes, this is a carrot.", alt: "A carrot." },
    { id: "orange", label: "orange", prompt: "Which is the orange?", teachingLabel: "This is an orange.", successSentence: "Yes, this is an orange.", alt: "An orange." },
    { id: "bread", label: "bread", prompt: "Which is the bread?", teachingLabel: "This is bread.", successSentence: "Yes, this is bread.", alt: "Bread." },
    { id: "cheese", label: "cheese", prompt: "Which is the cheese?", teachingLabel: "This is cheese.", successSentence: "Yes, this is cheese.", alt: "Cheese." },
  ]),
  topic("toys", "Toys", "Listen and find the toys.", "yellow", [
    { id: "ball", label: "ball", prompt: "Which is the ball?", teachingLabel: "This is a ball.", successSentence: "Yes, this is a ball.", alt: "A ball." },
    { id: "toy-car", label: "toy car", prompt: "Which is the toy car?", teachingLabel: "This is a toy car.", successSentence: "Yes, this is a toy car.", alt: "A toy car." },
    { id: "doll", label: "doll", prompt: "Which is the doll?", teachingLabel: "This is a doll.", successSentence: "Yes, this is a doll.", alt: "A doll." },
    { id: "kite", label: "kite", prompt: "Which is the kite?", teachingLabel: "This is a kite.", successSentence: "Yes, this is a kite.", alt: "A kite." },
    { id: "blocks", label: "blocks", prompt: "Where are the blocks?", teachingLabel: "These are blocks.", successSentence: "Yes, these are blocks.", alt: "Building blocks." },
    { id: "teddy-bear", label: "teddy bear", prompt: "Which is the teddy bear?", teachingLabel: "This is a teddy bear.", successSentence: "Yes, this is a teddy bear.", alt: "A teddy bear." },
  ]),
  topic("feelings", "Feelings", "Listen and find the feelings.", "purple", [
    { id: "happy", label: "happy", prompt: "Which face is happy?", teachingLabel: "This face is happy.", successSentence: "Yes, this face is happy.", alt: "A happy face." },
    { id: "sad", label: "sad", prompt: "Which face is sad?", teachingLabel: "This face is sad.", successSentence: "Yes, this face is sad.", alt: "A sad face." },
    { id: "angry", label: "angry", prompt: "Which face is angry?", teachingLabel: "This face is angry.", successSentence: "Yes, this face is angry.", alt: "An angry face." },
    { id: "sleepy", label: "sleepy", prompt: "Which face is sleepy?", teachingLabel: "This face is sleepy.", successSentence: "Yes, this face is sleepy.", alt: "A sleepy face." },
    { id: "surprised", label: "surprised", prompt: "Which face is surprised?", teachingLabel: "This face is surprised.", successSentence: "Yes, this face is surprised.", alt: "A surprised face." },
    { id: "silly", label: "silly", prompt: "Which face is silly?", teachingLabel: "This face is silly.", successSentence: "Yes, this face is silly.", alt: "A silly face." },
  ]),
]);

export function resolveWordGameTopic(topicId: string | undefined): WordGameTopic | null {
  return WORD_GAME_TOPICS.find(({ id }) => id === topicId) ?? null;
}

export function getWordGameRoute(topicId: string): string {
  return `/word-games/${topicId}`;
}

export function buildWordGameRounds(topic: WordGameTopic): readonly WordGameRound[] {
  return topic.items.map((target, index) => {
    const candidates = [target, topic.items[(index + 1) % 6], topic.items[(index + 2) % 6]];
    const correctPosition = index % 3;
    return deepFreeze({
      target,
      choices: candidates.map((_, position) => candidates[(position - correctPosition + 3) % 3]),
    });
  });
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
