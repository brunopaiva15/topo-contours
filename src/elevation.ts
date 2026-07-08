import type { BBox, ElevationGrid } from "./types";
import type { TileFetchResult } from "./tiles";

/**
 * Décode une valeur d'élévation Terrarium à partir des composantes RGB.
 * élévation (m) = (R * 256 + G + B / 256) - 32768
 */
export function decodeTerrariumPixel(r: number, g: number, b: number): number {
  return r * 256 + g + b / 256 - 32768;
}

/**
 * Transforme le résultat de tuiles (ImageData Terrarium) en grille d'élévations.
 * Les pixels nodata (tuiles manquantes) ont été peints à 0 m en amont.
 */
export function decodeElevationGrid(tile: TileFetchResult): ElevationGrid {
  const { imageData, width, height, bbox, zoom } = tile;
  const { data } = imageData;
  const values = new Float32Array(width * height);

  let min = Infinity;
  let max = -Infinity;

  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    const elev = decodeTerrariumPixel(data[o], data[o + 1], data[o + 2]);
    values[i] = elev;
    if (elev < min) min = elev;
    if (elev > max) max = elev;
  }

  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    min = 0;
    max = 0;
  }

  return { width, height, values, min, max, bbox, zoom };
}

/** Recalcule min/max (utile après un flou). */
export function recomputeExtent(grid: {
  values: Float32Array;
}): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < grid.values.length; i++) {
    const v = grid.values[i];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (!Number.isFinite(min)) return { min: 0, max: 0 };
  return { min, max };
}

export type { BBox };
