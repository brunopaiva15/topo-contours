import type { BBox, ElevationGrid, Settings } from "./types";
import { pickZoom, fetchTiles } from "./tiles";
import { decodeElevationGrid } from "./elevation";
import { blurGrid, buildContours, computeThresholds } from "./contours";
import type { ContourPolygon } from "./contours";
import { renderSVG } from "./render";
import { buildPoster, type PosterOptions, type PosterResult } from "./poster";

const FLAT_EPSILON = 1e-3;

interface ContourEntry {
  contours: ContourPolygon[];
  width: number;
  height: number;
  min: number;
  max: number;
  levels: number;
}

export interface ComposeResult {
  flat: boolean;
  min: number;
  max: number;
  levels: number;
  poster: PosterResult | null;
}

/**
 * Orchestration du pipeline avec cache : la grille brute reste en mémoire,
 * et les contours sont mémorisés par (flou, seuils) pour que les changements
 * d'apparence ne relancent aucun calcul lourd ni requête réseau.
 */
export class PosterEngine {
  private rawGrid: ElevationGrid | null = null;
  private bbox: BBox | null = null;
  private cache = new Map<string, ContourEntry>();

  hasGrid(): boolean {
    return this.rawGrid !== null;
  }

  getBBox(): BBox | null {
    return this.bbox;
  }

  /** Télécharge et décode la grille d'élévation. Renvoie `capped` si zoom réduit. */
  async fetchGrid(
    bbox: BBox,
    signal: AbortSignal,
    onProgress?: (loaded: number, total: number) => void,
  ): Promise<{ capped: boolean }> {
    const { zoom, capped } = pickZoom(bbox);
    const tiles = await fetchTiles(bbox, zoom, signal, onProgress);
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    this.rawGrid = decodeElevationGrid(tiles);
    this.bbox = bbox;
    this.cache.clear();
    return { capped };
  }

  private cacheKey(s: Settings): string {
    return [
      s.blurRadius,
      s.thresholdMode,
      s.spacing,
      s.levelCount,
      s.ignoreZero ? 1 : 0,
    ].join("|");
  }

  private contoursFor(settings: Settings): ContourEntry {
    const key = this.cacheKey(settings);
    const cached = this.cache.get(key);
    if (cached) return cached;

    const grid = blurGrid(this.rawGrid as ElevationGrid, settings.blurRadius);
    const thresholds = computeThresholds(grid.min, grid.max, settings);
    const contours = buildContours(grid, thresholds);
    const levels = contours.filter((c) => c.polygons.length > 0).length;
    const entry: ContourEntry = {
      contours,
      width: grid.width,
      height: grid.height,
      min: grid.min,
      max: grid.max,
      levels,
    };
    this.cache.set(key, entry);
    return entry;
  }

  /** Génère le poster à partir de la grille en mémoire (aucun réseau). */
  compose(settings: Settings, posterOpts: PosterOptions): ComposeResult {
    if (!this.rawGrid) {
      return { flat: true, min: 0, max: 0, levels: 0, poster: null };
    }

    const entry = this.contoursFor(settings);
    const amplitude = entry.max - entry.min;

    if (amplitude < FLAT_EPSILON || entry.levels === 0) {
      return {
        flat: true,
        min: entry.min,
        max: entry.max,
        levels: entry.levels,
        poster: null,
      };
    }

    const render = renderSVG({
      gridWidth: entry.width,
      gridHeight: entry.height,
      contours: entry.contours,
      settings,
    });
    const poster = buildPoster(render, posterOpts);

    return {
      flat: false,
      min: entry.min,
      max: entry.max,
      levels: render.levels,
      poster,
    };
  }
}
