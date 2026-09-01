import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  parseFluentAssetManifest,
  parseWordGameManifest,
} from "../scripts/word-game/manifest.mjs";

const categorySourcePath = "/content/animals.json";
const fluentSourcePath = "/content/fluent-3d-assets.json";

function validCategory() {
  const items = Array.from({ length: 12 }, (_, index) => {
    const number = index + 1;
    const id = `animal-${number}`;
    return {
      id,
      label: `animal ${number}`,
      alt: `Animal ${number}.`,
      visual: { assetId: `1f4${String(number).padStart(2, "0")}`, kind: "fluent-3d" },
      audio: {
        id: `word-game-animals-${id}-label`,
        text: `This is animal ${number}.`,
      },
    };
  });
  const quiz = (tierId, offset) => ({
    id: `${tierId}-1`,
    title: `${tierId} animals`,
    description: `Six ${tierId} animal words.`,
    questions: Array.from({ length: 6 }, (_, index) => {
      const ids = Array.from(
        { length: 4 },
        (_, choiceOffset) => items[(offset + index + choiceOffset) % items.length].id,
      );
      return {
        id: `find-${tierId}-${index + 1}`,
        targetId: ids[0],
        choiceIds: [ids[0], ids[1], ids[2], ids[3]],
        prompt: `Animal ${offset + index + 1}. Which picture is animal ${offset + index + 1}?`,
        success: `Great job! This is animal ${offset + index + 1}.`,
      };
    }),
  });

  return {
    schemaVersion: 1,
    order: 1,
    id: "animals",
    title: "Animals",
    description: "Listen and find the animals.",
    theme: "sky",
    coverItemId: "animal-1",
    items,
    tiers: [
      {
        id: "simple",
        title: "Simple",
        description: "Start with familiar animal words.",
        quizzes: [quiz("simple", 0)],
      },
      {
        id: "intermediate",
        title: "Intermediate",
        description: "Try more animal words.",
        quizzes: [quiz("intermediate", 3)],
      },
      {
        id: "advanced",
        title: "Advanced",
        description: "Practice advanced animal words.",
        quizzes: [quiz("advanced", 6)],
      },
    ],
  };
}

function validFluentManifest() {
  return {
    schemaVersion: 1,
    repository: "https://github.com/microsoft/fluentui-emoji",
    revision: "1ffb34c752ecf5d402f04cfb4b392c77f57c54bc",
    license: "MIT",
    licensePath: "LICENSE",
    assets: [
      {
        id: "1f431",
        upstreamPath: "assets/Cat/3D/cat_3d.png",
        publicPath: "/assets/word-games/fluent-3d/1f431.png",
        sha256: "5d3fcbbfb0be45d9be0ade47fe4eb1b97d33130fe67d46a8db697e434f13289b",
      },
    ],
  };
}

function errorAt(sourcePath, fieldPath) {
  return (error) => {
    assert.ok(error.message.startsWith(`${sourcePath}:${fieldPath}:`));
    return true;
  };
}

describe("word-game manifests", () => {
  it("accepts complete schema-version-1 category and Fluent manifests", () => {
    const category = validCategory();
    assert.deepEqual(parseWordGameManifest(category, categorySourcePath), category);
    assert.deepEqual(
      parseFluentAssetManifest(validFluentManifest(), fluentSourcePath),
      validFluentManifest(),
    );
  });

  for (const { name, parse, sourcePath, value, fieldPath } of [
    {
      name: "unknown category fields",
      parse: parseWordGameManifest,
      sourcePath: categorySourcePath,
      value: () => ({ ...validCategory(), surprise: true }),
      fieldPath: "surprise",
    },
    {
      name: "unknown item fields",
      parse: parseWordGameManifest,
      sourcePath: categorySourcePath,
      value: () => {
        const category = validCategory();
        category.items[0].surprise = true;
        return category;
      },
      fieldPath: "items[0].surprise",
    },
    {
      name: "unknown audio fields",
      parse: parseWordGameManifest,
      sourcePath: categorySourcePath,
      value: () => {
        const category = validCategory();
        category.items[0].audio.surprise = true;
        return category;
      },
      fieldPath: "items[0].audio.surprise",
    },
    {
      name: "unknown Fluent visual fields",
      parse: parseWordGameManifest,
      sourcePath: categorySourcePath,
      value: () => {
        const category = validCategory();
        category.items[0].visual.surprise = true;
        return category;
      },
      fieldPath: "items[0].visual.surprise",
    },
    {
      name: "unknown swatch visual fields",
      parse: parseWordGameManifest,
      sourcePath: categorySourcePath,
      value: () => {
        const category = validCategory();
        category.items[0].visual = {
          color: "#ef4444",
          kind: "swatch",
          surprise: true,
        };
        return category;
      },
      fieldPath: "items[0].visual.surprise",
    },
    {
      name: "unknown tier fields",
      parse: parseWordGameManifest,
      sourcePath: categorySourcePath,
      value: () => {
        const category = validCategory();
        category.tiers[0].surprise = true;
        return category;
      },
      fieldPath: "tiers[0].surprise",
    },
    {
      name: "unknown quiz fields",
      parse: parseWordGameManifest,
      sourcePath: categorySourcePath,
      value: () => {
        const category = validCategory();
        category.tiers[0].quizzes[0].surprise = true;
        return category;
      },
      fieldPath: "tiers[0].quizzes[0].surprise",
    },
    {
      name: "unknown question fields",
      parse: parseWordGameManifest,
      sourcePath: categorySourcePath,
      value: () => {
        const category = validCategory();
        category.tiers[0].quizzes[0].questions[0].surprise = true;
        return category;
      },
      fieldPath: "tiers[0].quizzes[0].questions[0].surprise",
    },
    {
      name: "unknown Fluent manifest fields",
      parse: parseFluentAssetManifest,
      sourcePath: fluentSourcePath,
      value: () => ({ ...validFluentManifest(), surprise: true }),
      fieldPath: "surprise",
    },
    {
      name: "unknown Fluent asset fields",
      parse: parseFluentAssetManifest,
      sourcePath: fluentSourcePath,
      value: () => {
        const manifest = validFluentManifest();
        manifest.assets[0].surprise = true;
        return manifest;
      },
      fieldPath: "assets[0].surprise",
    },
    {
      name: "whitespace-only text",
      parse: parseWordGameManifest,
      sourcePath: categorySourcePath,
      value: () => {
        const category = validCategory();
        category.items[0].label = "   ";
        return category;
      },
      fieldPath: "items[0].label",
    },
    {
      name: "unsafe IDs",
      parse: parseWordGameManifest,
      sourcePath: categorySourcePath,
      value: () => ({ ...validCategory(), id: "Animals/../../private" }),
      fieldPath: "id",
    },
    {
      name: "filename-shaped Fluent asset IDs",
      parse: parseFluentAssetManifest,
      sourcePath: fluentSourcePath,
      value: () => {
        const manifest = validFluentManifest();
        manifest.assets[0].id = "emoji_u1f431.svg";
        return manifest;
      },
      fieldPath: "assets[0].id",
    },
    {
      name: "non-hex swatch colors",
      parse: parseWordGameManifest,
      sourcePath: categorySourcePath,
      value: () => {
        const category = validCategory();
        category.items[0].visual = { color: "#f00", kind: "swatch" };
        return category;
      },
      fieldPath: "items[0].visual.color",
    },
    {
      name: "non-40-character Fluent revisions",
      parse: parseFluentAssetManifest,
      sourcePath: fluentSourcePath,
      value: () => ({ ...validFluentManifest(), revision: "a".repeat(39) }),
      fieldPath: "revision",
    },
    {
      name: "unapproved 40-character Fluent revisions",
      parse: parseFluentAssetManifest,
      sourcePath: fluentSourcePath,
      value: () => ({ ...validFluentManifest(), revision: "a".repeat(40) }),
      fieldPath: "revision",
    },
    {
      name: "non-64-character Fluent SHA-256 values",
      parse: parseFluentAssetManifest,
      sourcePath: fluentSourcePath,
      value: () => {
        const manifest = validFluentManifest();
        manifest.assets[0].sha256 = "a".repeat(63);
        return manifest;
      },
      fieldPath: "assets[0].sha256",
    },
    ...[
      ["repository", "https://example.com/fluentui-emoji"],
      ["license", "Apache-2.0"],
      ["licensePath", "assets/LICENSE"],
    ].map(([field, replacement]) => ({
      name: `wrong Fluent ${field}`,
      parse: parseFluentAssetManifest,
      sourcePath: fluentSourcePath,
      value: () => ({ ...validFluentManifest(), [field]: replacement }),
      fieldPath: field,
    })),
    {
      name: "wrong tier IDs and order",
      parse: parseWordGameManifest,
      sourcePath: categorySourcePath,
      value: () => {
        const category = validCategory();
        category.tiers[0].id = "advanced";
        return category;
      },
      fieldPath: "tiers[0].id",
    },
    {
      name: "empty quiz lists",
      parse: parseWordGameManifest,
      sourcePath: categorySourcePath,
      value: () => {
        const category = validCategory();
        category.tiers[0].quizzes = [];
        return category;
      },
      fieldPath: "tiers[0].quizzes",
    },
    {
      name: "wrong question counts",
      parse: parseWordGameManifest,
      sourcePath: categorySourcePath,
      value: () => {
        const category = validCategory();
        category.tiers[0].quizzes[0].questions.pop();
        return category;
      },
      fieldPath: "tiers[0].quizzes[0].questions",
    },
    {
      name: "duplicate choices",
      parse: parseWordGameManifest,
      sourcePath: categorySourcePath,
      value: () => {
        const category = validCategory();
        category.tiers[0].quizzes[0].questions[0].choiceIds[3] =
          category.tiers[0].quizzes[0].questions[0].choiceIds[2];
        return category;
      },
      fieldPath: "tiers[0].quizzes[0].questions[0].choiceIds",
    },
    ...[3, 5].map((choiceCount) => ({
      name: `${choiceCount}-choice questions`,
      parse: parseWordGameManifest,
      sourcePath: categorySourcePath,
      value: () => {
        const category = validCategory();
        category.tiers[0].quizzes[0].questions[0].choiceIds =
          category.tiers[0].quizzes[0].questions[0].choiceIds.slice(0, choiceCount);
        if (choiceCount === 5) {
          category.tiers[0].quizzes[0].questions[0].choiceIds.push("animal-5");
        }
        return category;
      },
      fieldPath: "tiers[0].quizzes[0].questions[0].choiceIds",
    })),
    {
      name: "targets that are not the first choice",
      parse: parseWordGameManifest,
      sourcePath: categorySourcePath,
      value: () => {
        const category = validCategory();
        const question = category.tiers[0].quizzes[0].questions[0];
        question.targetId = question.choiceIds[1];
        return category;
      },
      fieldPath: "tiers[0].quizzes[0].questions[0].targetId",
    },
    {
      name: "malformed audio IDs",
      parse: parseWordGameManifest,
      sourcePath: categorySourcePath,
      value: () => {
        const category = validCategory();
        category.items[0].audio.id = "word-game-colors-animal-1-label";
        return category;
      },
      fieldPath: "items[0].audio.id",
    },
    {
      name: "retired Noto SVG visuals",
      parse: parseWordGameManifest,
      sourcePath: categorySourcePath,
      value: () => {
        const category = validCategory();
        category.items[0].visual.kind = "noto-svg";
        return category;
      },
      fieldPath: "items[0].visual.kind",
    },
    {
      name: "unsupported visual kinds",
      parse: parseWordGameManifest,
      sourcePath: categorySourcePath,
      value: () => {
        const category = validCategory();
        category.items[0].visual = { kind: "bitmap", src: "/cat.webp" };
        return category;
      },
      fieldPath: "items[0].visual.kind",
    },
  ]) {
    it(`rejects ${name} with its source path and field path`, () => {
      assert.throws(() => parse(value(), sourcePath), errorAt(sourcePath, fieldPath));
    });
  }
});
