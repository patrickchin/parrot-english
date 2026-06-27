# Parrot English Agent Notes

## Audio Generation

- Do not use local or macOS system text-to-speech for Chinese lesson audio.
- Regenerate Chinese saved audio with ElevenLabs TTS.
- Use character-directed voices, not exact protected-character clones.
- Current ElevenLabs defaults for regenerated assets:
  - Pig example audio: `Summer - British, Confident & Posh` (`Oqy85UMasXzUjUxF0ta5`).
  - Parrot coach/Chinese audio: `Chen - Friendly Narration Mandarin` (`4NQthjVhIGGVfL3Si000`).
  - Preferred model: `eleven_v3`.
- Chinese parrot lines should use `voiceStyle: "energetic-character"` and `ttsText` performance tags while keeping visible `text` clean.
- Source audio assets live in `public/assets/audio`; `dist/assets/audio` is build output.
