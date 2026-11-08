// The lore layer: the journal's pages as the game files list them (src/game/lore.ts), with the region and the finding hint of
// the matching page of the community map data (src/lore.ts). The game's ids and positions replace the community ones, which
// had 45 pages without an id, 11 ids on the wrong page and some positions off by up to 240 m.
import { gameLorePages, type GameLorePage } from "./game/lore.ts";
import { lorePages as communityPages, type LorePage } from "./lore.ts";

const titleKey = (title: string) => title.toLowerCase().replace(/[^a-z0-9]/g, "");
const distance = (page: LorePage, east: number, north: number) => Math.hypot(page.east - east, page.north - north);

function nearest(pages: readonly LorePage[], east: number, north: number, within: number) {
  let best: LorePage | null = null;
  let bestDistance = within;
  for (const page of pages) {
    const pageDistance = distance(page, east, north);
    if (pageDistance < bestDistance) {
      bestDistance = pageDistance;
      best = page;
    }
  }
  return best;
}

const communityByTitle = Map.groupBy(communityPages, (page) => titleKey(page.title));

// The community page for a game page: the same title nearby, or, for a renamed page, any page at the same spot.
function communityPageOf(page: GameLorePage, east: number, north: number) {
  return nearest(communityByTitle.get(titleKey(page.title)) ?? [], east, north, 400) ?? nearest(communityPages, east, north, 30);
}

// Journal categories in the order the game lists them.
export const loreCategories = [...new Set(gameLorePages.map((page) => page.category))];

// One entry per page, at the first place the game puts it. Three pages lie in two spots a few metres to 700 m apart; either copy
// marks the page read.
export const journalLorePages: readonly LorePage[] = gameLorePages.flatMap((page): LorePage[] => {
  const [place] = page.places;
  if (!place) {
    return [];
  }

  const [east, north, altitude] = place;
  const community = communityPageOf(page, east, north);

  return [
    {
      title: page.title,
      category: page.category,
      region: (community ?? nearest(communityPages, east, north, Infinity)!).region,
      collection: page.collection,
      part: page.part,
      parts: page.parts,
      hint: community?.hint ?? "",
      knowledgeId: page.knowledgeId,
      east,
      north,
      altitude,
    },
  ];
});

// Pages the game files place nowhere in the world, such as pages a quest hands over. A save still marks them read.
export const unplacedLorePages = gameLorePages.filter((page) => page.places.length === 0);
