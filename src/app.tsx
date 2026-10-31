import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";

import flameIconUrl from "./assets/flame-shrine.png";
import { locations, shortName, type FlameLocation, type LocationKind } from "./locations.ts";
import { MapView } from "./map.tsx";
import {
  errorMessage,
  forgetSave,
  foundCount,
  foundIds,
  listMode,
  loadSave,
  pickSaveFile,
  selectedLocation,
  selectLocation,
  shownLocations,
  stateOf,
  visibleKinds,
  type ListMode,
} from "./state.ts";

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

function TopBar() {
  const hasSave = foundIds.value !== null;

  return (
    <header class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5 border-b border-line bg-sheet px-4 py-2.5">
      <div class="flex min-w-0 items-center gap-2.5">
        <img class="size-7.5 shrink-0" src={flameIconUrl} alt="" />
        <h1 class="text-base font-semibold tracking-[-0.01em] text-primary">Enshrouded Flame Finder</h1>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <span class="status tabular-nums">
          <span class={`dot ${hasSave ? "dot-found" : ""}`} />
          {hasSave ? `${foundCount} / ${locations.length} lit` : `${locations.length} flames`}
        </span>
        {hasSave ? (
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
        Load a <code>characterN.ksd</code> file. A <code>worldN.ksd</code> file does not hold character data.
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

function LocationRow({ location }: { location: FlameLocation }) {
  const state = stateOf(location);

  return (
    <li>
      <button class="menu-item" aria-current={selectedLocation.value === location} onClick={() => selectLocation(location, true)}>
        <img class={`size-4.5 ${state === "found" ? "opacity-60 grayscale" : ""}`} src={flameIconUrl} alt="" />
        <span class="font-medium">{shortName(location)}</span>
        {state !== "unknown" && <span class={`dot dot-${state}`} aria-label={state} />}
      </button>
    </li>
  );
}

function Filters() {
  const modeIndex = listModes.findIndex(({ value }) => value === listMode.value);

  return (
    <div class="grid gap-2 border-b border-line p-3">
      <div class="track w-full" role="group" aria-label="Show">
        <span
          class="track-pill"
          style={{
            "--count": listModes.length,
            "--index": modeIndex,
          }}
        />
        {listModes.map(({ value, label }) => (
          <button key={value} aria-pressed={listMode.value === value} onClick={() => (listMode.value = value)}>
            {label}
          </button>
        ))}
      </div>
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
    </div>
  );
}

function Sidebar() {
  const rows = shownLocations.value;
  const showsMissing = listMode.value === "missing" && foundIds.value !== null;

  return (
    <aside class="flex min-h-0 flex-col border-line bg-sheet max-md:max-h-130 max-md:border-t md:border-l" aria-label="Locations">
      <Filters />
      <div class="min-h-0 flex-1 overflow-y-auto">
        {errorMessage.value && (
          <p role="alert" class="m-3 rounded-lg bg-(--danger-soft) px-3 py-2.5 text-[13px] leading-4.5 font-medium text-danger">
            {errorMessage}
          </p>
        )}
        {rows.length === 0 ? (
          <p class="px-4 py-6 text-[13px] leading-4.5 text-muted">
            {showsMissing ? "Nothing missing here. Every flame is lit." : "Turn on Shrines or Sanctums to see locations."}
          </p>
        ) : (
          <div class="p-1.5">
            {[...Map.groupBy(rows, (location) => location.region)].map(([region, regionRows]) => (
              <section key={region} aria-label={region}>
                <h2 class="menu-label mono-caption">
                  <span>{region}</span>
                  <span>{regionRows.length}</span>
                </h2>
                <ul class="grid gap-0.5">
                  {regionRows.map((location) => (
                    <LocationRow key={location.knowledgeId} location={location} />
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

        const file = event.dataTransfer?.files[0];
        if (file) {
          void loadSave(file);
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
