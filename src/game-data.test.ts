import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

import { gamePlaces } from "./game-places.ts";
import { gameLorePages } from "./game/lore.ts";
import { journalLorePages, unplacedLorePages } from "./journal-lore.ts";
import { loreRegions } from "./lore.ts";
import { questProgress, quests } from "./quest-progress.ts";
import { holds } from "./requirement.ts";
import { readKnowledge, readWorldKnowledge, saveKind } from "./save.ts";

const fixtures = new URL("fixtures/", import.meta.url);
const characterKnowledge = async () => readKnowledge(await readFile(new URL("character0.ksd", fixtures)));

describe("saves", () => {
  test("Kinds", async () => {
    expect(saveKind(await readFile(new URL("character0.ksd", fixtures)))).toBe("character");
    expect(saveKind(await readFile(new URL("world5.ksd", fixtures)))).toBe("world");
  });

  test("KnowledgeKeepsValues", async () => {
    const known = await characterKnowledge();
    expect(known.size).toBeGreaterThan(0);
    expect([...known.values()].some((value) => value > 1)).toBe(true);
  });

  test("EmptyWorldKnowledge", async () => {
    // The fixture world's blocks are empty.
    expect(readWorldKnowledge(await readFile(new URL("world5.ksd", fixtures))).size).toBe(0);
  });
});

describe("holds", () => {
  const known = new Map([
    [1, 1],
    [2, 0b101],
    [3, 4],
  ]);

  test("Flags", () => {
    expect(holds({ k: 1, flag: 1 }, known, null)).toBe(true);
    expect(holds({ k: 2, flag: 0b100 }, known, null)).toBe(true);
    expect(holds({ k: 2, flag: 0b010 }, known, null)).toBe(false);
    expect(holds({ k: 9, flag: 1 }, known, null)).toBe(false);
  });

  test("Counts", () => {
    expect(holds({ k: 3, count: ["GreaterThan", 3] }, known, null)).toBe(true);
    expect(holds({ k: 9, count: ["Equals", 0] }, known, null)).toBe(true);
  });

  test("UnknownChecksStayUnknown", () => {
    expect(holds({ other: "Npc" }, known, null)).toBeNull();
    expect(holds({ all: [{ k: 1, flag: 1 }, { other: "Npc" }] }, known, null)).toBeNull();
    expect(holds({ all: [{ k: 9, flag: 1 }, { other: "Npc" }] }, known, null)).toBe(false);
    expect(holds({ any: [{ k: 1, flag: 1 }, { other: "Npc" }] }, known, null)).toBe(true);
    expect(holds({ not: { other: "Npc" } }, known, null)).toBeNull();
    expect(holds({ k: 1, flag: 1, world: true }, known, null)).toBeNull();
  });
});

describe("journal lore", () => {
  test("EveryPlacedPageIsListed", () => {
    expect(journalLorePages.length + unplacedLorePages.length).toBe(gameLorePages.length);
    // The game marks three Revelwood pages read with one id, and two Scavenger pages with another.
    const shared = [...Map.groupBy(journalLorePages, (page) => page.knowledgeId)].filter(([, pages]) => pages.length > 1).map(([id]) => id);
    expect(shared.toSorted((first, second) => first! - second!)).toEqual([972589686, 2480636583]);
    for (const page of journalLorePages) {
      expect(loreRegions).toContain(page.region);
      expect(page.east).toBeGreaterThan(0);
      expect(page.north).toBeGreaterThan(0);
    }
  });

  test("CharacterSave", async () => {
    const known = await characterKnowledge();
    // The community ids found 290 of these pages read.
    expect(journalLorePages.filter((page) => known.has(page.knowledgeId!)).length).toBe(324);
  });
});

describe("quests", () => {
  test("CharacterSave", async () => {
    const known = await characterKnowledge();
    const states = quests.map((quest) => questProgress(quest, known, null).state);
    expect(states.filter((state) => state === "done").length).toBe(110);
  });

  test("EmptySave", () => {
    // Flame Altar and Mother Flame checks pass only together with knowledge, so a new character has started nothing.
    expect(quests.every((quest) => questProgress(quest, new Map(), null).state === "open")).toBe(true);
  });

  test("LaterStepShownMeansDone", () => {
    const quest = {
      id: 1,
      name: "Test",
      type: "PlayerQuest",
      main: false,
      giver: "",
      steps: [
        { name: "First", shown: { k: 1, flag: 1 }, done: { other: "Npc" } },
        { name: "Second", shown: { k: 2, flag: 1 }, done: { k: 3, flag: 1 } },
      ],
    };
    expect(questProgress(quest, new Map([[1, 1]]), null)).toEqual({ state: "active", steps: ["active", "locked"] });
    expect(
      questProgress(
        quest,
        new Map([
          [1, 1],
          [2, 1],
        ]),
        null,
      ),
    ).toEqual({ state: "active", steps: ["done", "active"] });
    expect(questProgress(quest, new Map([[3, 1]]), null).state).toBe("done");
    expect(questProgress(quest, new Map(), null)).toEqual({ state: "open", steps: ["locked", "locked"] });
  });
});

describe("discoveries", () => {
  test("CharacterSave", async () => {
    const known = await characterKnowledge();
    expect(gamePlaces.length).toBe(364);
    expect(gamePlaces.filter((place) => holds(place.discovered, known, null)).length).toBe(264);
  });
});
