import type { LessonEvent } from "../src/app/App";

const joinInDone: LessonEvent = { type: "JOIN_IN_DONE" };
void joinInDone;

// @ts-expect-error Manual microphone events are retired from the player contract.
const retiredMicrophoneEvent: LessonEvent = { type: "MIC_STARTED" };
void retiredMicrophoneEvent;
