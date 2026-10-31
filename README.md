# Flame Shrine Finder

A map of the Flame Shrines and lore pages in Enshrouded. Drop a `characterN.ksd` save file on the page to see which shrines you have found and which lore pages you have read, and which ones you have yet to discover.

Switch between the **Flames**, **Lore** and **Places** layers in the sidebar. A loaded save also shades the areas the character has not explored yet (the save's fog of war); turn it off with **Shade unexplored areas**. The lore layer lists 517 pages across all eight regions (Springlands, Revelwood, Nomad Highlands, Blackmire, Albaneve Summits, Kindlewastes, Veilwater Basin and Cinder's Cradle), grouped by region or by journal category, with a search box and a hint for where each page is. 45 of those pages have no known save id yet, so a save cannot tell whether they are read. They always show as not checked.

## Where to find the character save

Where the save files are depends on whether Steam Cloud is on for Enshrouded. To check, right-click Enshrouded in your Steam library and select **Properties**.

- **Steam Cloud on (default):** open the Steam install folder (usually `C:\Program Files (x86)\Steam`; Steam shows it under **Steam > Settings > Storage**). Then go to `userdata\<YOUR_STEAM_ID>\1203620`. You can also download the file from your [Steam Cloud storage for Enshrouded](https://store.steampowered.com/account/remotestorageapp/?appid=1203620). You must be logged in to Steam to see this page.
- **Steam Cloud off:** paste `%userprofile%\Saved Games\Enshrouded` into the Windows Start menu or the File Explorer address bar.

In that folder, select a `characterN.ksd` file.

On a shared PC with Steam Cloud on, each Steam account has its own `userdata` folder. With Steam Cloud off, all players on the PC share one save folder.

More information: [Enshrouded save management](https://saraserenity.net/enshrouded/manage_saves.php?action=general#save_location).

The **Places** layer shows about 4,200 points of interest of 40 types: Ancient Spires, Vaults, Night Sanctums, dungeons, villages, camps, bosses, chests, collectibles, secret doors and more. Pick the types under **Types**. Chests, collectibles, bosses, enemy camps and Shroud Roots start hidden. Zoomed out, nearby places are thinned to one per spot, so zoom in to see them all. The save does not tell which places you have found yet.

## Lore and place data

`src/lore.ts`, `src/places.ts` and `src/assets/pins/` are generated from `app/public/data.json` of the [Enshrouded Interactive Map](https://github.com/nicolasferreiraxn/Enshrouded-Interactive-Map) (MIT), whose data comes from the game files of Keen Games. The region of each page is the region of the nearest lore pin on the [All Things How map](https://allthings.how/enshrouded/map/). To refresh it:

```sh
git clone --depth 1 https://github.com/nicolasferreiraxn/Enshrouded-Interactive-Map /tmp/eim
curl -o /tmp/regions.json https://static.allthings.how/game-maps/enshrouded/embervale/points/lore.json
bun scripts/import-data.ts /tmp/eim/app/public/data.json /tmp/regions.json
bun run format
```

## Development

```sh
bun install
bun run dev
```

Other scripts: `bun run build`, `bun test`, `bun run check`, `bun run format`.

## Docker

```sh
docker build -t flame-shrine-finder .
docker run -p 8080:80 flame-shrine-finder
```
