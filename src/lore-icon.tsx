// A parchment page, drawn on a 24 by 24 grid centred on 0 so it scales like the flame icon.
export function LoreIcon({ found = false }: { found?: boolean }) {
  return (
    <g class="lore-icon">
      <path d="M-7 -10h9.5l5 5v15h-14.5z" fill={found ? "#a3a3a3" : "#ecd9a8"} stroke="#141414" stroke-width="1.5" stroke-linejoin="round" />
      <path d="M2.5 -10v5h5" fill="none" stroke="#141414" stroke-width="1.5" stroke-linejoin="round" />
      <path d="M-4 -2h8M-4 2h8M-4 6h5" stroke={found ? "#555555" : "#7a5a2b"} stroke-width="1.5" stroke-linecap="round" />
    </g>
  );
}
