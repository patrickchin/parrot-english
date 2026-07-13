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
  stopSignal?: AbortSignal;
};

type MicrophoneAccessOptions = Pick<
  SpeechRecorderOptions,
  "MediaRecorder" | "getUserMedia" | "signal"
>;

type SpeechRecordingSessionOptions = Pick<
  SpeechRecorderOptions,
  "MediaRecorder" | "getUserMedia" | "mimeType" | "signal"
>;

export type SpeechRecordingSession = {
  cancel: () => void;
  stop: () => Promise<Blob>;
};

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

export async function startSpeechRecording({
  MediaRecorder: MediaRecorderClass = globalThis.MediaRecorder,
  getUserMedia = (constraints) => navigator.mediaDevices.getUserMedia(constraints),
  mimeType = DEFAULT_MIME_TYPE,
  signal,
}: SpeechRecordingSessionOptions = {}): Promise<SpeechRecordingSession> {
  if (signal?.aborted) {
    throw createAbortError();
  }

  if (!MediaRecorderClass) {
    throw new RecordingUnsupportedError();
  }

  let stream: MediaStream;
  try {
    stream = await getUserMedia(MICROPHONE_CONSTRAINTS);
  } catch (error) {
    if (signal?.aborted) throw createAbortError();
    throw new MicrophoneAccessError(error);
  }

  if (signal?.aborted) {
    stopMediaStream(stream);
    throw createAbortError();
  }

  const chunks: BlobPart[] = [];
  let recorder: MediaRecorder;
  let cancelled = false;
  let settled = false;
  let stopRequested = false;
  let resolveResult: (blob: Blob) => void;
  let rejectResult: (error: unknown) => void;
  const result = new Promise<Blob>((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });
  void result.catch(() => {});

  function cleanup() {
    signal?.removeEventListener("abort", cancelRecording);
    stopMediaStream(stream);
  }

  function finish() {
    if (settled) return;
    settled = true;
    cleanup();

    if (cancelled || signal?.aborted) {
      rejectResult(createAbortError());
      return;
    }

    resolveResult(new Blob(chunks, { type: mimeType }));
  }

  function fail(error: unknown) {
    if (settled) return;
    settled = true;
    cleanup();
    rejectResult(error);
  }

  function cancelRecording() {
    if (settled) return;
    cancelled = true;
    if (recorder.state === "recording") {
      recorder.stop();
      return;
    }
    finish();
  }

  try {
    recorder = new MediaRecorderClass(stream, { mimeType });
  } catch (error) {
    stopMediaStream(stream);
    throw error;
  }

  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };
  recorder.onerror = () => fail(new Error("Audio recording failed."));
  recorder.onstop = finish;
  signal?.addEventListener("abort", cancelRecording, { once: true });

  try {
    recorder.start();
  } catch (error) {
    fail(error);
    throw error;
  }

  return {
    cancel: cancelRecording,
    stop() {
      if (!settled && !stopRequested) {
        stopRequested = true;
        if (recorder.state === "recording") recorder.stop();
        else finish();
      }
      return result;
    },
  };
}

export async function recordSpeechClip({
  MediaRecorder: MediaRecorderClass = globalThis.MediaRecorder,
  clearTimeout: clearRecordingTimeout = globalThis.clearTimeout,
  getUserMedia = (constraints) => navigator.mediaDevices.getUserMedia(constraints),
  mimeType = DEFAULT_MIME_TYPE,
  recordingMs = DEFAULT_RECORDING_MS,
  setTimeout: setRecordingTimeout = globalThis.setTimeout,
  signal,
  stopSignal,
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
      stopSignal?.removeEventListener("abort", stopRecording);
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

    function stopRecording() {
      if (recorder.state === "recording") {
        recorder.stop();
      }
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
    stopSignal?.addEventListener("abort", stopRecording, { once: true });

    try {
      recorder.start();
      if (stopSignal?.aborted) {
        stopRecording();
        return;
      }

      timeoutId = setRecordingTimeout(() => {
        if (recorder.state === "recording") recorder.stop();
      }, recordingMs);
    } catch (error) {
      fail(error);
    }
  });
}
