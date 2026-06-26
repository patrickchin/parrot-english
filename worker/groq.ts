import { scoreSpeechTranscript } from "../lib/speech-scoring.js";

const GROQ_BASE_URL = "https://api.groq.com/openai/v1";
const TTS_MODEL = "playai-tts";
const STT_MODEL = "whisper-large-v3-turbo";
const PARROT_VOICE = "Fritz-PlayAI";
const MAX_AUDIO_BYTES = 6 * 1024 * 1024;

export interface ApiEnv {
  GROQ_API_KEY?: string;
}

function jsonResponse(payload: unknown, init?: ResponseInit) {
  return Response.json(payload, {
    ...init,
    headers: {
      "Cache-Control": "no-store",
      ...(init?.headers ?? {}),
    },
  });
}

function requireGroqKey(env: ApiEnv) {
  if (!env.GROQ_API_KEY) {
    return null;
  }

  return env.GROQ_API_KEY;
}

export async function handleTts(request: Request, env: ApiEnv) {
  if (request.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
  }

  const apiKey = requireGroqKey(env);
  if (!apiKey) {
    return jsonResponse(
      { error: "missing_groq_api_key", message: "GROQ_API_KEY is not set." },
      { status: 503 }
    );
  }

  let payload: { text?: string; slow?: boolean };
  try {
    payload = (await request.json()) as { text?: string; slow?: boolean };
  } catch {
    return jsonResponse({ error: "invalid_json" }, { status: 400 });
  }

  const text = payload.text?.trim();
  if (!text) {
    return jsonResponse({ error: "text_required" }, { status: 400 });
  }

  const speechText = payload.slow
    ? `Please say this slowly and clearly for a young English learner: ${text}`
    : text;

  const upstream = await fetch(`${GROQ_BASE_URL}/audio/speech`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: TTS_MODEL,
      voice: PARROT_VOICE,
      input: speechText,
      response_format: "wav",
    }),
  });

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => "");
    return jsonResponse(
      {
        error: "tts_failed",
        message: "Groq text-to-speech failed.",
        detail: detail.slice(0, 500),
      },
      { status: 502 }
    );
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": upstream.headers.get("content-type") ?? "audio/wav",
    },
  });
}

export async function handleEvaluateSpeech(request: Request, env: ApiEnv) {
  if (request.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
  }

  const apiKey = requireGroqKey(env);
  if (!apiKey) {
    return jsonResponse(
      { error: "missing_groq_api_key", message: "GROQ_API_KEY is not set." },
      { status: 503 }
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return jsonResponse({ error: "invalid_form_data" }, { status: 400 });
  }

  const targetText = String(formData.get("targetText") ?? "").trim();
  const audio = formData.get("audio");

  if (!targetText) {
    return jsonResponse({ error: "target_text_required" }, { status: 400 });
  }

  if (!(audio instanceof File)) {
    return jsonResponse({ error: "audio_file_required" }, { status: 400 });
  }

  if (audio.size > MAX_AUDIO_BYTES) {
    return jsonResponse({ error: "audio_too_large" }, { status: 413 });
  }

  const groqForm = new FormData();
  groqForm.set("model", STT_MODEL);
  groqForm.set("language", "en");
  groqForm.set("response_format", "json");
  groqForm.set("file", audio, audio.name || "child-response.webm");

  const upstream = await fetch(`${GROQ_BASE_URL}/audio/transcriptions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: groqForm,
  });

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => "");
    return jsonResponse(
      {
        error: "stt_failed",
        message: "Groq speech-to-text failed.",
        detail: detail.slice(0, 500),
      },
      { status: 502 }
    );
  }

  const transcription = (await upstream.json()) as { text?: string };
  const transcript = transcription.text ?? "";
  const result = scoreSpeechTranscript(transcript, targetText);

  return jsonResponse({
    transcript: result.transcript,
    similarity: result.similarity,
    passed: result.passed,
    feedbackText: result.feedbackText,
    retryAllowed: result.retryAllowed,
  });
}
