import { useSignal, type Signal } from "@preact/signals";
import type { RefObject, TargetedKeyboardEvent, TargetedPointerEvent, TargetedWheelEvent } from "preact";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";

import flameIconUrl from "./assets/flame-shrine.png";
import mapImageUrl from "./assets/map.webp";
import { locations, locationsOfRegion, regions, shortName, type FlameLocation } from "./locations.ts";
import { foundIds, isShown, selectedLocation, selectLocation, stateOf, stepBy, stepLocations } from "./state.ts";
import {
  clampWidth,
  flyTo,
  homeView,
  mapSize,
  markerScale,
  panBy,
  resizeFrame,
  setView,
  stopAnimation,
  toMapPoint,
  toMapX,
  toMapY,
  view,
  viewBox,
  zoomAt,
  zoomBy,
  type View,
} from "./viewport.ts";

type Hover = {
  location: FlameLocation;
  clientX: number;
  clientY: number;
};

type Point = {
  x: number;
  y: number;
};

type Gesture = { kind: "pan"; start: Point; startView: View } | { kind: "pinch"; startDistance: number; anchor: [number, number]; startView: View };

const markerSize = 24;
const numberFormat = new Intl.NumberFormat("en");
const stateWords = {
  missing: "Missing",
  found: "Found",
  unknown: "Not checked",
} as const;

const distance = (first: Point, second: Point) => Math.hypot(first.x - second.x, first.y - second.y);
const midpoint = (first: Point, second: Point): Point => ({
  x: (first.x + second.x) / 2,
  y: (first.y + second.y) / 2,
});

function useMapGestures(svgRef: RefObject<SVGSVGElement | null>, onDragStart: () => void) {
  const moved = useRef(false);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const svg = svgRef.current!;
    const pointers = new Map<number, Point>();
    const controller = new AbortController();
    const { signal } = controller;
    let gesture: Gesture | null = null;

    const startGesture = () => {
      const [first, second] = pointers.values();
      if (first && second) {
        const center = midpoint(first, second);

        gesture = {
          kind: "pinch",
          startDistance: distance(first, second),
          anchor: toMapPoint(center.x, center.y, svg.getBoundingClientRect()),
          startView: view.peek(),
        };
      } else if (first) {
        gesture = {
          kind: "pan",
          start: first,
          startView: view.peek(),
        };
      } else {
        gesture = null;
      }
    };

    const endPointer = (event: PointerEvent) => {
      if (!pointers.delete(event.pointerId)) {
        return;
      }

      startGesture();

      if (!pointers.size) {
        setDragging(false);
      }
    };

    svg.addEventListener(
      "pointerdown",
      (event) => {
        stopAnimation();
        pointers.set(event.pointerId, {
          x: event.clientX,
          y: event.clientY,
        });

        if (pointers.size === 1) {
          moved.current = false;
        }

        startGesture();
      },
      { signal },
    );

    window.addEventListener(
      "pointermove",
      (event) => {
        if (!pointers.has(event.pointerId)) {
          return;
        }

        pointers.set(event.pointerId, {
          x: event.clientX,
          y: event.clientY,
        });

        const frame = svg.getBoundingClientRect();
        const [first, second] = pointers.values();

        if (gesture?.kind === "pan") {
          const deltaX = event.clientX - gesture.start.x;
          const deltaY = event.clientY - gesture.start.y;
          if (!moved.current && Math.abs(deltaX) + Math.abs(deltaY) < 5) {
            return;
          }

          moved.current = true;
          setDragging(true);
          onDragStart();

          const metresPerPixel = gesture.startView.width / frame.width;

          setView({
            centerX: gesture.startView.centerX - deltaX * metresPerPixel,
            centerY: gesture.startView.centerY - deltaY * metresPerPixel,
            width: gesture.startView.width,
          });
        } else if (gesture?.kind === "pinch" && first && second) {
          moved.current = true;

          const center = midpoint(first, second);
          const width = clampWidth((gesture.startView.width * gesture.startDistance) / distance(first, second));
          const metresPerPixel = width / frame.width;

          setView({
            centerX: gesture.anchor[0] - (center.x - frame.left - frame.width / 2) * metresPerPixel,
            centerY: gesture.anchor[1] - (center.y - frame.top - frame.height / 2) * metresPerPixel,
            width,
          });
        }
      },
      { signal },
    );

    window.addEventListener("pointerup", endPointer, { signal });
    window.addEventListener("pointercancel", endPointer, { signal });

    return () => controller.abort();
  }, []);

  return { moved, dragging };
}

function Tooltip({ hover, frameRef }: { hover: Signal<Hover | null>; frameRef: RefObject<HTMLElement | null> }) {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const current = hover.value;

  useLayoutEffect(() => {
    const tooltip = tooltipRef.current;
    if (!tooltip || !current) {
      return;
    }

    const frame = frameRef.current!.getBoundingClientRect();
    const x = current.clientX - frame.left;
    const y = current.clientY - frame.top;
    const flip = x > frame.width - tooltip.offsetWidth - 24;

    tooltip.style.left = `${flip ? x - tooltip.offsetWidth - 14 : x + 14}px`;
    tooltip.style.top = `${Math.max(8, y - tooltip.offsetHeight - 10)}px`;
  });

  if (!current) {
    return null;
  }

  const state = stateOf(current.location);

  return (
    <div
      ref={tooltipRef}
      class="floating pointer-events-none absolute z-2 grid gap-1 rounded-lg px-3 py-2 text-[13px] leading-4.5 font-medium whitespace-nowrap text-primary"
    >
      <small class="mono-caption">
        {current.location.region}
        {state === "unknown" ? "" : ` · ${state}`}
      </small>
      {shortName(current.location)}
    </div>
  );
}

function RegionLabels() {
  return (
    <g>
      {regions.map((region) => {
        const regionLocations = locationsOfRegion(region);
        const centerEast = regionLocations.reduce((sum, location) => sum + location.east, 0) / regionLocations.length;
        const centerNorth = regionLocations.reduce((sum, location) => sum + location.north, 0) / regionLocations.length;

        return (
          <g key={region} transform={`translate(${toMapX(centerEast)} ${toMapY(centerNorth)})`}>
            <g transform={markerScale}>
              <text class="region-label" text-anchor="middle" y={4}>
                {region}
              </text>
            </g>
          </g>
        );
      })}
    </g>
  );
}

function Markers({ hover, moved }: { hover: Signal<Hover | null>; moved: RefObject<boolean> }) {
  const selected = selectedLocation.value;
  // Missing markers draw above the other markers, and the selected marker draws above all.
  const ordered = [
    ...locations.filter((location) => stateOf(location) !== "missing" && location !== selected),
    ...locations.filter((location) => stateOf(location) === "missing" && location !== selected),
    ...(selected ? [selected] : []),
  ];

  const updateHover = (location: FlameLocation, event: TargetedPointerEvent<SVGGElement>) => {
    if (event.pointerType === "mouse") {
      hover.value = {
        location,
        clientX: event.clientX,
        clientY: event.clientY,
      };
    }
  };

  return (
    <g>
      {ordered.map((location) => {
        const classes = ["marker", stateOf(location), location === selected && "selected", !isShown(location) && location !== selected && "hidden-marker"];

        return (
          <g
            key={location.knowledgeId}
            class={classes.filter(Boolean).join(" ")}
            transform={`translate(${toMapX(location.east)} ${toMapY(location.north)})`}
            onClick={() => {
              if (!moved.current) {
                selectLocation(location, false);
              }
            }}
            onPointerEnter={(event) => updateHover(location, event)}
            onPointerMove={(event) => updateHover(location, event)}
            onPointerLeave={() => (hover.value = null)}
          >
            <g transform={markerScale}>
              <circle class="ring" r={markerSize / 2 + 3} />
              <image class="shape" href={flameIconUrl} x={-markerSize / 2} y={-markerSize / 2} width={markerSize} height={markerSize} />
            </g>
          </g>
        );
      })}
    </g>
  );
}

function Popover() {
  const selected = selectedLocation.value;
  if (!selected) {
    return null;
  }

  const state = stateOf(selected);
  const steps = stepLocations.value;
  const position = steps.indexOf(selected);
  const isAlone = steps.length < 2 && position >= 0;

  return (
    <div class="floating menu-in absolute bottom-3 left-3 z-3 grid w-[min(340px,calc(100%-24px))] gap-3 rounded-[18px] p-4">
      <div class="flex items-center justify-between gap-2">
        <span class="mono-caption">{selected.region}</span>
        <button class="btn btn-ghost btn-icon -my-1.5 -mr-2" aria-label="Close" onClick={() => selectLocation(null, false)}>
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
      </div>
      <div class="flex flex-wrap items-center justify-between gap-2.5">
        <h2 class="title text-primary">{shortName(selected)}</h2>
        <span class="status">
          <span class={`dot dot-${state}`} />
          {stateWords[state]}
        </span>
      </div>
      <p class="mono-caption tabular-nums">
        E {numberFormat.format(selected.east)} · N {numberFormat.format(selected.north)} · Alt {numberFormat.format(selected.altitude)} m
      </p>
      <div class="flex items-center justify-between gap-2 pt-1">
        <button class="btn btn-glass btn-sm" disabled={isAlone} onClick={() => stepBy(-1)}>
          Previous
        </button>
        <span class="mono-label tabular-nums">{position >= 0 ? `${position + 1} / ${steps.length}` : ""}</span>
        <button class="btn btn-action btn-sm" disabled={isAlone} onClick={() => stepBy(1)}>
          Next{foundIds.value ? " missing" : ""}
        </button>
      </div>
    </div>
  );
}

const zoomButtonClass = "btn btn-glass btn-icon";

export function MapView() {
  const frameRef = useRef<HTMLElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const hover = useSignal<Hover | null>(null);
  const { moved, dragging } = useMapGestures(svgRef, () => (hover.value = null));

  useEffect(() => {
    const frame = frameRef.current!;
    const observer = new ResizeObserver(() => {
      const { width, height } = frame.getBoundingClientRect();
      if (width && height) {
        resizeFrame(width, height);
      }
    });

    observer.observe(frame);

    return () => observer.disconnect();
  }, []);

  const handleWheel = (event: TargetedWheelEvent<SVGSVGElement>) => {
    event.preventDefault();
    zoomAt(Math.exp(event.deltaY * (event.ctrlKey ? 0.01 : 0.0015)), ...toMapPoint(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect()));
  };

  const handleKeyDown = (event: TargetedKeyboardEvent<HTMLElement>) => {
    const panDistance = view.peek().width * 0.15;
    const actions: Record<string, () => void> = {
      "+": () => zoomBy(0.7),
      "=": () => zoomBy(0.7),
      "-": () => zoomBy(1 / 0.7),
      _: () => zoomBy(1 / 0.7),
      "0": () => flyTo(homeView()),
      ArrowLeft: () => panBy(-panDistance, 0),
      ArrowRight: () => panBy(panDistance, 0),
      ArrowUp: () => panBy(0, -panDistance),
      ArrowDown: () => panBy(0, panDistance),
      Escape: () => selectLocation(null, false),
    };

    const action = actions[event.key];
    if (action) {
      event.preventDefault();
      action();
    }
  };

  return (
    <section
      ref={frameRef}
      tabIndex={0}
      aria-label="Map. Drag to pan. Use the plus and minus keys to zoom."
      class="relative h-full overflow-hidden bg-frame focus-visible:shadow-[inset_0_0_0_2px_var(--text-muted)]"
      onKeyDown={handleKeyDown}
    >
      <svg
        ref={svgRef}
        role="img"
        aria-label="Flame shrines and sanctums on the Embervale map"
        viewBox={viewBox}
        class={`absolute inset-0 block h-full w-full touch-none select-none ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
        onWheel={handleWheel}
        onClick={(event) => {
          if (!moved.current && !(event.target as Element).closest(".marker")) {
            selectLocation(null, false);
          }
        }}
      >
        <image href={mapImageUrl} x={0} y={0} width={mapSize} height={mapSize} preserveAspectRatio="none" />
        <RegionLabels />
        <Markers hover={hover} moved={moved} />
      </svg>
      <div class="absolute top-3 right-3 grid gap-1.5" role="group" aria-label="Zoom">
        <button aria-label="Zoom in" class={zoomButtonClass} onClick={() => zoomBy(0.6)}>
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
            <path d="M8 3v10M3 8h10" />
          </svg>
        </button>
        <button aria-label="Zoom out" class={zoomButtonClass} onClick={() => zoomBy(1 / 0.6)}>
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
            <path d="M3 8h10" />
          </svg>
        </button>
        <button aria-label="Show all flames" class={zoomButtonClass} onClick={() => flyTo(homeView())}>
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10" />
          </svg>
        </button>
      </div>
      <Tooltip hover={hover} frameRef={frameRef} />
      <Popover />
      <div class="mono-caption absolute right-3 bottom-2.5 text-(--marker-label)! [text-shadow:0_1px_2px_var(--marker-edge)]">
        Map{" "}
        <a class="underline" href="https://enshrouded.wiki.gg/" target="_blank" rel="noopener">
          Enshrouded Wiki
        </a>
      </div>
    </section>
  );
}
