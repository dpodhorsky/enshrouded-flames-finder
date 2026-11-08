import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

import { readCustomMarkers } from "./character.ts";
import { markerColors, markerTypes } from "./custom-markers.tsx";
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

describe("custom markers", () => {
  // character_data as the game writes it: a byte, a storage tag, the name, 50 bytes of other data, then the markers.
  function characterData(name: string, markers: { east: number; height: number; north: number; color: number; icon: number; label: string }[]) {
    const nameBytes = new TextEncoder().encode(name);
    const parts: number[] = [2, 0, 0, 0, 0, ...new Uint8Array(new Uint32Array([nameBytes.length]).buffer), ...nameBytes, ...new Array(50).fill(0)];
    parts.push(...new Uint8Array(new Uint32Array([markers.length]).buffer));
    for (const marker of markers) {
      const fixed = new DataView(new ArrayBuffer(24));
      fixed.setBigInt64(0, BigInt(Math.round(marker.east * 2 ** 32)), true);
      fixed.setBigInt64(8, BigInt(Math.round(marker.height * 2 ** 32)), true);
      fixed.setBigInt64(16, BigInt(Math.round(marker.north * 2 ** 32)), true);
      const label = new TextEncoder().encode(marker.label);
      parts.push(...new Uint8Array(fixed.buffer), marker.color, ...new Uint8Array(new Uint32Array([marker.icon]).buffer), label.length, ...label);
    }
    parts.push(0x3d, 0, 0, 0);
    return new Uint8Array(parts);
  }

  test("Reads", () => {
    const data = characterData("Lando", [
      { east: 4123.4, height: 0, north: 2768.89, color: 6, icon: 0xfe2fd02d, label: "Fish" },
      { east: 3829.72, height: 12.5, north: 6182.44, color: 0, icon: 0x5eba3084, label: "" },
    ]);
    const markers = readCustomMarkers(data);
    expect(markers.map((marker) => marker.label)).toEqual(["Fish", ""]);
    expect(markers[0]!.east).toBeCloseTo(4123.4, 3);
    expect(markers[0]!.north).toBeCloseTo(2768.89, 3);
    expect(markers[0]!.color).toBe(6);
    expect(markers[0]!.icon).toBe(0xfe2fd02d);
    expect(markerTypes.find((type) => type.id === markers[0]!.icon)?.name).toBe("Fish");
  });

  test("UnknownLayoutGivesNone", () => {
    expect(readCustomMarkers(new Uint8Array(40))).toEqual([]);
    const data = characterData("Lando", [{ east: 4000, height: 0, north: 3000, color: 1, icon: 0x5eba3084, label: "x" }]);
    data[9 + 5 + 50] = 0xff; // a count far beyond the data
    expect(readCustomMarkers(data)).toEqual([]);
  });

  test("EveryColourHasAScheme", () => {
    expect(markerColors).toHaveLength(8);
    expect(markerTypes).toHaveLength(10);
  });
});
