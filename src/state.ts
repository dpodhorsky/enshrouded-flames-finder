import { batch, computed, signal } from "@preact/signals";

import { readCharacterName, readPlayerCharacter, type Character, type ItemRecord } from "./character.ts";
import { orderedLocations, shortName, type LocationKind } from "./locations.ts";
import { loreCategories, lorePages, loreRegions, type LorePage } from "./lore.ts";
import type { PlaceType } from "./places.ts";
import { fogSize, readBlock, readFog, readKnowledge } from "./save.ts";
import { flyTo, toMapX, toMapY, view } from "./viewport.ts";

export type LocationState = "unknown" | "found" | "missing";
export type ListMode = "missing" | "all";
export type Layer = "flames" | "lore" | "places";
export type LoreGrouping = "region" | "journal";

// A pin is one marker on the map and one row in the list.
export type Pin = {
  readonly key: string;
  readonly layer: Layer;
  readonly knowledgeId: number | null;
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

export const lorePins: readonly Pin[] = lorePages.map((page, index) => ({
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

// Places load on demand: the list holds about 4,000 points and 40 icons.
export const placePins = signal<readonly Pin[] | null>(null);
export const visiblePlaceTypes = signal<ReadonlySet<string>>(new Set());
let placesLoading: Promise<void> | null = null;

export function loadPlaces() {
  placesLoading ??= Promise.all([import("./places.ts"), import("./place-icons.ts")]).then(([{ placeRegions, placeRows, placeTypes }, { placeIconUrl }]) => {
    const pins = placeRows.map(([typeIndex, title, description, east, north, altitude, regionIndex, level], index): Pin => {
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
      placePins.value = pins;
      visiblePlaceTypes.value = new Set(placeTypes.filter((type) => type.shownByDefault).map((type) => type.id));
    });
  });

  return placesLoading;
}

export const pinsOf = (layer: Layer) => (layer === "flames" ? flamePins : layer === "lore" ? lorePins : (placePins.value ?? []));

const trackedIds = new Set([...flamePins, ...lorePins].flatMap((pin) => (pin.knowledgeId === null ? [] : [pin.knowledgeId])));

const foundStorageKey = "found";
// Saves stored before lore tracking hold flame ids only. Lore pages stay "unknown" until the save loads again.
const loreStorageKey = "lore-tracked";

function readStoredSave() {
  try {
    const storedIds: unknown = JSON.parse(localStorage.getItem(foundStorageKey) ?? "null");
    if (Array.isArray(storedIds)) {
      return {
        ids: new Set(storedIds.filter((id) => typeof id === "number")),
        tracksLore: localStorage.getItem(loreStorageKey) === "1",
      };
    }
  } catch {
    // Private windows and blocked storage throw here. The page then starts with no save.
  }

  return null;
}

const storedSave = readStoredSave();

// The explored grid is kept as a PNG data URL: the raw grid is 1.6 MB, the PNG a small part of it.
const fogStorageKey = "fog";

function readStoredFog() {
  try {
    return localStorage.getItem(fogStorageKey);
  } catch {
    return null;
  }
}

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
    return { character: { name: readCharacterName(data), ...readPlayerCharacter(player) }, error: "" };
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

export const foundIds = signal<ReadonlySet<number> | null>(storedSave?.ids ?? null);
export const saveTracksLore = signal(storedSave?.tracksLore ?? false);
export const fogUrl = signal<string | null>(storedSave ? readStoredFog() : null);
export const character = signal<Character | null>(storedSave ? readStoredCharacter() : null);
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
  const ids = foundIds.value;
  if (!ids || pin.knowledgeId === null || (pin.layer === "lore" && !saveTracksLore.value)) {
    return "unknown";
  }

  return ids.has(pin.knowledgeId) ? "found" : "missing";
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
  pin.page
    ? loreGrouping.value === "region"
      ? (loreRegions as readonly string[]).indexOf(pin.page.region)
      : (loreCategories as readonly string[]).indexOf(pin.page.category)
    : 0;

export const activePins = computed(() => {
  const pins = pinsOf(activeLayer.value);
  return activeLayer.value === "lore" ? pins.toSorted((first, second) => groupOrder(first) - groupOrder(second)) : pins;
});

export const shownPins = computed(() => activePins.value.filter(isShown));

export const stepPins = computed(() => shownPins.value.filter((pin) => stateOf(pin) !== "found"));

export const foundCount = computed(() => activePins.value.filter((pin) => stateOf(pin) === "found").length);

// Pages without a knowledge id never count as found, so the total leaves them out once a save is loaded.
export const checkableCount = computed(() => activePins.value.filter((pin) => pin.knowledgeId !== null).length);

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

export async function loadSave(file: File) {
  errorMessage.value = "";

  try {
    const save = new Uint8Array(await file.arrayBuffer());
    const knowledgeIds = readKnowledge(save);
    const ids = new Set([...trackedIds].filter((id) => knowledgeIds.has(id)));
    const grid = readFog(save);
    const fog = grid ? fogImage(grid) : null;
    const read = readCharacter(save);

    batch(() => {
      foundIds.value = ids;
      saveTracksLore.value = true;
      fogUrl.value = fog;
      character.value = read.character;
      characterError.value = read.error;
      selectedPin.value = null;
    });

    try {
      localStorage.setItem(foundStorageKey, JSON.stringify([...ids]));
      localStorage.setItem(loreStorageKey, "1");
      if (read.character) {
        localStorage.setItem(characterStorageKey, JSON.stringify({ ...read.character, equipped: [...read.character.equipped] }));
      } else {
        localStorage.removeItem(characterStorageKey);
      }
      if (fog) {
        localStorage.setItem(fogStorageKey, fog);
      } else {
        localStorage.removeItem(fogStorageKey);
        localStorage.removeItem(characterStorageKey);
      }
    } catch {
      // Blocked storage only stops the save from loading again on the next visit.
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error);
  }
}

export function forgetSave() {
  batch(() => {
    foundIds.value = null;
    saveTracksLore.value = false;
    fogUrl.value = null;
    character.value = null;
    characterError.value = "";
  });

  try {
    localStorage.removeItem(foundStorageKey);
    localStorage.removeItem(loreStorageKey);
    localStorage.removeItem(fogStorageKey);
  } catch {
    // Blocked storage holds no save to remove.
  }
}

export function pickSaveFile() {
  const input = document.createElement("input");

  input.type = "file";
  input.accept = ".ksd";
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    if (file) {
      void loadSave(file);
    }
  });
  input.click();
}
