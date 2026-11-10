// Builds src/game/*.ts from the Enshrouded game files: skill names, lore pages, map locations and quests, with the knowledge ids
// a save stores for them.
//
// Usage: bun scripts/import-game.ts <unpacked dir> <game dir> [--check <save.ksd>...]
//
// <unpacked dir> is the output of kfc-parser (https://github.com/Brabb3l/kfc-parser, the cli-legacy crate):
//   kfc-parser unpack -g <game dir> -o <unpacked dir>
// It holds one JSON file per game resource, in a folder per type. The English texts are not resources but a content blob in the
// enshrouded_NNN.dat files, so this script reads that blob from <game dir> itself. It only opens game files for reading.
//
// With --check, the script reads the given character and world saves and prints what they hold of the generated data.
//
// How the pieces fit (learned from the game files and the save editor research notes of
// https://github.com/MrAmadis/enshrouded-save-editor, docs/research/kfc-format.md):
// - A loca tag reference (a GUID) has the tag id FNV-1a 32 of the GUID's 16 bytes, in little-endian GUID layout.
//   Journal and skill tree resources store tag ids directly.
// - keen::JournalRegistryResource lists the quests and the lore collections. Each lore page and quest step has a knowledge
//   requirement (when it shows) and a completion requirement. A requirement is a SimpleBool/SimpleFlag test of one knowledge id,
//   or "Extern": a named query of keen::GameKnowledgeQueryResourceDb, an AND/OR tree of knowledge tests and other checks.
// - Placed objects are in keen::SceneEntityChunkResource: entities (template, transform) and spawn data. Spawn entry i belongs to
//   entity i. Its index bytes start with a component count and, when it is not 0, the u16 index of the first component.
//   A position is X1 + X0 / 65536 east, Z1 + Z0 / 65536 north and Y1 + Y0 / 65536 up, in metres.
// - A lore object's template has a keen::ecs::LoreReading component whose entryName is the page's journal name tag.
// - A map marker's template has a keen::ecs::MapMarker component, and keen::ecs::RuntimeMapMarkerUnlockRequirements when the
//   marker is unlocked by knowledge (hint, visible and completed states).
// - Knowledge is set by: NPC dialog lines (keen::ecs::NpcDialog, knowledgeUnlockOperations per line), kills
//   (keen::ecs::KnowledgeTriggerOnKill), collection showcases (keen::ecs::TriggerCollectionCompletionKnowledge), other template
//   components with knowledgeUnlockOperations, placed objects (keen::ecs::SceneKnowledgeTrigger in a chunk's spawn data, context
//   "Interact" or none) and picking up items (an item's id is also its knowledge id).
import { closeSync, mkdirSync, openSync, readdirSync, readFileSync, readSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

import { lorePages as siteLorePages } from "../src/lore.ts";
import { readBlock } from "../src/save.ts";

const [unpacked, gameDir, ...rest] = process.argv.slice(2);
if (!unpacked || !gameDir || (rest.length && rest[0] !== "--check")) {
  throw new Error("Usage: bun scripts/import-game.ts <unpacked dir> <game dir> [--check <save.ksd>...]");
}
const checkSaves = rest.slice(1);

type Json = any;

// The one resource of a type that has a single resource.
const single = (type: string): Json => {
  const files = readdirSync(join(unpacked, type));
  if (files.length !== 1) {
    throw new Error(`Expected one ${type}, found ${files.length}.`);
  }
  return JSON.parse(readFileSync(join(unpacked, type, files[0]!), "utf8"));
};

const fnv1a = (bytes: Uint8Array) => {
  let hash = 0x811c9dc5;
  for (const byte of bytes) {
    hash = Math.imul(hash ^ byte, 0x01000193) >>> 0;
  }
  return hash;
};

// "00112233-4455-6677-8899-aabbccddeeff" in little-endian GUID layout: the first three groups are byte-swapped.
const guidTag = (guid: string | null | undefined) => {
  if (!guid) {
    return 0;
  }
  const hex = guid.replace(/-/g, "");
  const bytes = Uint8Array.from({ length: 16 }, (_, index) => parseInt(hex.slice(2 * index, 2 * index + 2), 16));
  const order = [3, 2, 1, 0, 5, 4, 7, 6, 8, 9, 10, 11, 12, 13, 14, 15];
  return fnv1a(Uint8Array.from(order, (index) => bytes[index]!));
};

// --- English texts --------------------------------------------------------------------------------------------------------

function readContent(hash: { size: number; hash0: number; hash1: number; hash2: number }): Uint8Array {
  const index = readFileSync(join(gameDir!, "enshrouded.kfc"));
  const view = new DataView(index.buffer, index.byteOffset, index.byteLength);
  if (String.fromCharCode(...index.subarray(0, 4)) !== "KFC4") {
    throw new Error("enshrouded.kfc has an unknown layout.");
  }
  // A location is a u32 offset relative to the field itself and a u32 count. 0x48 locates the content keys, 0x50 the values.
  const location = (field: number) => ({ offset: field + view.getUint32(field, true), count: view.getUint32(field + 4, true) });
  const keys = location(0x48);
  const values = location(0x50);
  for (let entry = 0; entry < keys.count; entry++) {
    const key = keys.offset + 16 * entry;
    if (
      view.getUint32(key, true) === hash.size &&
      view.getUint32(key + 4, true) === hash.hash0 &&
      view.getUint32(key + 8, true) === hash.hash1 &&
      view.getUint32(key + 12, true) === hash.hash2
    ) {
      const value = values.offset + 16 * entry;
      const offset = view.getUint32(value, true);
      const container = view.getUint16(value + 6, true);
      const bytes = new Uint8Array(hash.size);
      const file = openSync(join(gameDir!, `enshrouded_${String(container).padStart(3, "0")}.dat`), "r");
      try {
        readSync(file, bytes, 0, hash.size, offset);
      } finally {
        closeSync(file);
      }
      return bytes;
    }
  }
  throw new Error("The English texts are not in enshrouded.kfc.");
}

// keen::LocaTagCollectionResourceData: tags, a blob array of 24-byte keen::LocaTagResource: id, text (blob string), arguments,
// genericArguments. Blob offsets are relative to the offset field.
function readEnglish(): Map<number, string> {
  const collection = single("LocaTagCollectionResource");
  const english = collection.languages.find((language: Json) => language.language === "En_Us")?.data ?? collection.keenglishData;
  const data = readContent(english.hash);
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const tagsOffset = view.getUint32(0, true);
  const tagCount = view.getUint32(4, true);
  const decoder = new TextDecoder();
  const texts = new Map<number, string>();
  for (let tag = 0; tag < tagCount; tag++) {
    const record = tagsOffset + 24 * tag;
    const textField = record + 4;
    const textOffset = textField + view.getUint32(textField, true);
    texts.set(view.getUint32(record, true), decoder.decode(data.subarray(textOffset, textOffset + view.getUint32(textField + 4, true))));
  }
  return texts;
}

const english = readEnglish();
// Texts carry markup such as <npc>…</npc> and <b>; the page shows plain text.
const text = (id: number | undefined) => (english.get(id ?? 0) ?? "").replace(/<[^>]*>/g, "").trim();

// --- Knowledge and requirements -------------------------------------------------------------------------------------------

const knowledge = single("GameKnowledgeResource");
const playerIds = new Set<number>(knowledge.playerKnowledge.keys.map((key: Json) => key.id.value));
const worldIds = new Set<number>(knowledge.worldKnowledge.keys.map((key: Json) => key.id.value));
const queries = new Map<number, Json>(single("GameKnowledgeQueryResourceDb").queries.map((query: Json) => [query.queryId.id.value, query]));

// A requirement as the page tests it against a save:
// - { k, flag } holds when the save knows k and its value has every bit of flag (a Bool is the flag 1);
// - { k, count: [op, n] } compares the value of k with n;
// - all / any / not combine requirements;
// - { other } is a check the save's knowledge cannot answer (Mother Flame level, an NPC's state, the inventory, …).
// "world" marks ids of the world registry: a world save holds them, not the character save.
type Requirement =
  | { readonly k: number; readonly flag: number; readonly world?: true }
  | { readonly k: number; readonly count: readonly [string, number]; readonly world?: true }
  | { readonly all: readonly Requirement[] }
  | { readonly any: readonly Requirement[] }
  | { readonly not: Requirement }
  | { readonly other: string; readonly detail?: string };

const leaf = (id: number, extra: object): Requirement =>
  ({ k: id, ...extra, ...(worldIds.has(id) && !playerIds.has(id) ? { world: true as const } : {}) }) as Requirement;

function requirement(query: Json, depth = 0): Requirement | null {
  const id: number = query.knowledgeOrQueryId.value;
  switch (query.type) {
    case "SimpleBool":
    case "SimpleFlag":
      if (query.compareOperator !== "Equals") {
        return { other: `${query.type} ${query.compareOperator}` };
      }
      return id ? leaf(id, { flag: query.compareValue }) : null;
    case "SimpleCount":
      return leaf(id, { count: [query.compareOperator, query.compareValue] });
    case "Extern": {
      const named = queries.get(id);
      if (!id || !named) {
        return null;
      }
      if (depth > 16) {
        throw new Error(`Query ${named.name} nests too deep.`);
      }
      const parts = named.actions.map((action: Json): Requirement => {
        const inner =
          action.type === "Knowledge" || action.type === "Query"
            ? requirement(action.query, depth + 1)
            : { other: action.type, ...(action.name ? { detail: action.name } : {}) };
        const result = inner ?? { other: "empty" };
        return action.invertResult ? { not: result } : result;
      });
      const combined: Requirement =
        named.type === "XOR" ? { other: "XOR" } : parts.length === 1 ? parts[0]! : named.type === "OR" ? { any: parts } : { all: parts };
      return named.invertResult ? { not: combined } : combined;
    }
    default:
      return { other: query.type };
  }
}

// --- Templates and placed objects -----------------------------------------------------------------------------------------

type Template = { readonly name: string; readonly components: Map<string, Json> };
const templates = new Map<string, Template>();
for (const file of readdirSync(join(unpacked, "TemplateResource"))) {
  const raw = readFileSync(join(unpacked, "TemplateResource", file), "utf8");
  if (!raw.includes('"keen::ecs::LoreReading"') && !raw.includes('"keen::ecs::MapMarker"') && !raw.includes("nowledgeUnlockOperation")) {
    continue;
  }
  const template = JSON.parse(raw);
  templates.set(template.$guid, {
    name: template.name,
    components: new Map(template.components.map((component: Json) => [component.$type, component.$value])),
  });
}

type Placed = {
  readonly template: string;
  readonly east: number;
  readonly north: number;
  readonly altitude: number;
  // Knowledge the object sets when used ("Interact"); the lore pages use these.
  readonly triggers: number[];
  // All knowledge the object sets, with the context: "Interact", or "Invalid" for its default action (opened, reached, …).
  readonly sceneTriggers: { readonly id: number; readonly context: string }[];
};
const placed: Placed[] = [];
for (const file of readdirSync(join(unpacked, "SceneEntityChunkResource")).sort()) {
  const chunk = JSON.parse(readFileSync(join(unpacked, "SceneEntityChunkResource", file), "utf8"));
  const spawn = chunk.spawnData;
  chunk.entities.forEach((entity: Json, index: number) => {
    const template: string = chunk.templates[entity.templateIndex];
    const triggers: number[] = [];
    const sceneTriggers: { id: number; context: string }[] = [];
    const entry = spawn.entries[index];
    if (entry) {
      const count: number = spawn.indices[entry.spawnIndexStart];
      const first = count ? spawn.indices[entry.spawnIndexStart + 1] | (spawn.indices[entry.spawnIndexStart + 2] << 8) : 0;
      for (const component of spawn.components.slice(first, first + count)) {
        if (component.$type === "keen::ecs::SceneKnowledgeTrigger") {
          for (const operation of component.$value.knowledgeUnlockOperations) {
            const id: number = operation.unlockOperation.knowledgeId.id.value;
            if (operation.context !== "Invalid") {
              triggers.push(id);
            }
            if (id) {
              sceneTriggers.push({ id, context: operation.context });
            }
          }
        }
      }
    }
    if (!templates.has(template) && !sceneTriggers.length) {
      return;
    }
    const t = entity.transform;
    placed.push({
      template,
      east: Math.round(t.positionX1 + t.positionX0 / 65536),
      north: Math.round(t.positionZ1 + t.positionZ0 / 65536),
      altitude: Math.round(t.positionY1 + t.positionY0 / 65536),
      triggers,
      sceneTriggers,
    });
  });
}
const placedByTemplate = Map.groupBy(placed, (object) => object.template);
const position = (object: Placed) => [object.east, object.north, object.altitude] as const;

// --- Skills ---------------------------------------------------------------------------------------------------------------

const kinds: Record<string, string> = { Root: "Spark", Attribute: "Attribute", ActiveSkill: "Ability", PassiveSkill: "Passive" };
const skills = single("SkillTreeResource").nodes.map((node: Json) => ({
  id: node.id.value,
  name: text(node.name.value),
  kind: kinds[node.type] ?? node.type,
  maxRank: node.maxLevel === 0 ? 1 : node.maxLevel,
}));

// --- Lore pages -----------------------------------------------------------------------------------------------------------

const journal = single("JournalRegistryResource");

type GamePage = {
  knowledgeId: number;
  title: string;
  collection: string;
  category: string;
  part: number;
  parts: number;
  places: (readonly [number, number, number])[];
};
const gamePages: GamePage[] = [];
const pageByName = new Map<number, GamePage>();
for (const collection of journal.collections) {
  collection.entries.forEach((entry: Json, index: number) => {
    const required = entry.knowledgeRequirement;
    if (required.type !== "SimpleBool" || !required.knowledgeOrQueryId.value) {
      return; // 39 entries show by a query, not by a page of their own; a save cannot mark them read.
    }
    const page: GamePage = {
      knowledgeId: required.knowledgeOrQueryId.value,
      title: text(entry.name.value),
      collection: text(collection.name.value),
      category: text(collection.loreCategory.value),
      part: index + 1,
      parts: collection.entries.length,
      places: [],
    };
    gamePages.push(page);
    pageByName.set(entry.name.value, page);
  });
}
const pageObjects: (Placed & { page: GamePage | undefined })[] = [];
for (const [guid, template] of templates) {
  const reading = template.components.get("keen::ecs::LoreReading");
  if (!reading) {
    continue;
  }
  const page = pageByName.get(guidTag(reading.entryName));
  for (const object of placedByTemplate.get(guid) ?? []) {
    page?.places.push(position(object));
    pageObjects.push({ ...object, page });
  }
}
for (const page of gamePages) {
  page.places.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}

// The site's lore list (src/lore.ts) comes from a community map. For its pages without a knowledge id, find the game page:
// a placed page within 3 m of the same collection and part (any page, when the site names no collection), else the one page of
// the same collection whose title contains the site title's words, else the page of the same collection with the same part and
// part count.
const words = (value: string) =>
  value
    .toLowerCase()
    .replace(/['’]/g, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
const sameText = (a: string, b: string) => words(a).join(" ") === words(b).join(" ");
const containsWords = (title: string, site: string) => {
  const have = new Set(words(title));
  return words(site).every((word) => have.has(word));
};

const siteLoreIds = siteLorePages.flatMap((site) => {
  if (site.knowledgeId !== null) {
    return [];
  }
  const sameCollection = (page: GamePage) => !site.collection || sameText(page.collection, site.collection);
  const near = pageObjects.find(
    (object) =>
      object.page &&
      Math.hypot(object.east - site.east, object.north - site.north) <= 3 &&
      sameCollection(object.page) &&
      (!site.parts || object.page.part === site.part),
  )?.page;
  const inCollection = gamePages.filter((page) => site.collection && sameText(page.collection, site.collection));
  const byWords = inCollection.filter((page) => containsWords(page.title, site.title));
  const byPart = inCollection.filter((page) => page.part === site.part && page.parts === site.parts);
  const page = near ?? (byWords.length === 1 ? byWords[0] : undefined) ?? (byPart.length === 1 ? byPart[0] : undefined);
  return page ? [{ title: site.title, east: site.east, north: site.north, knowledgeId: page.knowledgeId, gameTitle: page.title }] : [];
});

// --- Map locations --------------------------------------------------------------------------------------------------------

const markerTypes = new Map<number, Json>();
{
  const registry = single("MapMarkerRegistryResource").mapMarkers;
  registry.keys.forEach((key: Json, index: number) => markerTypes.set(key.value, registry.values[index]));
}

const mapLocations = [...templates]
  .flatMap(([guid, template]) => {
    const marker = template.components.get("keen::ecs::MapMarker");
    const unlock = template.components.get("keen::ecs::RuntimeMapMarkerUnlockRequirements");
    const objects = placedByTemplate.get(guid) ?? [];
    if (!marker || !unlock || !objects.length) {
      return [];
    }
    const hint = requirement(unlock.hintStateQuery);
    const visible = requirement(unlock.visibleStateQuery);
    const completed = requirement(unlock.completedStateQuery);
    if (!hint && !visible && !completed) {
      return [];
    }
    const type = markerTypes.get(guidTag(marker.markerType));
    const locaTag = template.components.get("keen::ecs::LocaTagComponent")?.locaTag;
    return objects.map((object) => ({
      name: text(guidTag(marker.markerId)) || text(guidTag(locaTag)) || template.name,
      template: template.name,
      category: type?.sortingCategory ?? "",
      east: object.east,
      north: object.north,
      altitude: object.altitude,
      hint,
      visible,
      completed,
    }));
  })
  .sort((a, b) => a.template.localeCompare(b.template) || a.east - b.east || a.north - b.north);

// --- Quests ---------------------------------------------------------------------------------------------------------------

const quests = journal.quests.map((quest: Json) => ({
  id: quest.entryId.value,
  name: text(quest.name.value),
  type: quest.type,
  main: quest.isMainQuest,
  giver: quest.source === "None" ? "" : quest.source,
  steps: quest.entries.map((step: Json) => ({
    name: text(step.name.value),
    shown: requirement(step.knowledgeRequirement),
    done: requirement(step.completionRequirement),
  })),
}));

// --- Knowledge sources -----------------------------------------------------------------------------------------------------
// What sets each knowledge id that a quest step tests, so the page can say "after talking to Galen Yager" instead of an id.

type SourceKind = "talk" | "kill" | "read" | "open" | "pickup" | "soul" | "reach" | "use" | "object" | "collection" | "item" | "craft" | "place" | "when";
type Source = {
  kind: SourceKind;
  rule?: Requirement;
  what: string;
  line?: string;
  near?: string;
  at?: readonly [number, number];
};

const leafIds = (required: Requirement | null): number[] =>
  !required || "other" in required
    ? []
    : "not" in required
      ? leafIds(required.not)
      : "all" in required
        ? required.all.flatMap(leafIds)
        : "any" in required
          ? required.any.flatMap(leafIds)
          : [required.k];
const questIds = new Set<number>(quests.flatMap((quest: Json) => quest.steps.flatMap((step: Json) => [...leafIds(step.shown), ...leafIds(step.done)])));

// Template names for placed objects whose template sets nothing itself (a chest whose placement carries the trigger).
const templateFiles = new Map(readdirSync(join(unpacked, "TemplateResource")).map((file) => [file.slice(0, 36), file]));
const otherTemplates = new Map<string, Template>();
const templateOf = (guid: string): Template | undefined => {
  const known = templates.get(guid) ?? otherTemplates.get(guid);
  if (known || !templateFiles.has(guid)) {
    return known;
  }
  const template = JSON.parse(readFileSync(join(unpacked, "TemplateResource", templateFiles.get(guid)!), "utf8"));
  const loaded = { name: template.name, components: new Map<string, Json>(template.components.map((component: Json) => [component.$type, component.$value])) };
  otherTemplates.set(guid, loaded);
  return loaded;
};

// "Prop_Chest_Wood_Small_01" -> "Chest Wood Small": a fallback when a template has no English name.
const readableTemplateName = (name: string) =>
  name
    .replace(/^(Prop|NPC|Enemy|Animal|HelperEntity|Craft|8kMapLabel)_/i, "")
    .replace(/_\d+[a-z]?$/i, "")
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim();
const nameOf = (template: Template) =>
  text(guidTag(template.components.get("keen::ecs::LocaTagComponent")?.locaTag)) ||
  text(template.components.get("keen::ecs::NpcDialog")?.dialogResource?.headline?.value) ||
  readableTemplateName(template.name);

// The name of the nearest named map location within 400 m.
const nearestLocation = (east: number, north: number) => {
  let best = "";
  let bestDistance = 400;
  for (const location of mapLocations) {
    const distance = Math.hypot(location.east - east, location.north - north);
    if (distance < bestDistance && !/_|MapLabel/.test(location.name)) {
      bestDistance = distance;
      best = location.name;
    }
  }
  return best;
};

// What a placed object or template does, in words. `used` is true when the trigger fires on interaction.
function describeObject(template: Template, used: boolean): { kind: SourceKind; what: string } {
  const name = template.name;
  const reading = template.components.get("keen::ecs::LoreReading");
  const page = reading ? pageByName.get(guidTag(reading.entryName)) : undefined;
  if (page) {
    return { kind: "read", what: page.title };
  }
  if (/Loot_?Chest/i.test(name)) {
    return { kind: "open", what: /gold/i.test(name) ? "gold chest" : /silver/i.test(name) ? "silver chest" : "chest" };
  }
  if (/Loot_?Pickup/i.test(name)) {
    const rest = name.replace(/^.*Loot_?Pickup_/i, "").replace(/^(NPC_[A-Za-z]+|Collections(_[A-Za-z]+?(?=_|$))?)_/i, "");
    return { kind: "pickup", what: readableTemplateName(rest) };
  }
  if (/soul_?knowledge|spawn_?Statue/i.test(name)) {
    return { kind: "soul", what: "a Lost Villager Soul" };
  }
  if (/^Spawnpoint_POI_(Enemy|Wildbeast)/i.test(name)) {
    const enemy = readableTemplateName(name.replace(/^Spawnpoint_POI_(Enemy|Wildbeast)_/i, ""))
      .replace(/\b(Boss )?Health ?Bar\b|\bhealthbar\b|\bPatrol\b|\bfog\b|\blore\b.*$/gi, "")
      .replace(/\bT\d\b/g, "")
      .replace(/\s+/g, " ")
      .trim();
    return { kind: "kill", what: enemy };
  }
  const english =
    text(guidTag(template.components.get("keen::ecs::LocaTagComponent")?.locaTag)) || text(guidTag(template.components.get("keen::ecs::MapMarker")?.markerId));
  if (english) {
    return { kind: used ? "use" : "reach", what: english };
  }
  const readable = readableTemplateName(name)
    .replace(/\b(general |)Placeholder( Map Marker)?\b|\bno UI\b|\bplaceholder\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  return { kind: used ? "use" : /zone|trigger/i.test(name) ? "reach" : "object", what: readable };
}

// "Lizardpeople_Drak04_Mage_Patrol" -> "Drak Mage"
const enemyName = (template: Template) =>
  text(guidTag(template.components.get("keen::ecs::LocaTagComponent")?.locaTag)) ||
  readableTemplateName(template.name)
    .replace(/Lizardpeople Drak\d+/i, "Drak")
    .replace(/\b(boss )?Health ?bar\b|\bPatrol\b|\bDungeon\d+\b|\blore\b.*$/gi, "")
    .replace(/\s+/g, " ")
    .trim();

const sources = new Map<number, Source[]>();
const addSource = (id: number, source: Source) => {
  if (!questIds.has(id)) {
    return;
  }
  const list = sources.get(id) ?? [];
  if (!list.some((each) => each.kind === source.kind && each.what === source.what && each.line === source.line && each.near === source.near)) {
    list.push(source);
  }
  sources.set(id, list);
};
const placeOf = (guid: string) => {
  const object = placedByTemplate.get(guid)?.[0];
  return object ? { near: nearestLocation(object.east, object.north) || undefined, at: [object.east, object.north] as const } : {};
};
const unlockIds = (operations: Json[] | undefined): number[] =>
  (operations ?? []).map((operation: Json) => (operation.knowledgeId ?? operation.unlockOperation?.knowledgeId)?.id?.value).filter(Boolean);

for (const [guid, template] of templates) {
  const name = nameOf(template);
  const dialog = template.components.get("keen::ecs::NpcDialog")?.dialogResource;
  if (dialog) {
    for (const lines of [dialog.initLines, dialog.transitionLines, dialog.farewellLines, dialog.dialogOptions]) {
      for (const line of lines ?? []) {
        const spoken = text(line.bodyTexts?.[0]?.value);
        for (const id of unlockIds(line.knowledgeUnlockOperations)) {
          addSource(id, { kind: "talk", what: name, line: spoken.length > 90 ? `${spoken.slice(0, 88).trimEnd()}…` : spoken || undefined, ...placeOf(guid) });
        }
      }
    }
  }
  const kill = template.components.get("keen::ecs::KnowledgeTriggerOnKill");
  for (const id of unlockIds(kill ? [kill.knowledgeUnlockOperation] : [])) {
    addSource(id, { kind: "kill", what: enemyName(template), ...placeOf(guid) });
  }
  const showcase = template.components.get("keen::ecs::TriggerCollectionCompletionKnowledge");
  for (const id of unlockIds(showcase ? [showcase.completionKnowledgeUnlockOperation] : [])) {
    addSource(id, { kind: "collection", what: name, ...placeOf(guid) });
  }
  for (const [type, component] of template.components) {
    if (type === "keen::ecs::NpcDialog" || type === "keen::ecs::KnowledgeTriggerOnKill" || !component || typeof component !== "object") {
      continue;
    }
    for (const id of unlockIds(component.knowledgeUnlockOperations)) {
      addSource(id, { ...describeObject(template, false), ...placeOf(guid) });
    }
  }
}

for (const object of placed) {
  for (const trigger of object.sceneTriggers) {
    if (!questIds.has(trigger.id)) {
      continue;
    }
    const template = templateOf(object.template);
    addSource(trigger.id, {
      ...(template ? describeObject(template, trigger.context === "Interact") : { kind: "object" as const, what: "an object" }),
      near: nearestLocation(object.east, object.north) || undefined,
      at: [object.east, object.north],
    });
  }
}

const itemNames = new Map<number, string>();
for (const file of readdirSync(join(unpacked, "ItemInfo"))) {
  const item = JSON.parse(readFileSync(join(unpacked, "ItemInfo", file), "utf8"));
  const name = text(guidTag(item.name)) || readableTemplateName(item.debugName);
  itemNames.set(item.itemId.value, name);
  if (questIds.has(item.itemId.value)) {
    addSource(item.itemId.value, { kind: "item", what: name });
  }
  // Placing or using the item (its use sequence) sets knowledge, such as placing the Loom.
  for (const sequence of [item.sequences].flat(2).filter(Boolean)) {
    for (const id of unlockIds([sequence.knowledgeUnlockOperation].filter(Boolean))) {
      addSource(id, { kind: "place", what: name });
    }
  }
}

// A recipe's id is also the knowledge id of having crafted it.
for (const recipe of single("RecipeRegistryResource").recipes) {
  const output = recipe.output.map((stack: Json) => itemNames.get(stack.item.value)).find(Boolean);
  if (output) {
    addSource(recipe.recipeId.value, { kind: "craft", what: output });
  }
}

// The game sets some knowledge by itself once a rule holds ("has all three shards").
{
  const triggers = single("GameKnowledgeQueryTriggerResource");
  for (const entry of [...triggers.worldQueries, ...triggers.playerQueries]) {
    const rule = entry.query ? requirement(entry.query) : null;
    for (const id of unlockIds(entry.unlockKnowledge)) {
      if (rule) {
        addSource(id, { kind: "when", what: "", rule });
      }
    }
  }
}

// --- Output ---------------------------------------------------------------------------------------------------------------

const version = (() => {
  const index = readFileSync(join(gameDir, "enshrouded.kfc"));
  const view = new DataView(index.buffer, index.byteOffset, index.byteLength);
  const offset = 0x10 + view.getUint32(0x10, true);
  return String.fromCharCode(...index.subarray(offset, offset + view.getUint32(0x14, true)));
})();

const header = (what: string) => `// Generated by scripts/import-game.ts. Do not edit by hand.
// ${what}
// Read from the Enshrouded game files (build ${version}), which belong to Keen Games.
`;

const requirementType = `// A requirement as a save answers it:
// - { k, flag }: the save knows id k and its value has every bit of flag (a Bool is the flag 1);
// - { k, count: [op, n] }: the value of k compared with n;
// - all / any / not combine requirements;
// - { other, detail }: a check the save's knowledge cannot answer, such as the Mother Flame level or an NPC's state; detail is the
//   game's own name for the check, such as "NPC_barber_sheltered_state".
// "world" marks ids only a world save's world_knowledge holds. Most quest ids are in both registries: the world save holds them
// for the world, and the character save for the players who were there.
export type Requirement =
  | { readonly k: number; readonly flag: number; readonly world?: true }
  | { readonly k: number; readonly count: readonly [string, number]; readonly world?: true }
  | { readonly all: readonly Requirement[] }
  | { readonly any: readonly Requirement[] }
  | { readonly not: Requirement }
  | { readonly other: string; readonly detail?: string };
`;

const outDir = new URL("../src/game/", import.meta.url);
mkdirSync(outDir, { recursive: true });
const write = (file: string, content: string) => {
  writeFileSync(new URL(file, outDir), content);
  console.log(`Wrote src/game/${file} (${(content.length / 1024).toFixed(0)} KB).`);
};
const json = (value: unknown) => JSON.stringify(value);

write(
  "requirement.ts",
  `${header("The requirement type of quests and map locations.")}
${requirementType}`,
);

write(
  "skills.ts",
  `${header("The skill tree nodes: the id a character save stores for an unlocked skill, its name, kind and highest rank.")}
export type GameSkill = { readonly id: number; readonly name: string; readonly kind: string; readonly maxRank: number };

export const gameSkills: readonly GameSkill[] = ${json(skills)};
`,
);

write(
  "lore.ts",
  `${header("Lore pages of the journal: the knowledge id that marks a page read, and where the game places the page ([east, north, altitude]).")}
export type GameLorePage = {
  readonly knowledgeId: number;
  readonly title: string;
  readonly collection: string;
  readonly category: string;
  readonly part: number;
  readonly parts: number;
  readonly places: readonly (readonly [number, number, number])[];
};

export const gameLorePages: readonly GameLorePage[] = ${json(gamePages)};

// Knowledge ids for the pages of src/lore.ts that have none, matched by place, collection and part.
export const siteLoreIds: readonly { readonly title: string; readonly east: number; readonly north: number; readonly knowledgeId: number }[] = ${json(
    siteLoreIds.map(({ title, east, north, knowledgeId }) => ({ title, east, north, knowledgeId })),
  )};
`,
);

write(
  "map-locations.ts",
  `${header("Map markers that knowledge unlocks: hint (shown as a hint), visible (discovered) and completed, as requirements.")}
import type { Requirement } from "./requirement.ts";

export type MapLocation = {
  readonly name: string;
  readonly template: string;
  readonly category: string;
  readonly east: number;
  readonly north: number;
  readonly altitude: number;
  readonly hint: Requirement | null;
  readonly visible: Requirement | null;
  readonly completed: Requirement | null;
};

export const mapLocations: readonly MapLocation[] = ${json(mapLocations)};
`,
);

write(
  "quests.ts",
  `${header("Quests of the journal: each step's shown and done requirements.")}
import type { Requirement } from "./requirement.ts";

export type QuestStep = { readonly name: string; readonly shown: Requirement | null; readonly done: Requirement | null };
export type Quest = {
  readonly id: number;
  readonly name: string;
  readonly type: string;
  readonly main: boolean;
  readonly giver: string;
  readonly steps: readonly QuestStep[];
};

export const quests: readonly Quest[] = ${json(quests)};
`,
);

// Lore pages that a quest step tests: reading the page shows the step ("shows") or completes it ("completes").
const questLore = new Map<number, { quest: string; step: string; role: "shows" | "completes" }[]>();
{
  const loreIds = new Set(gamePages.map((page) => page.knowledgeId));
  for (const quest of quests) {
    for (const step of quest.steps) {
      for (const [role, rule] of [
        ["shows", step.shown],
        ["completes", step.done],
      ] as const) {
        for (const id of new Set(leafIds(rule))) {
          if (loreIds.has(id)) {
            questLore.set(id, [...(questLore.get(id) ?? []), { quest: quest.name, step: step.name, role }]);
          }
        }
      }
    }
  }
}
write(
  "quest-lore.ts",
  `${header("Lore pages that quest steps test: reading the page shows a step, or completes it.")}
export type QuestLoreLink = { readonly quest: string; readonly step: string; readonly role: "shows" | "completes" };

export const questLore: Readonly<Record<number, readonly QuestLoreLink[]>> = ${json(Object.fromEntries([...questLore].sort((a, b) => a[0] - b[0])))};
`,
);

write(
  "knowledge-sources.ts",
  `${header("What sets the knowledge ids that quest steps test: NPC dialog lines, kills, used or reached objects, collections, items.")}
// kind: "talk" an NPC dialog line sets it (line: what the NPC says); "kill" defeating an enemy; "read" reading a lore page;
// "open" opening a chest; "pickup" picking something up; "soul" freeing a Lost Villager Soul; "reach" reaching or discovering a
// place; "use" using a placed object; "object" another object's default action; "collection" completing a showcase; "item"
// finding the item; "craft" crafting it; "place" placing or using the item; "when" the game sets it once \`rule\` holds.
// near: the nearest named map location within 400 m; at: [east, north] of one such object.
import type { Requirement } from "./requirement.ts";

export type KnowledgeSource = {
  readonly kind:
    | "talk"
    | "kill"
    | "read"
    | "open"
    | "pickup"
    | "soul"
    | "reach"
    | "use"
    | "object"
    | "collection"
    | "item"
    | "craft"
    | "place"
    | "when";
  readonly rule?: Requirement;
  readonly what: string;
  readonly line?: string;
  readonly near?: string;
  readonly at?: readonly [number, number];
};

export const knowledgeSources: Readonly<Record<number, readonly KnowledgeSource[]>> = ${json(Object.fromEntries([...sources].sort((a, b) => a[0] - b[0])))};
`,
);

{
  const lore = new Set(gamePages.map((page) => page.knowledgeId));
  const unexplained = [...questIds].filter((id) => !sources.has(id) && !lore.has(id));
  console.log(
    `Quest knowledge ids: ${questIds.size}; explained by lore pages ${[...questIds].filter((id) => lore.has(id)).length}, by other sources ${sources.size}, unexplained ${unexplained.length}.`,
  );
  console.log(
    `Sources by kind: ${JSON.stringify(Object.fromEntries([...Map.groupBy([...sources.values()].flat(), (source) => source.kind)].map(([kind, list]) => [kind, list.length])))}.`,
  );
}
console.log(
  `${skills.length} skills, ${gamePages.length} lore pages (${gamePages.filter((page) => page.places.length).length} placed), ${mapLocations.length} map locations, ${quests.length} quests.`,
);
console.log(`Site lore pages without an id: ${siteLorePages.filter((page) => page.knowledgeId === null).length}; matched now: ${siteLoreIds.length}.`);
for (const match of siteLoreIds) {
  console.log(`  ${match.title} -> ${match.knowledgeId} (${match.gameTitle})`);
}

// --- Check against saves --------------------------------------------------------------------------------------------------

type Knowledge = Map<number, number>;
const readKnowledgeBlock = (save: Uint8Array, name: string): Knowledge | null => {
  const payload = readBlock(save, name);
  if (!payload) {
    return null;
  }
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  const count = view.getUint32(4, true);
  return new Map(Array.from({ length: count }, (_, index) => [view.getUint32(8 + 4 * index, true), view.getUint32(8 + 4 * count + 4 * index, true)]));
};

// true, false, or null when the requirement has a check the knowledge cannot answer.
function holds(required: Requirement, player: Knowledge, world: Knowledge | null): boolean | null {
  if ("other" in required) {
    return null;
  }
  if ("not" in required) {
    const inner = holds(required.not, player, world);
    return inner === null ? null : !inner;
  }
  if ("all" in required || "any" in required) {
    const results = ("all" in required ? required.all : required.any).map((part) => holds(part, player, world));
    if ("all" in required) {
      return results.includes(false) ? false : results.includes(null) ? null : true;
    }
    return results.includes(true) ? true : results.includes(null) ? null : false;
  }
  const source = required.world ? world : player;
  if (!source) {
    return null;
  }
  const value = source.get(required.k);
  if ("flag" in required) {
    return value !== undefined && (value & required.flag) === required.flag;
  }
  const [op, n] = required.count;
  const count = value ?? 0;
  return op === "Equals" ? count === n : op === "GreaterThan" ? count > n : op === "LessThan" ? count < n : null;
}

const leaves = (required: Requirement | null): { k: number; world?: true }[] =>
  !required || "other" in required
    ? []
    : "not" in required
      ? leaves(required.not)
      : "all" in required
        ? required.all.flatMap(leaves)
        : "any" in required
          ? required.any.flatMap(leaves)
          : [required];

if (checkSaves.length) {
  const saves = checkSaves.map((path) => ({ path, bytes: new Uint8Array(readFileSync(path)) }));
  const worldSave = saves.map((save) => ({ ...save, knowledge: readKnowledgeBlock(save.bytes, "world_knowledge") })).find((save) => save.knowledge);
  const world = worldSave?.knowledge ?? null;
  for (const save of saves) {
    const player = readKnowledgeBlock(save.bytes, "player_knowledge");
    if (!player) {
      continue;
    }
    console.log(`\n${basename(save.path)}: ${player.size} player knowledge entries`);
    const siteRead = siteLorePages.filter((page) => page.knowledgeId !== null && player.has(page.knowledgeId)).length;
    const newRead = siteLoreIds.filter((match) => player.has(match.knowledgeId)).length;
    console.log(`  Site lore pages read: ${siteRead} with the site's ids, ${siteRead + newRead} with the ids matched here.`);
    console.log(`  Game lore pages read: ${gamePages.filter((page) => player.has(page.knowledgeId)).length} of ${gamePages.length}.`);
    const unknownSkills = [...new Set(Array.from(readCharacterSkills(save.bytes)).filter((id) => !skills.some((skill: { id: number }) => skill.id === id)))];
    console.log(`  Skills: ${readCharacterSkills(save.bytes).length} unlocked, ${unknownSkills.length} without a game name.`);
    const discovered = mapLocations.filter((location) => location.visible && holds(location.visible, player, world) === true).length;
    console.log(`  Map locations discovered: ${discovered} of ${mapLocations.filter((location) => location.visible).length} that have a visible rule.`);
    // Most quest ids are in both registries: the world save holds them for the world, the character save for the players who
    // were there. So count once from the character alone and once from the character and the world together.
    const sources: [string, Knowledge][] = [["the character", player]];
    if (world && worldSave) {
      sources.push([`the character and ${basename(worldSave.path)}`, new Map([...world, ...player])]);
    }
    for (const [label, known] of sources) {
      let done = 0;
      let open = 0;
      let unknown = 0;
      let questsDone = 0;
      for (const quest of quests) {
        const results = quest.steps.map((step: { done: Requirement | null }) => (step.done ? holds(step.done, known, world) : null));
        done += results.filter((result: boolean | null) => result === true).length;
        open += results.filter((result: boolean | null) => result === false).length;
        unknown += results.filter((result: boolean | null) => result === null).length;
        questsDone += results.length && results.every((result: boolean | null) => result === true) ? 1 : 0;
      }
      console.log(`  Quest steps from ${label}: ${done} done, ${open} not done, ${unknown} unknown; ${questsDone} of ${quests.length} quests done.`);
    }
  }
  if (world && worldSave) {
    const questIds = new Set(
      quests.flatMap((quest: Json) => quest.steps.flatMap((step: Json) => [...leaves(step.done), ...leaves(step.shown)].map((l) => l.k))),
    );
    const worldQuestIds = [...questIds].filter((id) => worldIds.has(id));
    const registry = [...world.keys()].filter((id) => worldIds.has(id)).length;
    console.log(`\n${basename(worldSave.path)}: ${world.size} world knowledge entries, ${registry} of them in the game's world registry.`);
    console.log(
      `  Quests use ${worldQuestIds.length} ids of the world registry; ${worldQuestIds.filter((id) => world.has(id)).length} are in this world save.`,
    );
  }
}

// player_character skills: a 58-byte prefix, level, experience, skill count, then (u32 id, u8 rank) per skill.
function readCharacterSkills(save: Uint8Array): number[] {
  const payload = readBlock(save, "player_character");
  if (!payload) {
    return [];
  }
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  const count = view.getUint32(66, true);
  return Array.from({ length: count }, (_, index) => view.getUint32(70 + 5 * index, true));
}
