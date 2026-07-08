import type { BBox } from "./types";

/** URL des tuiles Terrarium (AWS Open Data, CORS activé, sans clé). */
const TERRARIUM_URL = (z: number, x: number, y: number): string =>
  `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;

const TILE_SIZE = 256;
/** Cible de résolution sur le plus grand côté de la grille. */
const MAX_GRID = 1024;
/** Plafond du nombre de tuiles téléchargées. */
const MAX_TILES = 64;
/** Terrarium ne fournit pas de données au-delà de ce zoom. */
const MAX_ZOOM = 15;
/** Concurrence des téléchargements. */
const CONCURRENCY = 6;

export interface ZoomChoice {
  zoom: number;
  /** true si le zoom a été plafonné à cause du plafond de tuiles. */
  capped: boolean;
}

export interface TileFetchResult {
  imageData: ImageData;
  width: number;
  height: number;
  bbox: BBox;
  zoom: number;
}

/** Coordonnée pixel globale (x) d'une longitude à un zoom donné. */
function lonToGlobalPx(lon: number, z: number): number {
  return ((lon + 180) / 360) * TILE_SIZE * Math.pow(2, z);
}

/** Coordonnée pixel globale (y) d'une latitude à un zoom donné (Web Mercator). */
function latToGlobalPx(lat: number, z: number): number {
  const s = Math.sin((lat * Math.PI) / 180);
  const clamped = Math.min(Math.max(s, -0.9999), 0.9999);
  const y = 0.5 - Math.log((1 + clamped) / (1 - clamped)) / (4 * Math.PI);
  return y * TILE_SIZE * Math.pow(2, z);
}

/** Taille en pixels que couvrirait la bbox à un zoom donné. */
function pixelSize(bbox: BBox, z: number): { w: number; h: number } {
  const w = lonToGlobalPx(bbox.east, z) - lonToGlobalPx(bbox.west, z);
  const h = latToGlobalPx(bbox.south, z) - latToGlobalPx(bbox.north, z);
  return { w, h };
}

function tileCount(bbox: BBox, z: number): number {
  const x0 = lonToGlobalPx(bbox.west, z);
  const x1 = lonToGlobalPx(bbox.east, z);
  const y0 = latToGlobalPx(bbox.north, z);
  const y1 = latToGlobalPx(bbox.south, z);
  const nx =
    Math.floor((x1 - 1e-6) / TILE_SIZE) - Math.floor(x0 / TILE_SIZE) + 1;
  const ny =
    Math.floor((y1 - 1e-6) / TILE_SIZE) - Math.floor(y0 / TILE_SIZE) + 1;
  return Math.max(1, nx) * Math.max(1, ny);
}

/**
 * Choisit le niveau de zoom : la grille vise 512–1024 px sur le plus grand côté,
 * sans dépasser ~64 tuiles. Renvoie `capped: true` si le plafond a réduit le zoom.
 */
export function pickZoom(bbox: BBox): ZoomChoice {
  let chosen = 0;
  for (let z = 0; z <= MAX_ZOOM; z++) {
    const { w, h } = pixelSize(bbox, z);
    if (Math.max(w, h) <= MAX_GRID) {
      chosen = z;
    } else {
      break;
    }
  }
  // Plafonner le zoom si le nombre de tuiles dépasse la limite.
  let capped = false;
  while (chosen > 0 && tileCount(bbox, chosen) > MAX_TILES) {
    chosen -= 1;
    capped = true;
  }
  return { zoom: chosen, capped };
}

interface Tile {
  x: number;
  y: number;
}

function tileRange(
  bbox: BBox,
  z: number,
): { minX: number; minY: number; nx: number; ny: number } {
  const x0 = lonToGlobalPx(bbox.west, z);
  const x1 = lonToGlobalPx(bbox.east, z);
  const y0 = latToGlobalPx(bbox.north, z);
  const y1 = latToGlobalPx(bbox.south, z);
  const minX = Math.floor(x0 / TILE_SIZE);
  const maxX = Math.floor((x1 - 1e-6) / TILE_SIZE);
  const minY = Math.floor(y0 / TILE_SIZE);
  const maxY = Math.floor((y1 - 1e-6) / TILE_SIZE);
  return {
    minX,
    minY,
    nx: maxX - minX + 1,
    ny: maxY - minY + 1,
  };
}

/** Charge une tuile en ImageBitmap, avec 1 réessai ; renvoie null si nodata. */
async function loadTile(
  z: number,
  x: number,
  y: number,
  signal: AbortSignal,
): Promise<ImageBitmap | null> {
  const n = Math.pow(2, z);
  const wrappedX = ((x % n) + n) % n;
  if (y < 0 || y >= n) return null;
  const url = TERRARIUM_URL(z, wrappedX, y);

  for (let attempt = 0; attempt < 2; attempt++) {
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    try {
      const res = await fetch(url, { signal });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      return await createImageBitmap(blob);
    } catch (err) {
      if (signal.aborted || (err as Error).name === "AbortError") {
        throw err;
      }
      if (attempt === 1) return null; // nodata après échec définitif
    }
  }
  return null;
}

/**
 * Télécharge et compose les tuiles couvrant la bbox, puis recadre exactement
 * sur la bbox. Concurrence limitée, annulable via `signal`.
 */
export async function fetchTiles(
  bbox: BBox,
  zoom: number,
  signal: AbortSignal,
  onProgress?: (loaded: number, total: number) => void,
): Promise<TileFetchResult> {
  const { minX, minY, nx, ny } = tileRange(bbox, zoom);

  const composite = document.createElement("canvas");
  composite.width = nx * TILE_SIZE;
  composite.height = ny * TILE_SIZE;
  const ctx = composite.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas 2D indisponible.");

  // Couleur d'élévation 0 m (Terrarium: 0 m => R*256+G+B/256 = 32768).
  ctx.fillStyle = "rgb(128,0,0)";
  ctx.fillRect(0, 0, composite.width, composite.height);

  const tiles: Tile[] = [];
  for (let ty = 0; ty < ny; ty++) {
    for (let tx = 0; tx < nx; tx++) {
      tiles.push({ x: minX + tx, y: minY + ty });
    }
  }

  const total = tiles.length;
  let loaded = 0;
  let cursor = 0;

  const worker = async (): Promise<void> => {
    while (cursor < tiles.length) {
      const index = cursor++;
      const tile = tiles[index];
      const bitmap = await loadTile(zoom, tile.x, tile.y, signal);
      if (bitmap) {
        const dx = (tile.x - minX) * TILE_SIZE;
        const dy = (tile.y - minY) * TILE_SIZE;
        ctx.drawImage(bitmap, dx, dy);
        bitmap.close();
      }
      loaded += 1;
      onProgress?.(loaded, total);
    }
  };

  const workers = Array.from(
    { length: Math.min(CONCURRENCY, tiles.length) },
    () => worker(),
  );
  await Promise.all(workers);

  // Recadrage exact sur la bbox (offsets fractionnaires en pixels).
  const gx0 = lonToGlobalPx(bbox.west, zoom);
  const gy0 = latToGlobalPx(bbox.north, zoom);
  const gx1 = lonToGlobalPx(bbox.east, zoom);
  const gy1 = latToGlobalPx(bbox.south, zoom);

  const cropX = Math.round(gx0 - minX * TILE_SIZE);
  const cropY = Math.round(gy0 - minY * TILE_SIZE);
  const cropW = Math.max(1, Math.round(gx1 - gx0));
  const cropH = Math.max(1, Math.round(gy1 - gy0));

  const imageData = ctx.getImageData(cropX, cropY, cropW, cropH);

  return {
    imageData,
    width: cropW,
    height: cropH,
    bbox,
    zoom,
  };
}

export { MAX_TILES };
