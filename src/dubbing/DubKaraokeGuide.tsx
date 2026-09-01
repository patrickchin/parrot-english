import type { ReactNode } from "react";
import { getDubLineMusicPhrase, type DubDefinition, type DubLine } from "./rhyme-catalog";

export type DubWordState = "future" | "active" | "past";

export type DubTimedWordSegment = Readonly<
  | { kind: "text"; text: string }
  | {
      kind: "word";
      text: string;
      startOffset: number;
      endOffset: number;
      state: DubWordState;
    }
>;

export type DubMelodyRect = Readonly<{
  noteIndex: number;
  atMs: number;
  durationMs: number;
  x: number;
  width: number;
  y: number;
}>;

export type DubGuidancePosition = Readonly<{
  lineId: string | null;
  elapsedMs: number | null;
}>;

function isValidWordCue(line: DubLine) {
  let previousEndOffset = 0;
  let previousEndMs = 0;
  return Number.isFinite(line.durationMs) && line.durationMs > 0 && line.words.length > 0 && line.words.every((word) => {
    const endMs = word.atMs + word.durationMs;
    const valid = Number.isInteger(word.startOffset)
      && Number.isInteger(word.endOffset)
      && word.startOffset >= previousEndOffset
      && word.endOffset > word.startOffset
      && word.endOffset <= line.text.length
      && Number.isFinite(word.atMs)
      && Number.isFinite(word.durationMs)
      && word.atMs >= 0
      && word.durationMs > 0
      && Number.isFinite(endMs)
      && word.atMs >= previousEndMs
      && endMs <= line.durationMs;
    previousEndOffset = word.endOffset;
    previousEndMs = endMs;
    return valid;
  });
}

export function getDubTimedWordSegments(
  line: DubLine,
  elapsedMs: number | null,
): readonly DubTimedWordSegment[] {
  if (!isValidWordCue(line)) return [{ kind: "text", text: line.text }];

  const segments: DubTimedWordSegment[] = [];
  let offset = 0;
  for (const word of line.words) {
    if (word.startOffset > offset) segments.push({ kind: "text", text: line.text.slice(offset, word.startOffset) });
    const endMs = word.atMs + word.durationMs;
    const state: DubWordState = elapsedMs === null || elapsedMs < word.atMs
      ? "future"
      : elapsedMs < endMs
        ? "active"
        : "past";
    segments.push({
      endOffset: word.endOffset,
      kind: "word",
      startOffset: word.startOffset,
      state,
      text: line.text.slice(word.startOffset, word.endOffset),
    });
    offset = word.endOffset;
  }
  if (offset < line.text.length) segments.push({ kind: "text", text: line.text.slice(offset) });
  return segments;
}

function getLineNotes(definition: DubDefinition, line: DubLine) {
  if (!Number.isFinite(line.durationMs) || line.durationMs <= 0) return [];
  try {
    return getDubLineMusicPhrase(definition, line).notes
      .map((note, noteIndex) => ({ ...note, noteIndex }))
      .filter((note) => Number.isFinite(note.atMs)
        && Number.isFinite(note.durationMs)
        && Number.isFinite(note.midi)
        && note.atMs >= 0
        && note.durationMs > 0);
  } catch {
    return [];
  }
}

export function getDubMelodyGeometry(
  definition: DubDefinition,
  line: DubLine,
): readonly DubMelodyRect[] {
  const notes = getLineNotes(definition, line);
  if (notes.length === 0) return [];
  const lowestMidi = Math.min(...notes.map(({ midi }) => midi));
  const highestMidi = Math.max(...notes.map(({ midi }) => midi));
  const pitchRange = highestMidi - lowestMidi;

  return notes.map(({ atMs, durationMs, midi, noteIndex }) => {
    const x = Math.min(100, atMs / line.durationMs * 100);
    const width = Math.max(0, Math.min(100 - x, durationMs / line.durationMs * 100));
    return {
      atMs,
      durationMs,
      noteIndex,
      width,
      x,
      y: pitchRange === 0 ? 50 : (highestMidi - midi) / pitchRange * 100,
    };
  });
}

export function getActiveDubMelodyNoteIndex(
  definition: DubDefinition,
  line: DubLine,
  elapsedMs: number | null,
): number | null {
  if (elapsedMs === null || !Number.isFinite(elapsedMs)) return null;
  return getDubMelodyGeometry(definition, line).find((note) =>
    elapsedMs >= note.atMs && elapsedMs < note.atMs + note.durationMs,
  )?.noteIndex ?? null;
}

export function getDubPlayheadPercent(line: DubLine, elapsedMs: number | null): number | null {
  if (elapsedMs === null || !Number.isFinite(elapsedMs)
    || !Number.isFinite(line.durationMs) || line.durationMs <= 0) return null;
  return Math.min(100, Math.max(0, elapsedMs / line.durationMs * 100));
}

export function DubTimedWords({ line, elapsedMs }: {
  line: DubLine;
  elapsedMs: number | null;
}): ReactNode {
  return getDubTimedWordSegments(line, elapsedMs).map((segment) =>
    segment.kind === "text"
      ? segment.text
      : <span
          aria-current={segment.state === "active" ? "true" : undefined}
          className={segment.state === "active"
            ? "rounded-md bg-amber-200 px-0.5 font-black underline decoration-2 underline-offset-2"
            : undefined}
          key={`${segment.startOffset}-${segment.endOffset}`}
        >
          {segment.text}
        </span>,
  );
}

export function DubMelodyLane({
  definition,
  elapsedMs,
  line,
  showPlayhead = true,
}: {
  definition: DubDefinition;
  line: DubLine;
  elapsedMs: number | null;
  showPlayhead?: boolean;
}): ReactNode {
  const geometry = getDubMelodyGeometry(definition, line);
  if (geometry.length === 0) return null;
  const activeNoteIndex = getActiveDubMelodyNoteIndex(definition, line, elapsedMs);
  const playhead = showPlayhead ? getDubPlayheadPercent(line, elapsedMs) : null;

  return (
    <svg aria-hidden="true" className="h-8 w-full short-wide:h-3" focusable="false" preserveAspectRatio="none" viewBox="0 0 100 100">
      {geometry.map((note) => {
        const active = note.noteIndex === activeNoteIndex;
        return <rect
          className={active ? "fill-brand-rose stroke-brand-ink" : "fill-brand-blue/70 stroke-brand-blue"}
          height="18"
          key={note.noteIndex}
          rx="5"
          strokeWidth={active ? "4" : "1"}
          width={note.width}
          x={note.x}
          y={Math.max(0, Math.min(82, note.y - 9))}
        />;
      })}
      {playhead === null ? null : <line stroke="currentColor" strokeWidth="1.5" x1={playhead} x2={playhead} y1="0" y2="100" />}
    </svg>
  );
}
