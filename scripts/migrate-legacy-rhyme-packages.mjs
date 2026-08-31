import {
  copyFile as copyFileDefault,
  mkdir,
  writeFile as writeFileDefault,
} from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { STATIC_AUDIO_LINES } from "../lib/static-audio.js";
import {
  DUB_DEFINITIONS,
  getDubLineMusicPhrase,
} from "../src/dubbing/rhyme-catalog.ts";

const WORD_PATTERN = /[\p{L}\p{N}]+(?:[’‘ʼ'‐‑-][\p{L}\p{N}]+)*/gu;
const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function pitchXml(midi) {
  const steps = ["C", "C", "D", "D", "E", "F", "F", "G", "G", "A", "A", "B"];
  const alters = [0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0];
  const pitchClass = midi % 12;
  const alter = alters[pitchClass];
  return `<pitch><step>${steps[pitchClass]}</step>${
    alter === 0 ? "" : `<alter>${alter}</alter>`
  }<octave>${Math.floor(midi / 12) - 1}</octave></pitch>`;
}

function restXml(duration, { endLine = false } = {}) {
  if (!Number.isSafeInteger(duration) || duration <= 0) {
    throw new Error(`MusicXML rest duration must be a positive integer: ${duration}`);
  }
  return `<note><rest/><duration>${duration}</duration>${
    endLine ? lyricXml({ endLine: true, extend: false }) : ""
  }</note>`;
}

function lyricXml({ endLine = false, extend = false, text }) {
  return [
    '<lyric number="1">',
    extend
      ? "<extend/>"
      : text === undefined
        ? ""
        : `<syllabic>single</syllabic><text>${escapeXml(text)}</text>`,
    endLine ? "<end-line/>" : "",
    "</lyric>",
  ].join("");
}

function pitchedNoteXml({ chord = false, duration, endLine, extend, midi, text, ties = [] }) {
  if (!Number.isSafeInteger(duration) || duration <= 0) {
    throw new Error(`MusicXML note duration must be a positive integer: ${duration}`);
  }
  const tieElements = ties.map((type) => `<tie type="${type}"/>`).join("");
  const notations = ties.length === 0
    ? ""
    : `<notations>${ties.map((type) => `<tied type="${type}"/>`).join("")}</notations>`;
  const lyric = text === undefined && !extend
    ? ""
    : lyricXml({ endLine, extend, text });
  return `<note>${chord ? "<chord/>" : ""}${pitchXml(midi)}${tieElements}<duration>${duration}</duration>${notations}${lyric}</note>`;
}

function fragmentTies(index, count) {
  if (count === 1) return [];
  if (index === 0) return ["start"];
  if (index === count - 1) return ["stop"];
  return ["stop", "start"];
}

function lyricNotesForPhrase(text, notes) {
  const words = [...text.matchAll(WORD_PATTERN)].map(([word]) => word);
  if (words.length === 0 || notes.length === 0) {
    throw new Error(`Cannot allocate ${words.length} words across ${notes.length} notes for ${text}`);
  }
  const output = notes.map(() => []);
  if (words.length >= notes.length) {
    for (const [noteIndex, note] of notes.entries()) {
      const firstWord = Math.floor(noteIndex * words.length / notes.length);
      const afterLastWord = Math.floor((noteIndex + 1) * words.length / notes.length);
      const count = afterLastWord - firstWord;
      const boundaries = Array.from(
        { length: count + 1 },
        (_, boundaryIndex) => Math.round(
          note.atMs + boundaryIndex * note.durationMs / count,
        ),
      );
      for (let fragmentIndex = 0; fragmentIndex < count; fragmentIndex += 1) {
        const duration = boundaries[fragmentIndex + 1] - boundaries[fragmentIndex];
        if (duration <= 0) {
          throw new Error(`Word subdivision collapses to zero duration for ${text}`);
        }
        output[noteIndex].push({
          duration,
          endLine: noteIndex === notes.length - 1 && fragmentIndex === count - 1,
          midi: note.midi,
          text: words[firstWord + fragmentIndex],
          ties: fragmentTies(fragmentIndex, count),
        });
      }
    }
    return output;
  }

  for (const [wordIndex, word] of words.entries()) {
    const firstNote = Math.floor(wordIndex * notes.length / words.length);
    const afterLastNote = Math.floor((wordIndex + 1) * notes.length / words.length);
    for (let noteIndex = firstNote; noteIndex < afterLastNote; noteIndex += 1) {
      const note = notes[noteIndex];
      output[noteIndex].push({
        duration: note.durationMs,
        endLine: wordIndex === words.length - 1 && noteIndex === afterLastNote - 1,
        extend: noteIndex > firstNote,
        midi: note.midi,
        text: noteIndex === firstNote ? word : undefined,
      });
    }
  }
  return output;
}

function guideRecordsFor(definition) {
  const prefix = `${definition.id}-guide-line-`;
  return new Map(
    Object.entries(STATIC_AUDIO_LINES)
      .filter(([id]) => id.startsWith(prefix))
      .map(([id, record]) => [record.text, { id, ...record }]),
  );
}

function packageManifest(definition, order) {
  const slug = path.basename(definition.route);
  const guides = guideRecordsFor(definition);
  const scenes = definition.sceneTitles.map((title, sceneIndex) => ({
    artwork: definition.sceneArtwork[sceneIndex],
    id: `scene-${sceneIndex + 1}`,
    lines: definition.lines
      .slice(
        sceneIndex * definition.linesPerScene,
        (sceneIndex + 1) * definition.linesPerScene,
      )
      .map((line, localIndex) => {
        const lineIndex = sceneIndex * definition.linesPerScene + localIndex;
        const guide = guides.get(line.text);
        if (!guide) throw new Error(`Missing explicit guide record for ${line.id}: ${line.text}`);
        return {
          ...(definition.lineArtwork ? { artwork: definition.lineArtwork[lineIndex] } : {}),
          guide: `guides/${guide.id}.mp3`,
          id: line.id,
          text: line.text,
        };
      }),
    title,
  }));
  return {
    countInBeats: 2,
    countInMidi: definition.music.countIn[0].midi,
    id: definition.id,
    order,
    scenes,
    schemaVersion: 1,
    score: {
      melodyPart: "P1",
      playbackParts: ["P1", "P2"],
      src: "score.musicxml",
      volume: definition.music.volume,
    },
    slug,
    title: definition.title,
  };
}

function melodyPartXml(definition) {
  const body = [
    "<attributes><divisions>400</divisions></attributes>",
    "<direction><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>150</per-minute></metronome></direction-type></direction>",
    restXml(800),
  ];
  for (const line of definition.lines) {
    const phrase = getDubLineMusicPhrase(definition, line);
    body.push(`<bookmark id="${escapeXml(line.id)}"/>`);
    let cursor = 0;
    const allocated = lyricNotesForPhrase(line.text, phrase.notes);
    const finalNote = phrase.notes.at(-1);
    const hasSilentTail = finalNote.atMs + finalNote.durationMs < phrase.durationMs;
    if (hasSilentTail) allocated.at(-1).at(-1).endLine = false;
    for (const [noteIndex, note] of phrase.notes.entries()) {
      if (note.atMs < cursor) {
        throw new Error(`Overlapping legacy melody notes for ${line.id}`);
      }
      if (note.atMs > cursor) body.push(restXml(note.atMs - cursor));
      const fragmentsForNote = allocated[noteIndex];
      if (fragmentsForNote.length === 0) {
        throw new Error(`Missing lyric allocation for ${line.id}`);
      }
      for (const fragment of fragmentsForNote) body.push(pitchedNoteXml(fragment));
      cursor = note.atMs + note.durationMs;
    }
    if (cursor < phrase.durationMs) {
      body.push(restXml(phrase.durationMs - cursor, { endLine: true }));
    }
    if (cursor > phrase.durationMs) {
      throw new Error(`Legacy melody exceeds phrase duration for ${line.id}`);
    }
  }
  const outroDuration = definition.durationMs
    - definition.lines[0].cueMs
    - definition.lines.reduce(
      (total, line) => total + getDubLineMusicPhrase(definition, line).durationMs,
      0,
    );
  if (outroDuration > 0) body.push(restXml(outroDuration));
  return `<part id="P1"><measure number="1">${body.join("")}</measure></part>`;
}

function accompanimentPartXml(definition) {
  const body = [
    "<attributes><divisions>400</divisions></attributes>",
    restXml(800),
  ];
  for (const line of definition.lines) {
    const phrase = getDubLineMusicPhrase(definition, line);
    const bassDuration = Math.min(1_600, phrase.durationMs);
    body.push(pitchedNoteXml({ duration: bassDuration, midi: phrase.bassMidi }));
    if (bassDuration < phrase.durationMs) {
      body.push(restXml(phrase.durationMs - bassDuration));
    }
  }
  const outroDuration = definition.durationMs
    - definition.lines[0].cueMs
    - definition.lines.reduce(
      (total, line) => total + getDubLineMusicPhrase(definition, line).durationMs,
      0,
    );
  if (outroDuration > 0) {
    body.push(pitchedNoteXml({ duration: outroDuration, midi: definition.music.outroMidi[0] }));
    body.push(pitchedNoteXml({
      chord: true,
      duration: outroDuration,
      midi: definition.music.outroMidi[1],
    }));
  }
  return `<part id="P2"><measure number="1">${body.join("")}</measure></part>`;
}

function scoreMusicXml(definition) {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>\n',
    '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">\n',
    '<score-partwise version="4.0">',
    '<part-list><score-part id="P1"><part-name>Melody</part-name></score-part>',
    '<score-part id="P2"><part-name>Accompaniment</part-name></score-part></part-list>',
    melodyPartXml(definition),
    accompanimentPartXml(definition),
    "</score-partwise>\n",
  ].join("");
}

export async function runLegacyRhymeMigration({
  onlySlug,
  rootDir,
  copyFile = copyFileDefault,
  writeFile = writeFileDefault,
}) {
  if (typeof rootDir !== "string" || rootDir.length === 0) {
    throw new TypeError("Legacy rhyme migration requires rootDir.");
  }
  const selected = DUB_DEFINITIONS
    .map((definition, index) => ({ definition, order: index + 1 }))
    .filter(({ definition }) => !onlySlug || path.basename(definition.route) === onlySlug);
  if (selected.length === 0) throw new RangeError(`Unknown nursery-rhyme slug: ${onlySlug}`);

  for (const { definition, order } of selected) {
    const manifest = packageManifest(definition, order);
    const packageDir = path.join(
      rootDir,
      "public",
      "assets",
      "nursery-rhymes",
      manifest.slug,
    );
    const guidesDir = path.join(packageDir, "guides");
    await mkdir(guidesDir, { recursive: true });
    await writeFile(
      path.join(packageDir, "rhyme.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
    await writeFile(path.join(packageDir, "score.musicxml"), scoreMusicXml(definition));

    const uniqueGuides = new Set(
      manifest.scenes.flatMap(({ lines }) => lines.map(({ guide }) => guide)),
    );
    for (const relativeGuide of uniqueGuides) {
      const id = path.basename(relativeGuide, ".mp3");
      const record = STATIC_AUDIO_LINES[id];
      if (!record || !record.src.startsWith("/assets/audio/")) {
        throw new Error(`Missing legacy guide source for ${id}`);
      }
      await copyFile(
        path.join(repositoryRoot, "public", record.src),
        path.join(packageDir, relativeGuide),
      );
    }
  }
}

async function runCli() {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args[0] && !args[0].startsWith("--only="))) {
    throw new Error("Usage: node scripts/migrate-legacy-rhyme-packages.mjs [--only=<slug>]");
  }
  const onlySlug = args[0]?.slice("--only=".length);
  if (args[0] && !onlySlug) throw new Error("--only requires a slug");
  await runLegacyRhymeMigration({ onlySlug, rootDir: process.cwd() });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await runCli();
}
