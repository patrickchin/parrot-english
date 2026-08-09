export const FULL_SCENE_FRAME_PRESETS = {
  landscape: {
    aspectRatio: "3 / 2",
    label: "Landscape · 3:2",
  },
  square: {
    aspectRatio: "1 / 1",
    label: "Square · 1:1",
  },
  portrait: {
    aspectRatio: "2 / 3",
    label: "Portrait · 2:3",
  },
  wide: {
    aspectRatio: "16 / 9",
    label: "Wide · 16:9",
  },
  free: {
    aspectRatio: null,
    label: "Natural size",
  },
} as const;

export type FullSceneFramePreset = keyof typeof FULL_SCENE_FRAME_PRESETS;

export type FullSceneImage = {
  alt: string;
  src: string;
};

export type FullSceneLessonVariant = {
  baseLessonId: string;
  id: string;
  scenes: Array<{
    frame: {
      preset: FullSceneFramePreset;
    };
    image: FullSceneImage;
  }>;
};

export const FULL_SCENE_LESSON_VARIANTS: FullSceneLessonVariant[] = [
  {
    baseLessonId: "02-garden-colors",
    id: "full-scene",
    scenes: [
      {
        frame: { preset: "wide" },
        image: {
          alt: "Peppa and Dolly discover many colorful flowers beside their basket in the sunny garden",
          src: "/assets/full-scenes/02-garden-colors/01-colorful-flowers.webp",
        },
      },
      {
        frame: { preset: "wide" },
        image: {
          alt: "Peppa points to a flower while Dolly considers its color beside the basket",
          src: "/assets/full-scenes/02-garden-colors/02-color-question.webp",
        },
      },
      {
        frame: { preset: "wide" },
        image: {
          alt: "Dolly identifies the red flower while Peppa watches in the garden",
          src: "/assets/full-scenes/02-garden-colors/03-red-one.webp",
        },
      },
      {
        frame: { preset: "wide" },
        image: {
          alt: "Peppa lifts the red flower while Dolly smiles beside the basket",
          src: "/assets/full-scenes/02-garden-colors/04-flower-found.webp",
        },
      },
      {
        frame: { preset: "wide" },
        image: {
          alt: "Peppa and Dolly admire their finished basket with the red flower",
          src: "/assets/full-scenes/02-garden-colors/05-finished-basket.webp",
        },
      },
    ],
  },
];
