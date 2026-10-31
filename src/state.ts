import { batch, computed, signal } from "@preact/signals";

import { orderedLocations, shortName, type LocationKind } from "./locations.ts";
import { lorePages, type LorePage } from "./lore.ts";
import { readKnowledge } from "./save.ts";
import { flyTo, toMapX, toMapY, view } from "./viewport.ts";

export type LocationState = "unknown" | "found" | "missing";
export type ListMode = "missing" | "all";
export type Layer = "flames" | "lore";

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

export const pinsOf = (layer: Layer) => (layer === "flames" ? flamePins : lorePins);

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

export const foundIds = signal<ReadonlySet<number> | null>(storedSave?.ids ?? null);
export const saveTracksLore = signal(storedSave?.tracksLore ?? false);
export const activeLayer = signal<Layer>("flames");
export const selectedPin = signal<Pin | null>(null);
export const errorMessage = signal("");
export const listMode = signal<ListMode>("all");
export const loreQuery = signal("");
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
  !query || [pin.title, pin.group, pin.page?.collection ?? ""].some((text) => text.toLowerCase().includes(query));

export function isShown(pin: Pin) {
  if (pin.layer !== activeLayer.value || (listMode.value === "missing" && stateOf(pin) === "found")) {
    return false;
  }

  return pin.layer === "flames" ? visibleKinds.value[pin.kind!] : matchesQuery(pin, loreQuery.value.trim().toLowerCase());
}

export const activePins = computed(() => pinsOf(activeLayer.value));

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
      width: Math.min(view.peek().width, pin.layer === "lore" ? 1400 : 2200),
    });
  }
}

export function setLayer(layer: Layer) {
  batch(() => {
    activeLayer.value = layer;
    selectedPin.value = null;
  });
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
    const knowledgeIds = readKnowledge(new Uint8Array(await file.arrayBuffer()));
    const ids = new Set([...trackedIds].filter((id) => knowledgeIds.has(id)));

    batch(() => {
      foundIds.value = ids;
      saveTracksLore.value = true;
      selectedPin.value = null;
    });

    try {
      localStorage.setItem(foundStorageKey, JSON.stringify([...ids]));
      localStorage.setItem(loreStorageKey, "1");
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
  });

  try {
    localStorage.removeItem(foundStorageKey);
    localStorage.removeItem(loreStorageKey);
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
