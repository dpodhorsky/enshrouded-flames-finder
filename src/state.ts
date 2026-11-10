import { batch, computed, signal } from "@preact/signals";

import { readCharacterName, readCustomMarkers, readLevel, readPlayerCharacter, type Character, type ItemRecord } from "./character.ts";
import type { Requirement } from "./game/requirement.ts";
import { journalLorePages, loreCategories } from "./journal-lore.ts";
import { orderedLocations, shortName, type LocationKind } from "./locations.ts";
import { loreRegions, type LorePage } from "./lore.ts";
import type { PlaceType } from "./places.ts";
import { holds, type Knowledge } from "./requirement.ts";
import { fogSize, readBlock, readFog, readKnowledge, readWorldKnowledge, saveKind } from "./save.ts";
import { flyTo, toMapX, toMapY, view } from "./viewport.ts";

export type LocationState = "unknown" | "found" | "missing";
export type ListMode = "missing" | "all";
export type Layer = "flames" | "lore" | "places" | "quests";
export type LoreGrouping = "region" | "journal";

// A pin is one marker on the map and one row in the list.
export type Pin = {
  readonly key: string;
  readonly layer: Layer;
  readonly knowledgeId: number | null;
  // For a place from the game's map markers: the rule that marks it discovered.
  readonly discovered?: Requirement;
  readonly title: string;
  readonly group: string;
  readonly east: number;
  readonly north: number;
  readonly altitude: number;
  readonly kind?: LocationKind;
  readonly page?: LorePage;
  readonly place?: Place;
};

export type Place = {
  readonly type: PlaceType;
  readonly iconUrl: string;
  readonly description: string;
  readonly region: string;
  readonly level: number;
};

export const flamePins: readonly Pin[] = orderedLocations.map((location) => ({
  key: `flame-${location.knowledgeId}`,
  layer: "flames",
  knowledgeId: location.knowledgeId,
  title: shortName(location),
  group: location.region,
  east: location.east,
  north: location.north,
  altitude: location.altitude,
  kind: location.kind,
}));

export const lorePins: readonly Pin[] = journalLorePages.map((page, index) => ({
  key: `lore-${index}`,
  layer: "lore",
  knowledgeId: page.knowledgeId,
  title: page.title,
  group: page.category,
  east: page.east,
  north: page.north,
  altitude: page.altitude,
  page,
}));

// Places load on demand: the list holds about 4,600 points and 40 icons. The game's map markers come first, so zoomed out they
// win the spots they share with community places.
export const placePins = signal<readonly Pin[] | null>(null);
export const visiblePlaceTypes = signal<ReadonlySet<string>>(new Set());
let placesLoading: Promise<void> | null = null;

export function loadPlaces() {
  placesLoading ??= Promise.all([import("./places.ts"), import("./place-icons.ts"), import("./game-places.ts")]).then(
    ([{ placeRegions, placeRows, placeTypes }, { placeIconUrl }, { gamePlaces, gamePlaceTypes }]) => {
      const discoveries = gamePlaces.map((place, index): Pin => ({
        key: `discovery-${index}`,
        layer: "places",
        knowledgeId: null,
        discovered: place.discovered,
        title: place.title,
        group: place.type.label,
        east: place.east,
        north: place.north,
        altitude: place.altitude,
        place: { type: place.type, iconUrl: placeIconUrl(place.icon), description: "", region: place.region, level: 0 },
      }));
      const community = placeRows.map(([typeIndex, title, description, east, north, altitude, regionIndex, level], index): Pin => {
        const type = placeTypes[typeIndex]!;
        return {
          key: `place-${index}`,
          layer: "places",
          knowledgeId: null,
          title,
          group: type.label,
          east,
          north,
          altitude,
          place: { type, iconUrl: placeIconUrl(type.icon), description, region: placeRegions[regionIndex] ?? "", level },
        };
      });

      batch(() => {
        placePins.value = [...discoveries, ...community];
        visiblePlaceTypes.value = new Set([...gamePlaceTypes, ...placeTypes].filter((type) => type.shownByDefault).map((type) => type.id));
      });
    },
  );

  return placesLoading;
}

export const pinsOf = (layer: Layer) =>
  layer === "flames" ? flamePins : layer === "lore" ? lorePins : layer === "places" ? (placePins.value ?? []) : ([] as readonly Pin[]);

// The save is kept in localStorage: the character's knowledge as [id, value] pairs, and the world's when one is loaded.
// Saves stored by earlier versions of the page hold the found flame and lore ids under "found". Those still show flames; lore,
// places and quests wait until the save loads again.
const knowledgeStorageKey = "knowledge";
const worldStorageKey = "world-knowledge";
const worldNameStorageKey = "world-name";
const legacyStorageKeys = ["found", "lore-tracked"];

function readStoredPairs(key: string): Map<number, number> | null {
  try {
    const pairs: unknown = JSON.parse(localStorage.getItem(key) ?? "null");
    if (Array.isArray(pairs)) {
      return new Map(pairs.filter((pair): pair is [number, number] => Array.isArray(pair) && typeof pair[0] === "number" && typeof pair[1] === "number"));
    }
  } catch {
    // Private windows and blocked storage throw here. The page then starts with no save.
  }
  return null;
}

function readStoredKnowledge(): { knowledge: Map<number, number>; current: boolean } | null {
  const knowledge = readStoredPairs(knowledgeStorageKey);
  if (knowledge) {
    return { knowledge, current: true };
  }

  try {
    const ids: unknown = JSON.parse(localStorage.getItem("found") ?? "null");
    if (Array.isArray(ids)) {
      return { knowledge: new Map(ids.filter((id) => typeof id === "number").map((id) => [id, 1])), current: false };
    }
  } catch {
    // As above.
  }
  return null;
}

function readStoredText(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

const storedKnowledge = readStoredKnowledge();

// The explored grid is kept as a PNG data URL: the raw grid is 1.6 MB, the PNG a small part of it.
const fogStorageKey = "fog";

// The character is kept as JSON. Its Equipped map is stored as [position, item] pairs.
const characterStorageKey = "character";

type StoredCharacter = Omit<Character, "equipped"> & { equipped: [number, ItemRecord][] };

function readStoredCharacter(): Character | null {
  try {
    const stored = JSON.parse(localStorage.getItem(characterStorageKey) ?? "null") as StoredCharacter | null;
    return stored && Array.isArray(stored.equipped) ? { ...stored, equipped: new Map(stored.equipped) } : null;
  } catch {
    return null;
  }
}

// A character the page cannot read still loads its flames, lore and fog; the panel then says why it is empty.
function readCharacter(save: Uint8Array): { character: Character | null; error: string } {
  try {
    const data = readBlock(save, "character_data");
    const player = readBlock(save, "player_character");
    if (!data || !player) {
      return { character: null, error: "This save has no character data." };
    }
    return { character: { name: readCharacterName(data), ...readPlayerCharacter(player), markers: readCustomMarkers(data) }, error: "" };
  } catch (error) {
    return { character: null, error: error instanceof Error ? error.message : String(error) };
  }
}

// Item names load with the character panel.
export const itemNames = signal<Readonly<Record<number, string>> | null>(null);
let itemNamesLoading: Promise<void> | null = null;

export function loadItemNames() {
  itemNamesLoading ??= import("./items.ts").then((module) => {
    itemNames.value = module.itemNames;
  });
  return itemNamesLoading;
}

// Unexplored cells are dark and explored cells clear, with the grid's soft edges kept.
function fogImage(grid: Uint8Array) {
  const canvas = document.createElement("canvas");
  canvas.width = fogSize;
  canvas.height = fogSize;
  const context = canvas.getContext("2d")!;
  const image = context.createImageData(fogSize, fogSize);

  for (let cell = 0; cell < grid.length; cell++) {
    image.data[cell * 4] = 12;
    image.data[cell * 4 + 1] = 14;
    image.data[cell * 4 + 2] = 20;
    image.data[cell * 4 + 3] = Math.round((255 - grid[cell]!) * 0.72);
  }

  context.putImageData(image, 0, 0);
  return canvas.toDataURL("image/png");
}

// The character's knowledge, id to value. null until a character save loads.
export const knowledge = signal<Knowledge | null>(storedKnowledge?.knowledge ?? null);
// false for a save stored by an earlier version of the page, which kept only flame and lore ids.
export const knowledgeIsCurrent = signal(storedKnowledge?.current ?? false);
export const worldKnowledge = signal<Knowledge | null>(readStoredPairs(worldStorageKey));
export const worldName = signal(readStoredText(worldNameStorageKey) ?? "");

// Every character loaded, so the Quests tab can compare them. The character loaded last on its own (or first, when several load
// at once) is also the active one that the map, the fog and the character panel show. Stored as { key, file, name, level, pairs }.
export type SavedCharacter = {
  readonly key: string;
  readonly file: string;
  readonly name: string;
  readonly level: number | null;
  readonly knowledge: Knowledge;
};
const charactersStorageKey = "characters";

function readStoredCharacters(): SavedCharacter[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(charactersStorageKey) ?? "null");
    if (Array.isArray(stored)) {
      return stored.flatMap((entry) =>
        entry && typeof entry.key === "string" && Array.isArray(entry.pairs)
          ? [
              {
                key: entry.key,
                file: String(entry.file ?? ""),
                name: String(entry.name ?? "Character"),
                level: typeof entry.level === "number" ? entry.level : null,
                knowledge: new Map<number, number>(entry.pairs),
              },
            ]
          : [],
      );
    }
  } catch {
    // As for the other stored data.
  }
  return [];
}

export const savedCharacters = signal<readonly SavedCharacter[]>(readStoredCharacters());

function storeCharacters(list: readonly SavedCharacter[]) {
  store(() =>
    localStorage.setItem(
      charactersStorageKey,
      JSON.stringify(list.map(({ key, file, name, level, knowledge: known }) => ({ key, file, name, level, pairs: [...known] }))),
    ),
  );
}

// The name and level, read on their own: they come first, so they read even when the rest of the character does not.
function nameAndLevel(save: Uint8Array) {
  let name: string | null = null;
  let level: number | null = null;
  try {
    const data = readBlock(save, "character_data");
    name = data ? readCharacterName(data) : null;
  } catch {
    // Unknown layout: the file name stands in.
  }
  try {
    const player = readBlock(save, "player_character");
    level = player ? readLevel(player) : null;
  } catch {
    // As above.
  }
  return { name, level };
}

// A character read from a save, added to the list or replacing the entry from the same file.
function rememberCharacter(file: string, known: Knowledge, save: Uint8Array) {
  const { name, level } = nameAndLevel(save);
  const entry: SavedCharacter = { key: file, file, name: name ?? file.replace(/\.ksd$/i, ""), level, knowledge: known };
  const list = [...savedCharacters.peek().filter((each) => each.key !== entry.key), entry].toSorted((a, b) =>
    a.file.localeCompare(b.file, "en", { numeric: true }),
  );
  savedCharacters.value = list;
  storeCharacters(list);
}

export function forgetCharacter(key: string) {
  const list = savedCharacters.peek().filter((each) => each.key !== key);
  savedCharacters.value = list;
  storeCharacters(list);
}
export const hasSave = computed(() => knowledge.value !== null);
export const fogUrl = signal<string | null>(storedKnowledge ? readStoredText(fogStorageKey) : null);
export const character = signal<Character | null>(storedKnowledge ? readStoredCharacter() : null);
export const characterError = signal("");
export const showFog = signal(true);
export const activeLayer = signal<Layer>("flames");
export const selectedPin = signal<Pin | null>(null);
export const errorMessage = signal("");
export const listMode = signal<ListMode>("all");
export const searchQuery = signal("");
export const loreGrouping = signal<LoreGrouping>("region");
export const visibleKinds = signal<Record<LocationKind, boolean>>({
  shrine: true,
  sanctum: true,
});

export function stateOf(pin: Pin): LocationState {
  const known = knowledge.value;
  if (!known || (pin.layer !== "flames" && !knowledgeIsCurrent.value)) {
    return "unknown";
  }

  if (pin.discovered) {
    const result = holds(pin.discovered, known, null);
    return result === null ? "unknown" : result ? "found" : "missing";
  }

  if (pin.knowledgeId === null) {
    return "unknown";
  }

  return known.has(pin.knowledgeId) ? "found" : "missing";
}

const matchesQuery = (pin: Pin, query: string) =>
  !query ||
  [pin.title, pin.group, pin.page?.region ?? "", pin.page?.collection ?? "", pin.place?.region ?? "", pin.place?.description ?? ""].some((text) =>
    text.toLowerCase().includes(query),
  );

export function isShown(pin: Pin) {
  if (pin.layer !== activeLayer.value || (listMode.value === "missing" && stateOf(pin) === "found")) {
    return false;
  }

  if (pin.layer === "flames") {
    return visibleKinds.value[pin.kind!];
  }

  return (pin.layer === "lore" || visiblePlaceTypes.value.has(pin.place!.type.id)) && matchesQuery(pin, searchQuery.value.trim().toLowerCase());
}

// Flames group by region. Lore groups by region or by the journal category the game files it under.
export const groupOf = (pin: Pin) => (pin.page && loreGrouping.value === "region" ? pin.page.region : pin.group);

const groupOrder = (pin: Pin) =>
  pin.page ? (loreGrouping.value === "region" ? (loreRegions as readonly string[]).indexOf(pin.page.region) : loreCategories.indexOf(pin.page.category)) : 0;

export const activePins = computed(() => {
  const pins = pinsOf(activeLayer.value);
  return activeLayer.value === "lore" ? pins.toSorted((first, second) => groupOrder(first) - groupOrder(second)) : pins;
});

export const shownPins = computed(() => activePins.value.filter(isShown));

export const stepPins = computed(() => shownPins.value.filter((pin) => stateOf(pin) !== "found"));

export const foundCount = computed(() => activePins.value.filter((pin) => stateOf(pin) === "found").length);

// Pins a save can check: flames and lore pages by id, game map markers by rule.
export const checkableCount = computed(() => activePins.value.filter((pin) => pin.knowledgeId !== null || pin.discovered).length);

export function selectPin(pin: Pin | null, fly: boolean) {
  selectedPin.value = pin;

  if (fly && pin) {
    flyTo({
      centerX: toMapX(pin.east),
      centerY: toMapY(pin.north),
      width: Math.min(view.peek().width, pin.layer === "flames" ? 2200 : 1400),
    });
  }
}

export function setLayer(layer: Layer) {
  batch(() => {
    activeLayer.value = layer;
    selectedPin.value = null;
    searchQuery.value = "";
  });

  if (layer === "places") {
    void loadPlaces();
  }
}

export function stepBy(direction: 1 | -1) {
  const steps = stepPins.value;
  if (!steps.length) {
    return;
  }

  const selected = selectedPin.value;
  const position = selected ? steps.indexOf(selected) : -1;
  const nextIndex = position < 0 ? (direction > 0 ? 0 : steps.length - 1) : (position + direction + steps.length) % steps.length;

  selectPin(steps[nextIndex]!, true);
}

function store(write: () => void) {
  try {
    write();
  } catch {
    // Blocked or full storage only stops the save from loading again on the next visit.
  }
}

function loadCharacterSave(save: Uint8Array, file: string) {
  const known = readKnowledge(save);
  const grid = readFog(save);
  const fog = grid ? fogImage(grid) : null;
  const read = readCharacter(save);
  rememberCharacter(file, known, save);

  batch(() => {
    knowledge.value = known;
    knowledgeIsCurrent.value = true;
    fogUrl.value = fog;
    character.value = read.character;
    characterError.value = read.error;
    selectedPin.value = null;
  });

  store(() => {
    for (const key of legacyStorageKeys) {
      localStorage.removeItem(key);
    }
    localStorage.setItem(knowledgeStorageKey, JSON.stringify([...known]));
    if (read.character) {
      localStorage.setItem(characterStorageKey, JSON.stringify({ ...read.character, equipped: [...read.character.equipped] }));
    } else {
      localStorage.removeItem(characterStorageKey);
    }
    if (fog) {
      localStorage.setItem(fogStorageKey, fog);
    } else {
      localStorage.removeItem(fogStorageKey);
    }
  });
}

function loadWorldSave(save: Uint8Array, name: string) {
  const known = readWorldKnowledge(save);

  batch(() => {
    worldKnowledge.value = known;
    worldName.value = name;
  });

  store(() => {
    localStorage.setItem(worldStorageKey, JSON.stringify([...known]));
    localStorage.setItem(worldNameStorageKey, name);
  });
}

// Loads a character save, a world save, or one of each. A world save adds the world's quests to the character's.
export async function loadSaves(files: readonly File[]) {
  errorMessage.value = "";

  try {
    const saves = await Promise.all(files.map(async (file) => ({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) })));
    const kinds = saves.map((save) => saveKind(save.bytes));
    const unknown = saves.find((_, index) => kinds[index] === null);
    if (unknown) {
      throw new Error(`${unknown.name} holds neither character nor world knowledge. Select characterN.ksd, and worldN.ksd for world quests.`);
    }

    const characterSaves = saves.filter((_, index) => kinds[index] === "character");
    const worldSave = saves.find((_, index) => kinds[index] === "world");
    // Every character is remembered for the Quests tab; the first one becomes the active character.
    for (const extra of characterSaves.slice(1)) {
      rememberCharacter(extra.name, readKnowledge(extra.bytes), extra.bytes);
    }
    if (characterSaves[0]) {
      loadCharacterSave(characterSaves[0].bytes, characterSaves[0].name);
    }
    if (worldSave) {
      loadWorldSave(worldSave.bytes, worldSave.name);
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error);
  }
}

export function forgetSave() {
  batch(() => {
    knowledge.value = null;
    knowledgeIsCurrent.value = false;
    worldKnowledge.value = null;
    worldName.value = "";
    fogUrl.value = null;
    character.value = null;
    characterError.value = "";
    savedCharacters.value = [];
  });

  store(() => {
    for (const key of [
      knowledgeStorageKey,
      worldStorageKey,
      worldNameStorageKey,
      fogStorageKey,
      characterStorageKey,
      charactersStorageKey,
      ...legacyStorageKeys,
    ]) {
      localStorage.removeItem(key);
    }
  });
}

export function pickSaveFile() {
  const input = document.createElement("input");

  input.type = "file";
  input.accept = ".ksd";
  input.multiple = true;
  input.addEventListener("change", () => {
    if (input.files?.length) {
      void loadSaves([...input.files]);
    }
  });
  input.click();
}
