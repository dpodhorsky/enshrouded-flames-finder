// A parchment page, drawn on a 24 by 24 grid centred on 0 so it scales like the flame icon.
// The shadow is part of the drawing: an SVG filter on each of 500 markers makes panning slow.
// A page that shows or completes a quest step carries a "!" badge in its top right corner.
export function LoreIcon({ found = false, shadow = false, quest = false }: { found?: boolean; shadow?: boolean; quest?: boolean }) {
  return (
    <g class="lore-icon">
      {shadow && <path d="M-7 -9h9.5l5 5v15h-14.5z" fill="#000000" fill-opacity="0.45" />}
      <path d="M-7 -10h9.5l5 5v15h-14.5z" fill={found ? "#8f8f8f" : "#ecd9a8"} stroke="#141414" stroke-width="1.5" stroke-linejoin="round" />
      <path d="M2.5 -10v5h5" fill="none" stroke="#141414" stroke-width="1.5" stroke-linejoin="round" />
      <path d="M-4 -2h8M-4 2h8M-4 6h5" stroke={found ? "#555555" : "#7a5a2b"} stroke-width="1.5" stroke-linecap="round" />
      {quest && (
        <g transform="translate(7 -9)">
          <circle r="5.5" fill={found ? "#6b6b70" : "#d9822b"} stroke="#141414" stroke-width="1.5" />
          <path d="M0 -3v3.2" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" />
          <circle cy="2.6" r="1" fill="#ffffff" />
        </g>
      )}
    </g>
  );
}

// Map markers reuse these symbols, so each marker is one <use> element instead of several paths.
export function LoreSymbols() {
  return (
    <>
      <symbol id="lore-page" viewBox="-12 -12 24 24" overflow="visible">
        <LoreIcon shadow />
      </symbol>
      <symbol id="lore-page-found" viewBox="-12 -12 24 24" overflow="visible">
        <LoreIcon found shadow />
      </symbol>
      <symbol id="lore-page-quest" viewBox="-12 -12 24 24" overflow="visible">
        <LoreIcon shadow quest />
      </symbol>
      <symbol id="lore-page-quest-found" viewBox="-12 -12 24 24" overflow="visible">
        <LoreIcon found shadow quest />
      </symbol>
    </>
  );
}
