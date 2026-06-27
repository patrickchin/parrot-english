type RecorderHandler<TEvent extends Event> = ((event: TEvent) => void) | null;

const MOCK_AUDIO_DELAY_MS = 20;
const MOCK_RECORDING_DELAY_MS = 2500;

class MockAudioElement {
  onended: RecorderHandler<Event> = null;
  onerror: RecorderHandler<Event> = null;

  constructor(readonly src: string) {}

  pause() {}

  async play() {
    window.setTimeout(() => {
      this.onended?.(new Event("ended"));
    }, MOCK_AUDIO_DELAY_MS);
  }
}

class MockMediaRecorder {
  static isTypeSupported() {
    return true;
  }

  ondataavailable: RecorderHandler<BlobEvent> = null;
  onstop: RecorderHandler<Event> = null;
  state: RecordingState = "inactive";

  constructor(
    readonly stream: MediaStream,
    readonly options?: MediaRecorderOptions
  ) {}

  start() {
    this.state = "recording";
    window.setTimeout(() => {
      if (this.state === "recording") this.stop();
    }, MOCK_RECORDING_DELAY_MS);
  }

  stop() {
    if (this.state === "inactive") return;

    this.state = "inactive";
    const data = new Blob(["parrot-e2e-audio"], { type: "audio/webm" });
    this.ondataavailable?.({ data } as BlobEvent);
    this.onstop?.(new Event("stop"));
  }
}

function createMockStream() {
  const track = {
    enabled: true,
    kind: "audio",
    label: "Parrot E2E microphone",
    readyState: "live",
    stop() {},
  } as MediaStreamTrack;

  return {
    active: true,
    getAudioTracks: () => [track],
    getTracks: () => [track],
  } as unknown as MediaStream;
}

Object.defineProperty(window, "Audio", {
  configurable: true,
  value: MockAudioElement,
});

Object.defineProperty(window, "MediaRecorder", {
  configurable: true,
  value: MockMediaRecorder,
});

Object.defineProperty(navigator, "mediaDevices", {
  configurable: true,
  value: {
    getUserMedia: async () => createMockStream(),
  },
});

export {};
