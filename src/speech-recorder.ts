const DEFAULT_RECORDING_MS = 4200;
const DEFAULT_MIME_TYPE = "audio/webm";

export const MICROPHONE_CONSTRAINTS = {
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
  },
} satisfies MediaStreamConstraints;

type SpeechRecorderConstructor = new (
  stream: MediaStream,
  options?: MediaRecorderOptions
) => MediaRecorder;

type TimerId = ReturnType<typeof setTimeout>;

type SpeechRecorderOptions = {
  MediaRecorder?: SpeechRecorderConstructor;
  clearTimeout?: (timerId: TimerId) => void;
  getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  mimeType?: string;
  recordingMs?: number;
  setTimeout?: (callback: () => void, delay: number) => TimerId;
  signal?: AbortSignal;
};

type MicrophoneAccessOptions = Pick<
  SpeechRecorderOptions,
  "MediaRecorder" | "getUserMedia" | "signal"
>;

export class RecordingUnsupportedError extends Error {
  constructor() {
    super("This browser does not support audio recording.");
    this.name = "RecordingUnsupportedError";
  }
}

export class MicrophoneAccessError extends Error {
  constructor(cause: unknown) {
    super("Microphone access failed.");
    this.name = "MicrophoneAccessError";
    this.cause = cause;
  }
}

function createAbortError() {
  const error = new Error("Recording was cancelled.");
  error.name = "AbortError";
  return error;
}

function stopMediaStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

export async function requestMicrophoneAccess({
  MediaRecorder: MediaRecorderClass = globalThis.MediaRecorder,
  getUserMedia = (constraints) => navigator.mediaDevices.getUserMedia(constraints),
  signal,
}: MicrophoneAccessOptions = {}) {
  if (!MediaRecorderClass) {
    throw new RecordingUnsupportedError();
  }

  if (signal?.aborted) {
    throw createAbortError();
  }

  let stream: MediaStream;
  try {
    stream = await getUserMedia(MICROPHONE_CONSTRAINTS);
  } catch (error) {
    throw new MicrophoneAccessError(error);
  }

  stopMediaStream(stream);

  if (signal?.aborted) {
    throw createAbortError();
  }
}

export async function recordSpeechClip({
  MediaRecorder: MediaRecorderClass = globalThis.MediaRecorder,
  clearTimeout: clearRecordingTimeout = globalThis.clearTimeout,
  getUserMedia = (constraints) => navigator.mediaDevices.getUserMedia(constraints),
  mimeType = DEFAULT_MIME_TYPE,
  recordingMs = DEFAULT_RECORDING_MS,
  setTimeout: setRecordingTimeout = globalThis.setTimeout,
  signal,
}: SpeechRecorderOptions = {}) {
  if (!MediaRecorderClass) {
    throw new RecordingUnsupportedError();
  }

  if (signal?.aborted) {
    throw createAbortError();
  }

  let stream: MediaStream;
  try {
    stream = await getUserMedia(MICROPHONE_CONSTRAINTS);
  } catch (error) {
    throw new MicrophoneAccessError(error);
  }

  if (signal?.aborted) {
    stopMediaStream(stream);
    throw createAbortError();
  }

  return new Promise<Blob>((resolve, reject) => {
    const chunks: Blob[] = [];
    let recorder: MediaRecorder;
    let timeoutId: TimerId | null = null;
    let settled = false;

    function cleanup() {
      if (timeoutId !== null) {
        clearRecordingTimeout(timeoutId);
        timeoutId = null;
      }
      signal?.removeEventListener("abort", abortRecording);
      stopMediaStream(stream);
    }

    function finish() {
      if (settled) return;
      settled = true;
      cleanup();

      if (signal?.aborted) {
        reject(createAbortError());
        return;
      }

      resolve(new Blob(chunks, { type: mimeType }));
    }

    function fail(error: unknown) {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    }

    function abortRecording() {
      if (recorder.state === "recording") {
        recorder.stop();
        return;
      }

      fail(createAbortError());
    }

    try {
      recorder = new MediaRecorderClass(stream, { mimeType });
    } catch (error) {
      fail(error);
      return;
    }

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.onerror = () => fail(new Error("Audio recording failed."));
    recorder.onstop = finish;
    signal?.addEventListener("abort", abortRecording, { once: true });

    try {
      recorder.start();
      timeoutId = setRecordingTimeout(() => {
        if (recorder.state === "recording") recorder.stop();
      }, recordingMs);
    } catch (error) {
      fail(error);
    }
  });
}
