import { contours as d3contours } from "d3-contour";
import { blur2 } from "d3-array";
import type { ElevationGrid, Settings } from "./types";
import { recomputeExtent } from "./elevation";

/** Anneau = liste de points [x, y] en coordonnées de grille. */
export type Ring = Array<[number, number]>;

export interface ContourPolygon {
  value: number;
  /** Un MultiPolygon : liste de polygones, chacun = liste d'anneaux. */
  polygons: Ring[][];
}

/** Limite dure du nombre de seuils pour éviter les explosions de calcul. */
const MAX_THRESHOLDS = 400;

/**
 * Applique un flou gaussien (d3.blur2) à une copie de la grille.
 * Un rayon 0 renvoie une copie inchangée.
 */
export function blurGrid(grid: ElevationGrid, radius: number): ElevationGrid {
  const values = Float32Array.from(grid.values);
  const r = Math.max(0, Math.round(radius));
  if (r > 0) {
    blur2({ data: values, width: grid.width, height: grid.height }, r);
  }
  const { min, max } = recomputeExtent({ values });
  return { ...grid, values, min, max };
}

/**
 * Génère les seuils d'élévation selon le mode choisi.
 * - "spacing" : multiples de l'équidistance couvrant [min, max].
 * - "count"   : `levelCount` niveaux répartis uniformément dans (min, max).
 */
export function computeThresholds(
  min: number,
  max: number,
  settings: Settings,
): number[] {
  const result: number[] = [];
  if (!(max > min)) return result;

  if (settings.thresholdMode === "spacing") {
    const spacing = Math.max(1, settings.spacing);
    const start = Math.ceil(min / spacing) * spacing;
    for (let v = start; v <= max; v += spacing) {
      result.push(v);
      if (result.length > MAX_THRESHOLDS) break;
    }
  } else {
    const count = Math.max(1, Math.min(200, Math.round(settings.levelCount)));
    const step = (max - min) / (count + 1);
    for (let i = 1; i <= count; i++) {
      result.push(min + step * i);
    }
  }

  if (settings.ignoreZero) {
    return result.filter((v) => Math.abs(v) > 1e-6);
  }
  return result;
}

/** Exécute d3.contours et renvoie les polygones en coordonnées de grille. */
export function buildContours(
  grid: ElevationGrid,
  thresholds: number[],
): ContourPolygon[] {
  if (thresholds.length === 0) return [];

  const generator = d3contours()
    .size([grid.width, grid.height])
    .thresholds(thresholds)
    .smooth(true);

  const multis = generator(Array.from(grid.values));

  return multis.map((m) => ({
    value: m.value,
    polygons: m.coordinates as Ring[][],
  }));
}
