import { Window } from "happy-dom";

const CANONICAL_DOCTYPE =
  '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">';
const WORD_PATTERN = /[\p{L}\p{N}]+(?:[’‘ʼ'‐‑-][\p{L}\p{N}]+)*/gu;
const ZERO = Object.freeze({ denominator: 1n, numerator: 0n });
const STEP_SEMITONES = Object.freeze({ A: 9, B: 11, C: 0, D: 2, E: 4, F: 5, G: 7 });
const BEAT_UNITS = Object.freeze({
  "1024th": [1n, 256n],
  "128th": [1n, 32n],
  "16th": [1n, 4n],
  "256th": [1n, 64n],
  "32nd": [1n, 8n],
  "512th": [1n, 128n],
  "64th": [1n, 16n],
  breve: [8n, 1n],
  eighth: [1n, 2n],
  half: [2n, 1n],
  long: [16n, 1n],
  maxima: [32n, 1n],
  quarter: [1n, 1n],
  whole: [4n, 1n],
});
const MAX_SAFE_MILLISECONDS = BigInt(Number.MAX_SAFE_INTEGER);

class UnrepresentableScoreTimingError extends Error {}

function scoreError(sourcePath, message) {
  return new Error(`${sourcePath}: ${message}`);
}

function greatestCommonDivisor(left, right) {
  let a = left < 0n ? -left : left;
  let b = right < 0n ? -right : right;
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}

function rational(numerator, denominator = 1n) {
  if (denominator === 0n) throw new RangeError("A rational denominator cannot be zero.");
  const sign = denominator < 0n ? -1n : 1n;
  const divisor = greatestCommonDivisor(numerator, denominator);
  return {
    numerator: sign * numerator / divisor,
    denominator: sign * denominator / divisor,
  };
}

function addRational(left, right) {
  return rational(
    left.numerator * right.denominator + right.numerator * left.denominator,
    left.denominator * right.denominator,
  );
}

function subtractRational(left, right) {
  return rational(
    left.numerator * right.denominator - right.numerator * left.denominator,
    left.denominator * right.denominator,
  );
}

function multiplyRational(left, right) {
  return rational(
    left.numerator * right.numerator,
    left.denominator * right.denominator,
  );
}

function divideRational(left, right) {
  return rational(
    left.numerator * right.denominator,
    left.denominator * right.numerator,
  );
}

function compareRational(left, right) {
  const difference = left.numerator * right.denominator
    - right.numerator * left.denominator;
  return difference < 0n ? -1 : difference > 0n ? 1 : 0;
}

function equalRational(left, right) {
  return compareRational(left, right) === 0;
}

function roundedRational(value) {
  if (value.numerator < 0n) {
    throw new RangeError("Score positions must not be negative.");
  }
  const rounded =
    (value.numerator * 2n + value.denominator) /
      (value.denominator * 2n);
  if (rounded > MAX_SAFE_MILLISECONDS) {
    throw new UnrepresentableScoreTimingError(
      "Score timing exceeds the largest safe-integer millisecond boundary.",
    );
  }
  return Number(rounded);
}

function millisecondsAt(position, millisecondsPerQuarter) {
  return roundedRational(multiplyRational(position, millisecondsPerQuarter));
}

function intervalMs(start, end, millisecondsPerQuarter) {
  return millisecondsAt(end, millisecondsPerQuarter)
    - millisecondsAt(start, millisecondsPerQuarter);
}

function directChildren(element, tagName) {
  const children = [...element.children];
  return tagName === undefined
    ? children
    : children.filter((child) => child.tagName === tagName);
}

function onlyChild(element, tagName, sourcePath, context, { optional = false } = {}) {
  const matches = directChildren(element, tagName);
  if (matches.length === 0 && optional) return null;
  if (matches.length !== 1) {
    throw scoreError(sourcePath, `${context} must contain exactly one <${tagName}>.`);
  }
  return matches[0];
}

function textOf(element) {
  return element.textContent?.trim() ?? "";
}

function parsePositiveInteger(value, sourcePath, field) {
  if (!/^[1-9]\d*$/.test(value)) {
    throw scoreError(sourcePath, `${field} must be a positive integer.`);
  }
  return BigInt(value);
}

function parseInteger(value, sourcePath, field) {
  if (!/^-?(?:0|[1-9]\d*)$/.test(value)) {
    throw scoreError(sourcePath, `${field} must be an integer.`);
  }
  return BigInt(value);
}

function parsePositiveDecimal(value, sourcePath, field) {
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) {
    throw scoreError(sourcePath, `${field} must be a positive decimal.`);
  }
  const [whole, fraction = ""] = value.split(".");
  const denominator = 10n ** BigInt(fraction.length);
  const parsed = rational(
    BigInt(whole) * denominator + BigInt(fraction || "0"),
    denominator,
  );
  if (parsed.numerator <= 0n) {
    throw scoreError(sourcePath, `${field} must be a positive decimal.`);
  }
  return parsed;
}

function normalizeWord(value) {
  return value
    .normalize("NFC")
    .toLowerCase()
    .replaceAll(/[‘’ʼ]/gu, "'")
    .replaceAll(/[‐‑]/gu, "-");
}

function exactWord(value, sourcePath) {
  const matches = [...value.matchAll(WORD_PATTERN)];
  if (matches.length > 1) {
    throw scoreError(
      sourcePath,
      "A MusicXML lyric contains multiple tokens; exactly one token is required.",
    );
  }
  if (matches.length === 0) {
    throw scoreError(
      sourcePath,
      "A completed MusicXML lyric must contain exactly one lyric token.",
    );
  }
  return normalizeWord(matches[0][0]);
}

function manifestLines(manifest, sourcePath) {
  const lines = manifest?.scenes?.flatMap(({ lines }) => lines) ?? [];
  if (lines.length === 0) {
    throw scoreError(sourcePath, "The manifest must contain at least one line.");
  }
  return lines;
}

function stripDeclarations(xml, sourcePath) {
  if (typeof xml !== "string") {
    throw scoreError(sourcePath, "MusicXML source must be a string.");
  }
  if (/<!\s*(?:ENTITY|ELEMENT|ATTLIST|NOTATION)\b/iu.test(xml)) {
    throw scoreError(sourcePath, "MusicXML entity declarations are not allowed.");
  }
  for (const match of xml.matchAll(/&([^;\s]+);/gu)) {
    if (!/^(?:amp|apos|gt|lt|quot|#\d+|#x[\dA-Fa-f]+)$/.test(match[1])) {
      throw scoreError(sourcePath, `MusicXML contains an unresolved entity &${match[1]};.`);
    }
  }

  const canonicalCount = xml.split(CANONICAL_DOCTYPE).length - 1;
  const hasDoctype = /<!DOCTYPE/iu.test(xml);
  if ((hasDoctype && canonicalCount !== 1) || canonicalCount > 1) {
    throw scoreError(
      sourcePath,
      "Only the canonical MusicXML 4.0 score-partwise DOCTYPE is allowed.",
    );
  }

  const canonicalIndex = xml.indexOf(CANONICAL_DOCTYPE);
  if (
    canonicalCount === 1
    && !/^\uFEFF?\s*(?:<\?xml\s+[^?]*\?>\s*)?$/iu.test(
      xml.slice(0, canonicalIndex),
    )
  ) {
    throw scoreError(sourcePath, "The canonical MusicXML DOCTYPE must be in the document prolog.");
  }

  let declarationFree = canonicalCount === 1
    ? `${xml.slice(0, canonicalIndex)}${xml.slice(canonicalIndex + CANONICAL_DOCTYPE.length)}`
    : xml;
  if (/<!DOCTYPE/iu.test(declarationFree)) {
    throw scoreError(sourcePath, "MusicXML must contain only one canonical DOCTYPE.");
  }

  const xmlDeclaration = /^\uFEFF?\s*<\?xml\s+[^?]*\?>/iu.exec(declarationFree);
  const withoutXmlDeclaration = xmlDeclaration
    ? declarationFree.slice(xmlDeclaration[0].length)
    : declarationFree;
  if (/<\?/u.test(withoutXmlDeclaration)) {
    throw scoreError(sourcePath, "MusicXML processing declarations are not allowed.");
  }
  declarationFree = xmlDeclaration
    ? `${xmlDeclaration[0]}${withoutXmlDeclaration}`
    : withoutXmlDeclaration;
  return declarationFree;
}

function parseDocument(xml, sourcePath, window) {
  const declarationFreeXml = stripDeclarations(xml, sourcePath);
  const parser = new window.DOMParser();
  const document = parser.parseFromString(declarationFreeXml, "application/xml");
  if (document.getElementsByTagName("parsererror").length > 0) {
    throw scoreError(sourcePath, "MusicXML is malformed.");
  }
  if (document.doctype) {
    throw scoreError(sourcePath, "MusicXML contains an unstripped DOCTYPE.");
  }
  const root = document.documentElement;
  if (!root || root.tagName !== "score-partwise") {
    throw scoreError(sourcePath, "MusicXML root must be <score-partwise>.");
  }
  if (root.getAttribute("version") !== "4.0") {
    throw scoreError(sourcePath, "MusicXML score-partwise version must be 4.0.");
  }
  return root;
}

function parseMetronome(metronome, sourcePath) {
  const allowed = new Set(["beat-unit", "beat-unit-dot", "per-minute"]);
  for (const child of directChildren(metronome)) {
    if (!allowed.has(child.tagName)) {
      throw scoreError(sourcePath, `Unsupported metronome element <${child.tagName}>.`);
    }
  }
  const beatUnitName = textOf(
    onlyChild(metronome, "beat-unit", sourcePath, "metronome"),
  );
  const beatUnitTuple = BEAT_UNITS[beatUnitName];
  if (!beatUnitTuple) {
    throw scoreError(sourcePath, `Unsupported metronome beat unit ${beatUnitName}.`);
  }
  let beatQuarterLength = rational(...beatUnitTuple);
  let dotValue = beatQuarterLength;
  for (const dot of directChildren(metronome, "beat-unit-dot")) {
    if (directChildren(dot).length > 0) {
      throw scoreError(sourcePath, "Metronome beat-unit-dot must be empty.");
    }
    dotValue = divideRational(dotValue, rational(2n));
    beatQuarterLength = addRational(beatQuarterLength, dotValue);
  }
  const perMinute = parsePositiveDecimal(
    textOf(onlyChild(metronome, "per-minute", sourcePath, "metronome")),
    sourcePath,
    "metronome per-minute",
  );
  const millisecondsPerBeat = divideRational(rational(60_000n), perMinute);
  return {
    beatQuarterLength,
    millisecondsPerQuarter: divideRational(millisecondsPerBeat, beatQuarterLength),
  };
}

function parseDirection(direction, position, sourcePath) {
  const children = directChildren(direction);
  if (children.some(({ tagName }) => tagName === "offset")) {
    throw scoreError(sourcePath, "Tempo direction offsets are unsupported.");
  }
  for (const child of children) {
    if (child.tagName !== "direction-type" && child.tagName !== "sound") {
      throw scoreError(sourcePath, `Unsupported direction element <${child.tagName}>.`);
    }
  }

  const directionTypes = directChildren(direction, "direction-type");
  const sounds = directChildren(direction, "sound");
  if (directionTypes.length > 1 || sounds.length > 1) {
    throw scoreError(sourcePath, "A tempo direction must contain one tempo declaration.");
  }
  let metronomeTempo = null;
  if (directionTypes.length === 1) {
    const directionTypeChildren = directChildren(directionTypes[0]);
    if (
      directionTypeChildren.length !== 1
      || directionTypeChildren[0].tagName !== "metronome"
    ) {
      throw scoreError(sourcePath, "Only metronome direction types are supported.");
    }
    metronomeTempo = parseMetronome(directionTypeChildren[0], sourcePath);
  }

  let soundMillisecondsPerQuarter = null;
  if (sounds.length === 1) {
    const sound = sounds[0];
    if (sound.getAttributeNames().some((name) => name !== "tempo")) {
      throw scoreError(sourcePath, "Sound playback jumps and other attributes are unsupported.");
    }
    if (!sound.hasAttribute("tempo")) {
      throw scoreError(sourcePath, "A supported sound direction must declare tempo.");
    }
    if (directChildren(sound).length > 0) {
      throw scoreError(sourcePath, "Nested sound playback instructions are unsupported.");
    }
    soundMillisecondsPerQuarter = divideRational(
      rational(60_000n),
      parsePositiveDecimal(sound.getAttribute("tempo"), sourcePath, "sound tempo"),
    );
  }
  if (!metronomeTempo && !soundMillisecondsPerQuarter) {
    throw scoreError(sourcePath, "Direction does not contain supported tempo data.");
  }
  if (
    metronomeTempo
    && soundMillisecondsPerQuarter
    && !equalRational(
      metronomeTempo.millisecondsPerQuarter,
      soundMillisecondsPerQuarter,
    )
  ) {
    throw scoreError(sourcePath, "Metronome and sound tempo values disagree.");
  }
  return {
    beatQuarterLength: metronomeTempo?.beatQuarterLength ?? rational(1n),
    millisecondsPerQuarter:
      metronomeTempo?.millisecondsPerQuarter ?? soundMillisecondsPerQuarter,
    position,
  };
}

function parseAttributes(attributesElement, currentDivisions, sourcePath, partId) {
  const allowed = new Set(["divisions", "time"]);
  for (const child of directChildren(attributesElement)) {
    if (child.tagName === "transpose") {
      throw scoreError(sourcePath, `Part ${partId} uses unsupported transpose data.`);
    }
    if (!allowed.has(child.tagName)) {
      throw scoreError(sourcePath, `Part ${partId} uses unsupported attributes <${child.tagName}>.`);
    }
  }
  const divisionElements = directChildren(attributesElement, "divisions");
  if (divisionElements.length > 1) {
    throw scoreError(sourcePath, `Part ${partId} has multiple divisions declarations.`);
  }
  if (directChildren(attributesElement, "time").length > 1) {
    throw scoreError(sourcePath, `Part ${partId} has multiple time declarations.`);
  }
  if (divisionElements.length === 0) return currentDivisions;
  return parsePositiveInteger(
    textOf(divisionElements[0]),
    sourcePath,
    `Part ${partId} divisions`,
  );
}

function parsePitch(noteElement, sourcePath, partId) {
  const pitch = onlyChild(noteElement, "pitch", sourcePath, `Part ${partId} note`);
  const allowed = new Set(["step", "alter", "octave"]);
  for (const child of directChildren(pitch)) {
    if (!allowed.has(child.tagName)) {
      throw scoreError(sourcePath, `Part ${partId} uses unsupported pitch data.`);
    }
  }
  const step = textOf(onlyChild(pitch, "step", sourcePath, `Part ${partId} pitch`));
  if (!(step in STEP_SEMITONES)) {
    throw scoreError(sourcePath, `Part ${partId} pitch step is invalid.`);
  }
  const octave = Number(parseInteger(
    textOf(onlyChild(pitch, "octave", sourcePath, `Part ${partId} pitch`)),
    sourcePath,
    `Part ${partId} pitch octave`,
  ));
  const alterElement = onlyChild(
    pitch,
    "alter",
    sourcePath,
    `Part ${partId} pitch`,
    { optional: true },
  );
  const alter = alterElement
    ? Number(parseInteger(textOf(alterElement), sourcePath, `Part ${partId} pitch alter`))
    : 0;
  const midi = (octave + 1) * 12 + STEP_SEMITONES[step] + alter;
  if (!Number.isSafeInteger(midi) || midi < 0 || midi > 127) {
    throw scoreError(sourcePath, `Part ${partId} pitch must produce MIDI 0 through 127.`);
  }
  return midi;
}

function parseTies(noteElement, sourcePath, partId) {
  const soundTies = directChildren(noteElement, "tie");
  const notationElements = directChildren(noteElement, "notations");
  if (notationElements.length > 1) {
    throw scoreError(sourcePath, `Part ${partId} note has multiple notations elements.`);
  }
  const notationTies = [];
  if (notationElements.length === 1) {
    for (const child of directChildren(notationElements[0])) {
      if (child.tagName !== "tied") {
        throw scoreError(sourcePath, `Part ${partId} uses unsupported notation <${child.tagName}>.`);
      }
      notationTies.push(child);
    }
  }
  const types = new Set();
  for (const tie of [...soundTies, ...notationTies]) {
    const type = tie.getAttribute("type");
    if (type !== "start" && type !== "stop") {
      throw scoreError(sourcePath, `Part ${partId} tie type must be start or stop.`);
    }
    types.add(type);
  }
  return types;
}

function parseLyric(noteElement, sourcePath, partId, isMelody) {
  const lyricElements = directChildren(noteElement, "lyric");
  if (lyricElements.length > 1) {
    throw scoreError(sourcePath, `Part ${partId} has a second or multiple lyric verse.`);
  }
  if (lyricElements.length === 0) return null;
  if (!isMelody) {
    throw scoreError(sourcePath, `Only the melody part may contain lyrics.`);
  }
  const element = lyricElements[0];
  const number = element.getAttribute("number");
  if (number && number !== "1") {
    throw scoreError(sourcePath, `Part ${partId} uses an unsupported second lyric verse.`);
  }
  const allowed = new Set(["syllabic", "text", "extend", "end-line"]);
  for (const child of directChildren(element)) {
    if (!allowed.has(child.tagName)) {
      throw scoreError(sourcePath, `Unsupported lyric element <${child.tagName}>.`);
    }
  }
  for (const tagName of allowed) {
    if (directChildren(element, tagName).length > 1) {
      throw scoreError(sourcePath, `A lyric may contain only one <${tagName}>.`);
    }
  }
  const syllabicElement = directChildren(element, "syllabic")[0] ?? null;
  const textElement = directChildren(element, "text")[0] ?? null;
  const syllabic = syllabicElement ? textOf(syllabicElement) : null;
  if (
    syllabic
    && !new Set(["single", "begin", "middle", "end"]).has(syllabic)
  ) {
    throw scoreError(sourcePath, `Unsupported lyric syllabic value ${syllabic}.`);
  }
  return {
    endLine: directChildren(element, "end-line").length === 1,
    extend: directChildren(element, "extend").length === 1,
    syllabic,
    text: textElement ? textOf(textElement) : null,
  };
}

function parseNote(
  noteElement,
  { anchor, cursor, divisions, isMelody, partId, sourcePath, voice },
) {
  const noteAttributes = noteElement.getAttributeNames();
  if (noteAttributes.length > 0) {
    throw scoreError(
      sourcePath,
      `Part ${partId} note attributes are unsupported: ${noteAttributes.join(", ")}.`,
    );
  }
  const allowed = new Set([
    "chord", "pitch", "rest", "tie", "duration", "voice", "notations", "lyric",
  ]);
  for (const child of directChildren(noteElement)) {
    if (child.tagName === "grace") {
      throw scoreError(sourcePath, `Part ${partId} uses unsupported grace notes.`);
    }
    if (child.tagName === "time-modification") {
      throw scoreError(sourcePath, `Part ${partId} uses unsupported time-modification tuplets.`);
    }
    if (!allowed.has(child.tagName)) {
      throw scoreError(sourcePath, `Part ${partId} uses unsupported note element <${child.tagName}>.`);
    }
  }
  if (!divisions) {
    throw scoreError(sourcePath, `Part ${partId} must declare divisions before notes.`);
  }
  const chord = directChildren(noteElement, "chord").length === 1;
  if (directChildren(noteElement, "chord").length > 1) {
    throw scoreError(sourcePath, `Part ${partId} note has multiple chord markers.`);
  }
  if (chord && isMelody) {
    throw scoreError(sourcePath, `The melody part ${partId} cannot contain a chord.`);
  }
  const durationUnits = parsePositiveInteger(
    textOf(onlyChild(noteElement, "duration", sourcePath, `Part ${partId} note`)),
    sourcePath,
    `Part ${partId} note duration`,
  );
  const duration = rational(durationUnits, divisions);
  const start = chord ? anchor?.start : cursor;
  if (!start || (chord && !anchor)) {
    throw scoreError(sourcePath, `Part ${partId} chord has no preceding note.`);
  }
  if (chord && !equalRational(duration, subtractRational(anchor.end, anchor.start))) {
    throw scoreError(sourcePath, `Part ${partId} chord duration would create an overlap.`);
  }
  const end = addRational(start, duration);

  const pitchElements = directChildren(noteElement, "pitch");
  const restElements = directChildren(noteElement, "rest");
  if (pitchElements.length + restElements.length !== 1) {
    throw scoreError(sourcePath, `Part ${partId} note must contain exactly one pitch or rest.`);
  }
  const midi = pitchElements.length === 1
    ? parsePitch(noteElement, sourcePath, partId)
    : null;
  if (chord && anchor.midi === null) {
    throw scoreError(sourcePath, `Part ${partId} chord must follow a pitched note, not a rest.`);
  }
  const ties = parseTies(noteElement, sourcePath, partId);
  const lyric = parseLyric(noteElement, sourcePath, partId, isMelody);
  if (midi === null && (ties.size > 0 || lyric || chord)) {
    throw scoreError(sourcePath, `Part ${partId} rests cannot contain ties, lyrics, or chords.`);
  }

  const voiceElements = directChildren(noteElement, "voice");
  if (voiceElements.length > 1) {
    throw scoreError(sourcePath, `Part ${partId} note has a second voice.`);
  }
  const noteVoice = voiceElements.length === 1 ? textOf(voiceElements[0]) : "1";
  if (!noteVoice || (voice !== null && noteVoice !== voice)) {
    throw scoreError(sourcePath, `Part ${partId} contains a changing or second voice.`);
  }

  return {
    anchor: chord ? anchor : { end, midi, start },
    nextCursor: chord ? cursor : end,
    note: midi === null
      ? null
      : { end, lyric, midi, partId, start, ties },
    voice: voice ?? noteVoice,
  };
}

function parsePart(partElement, melodyPart, sourcePath) {
  const partId = partElement.getAttribute("id");
  const measures = directChildren(partElement);
  if (measures.length === 0 || measures.some(({ tagName }) => tagName !== "measure")) {
    throw scoreError(sourcePath, `Part ${partId} must contain only measures.`);
  }
  let cursor = ZERO;
  let divisions = null;
  let voice = null;
  const notes = [];
  const bookmarks = [];
  const measureEnds = [];
  const tempos = [];

  for (const [measureIndex, currentMeasure] of measures.entries()) {
    let anchor = null;
    let measureStarted = false;
    for (const child of directChildren(currentMeasure)) {
      switch (child.tagName) {
        case "attributes": {
          if (measureStarted) {
            throw scoreError(
              sourcePath,
              `Part ${partId} may change divisions only at a measure boundary.`,
            );
          }
          divisions = parseAttributes(child, divisions, sourcePath, partId);
          break;
        }
        case "direction":
          measureStarted = true;
          tempos.push(parseDirection(child, cursor, sourcePath));
          anchor = null;
          break;
        case "bookmark": {
          measureStarted = true;
          const id = child.getAttribute("id");
          if (!id) throw scoreError(sourcePath, `Part ${partId} bookmark needs an id.`);
          if (directChildren(child).length > 0) {
            throw scoreError(sourcePath, `Part ${partId} bookmark must be empty.`);
          }
          bookmarks.push({ id, position: cursor });
          anchor = null;
          break;
        }
        case "note": {
          measureStarted = true;
          const parsed = parseNote(child, {
            anchor,
            cursor,
            divisions,
            isMelody: partId === melodyPart,
            partId,
            sourcePath,
            voice,
          });
          anchor = parsed.anchor;
          cursor = parsed.nextCursor;
          voice = parsed.voice;
          if (parsed.note) notes.push(parsed.note);
          break;
        }
        case "backup":
        case "forward":
          throw scoreError(sourcePath, `Part ${partId} uses unsupported <${child.tagName}>.`);
        case "barline":
          if (child.querySelector("repeat")) {
            throw scoreError(sourcePath, `Part ${partId} uses an unsupported repeat.`);
          }
          if (child.querySelector("ending")) {
            throw scoreError(sourcePath, `Part ${partId} uses an unsupported alternate ending.`);
          }
          throw scoreError(sourcePath, `Part ${partId} uses an unsupported barline.`);
        default:
          throw scoreError(
            sourcePath,
            `Part ${partId} uses unsupported measure element <${child.tagName}>.`,
          );
      }
    }
    measureEnds.push({ index: measureIndex, position: cursor });
  }
  return { bookmarks, duration: cursor, measureEnds, notes, partId, tempos };
}

function validatePartList(root, sourcePath) {
  const rootChildren = directChildren(root);
  if (rootChildren.some(({ tagName }) => tagName !== "part-list" && tagName !== "part")) {
    const unsupported = rootChildren.find(
      ({ tagName }) => tagName !== "part-list" && tagName !== "part",
    );
    throw scoreError(sourcePath, `Unsupported score element <${unsupported.tagName}>.`);
  }
  const partList = onlyChild(root, "part-list", sourcePath, "score-partwise");
  const scoreParts = directChildren(partList);
  if (scoreParts.length === 0 || scoreParts.some(({ tagName }) => tagName !== "score-part")) {
    throw scoreError(sourcePath, "part-list must contain score-part entries.");
  }
  const listedIds = scoreParts.map((scorePart) => scorePart.getAttribute("id"));
  if (listedIds.some((id) => !id) || new Set(listedIds).size !== listedIds.length) {
    throw scoreError(sourcePath, "part-list part IDs must be non-empty and unique.");
  }
  const partElements = directChildren(root, "part");
  const actualIds = partElements.map((partElement) => partElement.getAttribute("id"));
  if (
    actualIds.some((id) => !id)
    || new Set(actualIds).size !== actualIds.length
    || actualIds.length !== listedIds.length
    || actualIds.some((id, index) => id !== listedIds[index])
  ) {
    throw scoreError(sourcePath, "part-list and score parts must match once in order.");
  }
  return { actualIds, partElements };
}

function validatePartTiming(parts, melodyPart, sourcePath) {
  const melody = parts.find(({ partId }) => partId === melodyPart);
  for (const currentPart of parts) {
    if (currentPart.measureEnds.length !== melody.measureEnds.length) {
      throw scoreError(sourcePath, `Part ${currentPart.partId} timing diverges from the melody.`);
    }
    for (const [index, measureEnd] of currentPart.measureEnds.entries()) {
      if (!equalRational(measureEnd.position, melody.measureEnds[index].position)) {
        throw scoreError(
          sourcePath,
          `Part ${currentPart.partId} measure ${index + 1} timing diverges from the melody.`,
        );
      }
    }
  }
}

function coalesceTies(part, sourcePath) {
  const active = new Map();
  const chains = [];
  const chainByNote = new Map();
  for (const currentNote of part.notes) {
    const stops = currentNote.ties.has("stop");
    const starts = currentNote.ties.has("start");
    if (starts && !stops && active.has(currentNote.midi)) {
      throw scoreError(
        sourcePath,
        `Part ${part.partId} repeats a tie start while the same pitch is still active.`,
      );
    }
    let chain;
    if (stops) {
      chain = active.get(currentNote.midi);
      if (!chain || !equalRational(chain.end, currentNote.start)) {
        throw scoreError(
          sourcePath,
          `Part ${part.partId} has an unmatched or non-contiguous tie stop.`,
        );
      }
      chain.end = currentNote.end;
      chain.notes.push(currentNote);
    } else {
      chain = {
        end: currentNote.end,
        midi: currentNote.midi,
        notes: [currentNote],
        partId: currentNote.partId,
        start: currentNote.start,
      };
      chains.push(chain);
    }
    chainByNote.set(currentNote, chain);
    if (starts) active.set(currentNote.midi, chain);
    else if (stops) active.delete(currentNote.midi);
  }
  if (active.size > 0) {
    throw scoreError(sourcePath, `Part ${part.partId} has an incomplete tie chain.`);
  }
  return { chainByNote, chains };
}

function validateBookmarks(bookmarks, lines, sourcePath) {
  const seen = new Set();
  for (const { id } of bookmarks) {
    if (seen.has(id)) {
      throw scoreError(sourcePath, `Line bookmark ${id} is duplicated.`);
    }
    seen.add(id);
  }
  if (bookmarks.length < lines.length) {
    const missing = lines.find(({ id }) => !seen.has(id));
    throw scoreError(sourcePath, `Missing line bookmark ${missing?.id ?? "from manifest"}.`);
  }
  if (bookmarks.length > lines.length) {
    const extra = bookmarks.find(({ id }) => !lines.some((line) => line.id === id));
    throw scoreError(sourcePath, `Unexpected extra line bookmark ${extra?.id ?? "in score"}.`);
  }
  for (const [index, bookmark] of bookmarks.entries()) {
    if (bookmark.id !== lines[index].id) {
      throw scoreError(
        sourcePath,
        `Line bookmark order is invalid: expected ${lines[index].id}, received ${bookmark.id}.`,
      );
    }
  }
}

function deriveLineWindows({
  bookmarks,
  chainByNote,
  lines,
  melodyNotes,
  millisecondsPerQuarter,
  sourcePath,
  totalDuration,
}) {
  const endMarkers = Array.from({ length: lines.length }, () => []);
  for (const currentNote of melodyNotes) {
    if (!currentNote.lyric?.endLine) continue;
    const index = bookmarks.findLastIndex(
      ({ position }) => compareRational(position, currentNote.start) <= 0,
    );
    if (index < 0) {
      throw scoreError(sourcePath, "An end-line marker appears before the first bookmark.");
    }
    endMarkers[index].push(currentNote);
  }

  return lines.map((line, index) => {
    if (endMarkers[index].length !== 1) {
      throw scoreError(
        sourcePath,
        `Line ${line.id} must contain exactly one end-line lyric marker.`,
      );
    }
    const start = bookmarks[index].position;
    const endMarker = endMarkers[index][0];
    const end = chainByNote.get(endMarker).end;
    const nextStart = bookmarks[index + 1]?.position ?? totalDuration;
    if (compareRational(end, start) <= 0 || compareRational(end, nextStart) > 0) {
      throw scoreError(sourcePath, `Line ${line.id} end-line lies outside its line window.`);
    }
    const durationMs = intervalMs(start, end, millisecondsPerQuarter);
    if (durationMs > 8_000) {
      throw scoreError(sourcePath, `Line ${line.id} exceeds the 8,000ms limit.`);
    }
    return { durationMs, end, endMarker, line, start };
  });
}

function deriveWords(window, melodyNotes, millisecondsPerQuarter, sourcePath) {
  const manifestWords = [...window.line.text.matchAll(WORD_PATTERN)].map((match) => ({
    endOffset: match.index + match[0].length,
    key: normalizeWord(match[0]),
    startOffset: match.index,
  }));
  const scoreWords = [];
  let syllableChain = null;
  let lastWord = null;
  let lastLyricEnd = null;
  let passedEndMarker = false;

  const notes = melodyNotes.filter(
    ({ start }) => compareRational(start, window.start) >= 0
      && compareRational(start, window.end) < 0,
  );
  for (const currentNote of notes) {
    const currentLyric = currentNote.lyric;
    if (passedEndMarker && currentLyric) {
      throw scoreError(
        sourcePath,
        `Line ${window.line.id} has a lyric after its final end-line marker.`,
      );
    }
    if (!currentLyric) {
      if (!currentNote.ties.has("stop")) {
        throw scoreError(sourcePath, `Line ${window.line.id} has a note without lyric timing.`);
      }
      continue;
    }
    const hasText = currentLyric.text !== null && currentLyric.text.length > 0;
    if (!hasText) {
      if (
        !currentLyric.extend
        || currentLyric.syllabic
        || !lastWord
        || !equalRational(lastLyricEnd, currentNote.start)
      ) {
        throw scoreError(sourcePath, `Line ${window.line.id} has an invalid lyric extend.`);
      }
      lastWord.end = currentNote.end;
      lastLyricEnd = currentNote.end;
      passedEndMarker = currentNote === window.endMarker;
      continue;
    }
    if (!currentLyric.syllabic) {
      throw scoreError(sourcePath, `Line ${window.line.id} lyric text needs syllabic timing.`);
    }

    switch (currentLyric.syllabic) {
      case "single": {
        if (syllableChain) {
          throw scoreError(sourcePath, `Line ${window.line.id} has an incomplete syllable chain.`);
        }
        lastWord = {
          end: currentNote.end,
          key: exactWord(currentLyric.text, sourcePath),
          start: currentNote.start,
        };
        scoreWords.push(lastWord);
        break;
      }
      case "begin":
        if (syllableChain) {
          throw scoreError(sourcePath, `Line ${window.line.id} has nested syllable chains.`);
        }
        syllableChain = {
          end: currentNote.end,
          start: currentNote.start,
          text: currentLyric.text,
        };
        lastWord = null;
        break;
      case "middle":
        if (!syllableChain) {
          throw scoreError(sourcePath, `Line ${window.line.id} has an invalid middle syllable.`);
        }
        syllableChain.text += currentLyric.text;
        syllableChain.end = currentNote.end;
        break;
      case "end":
        if (!syllableChain) {
          throw scoreError(sourcePath, `Line ${window.line.id} has an invalid end syllable.`);
        }
        syllableChain.text += currentLyric.text;
        syllableChain.end = currentNote.end;
        lastWord = {
          end: syllableChain.end,
          key: exactWord(syllableChain.text, sourcePath),
          start: syllableChain.start,
        };
        scoreWords.push(lastWord);
        syllableChain = null;
        break;
    }
    lastLyricEnd = currentNote.end;
    passedEndMarker = currentNote === window.endMarker;
  }
  if (syllableChain) {
    throw scoreError(sourcePath, `Line ${window.line.id} has an incomplete syllable chain.`);
  }
  if (scoreWords.length !== manifestWords.length) {
    throw scoreError(
      sourcePath,
      `Line ${window.line.id} lyric word count does not match the manifest.`,
    );
  }
  return scoreWords.map((scoreWord, index) => {
    const manifestWord = manifestWords[index];
    if (scoreWord.key !== manifestWord.key) {
      throw scoreError(
        sourcePath,
        `Line ${window.line.id} lyric mismatch at manifest word ${index + 1}.`,
      );
    }
    return {
      startOffset: manifestWord.startOffset,
      endOffset: manifestWord.endOffset,
      atMs: millisecondsAt(scoreWord.start, millisecondsPerQuarter)
        - millisecondsAt(window.start, millisecondsPerQuarter),
      durationMs: intervalMs(scoreWord.start, scoreWord.end, millisecondsPerQuarter),
    };
  });
}

function noteOutput(chain, origin, millisecondsPerQuarter, role) {
  const value = {
    atMs: millisecondsAt(chain.start, millisecondsPerQuarter)
      - millisecondsAt(origin, millisecondsPerQuarter),
    durationMs: intervalMs(chain.start, chain.end, millisecondsPerQuarter),
    midi: chain.midi,
  };
  return role ? { ...value, role } : value;
}

function playbackRole(partId, melodyPart) {
  return partId === melodyPart ? "melody" : "accompaniment";
}

function sortNotes(left, right) {
  return left.atMs - right.atMs
    || left.midi - right.midi
    || left.role.localeCompare(right.role);
}

function assertMillisecondValue(value, label, { positive = false } = {}) {
  if (
    !Number.isSafeInteger(value)
    || (positive ? value <= 0 : value < 0)
  ) {
    throw new UnrepresentableScoreTimingError(
      `Score timing ${label} must be a ${positive ? "positive " : ""}safe-integer millisecond value; rounded boundaries must not collapse.`,
    );
  }
}

function validateCompiledMilliseconds(compiled) {
  assertMillisecondValue(compiled.countInBeatMs, "count-in beat", { positive: true });
  assertMillisecondValue(compiled.countInDurationMs, "count-in duration", { positive: true });
  assertMillisecondValue(compiled.durationMs, "score duration", { positive: true });
  if (compiled.countInDurationMs <= compiled.countInBeatMs) {
    throw new UnrepresentableScoreTimingError(
      "Score timing count-in boundaries must remain distinct after millisecond rounding.",
    );
  }
  for (const currentLine of compiled.lines) {
    assertMillisecondValue(currentLine.cueMs, `line ${currentLine.id} cue`);
    assertMillisecondValue(
      currentLine.durationMs,
      `line ${currentLine.id} duration`,
      { positive: true },
    );
    for (const [kind, notes] of [
      ["melody note", currentLine.notes],
      ["playback note", currentLine.playbackNotes],
    ]) {
      for (const currentNote of notes) {
        assertMillisecondValue(currentNote.atMs, `line ${currentLine.id} ${kind} onset`);
        assertMillisecondValue(
          currentNote.durationMs,
          `line ${currentLine.id} ${kind} duration`,
          { positive: true },
        );
      }
    }
    for (const currentWord of currentLine.words) {
      assertMillisecondValue(currentWord.atMs, `line ${currentLine.id} word onset`);
      assertMillisecondValue(
        currentWord.durationMs,
        `line ${currentLine.id} word duration`,
        { positive: true },
      );
    }
  }
  for (const currentNote of compiled.outroNotes) {
    assertMillisecondValue(currentNote.atMs, "outro note onset");
    assertMillisecondValue(currentNote.durationMs, "outro note duration", { positive: true });
  }
}

function compileParsedScore(root, manifest, sourcePath) {
  const lines = manifestLines(manifest, sourcePath);
  const melodyPart = manifest?.score?.melodyPart;
  const playbackParts = manifest?.score?.playbackParts;
  if (typeof melodyPart !== "string" || !Array.isArray(playbackParts)) {
    throw scoreError(sourcePath, "Manifest score part selection is invalid.");
  }
  const { actualIds, partElements } = validatePartList(root, sourcePath);
  if (!actualIds.includes(melodyPart)) {
    throw scoreError(sourcePath, `Manifest melody part ${melodyPart} is absent from the score.`);
  }
  for (const partId of playbackParts) {
    if (!actualIds.includes(partId)) {
      throw scoreError(sourcePath, `Manifest playback part ${partId} is absent from the score.`);
    }
  }

  const parts = partElements.map((partElement) =>
    parsePart(partElement, melodyPart, sourcePath));
  const nonMelodyBookmark = parts.find(
    ({ bookmarks, partId }) => partId !== melodyPart && bookmarks.length > 0,
  );
  if (nonMelodyBookmark) {
    throw scoreError(
      sourcePath,
      `Line bookmarks are allowed only in melody part ${melodyPart}; part ${nonMelodyBookmark.partId} contains an extra bookmark.`,
    );
  }
  validatePartTiming(parts, melodyPart, sourcePath);
  const tempos = parts.flatMap(({ tempos: currentTempos }) => currentTempos);
  if (tempos.length > 1) {
    throw scoreError(sourcePath, "The score contains multiple tempo declarations or changes.");
  }
  if (tempos.length === 0) {
    throw scoreError(sourcePath, "The score must contain exactly one score-wide tempo declaration.");
  }
  const tempo = tempos[0];
  if (!equalRational(tempo.position, ZERO)) {
    throw scoreError(sourcePath, "The score-wide tempo must appear at the score start.");
  }

  const coalescedByPart = new Map(
    parts.map((currentPart) => [currentPart.partId, coalesceTies(currentPart, sourcePath)]),
  );
  const melody = parts.find(({ partId }) => partId === melodyPart);
  validateBookmarks(melody.bookmarks, lines, sourcePath);
  const countInPosition = multiplyRational(
    tempo.beatQuarterLength,
    rational(BigInt(manifest.countInBeats)),
  );
  if (!equalRational(melody.bookmarks[0].position, countInPosition)) {
    throw scoreError(
      sourcePath,
      "The first bookmark must begin exactly after the manifest count-in beats.",
    );
  }

  const windows = deriveLineWindows({
    bookmarks: melody.bookmarks,
    chainByNote: coalescedByPart.get(melodyPart).chainByNote,
    lines,
    melodyNotes: melody.notes,
    millisecondsPerQuarter: tempo.millisecondsPerQuarter,
    sourcePath,
    totalDuration: melody.duration,
  });
  for (const currentNote of melody.notes) {
    if (!currentNote.lyric) continue;
    const insideLine = windows.some(
      ({ end, start }) => compareRational(currentNote.start, start) >= 0
        && compareRational(currentNote.end, end) <= 0,
    );
    if (!insideLine) {
      throw scoreError(sourcePath, "A melody lyric interval lies outside its line window.");
    }
  }
  const playbackPartSet = new Set(playbackParts);
  const selectedChains = parts
    .filter(({ partId }) => playbackPartSet.has(partId))
    .flatMap(({ partId }) => coalescedByPart.get(partId).chains);
  const lastWindow = windows.at(-1);
  for (const chain of coalescedByPart.get(melodyPart).chains) {
    const insideLine = windows.some(
      ({ end, start }) => compareRational(chain.start, start) >= 0
        && compareRational(chain.end, end) <= 0,
    );
    const inOutro = compareRational(chain.start, lastWindow.end) >= 0;
    if (!insideLine && !inOutro) {
      throw scoreError(sourcePath, "A melody note lies outside its line window.");
    }
  }

  const compiledLines = windows.map((window) => {
    const melodyChains = coalescedByPart.get(melodyPart).chains.filter(
      ({ end, start }) => compareRational(start, window.start) >= 0
        && compareRational(end, window.end) <= 0,
    );
    const playbackChains = selectedChains.filter(
      ({ end, start }) => compareRational(start, window.start) >= 0
        && compareRational(end, window.end) <= 0,
    );
    return {
      id: window.line.id,
      text: window.line.text,
      cueMs: millisecondsAt(window.start, tempo.millisecondsPerQuarter),
      durationMs: window.durationMs,
      notes: melodyChains.map((chain) =>
        noteOutput(chain, window.start, tempo.millisecondsPerQuarter)),
      playbackNotes: playbackChains
        .map((chain) => noteOutput(
          chain,
          window.start,
          tempo.millisecondsPerQuarter,
          playbackRole(chain.partId, melodyPart),
        ))
        .sort(sortNotes),
      words: deriveWords(
        window,
        melody.notes,
        tempo.millisecondsPerQuarter,
        sourcePath,
      ),
    };
  });

  for (const chain of selectedChains) {
    const insideLine = windows.some(
      ({ end, start }) => compareRational(chain.start, start) >= 0
        && compareRational(chain.end, end) <= 0,
    );
    const inOutro = compareRational(chain.start, lastWindow.end) >= 0;
    if (!insideLine && !inOutro) {
      throw scoreError(sourcePath, `Playback note in part ${chain.partId} lies outside a line window.`);
    }
  }

  const outroNotes = selectedChains
    .filter(({ start }) => compareRational(start, lastWindow.end) >= 0)
    .map((chain) => noteOutput(
      chain,
      ZERO,
      tempo.millisecondsPerQuarter,
      playbackRole(chain.partId, melodyPart),
    ))
    .sort(sortNotes);

  const compiled = {
    countInBeatMs: millisecondsAt(
      tempo.beatQuarterLength,
      tempo.millisecondsPerQuarter,
    ),
    countInDurationMs: millisecondsAt(
      countInPosition,
      tempo.millisecondsPerQuarter,
    ),
    durationMs: millisecondsAt(melody.duration, tempo.millisecondsPerQuarter),
    lines: compiledLines,
    outroNotes,
  };
  validateCompiledMilliseconds(compiled);
  return compiled;
}

export function compileMusicXml({ manifest, sourcePath, xml }) {
  const window = new Window({
    settings: {
      disableCSSFileLoading: true,
      disableJavaScriptEvaluation: true,
      disableJavaScriptFileLoading: true,
    },
  });
  try {
    return compileParsedScore(parseDocument(xml, sourcePath, window), manifest, sourcePath);
  } catch (error) {
    if (error instanceof UnrepresentableScoreTimingError) {
      throw scoreError(sourcePath, error.message);
    }
    throw error;
  } finally {
    window.close();
  }
}
