# Flame Shrine Finder

A map of the Flame Shrines in Enshrouded. Drop a `characterN.ksd` save file on the page to see which shrines you have found and which ones you have yet to discover.

## Where to find the character save

Where the save files are depends on whether Steam Cloud is on for Enshrouded. To check, right-click Enshrouded in your Steam library and select **Properties**.

- **Steam Cloud on (default):** open the Steam install folder (usually `C:\Program Files (x86)\Steam`; Steam shows it under **Steam > Settings > Storage**). Then go to `userdata\<YOUR_STEAM_ID>\1203620`. You can also download the file from your [Steam Cloud storage for Enshrouded](https://store.steampowered.com/account/remotestorageapp/?appid=1203620). You must be logged in to Steam to see this page.
- **Steam Cloud off:** paste `%userprofile%\Saved Games\Enshrouded` into the Windows Start menu or the File Explorer address bar.

In that folder, select a `characterN.ksd` file.

On a shared PC with Steam Cloud on, each Steam account has its own `userdata` folder. With Steam Cloud off, all players on the PC share one save folder.

More information: [Enshrouded save management](https://saraserenity.net/enshrouded/manage_saves.php?action=general#save_location).

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
