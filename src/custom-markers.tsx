// The map markers the player placed in game, drawn the way the game's map draws them: a rough round badge in the colour
// scheme's base colour with the marker's icon in the scheme's icon colour.
// Icons, badge and colours come from the game files (MapMarkerRegistryResource, the custom marker UiTextureResources and
// menu.map.customMarkers.colors of the UI bundle), which belong to Keen Games.
import { signal } from "@preact/signals";

import baseUrl from "./assets/markers/base.png";
import chestUrl from "./assets/markers/chest.png";
import combatUrl from "./assets/markers/combat.png";
import fishUrl from "./assets/markers/fish.png";
import gliderUrl from "./assets/markers/glider.png";
import goalUrl from "./assets/markers/goal.png";
import lootUrl from "./assets/markers/loot.png";
import oreUrl from "./assets/markers/ore.png";
import plantsUrl from "./assets/markers/plants.png";
import waterUrl from "./assets/markers/water.png";
import wildlifeUrl from "./assets/markers/wildlife.png";
import type { CustomMarker } from "./character.ts";
import { character } from "./state.ts";
import { markerScale, toMapX, toMapY } from "./viewport.ts";

// The ten custom marker types by the id a save stores, in the order of the game's marker menu.
export const markerTypes = [
  { id: 0x5eba3084, name: "Goal", url: goalUrl },
  { id: 0x3a761350, name: "Chest", url: chestUrl },
  { id: 0x7103269e, name: "Glider", url: gliderUrl },
  { id: 0xa1c4ece9, name: "Loot", url: lootUrl },
  { id: 0xd9b19aec, name: "Plants", url: plantsUrl },
  { id: 0x28a5fb2c, name: "Wildlife", url: wildlifeUrl },
  { id: 0x1db9432d, name: "Water", url: waterUrl },
  { id: 0xfe2fd02d, name: "Fish", url: fishUrl },
  { id: 0xeeb09abe, name: "Ore", url: oreUrl },
  { id: 0x0e6558ff, name: "Combat", url: combatUrl },
] as const;

// The game's eight colour schemes, in the order a save numbers them. The game stores the colours as ABGR; these are RGB.
export const markerColors = [
  { name: "White", base: "#e7e7e7", icon: "#444444" },
  { name: "Green", base: "#8eaf7f", icon: "#2f4b24" },
  { name: "Red", base: "#f2c4c4", icon: "#532828" },
  { name: "Blue", base: "#c6caf5", icon: "#222543" },
  { name: "Yellow", base: "#9a732b", icon: "#f7e1c8" },
  { name: "Purple", base: "#6e4b86", icon: "#dcc7e2" },
  { name: "Turquoise", base: "#4b8683", icon: "#bdf2ef" },
  { name: "Black", base: "#57575b", icon: "#c3c3ca" },
] as const;

export const showCustomMarkers = signal(true);

const badgeSize = 26;
const iconSize = 17;
const typeOf = (marker: CustomMarker) => markerTypes.find((type) => type.id === marker.icon);

export function markerTitle(marker: CustomMarker) {
  const type = typeOf(marker);
  return marker.label || `${type?.name ?? "Custom"} marker`;
}

// The badge and icons are white stencils: each is a mask, and the marker fills it with the scheme's colours.
function MarkerMasks() {
  const stencil = (id: string, href: string, size: number) => (
    <mask id={id} maskUnits="userSpaceOnUse" x={-size / 2} y={-size / 2} width={size} height={size}>
      <image href={href} x={-size / 2} y={-size / 2} width={size} height={size} />
    </mask>
  );

  return (
    <defs>
      {stencil("custom-marker-base", baseUrl, badgeSize)}
      {markerTypes.map((type) => stencil(`custom-marker-${type.name.toLowerCase()}`, type.url, iconSize))}
    </defs>
  );
}

export function CustomMarkers() {
  const markers = character.value?.markers;
  if (!showCustomMarkers.value || !markers?.length) {
    return null;
  }

  return (
    <g class="custom-markers" aria-label="Your map markers">
      <MarkerMasks />
      {markers.map((marker, index) => {
        const type = typeOf(marker);
        const colors = markerColors[marker.color] ?? markerColors[0];
        return (
          <g key={index} class="custom-marker" transform={`translate(${toMapX(marker.east)} ${toMapY(marker.north)})`}>
            <title>{markerTitle(marker)}</title>
            <g transform={markerScale}>
              <rect x={-badgeSize / 2} y={-badgeSize / 2} width={badgeSize} height={badgeSize} fill={colors.base} mask="url(#custom-marker-base)" />
              {type && (
                <rect
                  x={-iconSize / 2}
                  y={-iconSize / 2}
                  width={iconSize}
                  height={iconSize}
                  fill={colors.icon}
                  mask={`url(#custom-marker-${type.name.toLowerCase()})`}
                />
              )}
            </g>
          </g>
        );
      })}
    </g>
  );
}
