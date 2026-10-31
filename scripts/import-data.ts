// Builds src/lore.ts, src/places.ts and src/assets/pins/ from app/public of the Enshrouded Interactive Map (MIT):
// https://github.com/nicolasferreiraxn/Enshrouded-Interactive-Map
//
// Usage: bun scripts/import-data.ts <path to app/public/data.json> [<path to regions.json>]
//
// The script also reads lang/en.json, for English names, and et/pins/, for the place icons, next to data.json.
//
// The optional regions.json is the lore layer of the All Things How map
// (https://static.allthings.how/game-maps/enshrouded/embervale/points/lore.json): a list of [east, 10240 - north, area, { t, r }],
// where "r" names the region of the pin. Each page takes the region of the nearest of those pins.
// Without it, each page takes the region of the nearest place that data.json names a region for: flame shrines, Ancient Spires and
// spots such as "A Hidden Temple in the Blackmire". That fallback cannot place pages in Cinder's Cradle, which has none of those.
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { locations } from "../src/locations.ts";

type Point = {
  c: string;
  n: string;
  en?: string;
  d?: string;
  k?: number;
  x: number;
  z: number;
  y: number;
  lv?: number;
};

const categoryLabels: Record<string, string> = {
  "lore-general": "General",
  "lore-ancients-and-the-flame": "The Ancients and the Flame",
  "lore-the-shroud-and-elixir": "The Shroud and Elixir",
  "lore-scavengers": "Scavengers",
  "lore-vukah-and-wildlife": "Vukah and Wildlife",
  "lore-nobles-and-history": "Nobles and History",
  "lore-revelwood": "Revelwood",
  "lore-nomad-highlands": "Nomad Highlands",
  "lore-kindlewastes": "Kindlewastes",
  "lore-hollow": "Hollow",
  "lore-albaneve-summits": "Albaneve Summits",
  "lore-veilwater-basin": "Veilwater Basin",
  "lore-drak": "Drak",
};

const regions = ["Springlands", "Revelwood", "Nomad Highlands", "Blackmire", "Albaneve Summits", "Kindlewastes", "Veilwater Basin", "Cinder's Cradle"];

// Places inside a region that the sources name instead of the region itself.
const regionAliases: Record<string, string> = {
  "Low Meadows": "Springlands",
};

const [source, regionsSource] = process.argv.slice(2);
if (!source) {
  throw new Error("Usage: bun scripts/import-data.ts <path to app/public/data.json> [<path to regions.json>]");
}

type Category = { id: string; group: string; label: string; icon: string; on?: boolean };

const data = JSON.parse(readFileSync(source, "utf8")) as { cats: Category[]; points: Point[] };
const english = JSON.parse(readFileSync(join(dirname(source), "lang", "en.json"), "utf8")) as Record<string, string>;
const toEnglish = (text: string) => english[text] ?? text;

const regionOf = (name: string) => {
  const region = regionAliases[name] ?? name;
  return regions.includes(region) ? region : null;
};

type Anchor = { region: string; east: number; north: number };

const regionPins: Anchor[] = regionsSource
  ? (JSON.parse(readFileSync(regionsSource, "utf8")) as [number, number, number, { r?: string }][]).flatMap(([east, flippedNorth, , meta]) => {
      const region = regionOf(meta.r ?? "");
      return region ? [{ region, east, north: 10240 - flippedNorth }] : [];
    })
  : [];

const regionNames = [...regions, ...Object.keys(regionAliases)].map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
const regionMention = new RegExp(`(?:\\b(?:in|of) the (${regionNames})\\b| - (${regionNames})$)`);

const namedPlaces: Anchor[] = [
  ...locations.map((location) => ({ region: location.region, east: location.east, north: location.north })),
  ...data.points.flatMap((point) => {
    const match = regionMention.exec(point.d ?? "") ?? regionMention.exec(point.en ?? "");
    const region = match && regionOf(match[1] ?? match[2]!);
    return region ? [{ region, east: point.x, north: point.z }] : [];
  }),
];

const anchors = regionPins.length ? regionPins : namedPlaces;

const regionAt = (east: number, north: number) =>
  anchors.reduce(
    (best, anchor) => {
      const distance = Math.hypot(anchor.east - east, anchor.north - north);
      return distance < best.distance ? { distance, region: anchor.region } : best;
    },
    { distance: Infinity, region: "" },
  ).region;

const loreCategoryOrder = Object.values(categoryLabels);

const pages = data.points
  .filter((point) => point.c.startsWith("lore-"))
  .map((point) => {
    const label = categoryLabels[point.c];
    if (!label) {
      throw new Error(`Unknown lore category ${point.c}. Add it to categoryLabels.`);
    }

    // "d" reads "<collection> (<part>/<parts>). <optional hint>".
    const match = /^(.+?) \((\d+)\/(\d+)\)\.\s*(.*)$/s.exec(point.d ?? "");

    return {
      title: (point.en ?? point.n).trim(),
      category: label,
      region: regionAt(point.x, point.z),
      collection: match?.[1]?.trim() ?? "",
      part: Number(match?.[2] ?? 0),
      parts: Number(match?.[3] ?? 0),
      hint: match?.[4]?.trim() ?? "",
      knowledgeId: point.k ?? null,
      east: Math.round(point.x),
      north: Math.round(point.z),
      altitude: Math.round(point.y),
    };
  })
  .toSorted(
    (first, second) =>
      loreCategoryOrder.indexOf(first.category) - loreCategoryOrder.indexOf(second.category) ||
      first.collection.localeCompare(second.collection) ||
      first.part - second.part ||
      first.title.localeCompare(second.title),
  );

const output = `// Generated by scripts/import-data.ts. Do not edit by hand.
// Source: app/public/data.json of https://github.com/nicolasferreiraxn/Enshrouded-Interactive-Map (MIT).
// Regions: the region of the nearest lore pin on the All Things How map, https://allthings.how/enshrouded/map/.
// The names and positions come from the Enshrouded game files, which belong to Keen Games.
// "knowledgeId" is null for pages whose id the source does not list. Those pages cannot be read from a save.

export type LorePage = {
  readonly title: string;
  readonly category: string;
  readonly region: string;
  readonly collection: string;
  readonly part: number;
  readonly parts: number;
  readonly hint: string;
  readonly knowledgeId: number | null;
  readonly east: number;
  readonly north: number;
  readonly altitude: number;
};

export const loreCategories = ${JSON.stringify(Object.values(categoryLabels), null, 2)} as const;

export const loreRegions = ${JSON.stringify(regions, null, 2)} as const;

export const lorePages: readonly LorePage[] = ${JSON.stringify(pages, null, 2)};
`;

writeFileSync(new URL("../src/lore.ts", import.meta.url), output);
console.log(
  regionPins.length ? `Placed pages by ${regionPins.length} region pins.` : "No regions.json given. Pages take the region of the nearest named place.",
);
for (const region of regions) {
  console.log(`  ${region}: ${pages.filter((page) => page.region === region).length}`);
}
console.log(`Wrote ${pages.length} lore pages, ${pages.filter((page) => page.knowledgeId !== null).length} with a knowledge id.`);

// Places: every point that is not a flame shrine or a lore page. Traversal grapple points (1,222) and empty categories are left out.
const skippedCategories = new Set(["flame-shrine", "quest", "fishing", "grapple"]);
// The source turns these on by default. Chests, collectibles, bosses, enemy camps and Shroud Roots start hidden so the map stays readable.
const hiddenByDefault = new Set(["boss", "enemy-camp", "shroud-root"]);
const placeCategories = data.cats.filter((category) => !category.id.startsWith("lore-") && !skippedCategories.has(category.id));

// Descriptions the source has not translated are dropped rather than shown in Portuguese.
const looksPortuguese = (text: string) => /[ãõçáéíóúâê]|\b(?:Em|Perto|de|do|da|no|na)\b/.test(text);
const englishText = (text: string | undefined) => {
  // The source keeps notes such as "(TODO: coordinates)" in some descriptions.
  const translated = text
    ? toEnglish(text.trim())
        .replace(/\s*\(TODO[^)]*\)/g, "")
        .replace(/^\((.*?)\.? TODO[^)]*\)$/, "$1.")
    : "";
  return translated && !looksPortuguese(translated) ? translated : "";
};

const pinsDirectory = new URL("../src/assets/pins/", import.meta.url);
rmSync(pinsDirectory, { recursive: true, force: true });
mkdirSync(pinsDirectory, { recursive: true });

const placeTypes = placeCategories.map((category) => {
  const iconFile = category.icon.split("/").pop()!;
  copyFileSync(join(dirname(source), category.icon), new URL(iconFile, pinsDirectory));
  return {
    id: category.id,
    label: toEnglish(category.label),
    group: toEnglish(category.group),
    icon: iconFile,
    shownByDefault: Boolean(category.on) && !category.id.startsWith("chest-") && !hiddenByDefault.has(category.id),
  };
});

const typeIndex = new Map(placeTypes.map((type, index) => [type.id, index]));
// Compact rows keep the file small: [type index, name, description, east, north, altitude, region index, level].
const places = data.points
  .filter((point) => typeIndex.has(point.c))
  .map((point) => [
    typeIndex.get(point.c)!,
    englishText(point.en ?? point.n) || toEnglish(point.n),
    englishText(point.d),
    Math.round(point.x),
    Math.round(point.z),
    Math.round(point.y),
    regions.indexOf(regionAt(point.x, point.z)),
    point.lv ?? 0,
  ])
  .toSorted((first, second) => (first[0] as number) - (second[0] as number) || String(first[1]).localeCompare(String(second[1])));

const placesOutput = `// Generated by scripts/import-data.ts. Do not edit by hand.
// Source: app/public/data.json of https://github.com/nicolasferreiraxn/Enshrouded-Interactive-Map (MIT).
// Regions: the region of the nearest lore pin on the All Things How map, https://allthings.how/enshrouded/map/.
// The names, positions and icons come from the Enshrouded game files, which belong to Keen Games.
// The app loads this module only when the Places layer opens.

export type PlaceType = {
  readonly id: string;
  readonly label: string;
  readonly group: string;
  readonly icon: string;
  readonly shownByDefault: boolean;
};

export const placeTypes: readonly PlaceType[] = ${JSON.stringify(placeTypes, null, 2)};

export const placeRegions = ${JSON.stringify(regions)} as const;

// [type index, name, description, east, north, altitude, region index, level]
export type PlaceRow = readonly [number, string, string, number, number, number, number, number];

export const placeRows: readonly PlaceRow[] = [
${places.map((row) => `  ${JSON.stringify(row)},`).join("\n")}
];
`;

writeFileSync(new URL("../src/places.ts", import.meta.url), placesOutput);
console.log(`Wrote ${places.length} places of ${placeTypes.length} types, ${placeTypes.filter((type) => type.shownByDefault).length} shown by default.`);

// Item names by item id, for the character panel. live_names.json holds the Portuguese names; lang/en.json translates them.
// The file also holds a few lists (such as "creatures") next to the ids; those are skipped.
const liveNames = JSON.parse(readFileSync(join(dirname(source), "live_names.json"), "utf8")) as Record<string, unknown>;
const itemNames = Object.fromEntries(
  Object.entries(liveNames)
    .filter((entry): entry is [string, string] => typeof entry[1] === "string")
    .map(([id, name]) => [Number(id), toEnglish(name.trim())] as const)
    .filter(([id, name]) => Number.isInteger(id) && name)
    .toSorted(([first], [second]) => first - second),
);

writeFileSync(
  new URL("../src/items.ts", import.meta.url),
  `// Generated by scripts/import-data.ts. Do not edit by hand.
// Source: app/public/live_names.json and lang/en.json of https://github.com/nicolasferreiraxn/Enshrouded-Interactive-Map (MIT).
// The names come from the Enshrouded game files, which belong to Keen Games. A few names have no English translation in the source.
// The app loads this module only when the character panel opens.

export const itemNames: Readonly<Record<number, string>> = ${JSON.stringify(itemNames)};
`,
);
console.log(`Wrote ${Object.keys(itemNames).length} item names.`);
