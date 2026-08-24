export type FullSceneImage = {
  alt: string;
  src: string;
};

export type FullSceneLesson = {
  lessonId: string;
  scenes: FullSceneImage[];
};

function scene(src: string, alt: string): FullSceneImage {
  return { alt, src };
}

export const FULL_SCENE_LESSONS: FullSceneLesson[] = [
  {
    lessonId: "01-peppas-high-ball",
    scenes: [
      scene(
        "https://media.parrotbook.com/assets/v3/full-scenes/01-peppas-high-ball/01-ball-up-high.webp",
        "Peppa and Dolly look up at the red ball caught high in the tree",
      ),
      scene(
        "https://media.parrotbook.com/assets/v3/full-scenes/01-peppas-high-ball/02-cannot-reach.webp",
        "Peppa stretches toward the red ball but cannot reach the high branch",
      ),
      scene(
        "https://media.parrotbook.com/assets/v3/full-scenes/01-peppas-high-ball/03-asking-for-help.webp",
        "Peppa asks Dolly for help beneath the tree while the ball stays high above",
      ),
      scene(
        "https://media.parrotbook.com/assets/v3/full-scenes/01-peppas-high-ball/04-dolly-flies-up.webp",
        "Dolly flies toward the red ball as Peppa watches from below",
      ),
      scene(
        "https://media.parrotbook.com/assets/v3/full-scenes/01-peppas-high-ball/05-ball-comes-down.webp",
        "Dolly returns the red ball to a smiling Peppa beneath the tree",
      ),
    ],
  },
  {
    lessonId: "02-garden-colors",
    scenes: [
      scene(
        "https://media.parrotbook.com/assets/v3/full-scenes/02-garden-colors/01-colorful-flowers.webp",
        "Peppa and Dolly discover many colorful flowers beside their basket in the sunny garden",
      ),
      scene(
        "https://media.parrotbook.com/assets/v3/full-scenes/02-garden-colors/02-color-question.webp",
        "Peppa points to a flower while Dolly considers its color beside the basket",
      ),
      scene(
        "https://media.parrotbook.com/assets/v3/full-scenes/02-garden-colors/03-red-one.webp",
        "Dolly identifies the red flower while Peppa watches in the garden",
      ),
      scene(
        "https://media.parrotbook.com/assets/v3/full-scenes/02-garden-colors/04-flower-found.webp",
        "Peppa lifts the red flower while Dolly smiles beside the basket",
      ),
      scene(
        "https://media.parrotbook.com/assets/v3/full-scenes/02-garden-colors/05-finished-basket.webp",
        "Peppa and Dolly admire their finished basket with the red flower",
      ),
    ],
  },
  {
    lessonId: "03-snack-time",
    scenes: [
      scene(
        "https://media.parrotbook.com/assets/v3/full-scenes/03-snack-time/01-snack-basket.webp",
        "Dolly opens the snack basket on the picnic blanket while Peppa watches",
      ),
      scene(
        "https://media.parrotbook.com/assets/v3/full-scenes/03-snack-time/02-fruit-for-snack.webp",
        "Peppa and Dolly look at the apples and bananas inside the open basket",
      ),
      scene(
        "https://media.parrotbook.com/assets/v3/full-scenes/03-snack-time/03-peppa-asks-politely.webp",
        "Peppa politely asks Dolly for an apple beside the snack basket",
      ),
      scene(
        "https://media.parrotbook.com/assets/v3/full-scenes/03-snack-time/04-apple-for-peppa.webp",
        "Dolly holds out one red apple for Peppa at the edge of the blanket",
      ),
      scene(
        "https://media.parrotbook.com/assets/v3/full-scenes/03-snack-time/05-happy-snack.webp",
        "Peppa happily holds her apple while Dolly rests beside the snack basket",
      ),
    ],
  },
  {
    lessonId: "04-playground-words",
    scenes: [
      scene(
        "https://media.parrotbook.com/assets/v3/full-scenes/04-playground-words/01-dolly-swinging.webp",
        "Dolly swings while Peppa waits patiently on the playground grass",
      ),
      scene(
        "https://media.parrotbook.com/assets/v3/full-scenes/04-playground-words/02-peppa-waits.webp",
        "Peppa waits beside the slide while Dolly continues swinging",
      ),
      scene(
        "https://media.parrotbook.com/assets/v3/full-scenes/04-playground-words/03-ask-for-a-turn.webp",
        "Peppa asks Dolly for a turn beside the nearly still swing",
      ),
      scene(
        "https://media.parrotbook.com/assets/v3/full-scenes/04-playground-words/04-peppas-turn.webp",
        "Dolly steps aside and welcomes Peppa toward the empty swing",
      ),
      scene(
        "https://media.parrotbook.com/assets/v3/full-scenes/04-playground-words/05-playing-together.webp",
        "Peppa invites Dolly to keep playing together beside the empty swing",
      ),
    ],
  },
  {
    lessonId: "05-market-day",
    scenes: [
      scene(
        "https://media.parrotbook.com/assets/v3/full-scenes/05-market-day/01-fruit-stand.webp",
        "Dolly welcomes Peppa to the fruit stand with baskets of red apples",
      ),
      scene(
        "https://media.parrotbook.com/assets/v3/full-scenes/05-market-day/02-asking-price.webp",
        "Peppa points to the apples and asks Dolly their price",
      ),
      scene(
        "https://media.parrotbook.com/assets/v3/full-scenes/05-market-day/03-two-coins.webp",
        "Dolly points to the price while Peppa holds up two gold coins",
      ),
      scene(
        "https://media.parrotbook.com/assets/v3/full-scenes/05-market-day/04-choosing-apples.webp",
        "Peppa chooses the two red apples waiting on Dolly's counter",
      ),
      scene(
        "https://media.parrotbook.com/assets/v3/full-scenes/05-market-day/05-apples-ready.webp",
        "Dolly passes two red apples across the counter to Peppa",
      ),
    ],
  },
  {
    lessonId: "06-picnic-time",
    scenes: [
      scene(
        "https://media.parrotbook.com/assets/v3/full-scenes/06-picnic-time/01-picnic-blanket.webp",
        "Peppa and Dolly sit around the picnic blanket with an open basket and empty cups",
      ),
      scene(
        "https://media.parrotbook.com/assets/v3/full-scenes/06-picnic-time/02-dolly-offers-juice.webp",
        "Dolly offers the juice bottle to Peppa across the picnic blanket",
      ),
      scene(
        "https://media.parrotbook.com/assets/v3/full-scenes/06-picnic-time/03-peppa-says-yes.webp",
        "Peppa happily accepts while Dolly holds the juice beside an empty cup",
      ),
      scene(
        "https://media.parrotbook.com/assets/v3/full-scenes/06-picnic-time/04-cup-of-juice.webp",
        "Dolly places a filled cup of orange juice in front of Peppa",
      ),
      scene(
        "https://media.parrotbook.com/assets/v3/full-scenes/06-picnic-time/05-picnic-time-together.webp",
        "Peppa holds her juice while she and Dolly enjoy the ready picnic",
      ),
    ],
  },
  {
    lessonId: "07-bedtime-story",
    scenes: [
      scene(
        "https://media.parrotbook.com/assets/v3/full-scenes/07-bedtime-story/01-story-ends.webp",
        "Dolly closes the storybook while Peppa rests awake on the evening meadow blanket",
      ),
      scene(
        "https://media.parrotbook.com/assets/v3/full-scenes/07-bedtime-story/02-quiet-evening.webp",
        "Peppa and Dolly sit quietly by the lantern beneath the crescent moon",
      ),
      scene(
        "https://media.parrotbook.com/assets/v3/full-scenes/07-bedtime-story/03-peppa-feels-sleepy.webp",
        "Sleepy Peppa rests her head on the pillow while Dolly listens nearby",
      ),
      scene(
        "https://media.parrotbook.com/assets/v3/full-scenes/07-bedtime-story/04-blanket-ready.webp",
        "Peppa lies tucked under the blanket while Dolly sits beside the closed storybook",
      ),
      scene(
        "https://media.parrotbook.com/assets/v3/full-scenes/07-bedtime-story/05-good-night.webp",
        "Peppa sleeps beneath the blanket while Dolly says good night beside the lantern",
      ),
    ],
  },
];
