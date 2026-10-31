import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";

import flameIconUrl from "./assets/flame-shrine.png";
import { type LocationKind } from "./locations.ts";
import { LoreIcon } from "./lore-icon.tsx";
import { MapView } from "./map.tsx";
import {
  activeLayer,
  activePins,
  checkableCount,
  errorMessage,
  forgetSave,
  foundCount,
  foundIds,
  listMode,
  loadSave,
  loreQuery,
  pickSaveFile,
  saveTracksLore,
  selectedPin,
  selectPin,
  setLayer,
  shownPins,
  stateOf,
  visibleKinds,
  type Layer,
  type ListMode,
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

function statusText() {
  const isLore = activeLayer.value === "lore";

  if (foundIds.value === null) {
    return `${activePins.value.length} ${isLore ? "lore pages" : "flames"}`;
  }

  if (isLore && !saveTracksLore.value) {
    return "Load the save again to check lore";
  }

  return `${foundCount} / ${checkableCount} ${isLore ? "read" : "lit"}`;
}

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
          {statusText()}
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

function PinIcon({ pin, found }: { pin: Pin; found: boolean }) {
  if (pin.layer === "lore") {
    return (
      <svg class={`size-4.5 shrink-0 ${found ? "opacity-60" : ""}`} viewBox="-12 -12 24 24" aria-hidden="true">
        <LoreIcon found={found} />
      </svg>
    );
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

function Filters() {
  return (
    <div class="grid gap-2 border-b border-line p-3">
      <Track label="Layer" options={layers} value={activeLayer.value} onChange={setLayer} />
      <Track label="Show" options={listModes} value={listMode.value} onChange={(value) => (listMode.value = value)} />
      {activeLayer.value === "flames" ? (
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
      ) : (
        <input
          class="search"
          type="search"
          placeholder="Search lore pages"
          aria-label="Search lore pages"
          value={loreQuery.value}
          onInput={(event) => (loreQuery.value = event.currentTarget.value)}
        />
      )}
    </div>
  );
}

function emptyText() {
  if (listMode.value === "missing" && foundIds.value !== null) {
    return activeLayer.value === "lore" ? "Nothing missing here. Every lore page is read." : "Nothing missing here. Every flame is lit.";
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
        {rows.length === 0 ? (
          <p class="px-4 py-6 text-[13px] leading-4.5 text-muted">{emptyText()}</p>
        ) : (
          <div class="p-1.5">
            {[...Map.groupBy(rows, (pin) => pin.group)].map(([group, groupRows]) => (
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
