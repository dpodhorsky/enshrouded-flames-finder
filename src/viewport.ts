import { computed, signal } from "@preact/signals";

import { locations, type FlameLocation } from "./locations.ts";

// The wiki map covers 0 to 10240 m on both axes, with north at the top.
export const mapSize = 10240;

export const toMapX = (east: number) => east;
export const toMapY = (north: number) => mapSize - north;

export type View = {
  centerX: number;
  centerY: number;
  width: number;
};

export const frameSize = signal({
  width: 1,
  height: 1,
});

export const view = signal<View>({
  centerX: mapSize / 2,
  centerY: mapSize / 2,
  width: mapSize,
});

export const viewBox = computed(() => {
  const { centerX, centerY, width } = view.value;
  const height = (width * frameSize.value.height) / frameSize.value.width;

  return `${centerX - width / 2} ${centerY - height / 2} ${width} ${height}`;
});

export const markerScale = computed(() => `scale(${view.value.width / frameSize.value.width})`);

export const clampWidth = (width: number) => {
  const frame = frameSize.peek();
  const widestView = Math.max(mapSize, (mapSize * frame.width) / frame.height) * 1.1;

  return Math.min(widestView, Math.max(450, width));
};

const clampCoordinate = (coordinate: number) => Math.min(mapSize, Math.max(0, coordinate));

export function setView(next: View) {
  view.value = {
    centerX: clampCoordinate(next.centerX),
    centerY: clampCoordinate(next.centerY),
    width: clampWidth(next.width),
  };
}

export function fit(targets: readonly FlameLocation[], padding: number): View {
  const eastValues = targets.map((location) => location.east);
  const northValues = targets.map((location) => location.north);
  const [westEdge, eastEdge] = [Math.min(...eastValues), Math.max(...eastValues)];
  const [southEdge, northEdge] = [Math.min(...northValues), Math.max(...northValues)];
  const frame = frameSize.peek();

  return {
    centerX: (westEdge + eastEdge) / 2,
    centerY: mapSize - (southEdge + northEdge) / 2,
    width: Math.max(eastEdge - westEdge + 2 * padding, ((northEdge - southEdge + 2 * padding) * frame.width) / frame.height),
  };
}

export const homeView = () => fit(locations, 350);

export function resizeFrame(width: number, height: number) {
  const isFirstSize = frameSize.peek().width === 1;

  frameSize.value = {
    width,
    height,
  };
  setView(isFirstSize ? homeView() : view.peek());
}

export function toMapPoint(clientX: number, clientY: number, frame: DOMRect): [number, number] {
  const { centerX, centerY, width } = view.peek();
  const height = (width * frame.height) / frame.width;

  return [centerX - width / 2 + ((clientX - frame.left) / frame.width) * width, centerY - height / 2 + ((clientY - frame.top) / frame.height) * height];
}

let animationFrame = 0;

export const stopAnimation = () => cancelAnimationFrame(animationFrame);

export function zoomAt(factor: number, anchorX: number, anchorY: number) {
  stopAnimation();

  const current = view.peek();
  // Clamp the width first. Otherwise the anchor math pans the view at the zoom limits.
  const width = clampWidth(current.width * factor);
  if (width === current.width) {
    return;
  }

  setView({
    centerX: anchorX - ((anchorX - current.centerX) * width) / current.width,
    centerY: anchorY - ((anchorY - current.centerY) * width) / current.width,
    width,
  });
}

export function zoomBy(factor: number) {
  const { centerX, centerY } = view.peek();

  zoomAt(factor, centerX, centerY);
}

export function panBy(deltaX: number, deltaY: number) {
  const current = view.peek();

  setView({
    ...current,
    centerX: current.centerX + deltaX,
    centerY: current.centerY + deltaY,
  });
}

const easeOutQuart = (progress: number) => 1 - (1 - progress) ** 4;

export function flyTo(target: View) {
  stopAnimation();

  if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
    setView(target);
    return;
  }

  const start = view.peek();
  const startTime = performance.now();
  const duration = 480;

  const step = (now: number) => {
    const progress = Math.min(1, (now - startTime) / duration);
    const eased = easeOutQuart(progress);

    setView({
      centerX: start.centerX + (target.centerX - start.centerX) * eased,
      centerY: start.centerY + (target.centerY - start.centerY) * eased,
      width: start.width * (target.width / start.width) ** eased,
    });

    if (progress < 1) {
      animationFrame = requestAnimationFrame(step);
    }
  };

  animationFrame = requestAnimationFrame(step);
}
