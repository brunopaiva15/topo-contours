import type { Settings } from "./types";

export interface StylePreset {
  id: string;
  label: string;
  /** Réglages d'apparence appliqués (n'affecte pas le nombre de niveaux). */
  settings: Pick<
    Settings,
    | "backgroundColor"
    | "majorColor"
    | "minorColor"
    | "majorWidth"
    | "minorWidth"
    | "majorEvery"
    | "blurRadius"
    | "smoothPasses"
    | "transparentBackground"
  >;
  /** Couleur d'accroche pour la pastille [fond, trait]. */
  swatch: [string, string];
}

export const STYLE_PRESETS: StylePreset[] = [
  {
    id: "encre",
    label: "Encre",
    swatch: ["#fafaf8", "#2b3a67"],
    settings: {
      backgroundColor: "#fafaf8",
      majorColor: "#2b3a67",
      minorColor: "#2b3a67",
      majorWidth: 2.5,
      minorWidth: 1,
      majorEvery: 5,
      blurRadius: 2,
      smoothPasses: 2,
      transparentBackground: false,
    },
  },
  {
    id: "minuit",
    label: "Minuit",
    swatch: ["#111a2e", "#e9e5d6"],
    settings: {
      backgroundColor: "#111a2e",
      majorColor: "#f2eede",
      minorColor: "#c9c6b6",
      majorWidth: 2.4,
      minorWidth: 0.9,
      majorEvery: 5,
      blurRadius: 2,
      smoothPasses: 2,
      transparentBackground: false,
    },
  },
  {
    id: "sable",
    label: "Sable",
    swatch: ["#efe6d4", "#7a5230"],
    settings: {
      backgroundColor: "#efe6d4",
      majorColor: "#6f4a2b",
      minorColor: "#9b7043",
      majorWidth: 2.4,
      minorWidth: 1,
      majorEvery: 5,
      blurRadius: 2,
      smoothPasses: 2,
      transparentBackground: false,
    },
  },
  {
    id: "glacier",
    label: "Glacier",
    swatch: ["#f4f9fb", "#2f7ea8"],
    settings: {
      backgroundColor: "#f4f9fb",
      majorColor: "#1f6f9c",
      minorColor: "#7fb4cf",
      majorWidth: 2.4,
      minorWidth: 0.9,
      majorEvery: 5,
      blurRadius: 2,
      smoothPasses: 2,
      transparentBackground: false,
    },
  },
  {
    id: "carbone",
    label: "Carbone",
    swatch: ["#26282b", "#f6f6f4"],
    settings: {
      backgroundColor: "#26282b",
      majorColor: "#ffffff",
      minorColor: "#b9bcc0",
      majorWidth: 2.4,
      minorWidth: 0.9,
      majorEvery: 5,
      blurRadius: 2,
      smoothPasses: 2,
      transparentBackground: false,
    },
  },
];

export interface DetailLevel {
  id: string;
  label: string;
  /** Équidistance en mètres : plus petite = courbes plus denses (comme la v1). */
  spacing: number;
}

/**
 * Niveaux de détail : pilotent l'équidistance (mode "spacing"), ce qui donne
 * des courbes denses et proportionnelles au relief, à la manière de la v1.
 */
export const DETAIL_LEVELS: DetailLevel[] = [
  { id: "epure", label: "Épuré", spacing: 40 },
  { id: "equilibre", label: "Équilibré", spacing: 15 },
  { id: "detaille", label: "Détaillé", spacing: 8 },
];

export const DEFAULT_PRESET_ID = "encre";
export const DEFAULT_DETAIL_ID = "equilibre";

export function findPreset(id: string): StylePreset {
  return STYLE_PRESETS.find((p) => p.id === id) ?? STYLE_PRESETS[0];
}

export function findDetail(id: string): DetailLevel {
  return DETAIL_LEVELS.find((d) => d.id === id) ?? DETAIL_LEVELS[1];
}
