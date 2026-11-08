import { signal, useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";

import flameIconUrl from "./assets/flame-shrine.png";
import { CharacterButton } from "./character-panel.tsx";
import { type LocationKind } from "./locations.ts";
import { LoreIcon } from "./lore-icon.tsx";
import { MapView } from "./map.tsx";
import {
  activeLayer,
  activePins,
  checkableCount,
  errorMessage,
  fogUrl,
  forgetSave,
  foundCount,
  groupOf,
  hasSave,
  knowledgeIsCurrent,
  listMode,
  loadSaves,
  loreGrouping,
  pickSaveFile,
  placePins,
  searchQuery,
  selectedPin,
  selectPin,
  setLayer,
  showFog,
  shownPins,
  stateOf,
  visibleKinds,
  visiblePlaceTypes,
  worldKnowledge,
  type Layer,
  type ListMode,
  type LoreGrouping,
  type Pin,
} from "./state.ts";

const layers: { value: Layer; label: string }[] = [
  {
    value: "flames",
    label: "Flames",
  },
  {
    value: "lore",
    label: "Lore",
  },
  {
    value: "places",
    label: "Places",
  },
  {
    value: "quests",
    label: "Quests",
  },
];

const listModes: { value: ListMode; label: string }[] = [
  {
    value: "missing",
    label: "Missing",
  },
  {
    value: "all",
    label: "All",
  },
];

const loreGroupings: { value: LoreGrouping; label: string }[] = [
  {
    value: "region",
    label: "By region",
  },
  {
    value: "journal",
    label: "By journal",
  },
];

const kindToggles: { kind: LocationKind; label: string }[] = [
  {
    kind: "shrine",
    label: "Shrines",
  },
  {
    kind: "sanctum",
    label: "Sanctums",
  },
];

const layerNouns: Record<Layer, [string, string]> = {
  flames: ["flames", "lit"],
  lore: ["lore pages", "read"],
  places: ["places", "discovered"],
  quests: ["quests", "done"],
};

// The quest list and its data load when the Quests layer first opens.
const questModule = signal<typeof import("./quest-list.tsx") | null>(null);

function openLayer(layer: Layer) {
  setLayer(layer);
  if (layer === "quests" && !questModule.peek()) {
    void import("./quest-list.tsx").then((module) => (questModule.value = module));
  }
}

function statusText() {
  const layer = activeLayer.value;
  const [noun, verb] = layerNouns[layer];

  if (layer === "places" && !placePins.value) {
    return "Loading places";
  }

  if (layer === "quests") {
    return questModule.value?.questStatus() ?? "Loading quests";
  }

  if (!hasSave.value || (layer !== "flames" && !knowledgeIsCurrent.value)) {
    return layer === "places"
      ? `${shownPins.value.length} / ${placePins.value!.length} places`
      : hasSave.value
        ? `Load the save again to check ${noun}`
        : `${activePins.value.length} ${noun}`;
  }

  return `${foundCount} / ${checkableCount} ${verb}`;
}

function TopBar() {
  return (
    <header class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5 border-b border-line bg-sheet px-4 py-2.5">
      <div class="flex min-w-0 items-center gap-2.5">
        <img class="size-7.5 shrink-0" src={flameIconUrl} alt="" />
        <h1 class="text-base font-semibold tracking-[-0.01em] text-primary">Enshrouded Flame Finder</h1>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <span class="status tabular-nums">
          <span class={`dot ${hasSave.value ? "dot-found" : ""}`} />
          {statusText()}
        </span>
        <CharacterButton />
        {hasSave.value || worldKnowledge.value ? (
          <button class="btn btn-glass btn-sm" onClick={forgetSave}>
            Reset loaded save
          </button>
        ) : (
          <button class="btn btn-action btn-sm" onClick={pickSaveFile}>
            Load save
          </button>
        )}
        <button class="btn btn-glass btn-sm btn-icon" popovertarget="save-help" aria-label="Where to find the save file">
          ?
        </button>
        <SaveHelp />
      </div>
    </header>
  );
}

function SaveHelp() {
  return (
    <div id="save-help" popover class="save-help floating menu-in">
      <h2 class="mb-2 text-sm font-semibold text-primary">Where to find your save</h2>
      <p class="mb-2">
        Load a <code>characterN.ksd</code> file. To track world quests too, select the <code>worldN.ksd</code> of the world you play together with it (or drop
        both files at once).
      </p>
      <ul class="mb-2 grid list-disc gap-1.5 pl-4">
        <li>
          <strong class="text-primary">Steam Cloud on (default):</strong> <code>&lt;Steam folder&gt;\userdata\&lt;YOUR_STEAM_ID&gt;\1203620</code>, or download
          it from your{" "}
          <a href="https://store.steampowered.com/account/remotestorageapp/?appid=1203620" target="_blank" rel="noreferrer">
            Steam Cloud storage
          </a>
          .
        </li>
        <li>
          <strong class="text-primary">Steam Cloud off:</strong> <code>%userprofile%\Saved Games\Enshrouded</code>
        </li>
      </ul>
      <a href="https://saraserenity.net/enshrouded/manage_saves.php?action=general#save_location" target="_blank" rel="noreferrer">
        More information
      </a>
    </div>
  );
}

function PinIcon({ pin, found }: { pin: Pin; found: boolean }) {
  if (pin.layer === "lore") {
    return (
      <svg class={`size-4.5 shrink-0 ${found ? "opacity-60" : ""}`} viewBox="-12 -12 24 24" aria-hidden="true">
        <LoreIcon found={found} />
      </svg>
    );
  }

  if (pin.place) {
    return <img class="size-4.5 shrink-0" src={pin.place.iconUrl} alt="" loading="lazy" />;
  }

  return <img class={`size-4.5 ${found ? "opacity-60 grayscale" : ""}`} src={flameIconUrl} alt="" />;
}

function PinRow({ pin }: { pin: Pin }) {
  const state = stateOf(pin);
  const page = pin.page;

  return (
    <li>
      <button class="menu-item" aria-current={selectedPin.value === pin} onClick={() => selectPin(pin, true)}>
        <PinIcon pin={pin} found={state === "found"} />
        <span class="min-w-0 flex-1 truncate font-medium" title={pin.title}>
          {pin.title}
        </span>
        {pin.place && <span class="mono-caption shrink-0">{pin.place.region}</span>}
        {page && page.parts > 1 && (
          <span class="mono-caption shrink-0 tabular-nums">
            {page.part}/{page.parts}
          </span>
        )}
        {state !== "unknown" && <span class={`dot dot-${state}`} aria-label={state} />}
      </button>
    </li>
  );
}

function Track<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div class="track w-full" role="group" aria-label={label}>
      <span
        class="track-pill"
        style={{
          "--count": options.length,
          "--index": options.findIndex((option) => option.value === value),
        }}
      />
      {options.map((option) => (
        <button key={option.value} aria-pressed={value === option.value} onClick={() => onChange(option.value)}>
          {option.label}
        </button>
      ))}
    </div>
  );
}

function SearchBox({ label }: { label: string }) {
  return (
    <input
      class="search"
      type="search"
      placeholder={label}
      aria-label={label}
      value={searchQuery.value}
      onInput={(event) => (searchQuery.value = event.currentTarget.value)}
    />
  );
}

function toggleInSet(set: ReadonlySet<string>, value: string) {
  const next = new Set(set);
  if (!next.delete(value)) {
    next.add(value);
  }
  return next;
}

function PlaceTypeFilters() {
  const pins = placePins.value;
  if (!pins) {
    return null;
  }

  const types = [...new Map(pins.map((pin) => [pin.place!.type.id, pin.place!.type])).values()];
  const counts = Map.groupBy(pins, (pin) => pin.place!.type.id);
  const visible = visiblePlaceTypes.value;

  return (
    <details class="place-types">
      <summary class="mono-caption">
        Types · {visible.size} of {types.length} shown
      </summary>
      <div class="mt-2 flex gap-1.5">
        <button class="chip chip-sm" onClick={() => (visiblePlaceTypes.value = new Set(types.map((type) => type.id)))}>
          All
        </button>
        <button class="chip chip-sm" onClick={() => (visiblePlaceTypes.value = new Set())}>
          None
        </button>
        <button class="chip chip-sm" onClick={() => (visiblePlaceTypes.value = new Set(types.filter((type) => type.shownByDefault).map((type) => type.id)))}>
          Default
        </button>
      </div>
      {[...Map.groupBy(types, (type) => type.group)].map(([group, groupTypes]) => (
        <div key={group} class="mt-2.5" role="group" aria-label={group}>
          <h3 class="mono-caption mb-1.5">{group}</h3>
          <div class="flex flex-wrap gap-1.5">
            {groupTypes.map((type) => (
              <button
                key={type.id}
                class="chip chip-sm gap-1.5"
                aria-pressed={visible.has(type.id)}
                onClick={() => (visiblePlaceTypes.value = toggleInSet(visible, type.id))}
              >
                <img class="size-4" src={counts.get(type.id)![0]!.place!.iconUrl} alt="" />
                {type.label}
                <span class="tabular-nums opacity-60">{counts.get(type.id)!.length}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </details>
  );
}

function FogToggle() {
  if (!fogUrl.value) {
    return null;
  }

  return (
    <button class="chip justify-center" aria-pressed={showFog.value} onClick={() => (showFog.value = !showFog.value)}>
      Shade unexplored areas
    </button>
  );
}

function Filters() {
  const layer = activeLayer.value;

  return (
    <div class="grid gap-2 border-b border-line p-3">
      <Track label="Layer" options={layers} value={layer} onChange={openLayer} />
      <Track label="Show" options={listModes} value={listMode.value} onChange={(value) => (listMode.value = value)} />
      {layer === "flames" && (
        <div class="grid grid-cols-2 gap-1.5" role="group" aria-label="Types">
          {kindToggles.map(({ kind, label }) => (
            <button
              key={kind}
              class="chip justify-center"
              aria-pressed={visibleKinds.value[kind]}
              onClick={() =>
                (visibleKinds.value = {
                  ...visibleKinds.value,
                  [kind]: !visibleKinds.value[kind],
                })
              }
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {layer === "lore" && (
        <>
          <Track label="Group" options={loreGroupings} value={loreGrouping.value} onChange={(value) => (loreGrouping.value = value)} />
          <SearchBox label="Search lore pages" />
        </>
      )}
      {layer === "places" && (
        <>
          <SearchBox label="Search places" />
          <PlaceTypeFilters />
        </>
      )}
      {layer === "quests" && <SearchBox label="Search quests" />}
      <FogToggle />
    </div>
  );
}

function emptyText() {
  if (listMode.value === "missing" && hasSave.value) {
    return activeLayer.value === "lore"
      ? "Nothing missing here. Every lore page is read."
      : activeLayer.value === "places"
        ? "Nothing missing here. Every place shown is discovered."
        : "Nothing missing here. Every flame is lit.";
  }

  if (activeLayer.value === "places") {
    return placePins.value ? "No place matches. Turn on more types, or change the search." : "Loading places…";
  }

  return activeLayer.value === "lore" ? "No lore page matches the search." : "Turn on Shrines or Sanctums to see locations.";
}

function Sidebar() {
  const rows = shownPins.value;

  return (
    <aside class="flex min-h-0 flex-col border-line bg-sheet max-md:max-h-130 max-md:border-t md:border-l" aria-label="Locations">
      <Filters />
      <div class="min-h-0 flex-1 overflow-y-auto">
        {errorMessage.value && (
          <p role="alert" class="m-3 rounded-lg bg-(--danger-soft) px-3 py-2.5 text-[13px] leading-4.5 font-medium text-danger">
            {errorMessage}
          </p>
        )}
        {activeLayer.value === "quests" ? (
          questModule.value ? (
            <questModule.value.QuestList />
          ) : (
            <p class="px-4 py-6 text-[13px] leading-4.5 text-muted">Loading quests…</p>
          )
        ) : rows.length === 0 ? (
          <p class="px-4 py-6 text-[13px] leading-4.5 text-muted">{emptyText()}</p>
        ) : (
          <div class="p-1.5">
            {[...Map.groupBy(rows, groupOf)].map(([group, groupRows]) => (
              <section key={group} aria-label={group}>
                <h2 class="menu-label mono-caption">
                  <span>{group}</span>
                  <span>{groupRows.length}</span>
                </h2>
                <ul class="grid grid-cols-[minmax(0,1fr)] gap-0.5">
                  {groupRows.map((pin) => (
                    <PinRow key={pin.key} pin={pin} />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}

const hasFiles = (event: DragEvent) => event.dataTransfer?.types.includes("Files") ?? false;

function Dropzone() {
  const visible = useSignal(false);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    // dragenter and dragleave fire for each child element, so a counter tracks when the drag leaves the window.
    let dragDepth = 0;

    window.addEventListener(
      "dragenter",
      (event) => {
        if (hasFiles(event)) {
          event.preventDefault();
          dragDepth++;
          visible.value = true;
        }
      },
      { signal },
    );
    window.addEventListener(
      "dragover",
      (event) => {
        if (hasFiles(event)) {
          event.preventDefault();
        }
      },
      { signal },
    );
    window.addEventListener(
      "dragleave",
      (event) => {
        if (hasFiles(event) && --dragDepth <= 0) {
          dragDepth = 0;
          visible.value = false;
        }
      },
      { signal },
    );
    window.addEventListener(
      "drop",
      (event) => {
        if (!hasFiles(event)) {
          return;
        }

        event.preventDefault();
        dragDepth = 0;
        visible.value = false;

        const files = [...(event.dataTransfer?.files ?? [])];
        if (files.length) {
          void loadSaves(files);
        }
      },
      { signal },
    );

    return () => controller.abort();
  }, []);

  if (!visible.value) {
    return null;
  }

  return (
    <div class="fixed inset-0 z-100 grid place-items-center bg-overlay p-6 backdrop-blur-sm">
      <div class="menu-in rounded-[30px] border-[1.5px] border-dashed border-(--lilac) px-14 py-12 text-center text-2xl leading-[1.15] font-semibold tracking-[-0.035em] text-primary">
        Drop your save to load it
      </div>
    </div>
  );
}

export function App() {
  return (
    <div class="grid h-dvh grid-rows-[auto_minmax(0,1fr)] max-md:h-auto">
      <TopBar />
      <main class="grid min-h-0 md:grid-cols-[minmax(0,1fr)_320px]">
        <div class="max-md:h-[64vh] max-md:min-h-90">
          <MapView />
        </div>
        <Sidebar />
      </main>
      <Dropzone />
    </div>
  );
}
