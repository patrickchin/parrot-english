import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { compileMusicXml } from "../scripts/nursery-rhyme/musicxml.mjs";

const sourcePath = "/content/rhyme/score.musicxml";
const canonicalDoctype =
  '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">';

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function lyric({
  endLine = false,
  extend = false,
  number = "1",
  syllabic,
  text,
} = {}) {
  return [
    `<lyric number="${number}">`,
    syllabic ? `<syllabic>${syllabic}</syllabic>` : "",
    text === undefined ? "" : `<text>${escapeXml(text)}</text>`,
    extend ? "<extend/>" : "",
    endLine ? "<end-line/>" : "",
    "</lyric>",
  ].join("");
}

function note({
  alter,
  attributes: noteAttributes = "",
  chord = false,
  duration = 1,
  extra = "",
  grace = false,
  lyrics = [],
  octave = 4,
  rest = false,
  step = "C",
  ties = [],
  voice,
} = {}) {
  const pitch = rest
    ? "<rest/>"
    : `<pitch><step>${step}</step>${
        alter === undefined ? "" : `<alter>${alter}</alter>`
      }<octave>${octave}</octave></pitch>`;
  const tieElements = ties.map((type) => `<tie type="${type}"/>`).join("");
  const tiedNotations = ties.length
    ? `<notations>${ties.map((type) => `<tied type="${type}"/>`).join("")}</notations>`
    : "";
  return [
    `<note${noteAttributes ? ` ${noteAttributes}` : ""}>`,
    chord ? "<chord/>" : "",
    grace ? "<grace/>" : "",
    pitch,
    tieElements,
    `<duration>${duration}</duration>`,
    voice === undefined ? "" : `<voice>${voice}</voice>`,
    extra,
    tiedNotations,
    lyrics.join(""),
    "</note>",
  ].join("");
}

function rest(duration) {
  return note({ duration, rest: true });
}

function tempo({ beatUnit = "quarter", dots = 0, perMinute = "120" } = {}) {
  return [
    "<direction><direction-type><metronome>",
    `<beat-unit>${beatUnit}</beat-unit>`,
    "<beat-unit-dot/>".repeat(dots),
    `<per-minute>${perMinute}</per-minute>`,
    "</metronome></direction-type></direction>",
  ].join("");
}

function soundTempo(value = "120") {
  return `<direction><sound tempo="${value}"/></direction>`;
}

function attributes(divisions, extra = "") {
  return `<attributes><divisions>${divisions}</divisions>${extra}</attributes>`;
}

function measure(number, body) {
  return `<measure number="${number}">${body}</measure>`;
}

function part(id, measures) {
  return `<part id="${id}">${measures.join("")}</part>`;
}

function scoreXml({
  beforeRoot = "",
  doctype = "",
  partIds = ["P1"],
  parts,
  rootName = "score-partwise",
  version = "4.0",
} = {}) {
  const defaultPart = part("P1", [
    measure(
      1,
      attributes(2)
        + tempo()
        + rest(4)
        + '<bookmark id="line-1"/>'
        + note({
          duration: 2,
          lyrics: [lyric({ endLine: true, syllabic: "single", text: "Hello" })],
        }),
    ),
  ]);
  const partList = partIds
    .map((id) => `<score-part id="${id}"><part-name>${id}</part-name></score-part>`)
    .join("");
  return `${beforeRoot}${doctype}<${rootName} version="${version}"><part-list>${partList}</part-list>${
    parts?.join("") ?? defaultPart
  }</${rootName}>`;
}

function manifest(texts = ["Hello"], score = {}) {
  return {
    countInBeats: 2,
    scenes: [
      {
        lines: texts.map((text, index) => ({
          id: `line-${index + 1}`,
          text,
        })),
      },
    ],
    score: {
      melodyPart: "P1",
      playbackParts: ["P1"],
      ...score,
    },
  };
}

function compile(xml = scoreXml(), currentManifest = manifest()) {
  return compileMusicXml({ manifest: currentManifest, sourcePath, xml });
}

function lineNote(text, options = {}) {
  return note({
    duration: 2,
    ...options,
    lyrics: [
      lyric({
        endLine: true,
        syllabic: "single",
        text,
        ...options.lyric,
      }),
    ],
  });
}

describe("secure MusicXML parsing", () => {
  it("accepts the minimal score and strips only the canonical external doctype without fetching it", () => {
    const originalFetch = globalThis.fetch;
    let fetchCount = 0;
    globalThis.fetch = (...args) => {
      fetchCount += 1;
      throw new Error(`unexpected fetch: ${args[0]}`);
    };
    try {
      assert.doesNotThrow(() => compile());
      assert.doesNotThrow(() =>
        compile(scoreXml({
          beforeRoot: '<?xml version="1.0" encoding="UTF-8"?>',
          doctype: canonicalDoctype,
        })),
      );
      assert.equal(fetchCount, 0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("rejects internal subsets, entities, alternate doctypes, and repeated declarations", () => {
    for (const declaration of [
      '<!DOCTYPE score-partwise [<!ENTITY x "boom">]>',
      '<!ENTITY x SYSTEM "file:///etc/passwd">',
      '<!DOCTYPE score-timewise SYSTEM "https://example.com/x.dtd">',
      `${canonicalDoctype}${canonicalDoctype}`,
    ]) {
      assert.throws(
        () => compile(scoreXml({ doctype: declaration })),
        /DOCTYPE|entity|declaration/i,
      );
    }
    assert.throws(
      () => compile(
        scoreXml().replace("</score-partwise>", `${canonicalDoctype}</score-partwise>`),
      ),
      /DOCTYPE|declaration|prolog/i,
    );
  });

  it("rejects malformed XML, unresolved entities, the wrong root, and the wrong version", () => {
    assert.throws(
      () => compile('<score-partwise version="4.0"><part></score-partwise>'),
      /score\.musicxml.*malformed/i,
    );
    assert.throws(
      () => compile(scoreXml().replace("Hello", "&notDeclared;")),
      /score\.musicxml.*malformed|entity/i,
    );
    assert.throws(
      () => compile(scoreXml({ rootName: "score-timewise" })),
      /score\.musicxml.*score-partwise/i,
    );
    assert.throws(
      () => compile(scoreXml({ version: "3.1" })),
      /score\.musicxml.*version.*4\.0/i,
    );
  });
});

describe("rational score timing", () => {
  it("rounds thirds from absolute boundaries while changing divisions only at a measure boundary", () => {
    const xml = scoreXml({
      parts: [
        part("P1", [
          measure(1, attributes(3) + tempo({ perMinute: "60" }) + rest(6)),
          measure(
            2,
            attributes(6)
              + '<bookmark id="line-1"/>'
              + note({ duration: 2, lyrics: [lyric({ syllabic: "single", text: "One" })] })
              + note({ duration: 2, lyrics: [lyric({ syllabic: "single", text: "two" })] })
              + note({
                duration: 2,
                lyrics: [lyric({ endLine: true, syllabic: "single", text: "three" })],
              }),
          ),
        ]),
      ],
    });

    const compiled = compile(xml, manifest(["One two three"]));

    assert.equal(compiled.countInBeatMs, 1_000);
    assert.equal(compiled.countInDurationMs, 2_000);
    assert.equal(compiled.lines[0].cueMs, 2_000);
    assert.deepEqual(
      compiled.lines[0].notes.map(({ atMs, durationMs }) => [atMs, durationMs]),
      [[0, 333], [333, 334], [667, 333]],
    );
    assert.equal(compiled.lines[0].durationMs, 1_000);
    assert.equal(compiled.durationMs, 3_000);
  });

  it("rounds sixths from absolute boundaries without accumulating drift", () => {
    const words = ["A", "B", "C", "D", "E", "F"];
    const xml = scoreXml({
      parts: [
        part("P1", [
          measure(1, attributes(6) + tempo({ perMinute: "60" }) + rest(12)),
          measure(
            2,
            '<bookmark id="line-1"/>'
              + words.map((text, index) => note({
                duration: 1,
                lyrics: [lyric({
                  endLine: index === words.length - 1,
                  syllabic: "single",
                  text,
                })],
              })).join(""),
          ),
        ]),
      ],
    });

    const compiled = compile(xml, manifest([words.join(" ")]));

    assert.deepEqual(
      compiled.lines[0].notes.map(({ atMs, durationMs }) => [atMs, durationMs]),
      [[0, 167], [167, 166], [333, 167], [500, 167], [667, 166], [833, 167]],
    );
    assert.equal(compiled.lines[0].durationMs, 1_000);
  });

  it("derives the quarter clock from a dotted beat unit and decimal per-minute value", () => {
    const xml = scoreXml({
      parts: [
        part("P1", [
          measure(
            1,
            attributes(2)
              + tempo({ beatUnit: "eighth", dots: 1, perMinute: "90.5" })
              + rest(3)
              + '<bookmark id="line-1"/>'
              + lineNote("Hello", { duration: 2 }),
          ),
        ]),
      ],
    });

    const compiled = compile(xml);

    assert.equal(compiled.countInBeatMs, 663);
    assert.equal(compiled.countInDurationMs, 1_326);
    assert.equal(compiled.lines[0].cueMs, 1_326);
    assert.equal(compiled.lines[0].durationMs, 884);
  });

  it("accepts one score-wide sound tempo", () => {
    for (const value of ["120", "120.0"]) {
      const xml = scoreXml({
        parts: [
          part("P1", [
            measure(
              1,
              attributes(2)
                + soundTempo(value)
                + rest(4)
                + '<bookmark id="line-1"/>'
                + lineNote("Hello"),
            ),
          ]),
        ],
      });

      assert.equal(compile(xml).countInBeatMs, 500);
    }
  });
});

describe("ties, line boundaries, and exact lyric offsets", () => {
  it("coalesces a tie across measures and ends the line at the complete tied chain", () => {
    const xml = scoreXml({
      parts: [
        part("P1", [
          measure(
            1,
            attributes(2)
              + tempo()
              + rest(4)
              + '<bookmark id="line-1"/>'
              + note({
                duration: 2,
                ties: ["start"],
                lyrics: [lyric({ endLine: true, syllabic: "single", text: "Held" })],
              }),
          ),
          measure(2, note({ duration: 2, ties: ["stop"] })),
        ]),
      ],
    });

    const compiled = compile(xml, manifest(["Held"]));

    assert.deepEqual(compiled.lines[0].notes, [
      { atMs: 0, durationMs: 1_000, midi: 60 },
    ]);
    assert.equal(compiled.lines[0].durationMs, 1_000);
    assert.deepEqual(compiled.lines[0].words[0], {
      startOffset: 0,
      endOffset: 4,
      atMs: 0,
      durationMs: 500,
    });
  });

  it("extends one word across successive notes", () => {
    const xml = scoreXml({
      parts: [
        part("P1", [
          measure(
            1,
            attributes(2)
              + tempo()
              + rest(4)
              + '<bookmark id="line-1"/>'
              + note({
                duration: 2,
                lyrics: [lyric({ syllabic: "single", text: "Hello" })],
              })
              + note({
                duration: 2,
                step: "D",
                lyrics: [lyric({ endLine: true, extend: true })],
              }),
          ),
        ]),
      ],
    });

    const compiled = compile(xml);

    assert.deepEqual(compiled.lines[0].words[0], {
      startOffset: 0,
      endOffset: 5,
      atMs: 0,
      durationMs: 1_000,
    });
  });

  it("keeps successive lyric intervals distinct while coalescing tied same-pitch playback", () => {
    const xml = scoreXml({
      parts: [
        part("P1", [
          measure(
            1,
            attributes(2)
              + tempo()
              + rest(4)
              + '<bookmark id="line-1"/>'
              + note({
                duration: 2,
                ties: ["start"],
                lyrics: [lyric({ syllabic: "single", text: "One" })],
              })
              + note({
                duration: 2,
                ties: ["stop"],
                lyrics: [lyric({ endLine: true, syllabic: "single", text: "word" })],
              }),
          ),
        ]),
      ],
    });

    const compiled = compile(xml, manifest(["One word"]));

    assert.deepEqual(compiled.lines[0].notes, [
      { atMs: 0, durationMs: 1_000, midi: 60 },
    ]);
    assert.deepEqual(compiled.lines[0].playbackNotes, [
      { atMs: 0, durationMs: 1_000, midi: 60, role: "melody" },
    ]);
    assert.deepEqual(compiled.lines[0].words, [
      { startOffset: 0, endOffset: 3, atMs: 0, durationMs: 500 },
      { startOffset: 4, endOffset: 8, atMs: 500, durationMs: 500 },
    ]);
  });

  it("rejects a repeated same-pitch tie start before it can replace the active chain", () => {
    const xml = scoreXml({
      parts: [
        part("P1", [
          measure(
            1,
            attributes(2)
              + tempo()
              + rest(4)
              + '<bookmark id="line-1"/>'
              + note({
                duration: 1,
                ties: ["start"],
                lyrics: [lyric({ syllabic: "single", text: "One" })],
              })
              + note({
                duration: 1,
                ties: ["start"],
                lyrics: [lyric({ syllabic: "single", text: "two" })],
              })
              + note({
                duration: 1,
                ties: ["stop"],
                lyrics: [lyric({ endLine: true, syllabic: "single", text: "three" })],
              }),
          ),
        ]),
      ],
    });

    assert.throws(
      () => compile(xml, manifest(["One two three"])),
      /tie.*active|repeated.*tie start|tie.*overwrite/i,
    );
  });

  it("joins begin, middle, and end syllables without inserting characters", () => {
    const xml = scoreXml({
      parts: [
        part("P1", [
          measure(
            1,
            attributes(2)
              + tempo()
              + rest(4)
              + '<bookmark id="line-1"/>'
              + note({ duration: 1, lyrics: [lyric({ syllabic: "begin", text: "but" })] })
              + note({ duration: 1, step: "D", lyrics: [lyric({ syllabic: "middle", text: "ter" })] })
              + note({
                duration: 1,
                step: "E",
                lyrics: [lyric({ endLine: true, syllabic: "end", text: "fly" })],
              }),
          ),
        ]),
      ],
    });

    const compiled = compile(xml, manifest(["Butterfly"]));

    assert.deepEqual(compiled.lines[0].words, [
      { startOffset: 0, endOffset: 9, atMs: 0, durationMs: 750 },
    ]);
  });

  it("matches punctuation and E-I-E-I-O back to exact UTF-16 offsets", () => {
    const xml = scoreXml({
      parts: [
        part("P1", [
          measure(
            1,
            attributes(2)
              + tempo()
              + rest(4)
              + '<bookmark id="line-1"/>'
              + note({ duration: 2, lyrics: [lyric({ syllabic: "single", text: "hi" })] })
              + note({
                duration: 2,
                lyrics: [lyric({ endLine: true, syllabic: "single", text: "E-I-E-I-O" })],
              }),
          ),
        ]),
      ],
    });

    const compiled = compile(xml, manifest(["Hi, E-I-E-I-O!"]));

    assert.deepEqual(
      compiled.lines[0].words.map(({ startOffset, endOffset }) => [startOffset, endOffset]),
      [[0, 2], [4, 13]],
    );
  });

  it("normalizes case and every accepted apostrophe and hyphen without shifting source offsets", () => {
    const text = "CAN’T can't can‘t canʼt re‐do re‑do re-do";
    const scoreWords = ["can't", "CAN’T", "canʼt", "can‘t", "re-do", "re‐do", "RE‑DO"];
    const xml = scoreXml({
      parts: [
        part("P1", [
          measure(
            1,
            attributes(2)
              + tempo()
              + rest(4)
              + '<bookmark id="line-1"/>'
              + scoreWords.map((word, index) => note({
                duration: 1,
                lyrics: [lyric({
                  endLine: index === scoreWords.length - 1,
                  syllabic: "single",
                  text: word,
                })],
              })).join(""),
          ),
        ]),
      ],
    });

    const compiled = compile(xml, manifest([text]));

    assert.deepEqual(
      compiled.lines[0].words.map(({ startOffset, endOffset }) => [startOffset, endOffset]),
      [[0, 5], [6, 11], [12, 17], [18, 23], [24, 29], [30, 35], [36, 41]],
    );
  });

  it("uses end-line rather than a final rest or outro to bound the phrase", () => {
    const melody = part("P1", [
      measure(
        1,
        attributes(2)
          + tempo()
          + rest(4)
          + '<bookmark id="line-1"/>'
          + lineNote("Hello")
          + rest(2),
      ),
    ]);
    const accompaniment = part("P2", [
      measure(
        1,
        attributes(2)
          + rest(4)
          + rest(2)
          + note({ duration: 2, octave: 3 }),
      ),
    ]);
    const xml = scoreXml({ partIds: ["P1", "P2"], parts: [melody, accompaniment] });

    const compiled = compile(xml, manifest(["Hello"], {
      playbackParts: ["P1", "P2"],
    }));

    assert.equal(compiled.lines[0].durationMs, 500);
    assert.equal(compiled.durationMs, 2_000);
    assert.deepEqual(compiled.outroNotes, [
      { atMs: 1_500, durationMs: 500, midi: 48, role: "accompaniment" },
    ]);
  });

  it("uses a marker-only terminal rest to include an intentional silent line tail", () => {
    const xml = scoreXml({
      parts: [
        part("P1", [
          measure(
            1,
            attributes(2)
              + tempo()
              + rest(4)
              + '<bookmark id="line-1"/>'
              + note({
                duration: 1,
                lyrics: [lyric({ syllabic: "single", text: "Hello" })],
              })
              + note({
                duration: 1,
                lyrics: [lyric({ endLine: true })],
                rest: true,
              }),
          ),
        ]),
      ],
    });

    const compiled = compile(xml);

    assert.equal(compiled.lines[0].durationMs, 500);
    assert.deepEqual(compiled.lines[0].notes, [
      { atMs: 0, durationMs: 250, midi: 60 },
    ]);
    assert.deepEqual(compiled.lines[0].playbackNotes, [
      { atMs: 0, durationMs: 250, midi: 60, role: "melody" },
    ]);
    assert.deepEqual(compiled.lines[0].words, [
      { startOffset: 0, endOffset: 5, atMs: 0, durationMs: 250 },
    ]);
  });

  it("rejects malformed rest markers and marker-only pitched lyrics", () => {
    const invalidLyrics = [
      lyric({ endLine: true, syllabic: "single", text: "Hello" }),
      lyric({ endLine: true, extend: true }),
      lyric({ endLine: true, syllabic: "single" }),
    ];
    for (const invalidLyric of invalidLyrics) {
      const xml = scoreXml({
        parts: [
          part("P1", [
            measure(
              1,
              attributes(2)
                + tempo()
                + rest(4)
                + '<bookmark id="line-1"/>'
                + note({
                  duration: 1,
                  lyrics: [lyric({ syllabic: "single", text: "Hello" })],
                })
                + note({ duration: 1, lyrics: [invalidLyric], rest: true }),
            ),
          ]),
        ],
      });
      assert.throws(() => compile(xml), /rest.*marker-only|marker-only.*rest/i);
    }

    const pitchedMarker = scoreXml({
      parts: [
        part("P1", [
          measure(
            1,
            attributes(2)
              + tempo()
              + rest(4)
              + '<bookmark id="line-1"/>'
              + note({
                duration: 1,
                lyrics: [lyric({ syllabic: "single", text: "Hello" })],
              })
              + note({ duration: 1, lyrics: [lyric({ endLine: true })] }),
          ),
        ]),
      ],
    });
    assert.throws(() => compile(pitchedMarker), /marker-only.*pitched|pitched.*marker-only/i);
  });
});

describe("parts, voices, and supported notes", () => {
  it("accepts accompaniment chords and omits an unselected part", () => {
    const melody = part("P1", [
      measure(
        1,
        attributes(2)
          + tempo()
          + rest(4)
          + '<bookmark id="line-1"/>'
          + lineNote("Hello"),
      ),
    ]);
    const accompaniment = part("P2", [
      measure(
        1,
        attributes(2)
          + rest(4)
          + note({ duration: 2, octave: 3 })
          + note({ chord: true, duration: 2, octave: 3, step: "E" }),
      ),
    ]);
    const unselected = part("P3", [
      measure(1, attributes(2) + rest(4) + note({ duration: 2, octave: 5, step: "G" })),
    ]);
    const xml = scoreXml({
      partIds: ["P1", "P2", "P3"],
      parts: [melody, accompaniment, unselected],
    });

    const compiled = compile(xml, manifest(["Hello"], {
      playbackParts: ["P1", "P2"],
    }));

    assert.deepEqual(compiled.lines[0].notes, [
      { atMs: 0, durationMs: 500, midi: 60 },
    ]);
    assert.deepEqual(compiled.lines[0].playbackNotes, [
      { atMs: 0, durationMs: 500, midi: 48, role: "accompaniment" },
      { atMs: 0, durationMs: 500, midi: 52, role: "accompaniment" },
      { atMs: 0, durationMs: 500, midi: 60, role: "melody" },
    ]);
    assert.equal(compiled.lines[0].playbackNotes.some(({ midi }) => midi === 79), false);
  });

  it("rejects chords in the melody and overlapping accompaniment chord durations", () => {
    const melodyChord = scoreXml({
      parts: [
        part("P1", [
          measure(
            1,
            attributes(2)
              + tempo()
              + rest(4)
              + '<bookmark id="line-1"/>'
              + lineNote("Hello")
              + note({ chord: true, duration: 2, step: "E" }),
          ),
        ]),
      ],
    });
    assert.throws(() => compile(melodyChord), /melody.*chord|chord.*melody/i);

    const melody = part("P1", [
      measure(
        1,
        attributes(2) + tempo() + rest(4) + '<bookmark id="line-1"/>' + lineNote("Hello"),
      ),
    ]);
    const overlap = part("P2", [
      measure(
        1,
        attributes(2)
          + rest(4)
          + note({ duration: 2, octave: 3 })
          + note({ chord: true, duration: 3, octave: 3, step: "E" }),
      ),
    ]);
    assert.throws(
      () => compile(
        scoreXml({ partIds: ["P1", "P2"], parts: [melody, overlap] }),
        manifest(["Hello"], { playbackParts: ["P1", "P2"] }),
      ),
      /chord|overlap|duration/i,
    );
  });

  it("rejects an accompaniment chord whose immediate anchor is a rest", () => {
    const melody = part("P1", [
      measure(
        1,
        attributes(2)
          + tempo()
          + rest(4)
          + '<bookmark id="line-1"/>'
          + lineNote("Hello"),
      ),
    ]);
    const accompaniment = part("P2", [
      measure(
        1,
        attributes(2)
          + rest(4)
          + rest(2)
          + note({ chord: true, duration: 2, octave: 3 }),
      ),
    ]);

    assert.throws(
      () => compile(
        scoreXml({ partIds: ["P1", "P2"], parts: [melody, accompaniment] }),
        manifest(["Hello"], { playbackParts: ["P1", "P2"] }),
      ),
      /chord.*pitched|chord.*rest|rest.*anchor/i,
    );
  });

  it("rejects missing referenced parts while allowing a valid unselected part", () => {
    assert.throws(
      () => compile(scoreXml(), manifest(["Hello"], { melodyPart: "P9" })),
      /melody.*P9|P9.*absent|missing.*P9/i,
    );
    assert.throws(
      () => compile(scoreXml(), manifest(["Hello"], { playbackParts: ["P1", "P9"] })),
      /playback.*P9|P9.*absent|missing.*P9/i,
    );
  });

  it("rejects part timing divergence and multiple or changing voices", () => {
    const melody = part("P1", [
      measure(
        1,
        attributes(2) + tempo() + rest(4) + '<bookmark id="line-1"/>' + lineNote("Hello"),
      ),
    ]);
    const shortPart = part("P2", [measure(1, attributes(2) + rest(4))]);
    assert.throws(
      () => compile(
        scoreXml({ partIds: ["P1", "P2"], parts: [melody, shortPart] }),
        manifest(["Hello"], { playbackParts: ["P1", "P2"] }),
      ),
      /P2.*timing|timing.*diverge|measure.*duration/i,
    );

    const voices = scoreXml({
      parts: [
        part("P1", [
          measure(
            1,
            attributes(2)
              + tempo()
              + rest(4)
              + '<bookmark id="line-1"/>'
              + note({
                duration: 1,
                voice: "1",
                lyrics: [lyric({ syllabic: "single", text: "Hel" })],
              })
              + note({
                duration: 1,
                step: "D",
                voice: "2",
                lyrics: [lyric({ endLine: true, syllabic: "single", text: "lo" })],
              }),
          ),
        ]),
      ],
    });
    assert.throws(() => compile(voices), /voice/i);
  });
});

describe("bookmark and lyric validation", () => {
  function twoLineScore(bookmarks) {
    return scoreXml({
      parts: [
        part("P1", [
          measure(
            1,
            attributes(2)
              + tempo()
              + rest(4)
              + bookmarks[0]
              + lineNote("One")
              + (bookmarks[1] ?? "")
              + lineNote("Two")
              + (bookmarks[2] ?? ""),
          ),
        ]),
      ],
    });
  }

  it("requires bookmarks exactly once in manifest order with no extras", () => {
    const twoLines = manifest(["One", "Two"]);
    for (const [xml, pattern] of [
      [twoLineScore(["", '<bookmark id="line-2"/>']), /bookmark.*line-1|missing.*line-1/i],
      [twoLineScore(['<bookmark id="line-1"/>', '<bookmark id="line-1"/>']), /bookmark.*duplicate|line-1.*twice/i],
      [twoLineScore(['<bookmark id="line-2"/>', '<bookmark id="line-1"/>']), /bookmark.*order|expected.*line-1/i],
      [twoLineScore(['<bookmark id="line-1"/>', '<bookmark id="line-2"/>', '<bookmark id="extra"/>']), /bookmark.*extra|unexpected.*extra/i],
    ]) {
      assert.throws(() => compile(xml, twoLines), pattern);
    }

    const melody = part("P1", [
      measure(
        1,
        attributes(2)
          + tempo()
          + rest(4)
          + '<bookmark id="line-1"/>'
          + lineNote("One"),
      ),
    ]);
    const accompanimentWithExtraBookmark = part("P2", [
      measure(1, attributes(2) + rest(4) + '<bookmark id="extra"/>' + rest(2)),
    ]);
    assert.throws(
      () => compile(
        scoreXml({
          partIds: ["P1", "P2"],
          parts: [melody, accompanimentWithExtraBookmark],
        }),
        manifest(["One"], { playbackParts: ["P1", "P2"] }),
      ),
      /bookmark.*melody|extra.*bookmark/i,
    );
  });

  it("requires the first bookmark at the exact rounded two-beat boundary", () => {
    const early = scoreXml({
      parts: [
        part("P1", [
          measure(
            1,
            attributes(2)
              + tempo()
              + rest(2)
              + '<bookmark id="line-1"/>'
              + lineNote("Hello")
              + rest(2),
          ),
        ]),
      ],
    });

    assert.throws(() => compile(early), /first bookmark|count-in|two.*beat/i);
  });

  it("rejects incomplete syllable chains, multi-token lyrics, mismatches, and missing lyric timing", () => {
    const invalidLyrics = [
      [
        note({
          duration: 2,
          lyrics: [lyric({ endLine: true, syllabic: "begin", text: "Hel" })],
        }),
        /syllab|incomplete/i,
      ],
      [lineNote("Hello world"), /lyric.*one token|multiple.*token/i],
      [lineNote("Goodbye"), /lyric.*Hello|mismatch/i],
      [note({ duration: 2 }), /lyric|end-line/i],
    ];
    for (const [invalidNote, pattern] of invalidLyrics) {
      const xml = scoreXml({
        parts: [
          part("P1", [
            measure(
              1,
              attributes(2)
                + tempo()
                + rest(4)
                + '<bookmark id="line-1"/>'
                + invalidNote,
            ),
          ]),
        ],
      });
      assert.throws(() => compile(xml), pattern);
    }

    const prematureEndLine = scoreXml({
      parts: [
        part("P1", [
          measure(
            1,
            attributes(2)
              + tempo()
              + rest(4)
              + '<bookmark id="line-1"/>'
              + note({
                duration: 1,
                ties: ["start"],
                lyrics: [lyric({ endLine: true, syllabic: "single", text: "One" })],
              })
              + note({
                duration: 1,
                ties: ["stop"],
                lyrics: [lyric({ syllabic: "single", text: "word" })],
              }),
          ),
        ]),
      ],
    });
    assert.throws(
      () => compile(prematureEndLine, manifest(["One word"])),
      /end-line.*final|lyric.*after.*end-line/i,
    );
  });

  it("rejects lyric intervals outside a line even when melody playback is disabled", () => {
    const melody = part("P1", [
      measure(
        1,
        attributes(2)
          + tempo()
          + rest(4)
          + '<bookmark id="line-1"/>'
          + lineNote("Hello", { duration: 1 })
          + note({
            duration: 1,
            lyrics: [lyric({ syllabic: "single", text: "Outside" })],
          }),
      ),
    ]);
    const accompaniment = part("P2", [
      measure(1, attributes(2) + rest(4) + rest(1) + rest(1)),
    ]);
    const xml = scoreXml({ partIds: ["P1", "P2"], parts: [melody, accompaniment] });

    assert.throws(
      () => compile(xml, manifest(["Hello"], { playbackParts: ["P2"] })),
      /lyric.*outside|outside.*line window/i,
    );
  });
});

describe("unsupported and invalid score constructs", () => {
  function scoreWithBody(body, currentManifest = manifest()) {
    return [
      scoreXml({
        parts: [
          part("P1", [
            measure(
              1,
              attributes(2)
                + tempo()
                + rest(4)
                + '<bookmark id="line-1"/>'
                + body,
            ),
          ]),
        ],
      }),
      currentManifest,
    ];
  }

  it("rejects repeats, grace notes, tuplets, transposition, second verses, backup, and forward", () => {
    const cases = [
      [lineNote("Hello") + '<barline location="right"><repeat direction="backward"/></barline>', /repeat/i],
      [lineNote("Hello", { grace: true }), /grace/i],
      [lineNote("Hello", { extra: "<time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>" }), /tuplet|time-modification/i],
      [lineNote("Hello") + "<backup><duration>2</duration></backup>", /backup/i],
      [lineNote("Hello") + "<forward><duration>2</duration></forward>", /forward/i],
      [note({
        duration: 2,
        lyrics: [
          lyric({ endLine: true, number: "1", syllabic: "single", text: "Hello" }),
          lyric({ number: "2", syllabic: "single", text: "Bonjour" }),
        ],
      }), /lyric.*verse|second.*lyric|multiple.*lyric/i],
    ];
    for (const [body, pattern] of cases) {
      const [xml, currentManifest] = scoreWithBody(body);
      assert.throws(() => compile(xml, currentManifest), pattern);
    }

    const transposed = scoreXml({
      parts: [
        part("P1", [
          measure(
            1,
            attributes(2, "<transpose><chromatic>2</chromatic></transpose>")
              + tempo()
              + rest(4)
              + '<bookmark id="line-1"/>'
              + lineNote("Hello"),
          ),
        ]),
      ],
    });
    assert.throws(() => compile(transposed), /transpose/i);
  });

  it("rejects unsupported MusicXML note attributes that alter playback timing", () => {
    const [xml] = scoreWithBody(lineNote("Hello", { attributes: 'attack="1"' }));

    assert.throws(() => compile(xml), /note.*attribute|attack.*unsupported/i);
  });

  it("rejects a mid-score tempo change", () => {
    const [xml] = scoreWithBody(
      note({ duration: 1, lyrics: [lyric({ syllabic: "begin", text: "Hel" })] })
        + tempo({ perMinute: "100" })
        + note({
          duration: 1,
          lyrics: [lyric({ endLine: true, syllabic: "end", text: "lo" })],
        }),
    );

    assert.throws(() => compile(xml), /tempo.*change|multiple.*tempo|tempo.*start/i);
  });

  it("rejects D.C. and D.S. playback jumps encoded on sound", () => {
    for (const jump of ['dacapo="yes"', 'dalsegno="segno-1"']) {
      const xml = scoreXml().replace(
        tempo(),
        `<direction><sound tempo="120" ${jump}/></direction>`,
      );
      assert.throws(() => compile(xml), /sound.*unsupported|D\.C\.|D\.S\.|jump/i);
    }
  });

  it("rejects invalid divisions, duration, pitch, and tie chains", () => {
    for (const divisions of ["0", "1.5", "nope"]) {
      const xml = scoreXml({
        parts: [
          part("P1", [
            measure(
              1,
              attributes(divisions)
                + tempo()
                + rest(4)
                + '<bookmark id="line-1"/>'
                + lineNote("Hello"),
            ),
          ]),
        ],
      });
      assert.throws(() => compile(xml), /divisions/i);
    }

    for (const duration of ["0", "-1", "1.5", "nope"]) {
      const [xml] = scoreWithBody(lineNote("Hello", { duration }));
      assert.throws(() => compile(xml), /duration/i);
    }

    const [badStep] = scoreWithBody(lineNote("Hello", { step: "H" }));
    assert.throws(() => compile(badStep), /pitch|step/i);
    const [badMidi] = scoreWithBody(lineNote("Hello", { octave: 11 }));
    assert.throws(() => compile(badMidi), /pitch|MIDI|127/i);

    const [openTie] = scoreWithBody(lineNote("Hello", { ties: ["start"] }));
    assert.throws(() => compile(openTie), /tie/i);
  });

  it("rejects a line longer than 8,000ms", () => {
    const xml = scoreXml({
      parts: [
        part("P1", [
          measure(
            1,
            attributes(1)
              + tempo({ perMinute: "60" })
              + rest(2)
              + '<bookmark id="line-1"/>'
              + lineNote("Hello", { duration: 9 }),
          ),
        ]),
      ],
    });

    assert.throws(() => compile(xml), /line-1.*8,?000|8,?000.*line-1/i);
  });

  it("rejects rational timing that collapses or exceeds safe millisecond boundaries", () => {
    for (const perMinute of ["1000000", "0.000000000001"]) {
      const xml = scoreXml().replace(tempo(), tempo({ perMinute }));
      assert.throws(
        () => compile(xml),
        /timing.*(?:positive|safe|representable)|millisecond.*(?:collapse|safe|representable)/i,
      );
    }
  });
});
