# Flame Shrine Finder

A map of the Flame Shrines in Enshrouded. Drop a `characterN.ksd` save file on the page to see which shrines you have found and which ones you have yet to discover.

[More information on where to find the save files can be found here](https://saraserenity.net/enshrouded/manage_saves.php?action=general#save_location).

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
