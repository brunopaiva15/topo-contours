/** Bounding box géographique en degrés (WGS84). */
export interface BBox {
  west: number;
  south: number;
  east: number;
  north: number;
}

/**
 * Grille d'élévation décodée, exprimée en espace pixel Web Mercator des tuiles.
 * `values` fait `width * height`, ligne par ligne (row-major), du haut vers le bas.
 */
export interface ElevationGrid {
  width: number;
  height: number;
  values: Float32Array;
  /** Élévations min/max observées (mètres). */
  min: number;
  max: number;
  /** BBox exacte couverte par la grille. */
  bbox: BBox;
  /** Niveau de zoom des tuiles utilisé. */
  zoom: number;
}

export type ThresholdMode = "spacing" | "count";

export interface Settings {
  thresholdMode: ThresholdMode;
  /** Équidistance en mètres (mode "spacing"). */
  spacing: number;
  /** Nombre de niveaux cible (mode "count"). */
  levelCount: number;
  /** Rayon du flou gaussien appliqué à la grille (0–5). */
  blurRadius: number;
  /** Une courbe maîtresse toutes les N lignes. */
  majorEvery: number;
  majorWidth: number;
  minorWidth: number;
  majorColor: string;
  minorColor: string;
  backgroundColor: string;
  transparentBackground: boolean;
  /** Marge intérieure en pourcentage du plus petit côté. */
  marginPercent: number;
  /** Nombre de passes de lissage Chaikin sur les tracés. */
  smoothPasses: number;
  /** Ignorer le niveau 0 m (utile pour masquer le trait de côte). */
  ignoreZero: boolean;
}

/** Résultat prêt à afficher / exporter. */
export interface RenderResult {
  svg: string;
  widthPx: number;
  heightPx: number;
  levels: number;
}
