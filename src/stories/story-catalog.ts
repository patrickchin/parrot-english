export type StoryPage = {
  id: string;
  imageAlt: string;
  imageSrc: string;
  joinIn: string;
  text: string;
};

export type Story = {
  category: string;
  coverAlt: string;
  coverSrc: string;
  durationMinutes: number;
  id: string;
  pages: readonly StoryPage[];
  summary: string;
  title: string;
};

export type UpcomingStory = {
  category: string;
  durationMinutes: number;
  summary: string;
  title: string;
};

export const STORIES: readonly Story[] = [
  {
    id: "the-lantern-trail",
    title: "The Lantern Trail",
    category: "Adventure",
    durationMinutes: 4,
    summary:
      "Help Pip guide a little firefly home through a glowing nighttime garden.",
    coverSrc: "/assets/stories/the-lantern-trail-cover.webp",
    coverAlt:
      "Pip the green parrot follows Flicker the glowing firefly across a stream toward a lantern-lit tree house",
    pages: [
      {
        id: "the-garden-gate",
        imageSrc: "/assets/stories/the-lantern-trail-01.webp",
        imageAlt:
          "Pip meets Flicker beside an open garden gate at sunset",
        text:
          "At sunset, Pip the green parrot heard a tiny voice by the garden gate. “I’m Flicker,” said a little firefly. “The wind blew me away from my family.” Pip opened his wings. “We’ll follow your glow and find the lantern tree.”",
        joinIn: "Glow, little lantern, show us the way!",
      },
      {
        id: "the-moonlit-stream",
        imageSrc: "/assets/stories/the-lantern-trail-02.webp",
        imageAlt:
          "Pip and Flicker hop across round stones in a moonlit stream",
        text:
          "The trail reached a stream where round stones winked in the moonlight. Flicker lit the first stone, and Pip hopped after him—tip, tap, tip! Together they crossed without wetting a feather.",
        joinIn: "Glow, little lantern, show us the way!",
      },
      {
        id: "the-rain-leaf",
        imageSrc: "/assets/stories/the-lantern-trail-03.webp",
        imageAlt:
          "Pip shelters Flicker beneath a giant leaf while rain falls",
        text:
          "Soft rain began to patter. Pip lifted a giant leaf over them like an umbrella, but Flicker’s light grew dim. Pip stayed close until the warm glow shone again.",
        joinIn: "Glow, little lantern, show us the way!",
      },
      {
        id: "the-windy-sunflowers",
        imageSrc: "/assets/stories/the-lantern-trail-04.webp",
        imageAlt:
          "Pip protects Flicker from the wind among tall sleeping sunflowers",
        text:
          "A gust whooshed through the sleeping sunflowers and spun Flicker in circles. Pip cupped his wings around his little friend. When the wind passed, a golden trail twinkled ahead.",
        joinIn: "Glow, little lantern, show us the way!",
      },
      {
        id: "the-lantern-tree",
        imageSrc: "/assets/stories/the-lantern-trail-05.webp",
        imageAlt:
          "Pip watches Flicker reunite with a sparkling firefly family inside the lantern tree",
        text:
          "The trail ended at an old lantern tree. Dozens of fireflies danced from the hollow, and Flicker’s family wrapped him in a warm, sparkling hug. Pip cheered as the whole tree lit up.",
        joinIn: "Welcome home, Flicker!",
      },
      {
        id: "one-last-glow",
        imageSrc: "/assets/stories/the-lantern-trail-06.webp",
        imageAlt:
          "Pip rests in bed while Flicker glows outside the round window beneath the moon",
        text:
          "Flicker guided Pip back to his cosy tree house. One tiny light hovered outside the round window until Pip was tucked beneath his blanket. Then Flicker blinked once, twice, and floated home beneath the moon.",
        joinIn: "Good night, little lantern.",
      },
    ],
  },
];

export const UPCOMING_STORIES: readonly UpcomingStory[] = [
  {
    title: "The Cloud Who Lost Its Rain",
    category: "Weather",
    durationMinutes: 3,
    summary: "Listen for three sounds that wake a gentle rainstorm.",
  },
  {
    title: "The Tiny Dragon’s Big Sneeze",
    category: "Silly story",
    durationMinutes: 3,
    summary: "Help a tiny dragon learn a soft sneeze and save the birthday cake.",
  },
  {
    title: "Robot’s First Picnic",
    category: "Friendship",
    durationMinutes: 4,
    summary: "Pack a funny first picnic and learn what friends need.",
  },
];

export function resolveStory(storyId: string | undefined): Story | null {
  if (!storyId) return null;
  return STORIES.find((story) => story.id === storyId) ?? null;
}
