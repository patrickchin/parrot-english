import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

function extractFunctionSource(name) {
  const start = appSource.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `Expected to find function ${name}`);

  let depth = 0;
  let sawBody = false;
  for (let index = start; index < appSource.length; index += 1) {
    const char = appSource[index];
    if (char === "{") {
      depth += 1;
      sawBody = true;
    }
    if (char === "}") {
      depth -= 1;
      if (sawBody && depth === 0) {
        return appSource.slice(start, index + 1);
      }
    }
  }

  assert.fail(`Could not parse function ${name}`);
}

function extractUseEffectSource(functionSource, containingText) {
  const markerIndex = functionSource.indexOf(containingText);
  assert.notEqual(
    markerIndex,
    -1,
    `Expected useEffect marker ${containingText}`
  );

  const start = functionSource.lastIndexOf("useEffect(() => {", markerIndex);
  assert.notEqual(start, -1, `Expected useEffect for ${containingText}`);

  let depth = 0;
  let sawCall = false;
  for (let index = start; index < functionSource.length; index += 1) {
    const char = functionSource[index];
    if (char === "(") {
      depth += 1;
      sawCall = true;
    }
    if (char === ")") {
      depth -= 1;
      if (sawCall && depth === 0) {
        return functionSource.slice(start, index + 2);
      }
    }
  }

  assert.fail(`Could not parse useEffect for ${containingText}`);
}

describe("director packet UI integration", () => {
  it("imports the director packet modules", () => {
    assert.match(appSource, /ai-lesson-data/);
    assert.match(appSource, /mock-lesson-director/);
    assert.match(appSource, /director-packet-state/);
    assert.match(appSource, /director-packet-scene/);
  });

  it("uses childPrompt.targetText for director speech evaluation", () => {
    assert.match(appSource, /activePrompt\?\.targetText/);
  });

  it("keeps the feature flag as a wrapper around deterministic default flow", () => {
    assert.match(
      appSource,
      /return USE_DIRECTOR_PACKET_FLOW \?\s*\(\s*<DirectorLessonPlayer \/>\s*\)\s*:\s*\(\s*<DeterministicLessonPlayer \/>\s*\)/s
    );
  });

  it("can request director packets from the Worker route", () => {
    const loadPacketSource = extractFunctionSource("loadDirectorPacket");

    assert.match(appSource, /requestLessonDirectorPacket/);
    assert.match(appSource, /VITE_PARROT_DIRECTOR_API/);
    assert.match(loadPacketSource, /requestLessonDirectorPacket/);
    assert.match(loadPacketSource, /signal: controller\.signal/);
  });

  it("plays active director turns through the director speech helper", () => {
    const directorSource = extractFunctionSource("DirectorLessonPlayer");
    const playingTurnEffectSource = extractUseEffectSource(
      directorSource,
      "state.phase !== DirectorPacketPhase.PlayingTurn"
    );

    assert.match(appSource, /director-audio-playback/);
    assert.match(appSource, /playDirectorTurnSpeech/);
    assert.doesNotMatch(appSource, /DIRECTOR_TURN_DELAY_MS/);
    assert.match(
      directorSource,
      /const activeTurn = state\.packet\?\.turns\[state\.activeTurnIndex\] \?\? null;/
    );
    assert.match(
      playingTurnEffectSource,
      /state\.phase !== DirectorPacketPhase\.PlayingTurn \|\| !activeTurn/
    );
    assert.match(playingTurnEffectSource, /const turn = activeTurn;/);
    assert.match(playingTurnEffectSource, /let cancelled = false;/);
    assert.match(
      playingTurnEffectSource,
      /const controller = new AbortController\(\);/
    );
    assert.match(
      playingTurnEffectSource,
      /await playDirectorTurnSpeech\(\{\s*speaker: turn\.speaker,\s*speech: turn\.speech,\s*signal: controller\.signal,\s*\}\);/s
    );
    assert.match(
      playingTurnEffectSource,
      /if \(!cancelled\) \{\s*dispatch\(\{ type: "TURN_DONE" \}\);\s*\}/s
    );
    assert.match(
      playingTurnEffectSource,
      /return \(\) => \{\s*cancelled = true;\s*controller\.abort\(\);\s*\};/s
    );
    assert.doesNotMatch(playingTurnEffectSource, /DIRECTOR_TURN_DELAY_MS/);
  });

  it("does not evaluate speech inside the director recording step", () => {
    const recordingSource = extractFunctionSource("recordDirectorPrompt");
    const evaluationSource = extractFunctionSource("evaluateDirectorPrompt");

    assert.match(appSource, /state\.phase !== DirectorPacketPhase\.Listening[\s\S]+void recordDirectorPrompt\(\);/);
    assert.match(appSource, /state\.phase !== DirectorPacketPhase\.Evaluating[\s\S]+void evaluateDirectorPrompt\(\);/);
    assert.match(recordingSource, /recordSpeechClip/);
    assert.match(recordingSource, /dispatch\(\{ type: "RECORDING_DONE" \}\)/);
    assert.doesNotMatch(recordingSource, /evaluateSpeech/);
    assert.match(evaluationSource, /evaluateSpeech/);
    assert.match(evaluationSource, /dispatch\(\{ type: "EVALUATED", result \}\)/);
  });

  it("only resets the director lesson on finished start", () => {
    const reducerSource = extractFunctionSource("reduceDirectorLessonPlayerState");

    assert.match(reducerSource, /currentState\.phase === DirectorPacketPhase\.Finished/);
    assert.doesNotMatch(reducerSource, /currentState\.phase === DirectorPacketPhase\.Error/);
  });
});
