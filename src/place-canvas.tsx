import { effect } from "@preact/signals";
import type { RefObject } from "preact";
import { useEffect, useRef } from "preact/hooks";

import { activeLayer, selectedPin, shownPins, type Pin } from "./state.ts";
import { frameSize, toMapX, toMapY, view } from "./viewport.ts";

// The Places layer can show thousands of points. SVG <image> markers made zooming slow from a few hundred on, so places are drawn
// on one canvas instead:
// - only places inside the frame are drawn;
// - zoomed out, the frame is split into cells of `cellSize` pixels and each cell draws one place, the first in type order (the
//   list puts Ancient Spires before caves and caves before chests). Zooming in makes the cells smaller in map terms, so more
//   places appear.
// The same list of drawn places answers hover and click, so a hidden place cannot be picked.
const iconSize = 22;
const cellSize = 26;
const hitRadius = 14;

type Drawn = { pin: Pin; x: number; y: number };

const images = new Map<string, HTMLImageElement>();

function imageOf(url: string, onLoad: () => void) {
  let image = images.get(url);
  if (!image) {
    image = new Image();
    image.src = url;
    images.set(url, image);
  }
  if (!image.complete) {
    image.addEventListener("load", onLoad, { once: true });
  }
  return image;
}

export function usePlaceCanvas(canvasRef: RefObject<HTMLCanvasElement | null>) {
  const drawn = useRef<Drawn[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const context = canvas.getContext("2d")!;
    let frame = 0;

    const draw = () => {
      frame = 0;
      const { width: frameWidth, height: frameHeight } = frameSize.peek();
      const ratio = devicePixelRatio || 1;
      if (canvas.width !== Math.round(frameWidth * ratio) || canvas.height !== Math.round(frameHeight * ratio)) {
        canvas.width = Math.round(frameWidth * ratio);
        canvas.height = Math.round(frameHeight * ratio);
      }

      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, frameWidth, frameHeight);
      drawn.current = [];

      if (activeLayer.peek() !== "places") {
        return;
      }

      const { centerX, centerY, width } = view.peek();
      const pixelsPerMetre = frameWidth / width;
      const left = centerX - width / 2;
      const top = centerY - frameHeight / pixelsPerMetre / 2;
      const selected = selectedPin.peek();
      const taken = new Set<number>();
      const columns = Math.ceil(frameWidth / cellSize) + 1;

      for (const pin of shownPins.peek()) {
        const x = (toMapX(pin.east) - left) * pixelsPerMetre;
        const y = (toMapY(pin.north) - top) * pixelsPerMetre;
        if (x < -iconSize || y < -iconSize || x > frameWidth + iconSize || y > frameHeight + iconSize || pin === selected) {
          continue;
        }

        const cell = Math.floor((y + iconSize) / cellSize) * columns + Math.floor((x + iconSize) / cellSize);
        if (taken.has(cell)) {
          continue;
        }
        taken.add(cell);

        const image = imageOf(pin.place!.iconUrl, schedule);
        if (image.complete && image.naturalWidth) {
          context.drawImage(image, x - iconSize / 2, y - iconSize / 2, iconSize, iconSize);
        }
        drawn.current.push({ pin, x, y });
      }
    };

    function schedule() {
      frame ||= requestAnimationFrame(draw);
    }

    // Reading the signals here subscribes the effect, so any pan, zoom, filter or selection change schedules one draw per frame.
    const dispose = effect(() => {
      void view.value;
      void frameSize.value;
      void shownPins.value;
      void selectedPin.value;
      void activeLayer.value;
      schedule();
    });

    return () => {
      dispose();
      cancelAnimationFrame(frame);
    };
  }, []);

  // The drawn place nearest to a point on the frame, if one is close enough to be meant.
  return (frameX: number, frameY: number): Pin | null => {
    let best: Drawn | null = null;
    let bestDistance = hitRadius;
    for (const candidate of drawn.current) {
      const distance = Math.hypot(candidate.x - frameX, candidate.y - frameY);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = candidate;
      }
    }
    return best?.pin ?? null;
  };
}
