// A parchment page, drawn on a 24 by 24 grid centred on 0 so it scales like the flame icon.
// The shadow is part of the drawing: an SVG filter on each of 500 markers makes panning slow.
export function LoreIcon({ found = false, shadow = false }: { found?: boolean; shadow?: boolean }) {
  return (
    <g class="lore-icon">
      {shadow && <path d="M-7 -9h9.5l5 5v15h-14.5z" fill="#000000" fill-opacity="0.45" />}
      <path d="M-7 -10h9.5l5 5v15h-14.5z" fill={found ? "#8f8f8f" : "#ecd9a8"} stroke="#141414" stroke-width="1.5" stroke-linejoin="round" />
      <path d="M2.5 -10v5h5" fill="none" stroke="#141414" stroke-width="1.5" stroke-linejoin="round" />
      <path d="M-4 -2h8M-4 2h8M-4 6h5" stroke={found ? "#555555" : "#7a5a2b"} stroke-width="1.5" stroke-linecap="round" />
    </g>
  );
}

// Map markers reuse these two symbols, so each marker is one <use> element instead of four paths.
export function LoreSymbols() {
  return (
    <>
      <symbol id="lore-page" viewBox="-12 -12 24 24" overflow="visible">
        <LoreIcon shadow />
      </symbol>
      <symbol id="lore-page-found" viewBox="-12 -12 24 24" overflow="visible">
        <LoreIcon found shadow />
      </symbol>
    </>
  );
}
