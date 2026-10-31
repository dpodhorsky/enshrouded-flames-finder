import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

import { locations } from "./locations.ts";
import { lorePages, loreRegions } from "./lore.ts";
import { readKnowledge } from "./save.ts";

const fixtures = new URL("fixtures/", import.meta.url);

// Knowledge ids of the flame shrines found in fixtures/character0.ksd.
const expectedFoundIds = [
  62057186, 98744454, 165320110, 298017050, 300749593, 474159492, 506394430, 563774187, 601551183, 654257561, 780194091, 795911939, 805046254, 933247311,
  998467702, 1165517057, 1300199041, 1302557524, 1409075416, 1504051331, 1864446768, 1934786452, 2006844891, 2086262577, 2298824156, 2312230310, 2363930928,
  2680496851, 2847136040, 2909259168, 2979201379, 3040022919, 3079831042, 3090900730, 3134136988, 3177880864, 3204653507, 3237784541, 3291487762, 3360510043,
  3447418605, 3477110730, 3694994425, 3729720625, 3835884090, 3900914039, 3961375235, 4124619577, 4269520231, 4287852732,
];

describe("readKnowledge", () => {
  test("CharacterSave", async () => {
    const save = await readFile(new URL("character0.ksd", fixtures));

    const knowledgeIds = readKnowledge(save);
    const foundIds = locations
      .map((location) => location.knowledgeId)
      .filter((knowledgeId) => knowledgeIds.has(knowledgeId))
      .toSorted((first, second) => first - second);

    expect(foundIds).toEqual(expectedFoundIds);
  });

  test("NotASave", () => {
    expect(() => readKnowledge(new Uint8Array(64))).toThrow(new Error("This file is not an Enshrouded save. Select a characterN.ksd file."));
  });

  test("WorldSave", async () => {
    const save = await readFile(new URL("world5.ksd", fixtures));

    expect(() => readKnowledge(save)).toThrow(new Error("This file holds no character knowledge. It can be a world save. Select characterN.ksd."));
  });
});

describe("lore pages", () => {
  test("CharacterSave", async () => {
    const save = await readFile(new URL("character0.ksd", fixtures));

    const knowledgeIds = readKnowledge(save);
    const readPages = lorePages.filter((page) => page.knowledgeId !== null && knowledgeIds.has(page.knowledgeId));

    expect(readPages.length).toBe(290);
  });

  test("EveryPageHasAPlace", () => {
    for (const page of lorePages) {
      expect(page.title).not.toBe("");
      expect(page.east).toBeGreaterThan(0);
      expect(page.north).toBeGreaterThan(0);
      expect(loreRegions).toContain(page.region);
    }
  });
});
