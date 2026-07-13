export function createLessonScript({ childName = "Mia", title = "Garden Help" } = {}) {
  return {
    title,
    childName,
    goalPhrases: ["Can you help me?", "Thank you!"],
    summary: "Peppa asks Dolly for help in the garden.",
    detailedSummary:
      "Peppa finds a watering can beside the flowers. Dolly helps after Peppa asks politely. Peppa says thank you, and the flowers get their water.",
    location: {
      name: "The garden",
      description: "A bright garden with flowers and green grass.",
    },
    scenes: Array.from({ length: 5 }, (_, index) => ({
      title: `Scene ${index + 1}`,
      settingDescription:
        "Peppa and Dolly stand together beside the garden flowers.",
      background: "episode-garden",
      characters: ["peppa", "dolly", "user"],
      steps: [
        {
          speaker: "dolly",
          dialogue: index === 4 ? "Thank you!" : "Can you help me?",
          emotes: {
            peppa: "listening",
            dolly: "talking",
            user: "listening",
          },
        },
        {
          speaker: "user",
          dialogue: index === 4 ? "Thank you!" : "Can you help me?",
          emotes: {
            peppa: "listening",
            dolly: "listening",
            user: "talking",
          },
        },
        ...(index === 4
          ? [
              {
                speaker: "narrator",
                dialogue: `Great job, ${childName}! The flowers have their water!`,
                emotes: {
                  peppa: "happy",
                  dolly: "happy",
                  user: "happy",
                },
              },
            ]
          : []),
      ],
    })),
  };
}
