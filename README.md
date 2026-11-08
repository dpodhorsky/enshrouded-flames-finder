# Flame Shrine Finder

A map of the Flame Shrines, lore pages and places of Enshrouded, with the quest journal. Drop a `characterN.ksd` save file on the page to see which shrines you have found, which lore pages you have read, which places you have discovered and which quests you have done. Drop the `worldN.ksd` of the world you play together with it to count world quests too.

Switch between the **Flames**, **Lore**, **Places** and **Quests** layers in the sidebar. A loaded save also shades the areas the character has not explored yet (the save's fog of war); turn it off with **Shade unexplored areas**. The lore layer lists the 520 journal pages the game places in the world, across all eight regions (Springlands, Revelwood, Nomad Highlands, Blackmire, Albaneve Summits, Kindlewastes, Veilwater Basin and Cinder's Cradle), grouped by region or by journal category, with a search box and, for about 110 pages, a hint for where the page is. Five more pages are not placed in the world (a quest hands them over, for example), so they are not on the map.

## Where to find the character save

Where the save files are depends on whether Steam Cloud is on for Enshrouded. To check, right-click Enshrouded in your Steam library and select **Properties**.

- **Steam Cloud on (default):** open the Steam install folder (usually `C:\Program Files (x86)\Steam`; Steam shows it under **Steam > Settings > Storage**). Then go to `userdata\<YOUR_STEAM_ID>\1203620`. You can also download the file from your [Steam Cloud storage for Enshrouded](https://store.steampowered.com/account/remotestorageapp/?appid=1203620). You must be logged in to Steam to see this page.
- **Steam Cloud off:** paste `%userprofile%\Saved Games\Enshrouded` into the Windows Start menu or the File Explorer address bar.

In that folder, select a `characterN.ksd` file.

On a shared PC with Steam Cloud on, each Steam account has its own `userdata` folder. With Steam Cloud off, all players on the PC share one save folder.

More information: [Enshrouded save management](https://saraserenity.net/enshrouded/manage_saves.php?action=general#save_location).

The **Places** layer shows about 4,600 points of interest. 364 of them come from the game's own map markers, under **Discoveries**: villages, ruins, dungeons, lairs, Flame sites and hints. A save tells whether the character has discovered each one; discovered ones fade on the map, and **Missing** lists only the others. The rest come from the community map, in 40 types: Ancient Spires, Vaults, Night Sanctums, dungeons, villages, camps, bosses, chests, collectibles, secret doors and more. The save cannot tell which of those you have found. Pick the types under **Types**. Chests, collectibles, bosses, enemy camps and Shroud Roots start hidden. Zoomed out, nearby places are thinned to one per spot, so zoom in to see them all.

A loaded character also brings its own **map markers**: the ones you placed in game, with the game's icons, colours and labels (hover a marker for its label). Turn them off with **Show my map markers**.

The **Quests** layer lists the journal's 188 quests by who gives them, with each quest's steps. With a save loaded, each quest shows as done, in progress or not started, and each step as done, current or not reached. Most quests are kept in both the world and the character save, but some only in the world save, so load both for a full count. Some steps ask for an NPC's state, which saves do not hold; for those the page goes by whether the journal shows the next step.

The **character button** in the top bar (it shows the name and level once a save is loaded) opens the character: level and XP, the unlocked skills by name with their ranks, the equipped gear and what the character carries, with item names.

## Lore and place data

`src/lore.ts`, `src/places.ts`, `src/items.ts` and `src/assets/pins/` are generated from `app/public/data.json` of the [Enshrouded Interactive Map](https://github.com/nicolasferreiraxn/Enshrouded-Interactive-Map) (MIT), whose data comes from the game files of Keen Games. The region of each page is the region of the nearest lore pin on the [All Things How map](https://allthings.how/enshrouded/map/). To refresh it:

```sh
git clone --depth 1 https://github.com/nicolasferreiraxn/Enshrouded-Interactive-Map /tmp/eim
curl -o /tmp/regions.json https://static.allthings.how/game-maps/enshrouded/embervale/points/lore.json
bun scripts/import-data.ts /tmp/eim/app/public/data.json /tmp/regions.json
bun run format
```

## Game data

`src/game/` is generated from the game's own files by `scripts/import-game.ts`: skill names, the journal's lore pages with their save ids and places, the map markers with the knowledge that marks them discovered, and the quests with each step's rules. It reads the resources that [kfc-parser](https://github.com/Brabb3l/kfc-parser) unpacks (`kfc-parser unpack`, which only reads the game files) and the English texts from the game folder:

```sh
bun scripts/import-game.ts <unpacked folder> <Enshrouded folder> --check <characterN.ksd> <worldN.ksd>
bun run format
```

`--check` prints how the data reads a character and a world save. The custom map marker icons in `src/assets/markers/` and their colours (`src/custom-markers.tsx`) come from the game files too: the `MapMarkerRegistryResource`, the marker textures and `menu.map.customMarkers.colors` of the UI bundle. The page takes each lore page's region and hint from the community data above, by the page's title and position.

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
