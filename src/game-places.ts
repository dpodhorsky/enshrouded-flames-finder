// The map markers of the game files (src/game/map-locations.ts) as places. Unlike the community places, each has the knowledge
// rule that puts it on the in-game map, so a save tells whether the character has discovered it.
// Loaded with the Places layer.
import { mapLocations } from "./game/map-locations.ts";
import type { Requirement } from "./game/requirement.ts";
import { placeRegions, placeRows, placeTypes, type PlaceType } from "./places.ts";

export const discoveryGroup = "Discoveries (checked against your save)";

const categoryTypes: Record<string, PlaceType> = {
  Locations: { id: "game-locations", label: "Locations", group: discoveryGroup, icon: "village.png", shownByDefault: true },
  Dungeons: { id: "game-dungeons", label: "Dungeons and lairs", group: discoveryGroup, icon: "dungeon.png", shownByDefault: true },
  FlameRelated: { id: "game-flame", label: "Flame sites", group: discoveryGroup, icon: "ancient-obelisk.png", shownByDefault: true },
  None: { id: "game-other", label: "Hints and finds", group: discoveryGroup, icon: "hint.png", shownByDefault: true },
};

export const gamePlaceTypes = Object.values(categoryTypes);

// A community type whose name is in the marker's name lends its icon: "Shroud Lair", "Elixir Well", "Aquamarine Mine".
const singular = (label: string) => label.toLowerCase().replace(/s\b/g, "");
const namedIcons = placeTypes.map((type) => ({ name: singular(type.label), icon: type.icon })).filter(({ name }) => name.length >= 4);
const iconOf = (name: string, fallback: string) => namedIcons.find((type) => singular(name).includes(type.name))?.icon ?? fallback;

// Debug and quest-search markers carry an internal name, and markers without a visible rule never show as discovered.
const isTracked = (location: (typeof mapLocations)[number]): location is (typeof mapLocations)[number] & { visible: Requirement } =>
  location.visible !== null && !/^_|MapLabel/.test(location.name);

function regionAt(east: number, north: number) {
  let best = placeRows[0]!;
  let bestDistance = Infinity;
  for (const row of placeRows) {
    const rowDistance = Math.hypot(row[3] - east, row[4] - north);
    if (rowDistance < bestDistance) {
      bestDistance = rowDistance;
      best = row;
    }
  }
  return placeRegions[best[6]] ?? "";
}

// Grouped by type, in the order of gamePlaceTypes.
export const gamePlaces = mapLocations
  .filter(isTracked)
  .map((location) => {
    const type = categoryTypes[location.category] ?? categoryTypes.None!;
    return {
      type,
      title: location.name,
      icon: iconOf(location.name, type.icon),
      region: regionAt(location.east, location.north),
      east: location.east,
      north: location.north,
      altitude: location.altitude,
      discovered: location.visible,
    };
  })
  .toSorted((first, second) => gamePlaceTypes.indexOf(first.type) - gamePlaceTypes.indexOf(second.type));
