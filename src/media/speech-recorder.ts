const DEFAULT_RECORDING_MS = 4200;

export const MICROPHONE_CONSTRAINTS = {
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
  },
} satisfies MediaStreamConstraints;

type SpeechRecorderConstructor = new (
  stream: MediaStream,
  options?: MediaRecorderOptions,
) => MediaRecorder;

type SpeechRecorderClass = SpeechRecorderConstructor & {
  isTypeSupported?: (mimeType: string) => boolean;
};

const RECORDING_MIME_TYPES = [
  "audio/mp4;codecs=mp4a.40.2",
  "audio/webm;codecs=opus",
  "audio/mp4",
  "audio/webm",
  "audio/ogg;codecs=opus",
] as const;

type TimerId = ReturnType<typeof setTimeout>;

type SpeechRecorderOptions = {
  MediaRecorder?: SpeechRecorderClass;
  clearTimeout?: (timerId: TimerId) => void;
  getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  mimeType?: string;
  onRecordingStart?: () => void;
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

export function selectRecordingMimeType(
  MediaRecorderClass: SpeechRecorderClass = globalThis.MediaRecorder
) {
  if (!MediaRecorderClass) {
    throw new RecordingUnsupportedError();
  }

  if (typeof MediaRecorderClass.isTypeSupported !== "function") {
    return "";
  }

  const isTypeSupported = MediaRecorderClass.isTypeSupported;
  return RECORDING_MIME_TYPES.find((type) => isTypeSupported(type)) ?? "";
}

export type SpeechRecordingSession = {
  cancel: () => void;
  stream: MediaStream;
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
  getUserMedia = (constraints) =>
    navigator.mediaDevices.getUserMedia(constraints),
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
    if (signal?.aborted) throw createAbortError();
    throw new MicrophoneAccessError(error);
  }

  stopMediaStream(stream);

  if (signal?.aborted) {
    throw createAbortError();
  }
}

export async function startSpeechRecording({
  MediaRecorder: MediaRecorderClass = globalThis.MediaRecorder,
  getUserMedia = (constraints) =>
    navigator.mediaDevices.getUserMedia(constraints),
  mimeType,
  signal,
}: SpeechRecordingSessionOptions = {}): Promise<SpeechRecordingSession> {
  if (signal?.aborted) {
    throw createAbortError();
  }

  if (!MediaRecorderClass) {
    throw new RecordingUnsupportedError();
  }

  const resolvedMimeType = mimeType ?? selectRecordingMimeType(MediaRecorderClass);

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

    resolveResult(new Blob(chunks, { type: recorder.mimeType || resolvedMimeType }));
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
    recorder = new MediaRecorderClass(
      stream,
      resolvedMimeType ? { mimeType: resolvedMimeType } : undefined
    );
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
    stream,
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
  getUserMedia = (constraints) =>
    navigator.mediaDevices.getUserMedia(constraints),
  mimeType,
  onRecordingStart,
  recordingMs = DEFAULT_RECORDING_MS,
  setTimeout: setRecordingTimeout = globalThis.setTimeout,
  signal,
  stopSignal,
}: SpeechRecorderOptions = {}) {
  const session = await startSpeechRecording({
    MediaRecorder: MediaRecorderClass,
    getUserMedia,
    mimeType,
    signal,
  });

  try {
    onRecordingStart?.();
  } catch (error) {
    session.cancel();
    await session.stop().catch(() => undefined);
    throw error;
  }

  return await new Promise<Blob>((resolve, reject) => {
    let timeout: TimerId | null = null;
    let stopPromise: Promise<Blob> | null = null;
    const cleanup = () => {
      if (timeout !== null) clearRecordingTimeout(timeout);
      signal?.removeEventListener("abort", stop);
      stopSignal?.removeEventListener("abort", stop);
    };
    const stop = () => {
      stopPromise ??= session.stop().finally(cleanup);
      void stopPromise.then(resolve, reject);
    };
    signal?.addEventListener("abort", stop, { once: true });
    stopSignal?.addEventListener("abort", stop, { once: true });
    if (signal?.aborted || stopSignal?.aborted) {
      stop();
      return;
    }
    try {
      timeout = setRecordingTimeout(stop, recordingMs);
    } catch (error) {
      cleanup();
      session.cancel();
      void session.stop().catch(() => undefined);
      reject(error);
    }
  });
}
