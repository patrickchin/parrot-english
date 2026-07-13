export type DeviceSpeechSpeaker = "peppa" | "dolly" | "narrator";

export type DeviceVoice = {
  default: boolean;
  lang: string;
  localService: boolean;
  name: string;
};

type DeviceUtterance = {
  lang?: string;
  onend?: (() => void) | null;
  onerror?: ((event?: unknown) => void) | null;
  pitch?: number;
  rate?: number;
  text: string;
  voice?: DeviceVoice | null;
  volume?: number;
};

export type DeviceSpeechEnvironment = {
  cancel(): void;
  createUtterance(text: string): DeviceUtterance;
  getVoices(): DeviceVoice[];
  speak(utterance: DeviceUtterance): void;
};

type PlayDeviceSpeechOptions = {
  env?: DeviceSpeechEnvironment | null;
  signal?: AbortSignal;
  speaker: DeviceSpeechSpeaker;
  text: string;
};

function createAbortError() {
  const error = new Error("On-device speech was cancelled.");
  error.name = "AbortError";
  return error;
}

function browserDeviceSpeechEnvironment(): DeviceSpeechEnvironment | null {
  if (
    typeof globalThis.speechSynthesis === "undefined" ||
    typeof globalThis.SpeechSynthesisUtterance === "undefined"
  ) {
    return null;
  }

  return {
    cancel: () => globalThis.speechSynthesis.cancel(),
    createUtterance: (text) =>
      new SpeechSynthesisUtterance(text) as unknown as DeviceUtterance,
    getVoices: () => globalThis.speechSynthesis.getVoices(),
    speak: (utterance) =>
      globalThis.speechSynthesis.speak(utterance as SpeechSynthesisUtterance),
  };
}

function voiceScore(voice: DeviceVoice) {
  return (
    (voice.localService ? 8 : 0) +
    (voice.default ? 4 : 0) +
    (/^en-US\b/i.test(voice.lang) ? 2 : 0) +
    (/^en\b/i.test(voice.lang) ? 1 : 0)
  );
}

export function selectEnglishDeviceVoice(voices: DeviceVoice[]) {
  return (
    voices
      .filter((voice) => /^en(?:-|$)/i.test(voice.lang))
      .map((voice, index) => ({ index, score: voiceScore(voice), voice }))
      .sort((left, right) => right.score - left.score || left.index - right.index)[0]
      ?.voice ?? null
  );
}

function speakerPerformance(speaker: DeviceSpeechSpeaker) {
  switch (speaker) {
    case "peppa":
      return { pitch: 1.25, rate: 0.96 };
    case "dolly":
      return { pitch: 1.08, rate: 0.92 };
    case "narrator":
      return { pitch: 1, rate: 0.9 };
  }
}

export function playDeviceSpeech({
  env = browserDeviceSpeechEnvironment(),
  signal,
  speaker,
  text,
}: PlayDeviceSpeechOptions) {
  if (!env) {
    return Promise.reject(
      new Error("On-device speech is not supported by this browser."),
    );
  }
  if (signal?.aborted) return Promise.reject(createAbortError());

  const utterance = env.createUtterance(text);
  const voice = selectEnglishDeviceVoice(env.getVoices());
  const performance = speakerPerformance(speaker);
  utterance.lang = voice?.lang || "en-US";
  utterance.pitch = performance.pitch;
  utterance.rate = performance.rate;
  utterance.volume = 1;
  utterance.voice = voice;

  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      signal?.removeEventListener("abort", handleAbort);
      utterance.onend = null;
      utterance.onerror = null;
    };
    const settle = (action: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      action();
    };
    const handleAbort = () => {
      env.cancel();
      settle(() => reject(createAbortError()));
    };

    utterance.onend = () => settle(resolve);
    utterance.onerror = () =>
      settle(() => reject(new Error("On-device speech playback failed.")));
    signal?.addEventListener("abort", handleAbort, { once: true });

    try {
      env.speak(utterance);
    } catch (caughtError) {
      settle(() =>
        reject(
          caughtError instanceof Error
            ? caughtError
            : new Error("On-device speech playback failed."),
        ),
      );
    }
  });
}
