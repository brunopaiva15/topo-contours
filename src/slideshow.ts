import type { BBox, Settings } from "./types";
import { pickZoom, fetchTiles } from "./tiles";
import { decodeElevationGrid } from "./elevation";
import { blurGrid, buildContours, computeThresholds } from "./contours";
import { renderSVG } from "./render";

interface Zone {
  name: string;
  country: string;
  lat: number;
  lng: number;
}

/** Zones montagneuses emblématiques présentées sur l'accueil. */
const ZONES: Zone[] = [
  { name: "Cervin", country: "Suisse", lat: 45.9763, lng: 7.6586 },
  { name: "Mont Fuji", country: "Japon", lat: 35.3606, lng: 138.7274 },
  { name: "Everest", country: "Népal", lat: 27.9881, lng: 86.925 },
  { name: "Torres del Paine", country: "Chili", lat: -50.9423, lng: -73.4068 },
];

const HALF_LNG = 0.12;
const HALF_LAT = 0.085;
const CYCLE_MS = 5000;
const LOAD_GAP_MS = 600;
/**
 * Rendu volontairement léger : on abaisse le zoom des tuiles pour obtenir une
 * petite grille (calcul de contours très rapide, peu de tuiles téléchargées).
 */
const ZOOM_REDUCTION = 3;
const MIN_ZOOM = 8;

/** Réglages allégés propres au diaporama de fond. */
const LIGHT_SETTINGS: Settings = {
  thresholdMode: "spacing",
  spacing: 60,
  levelCount: 15,
  blurRadius: 1,
  majorEvery: 5,
  majorWidth: 2,
  minorWidth: 0.8,
  majorColor: "#2b3a67",
  minorColor: "#2b3a67",
  backgroundColor: "#fafaf8",
  transparentBackground: true,
  marginPercent: 0,
  smoothPasses: 0,
  ignoreZero: false,
};

function bboxOf(z: Zone): BBox {
  return {
    west: z.lng - HALF_LNG,
    east: z.lng + HALF_LNG,
    south: z.lat - HALF_LAT,
    north: z.lat + HALF_LAT,
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => window.setTimeout(r, ms));
}

interface Slide {
  el: HTMLDivElement;
  label: string;
}

/**
 * Diaporama de fond de l'accueil : génère de petits posters de contours pour
 * quelques massifs et les enchaîne en fondu. Léger, en tâche de fond, mis en
 * pause hors de l'accueil.
 */
export class SlideShow {
  private container: HTMLElement;
  private caption: HTMLElement;
  private slides: Slide[] = [];
  private index = 0;
  private nextZone = 0;
  private active = false;
  private loading = false;
  private controller = new AbortController();
  private interval: number | undefined;

  constructor(container: HTMLElement, caption: HTMLElement) {
    this.container = container;
    this.caption = caption;
  }

  resume(): void {
    if (this.active) return;
    this.active = true;
    this.controller = new AbortController();
    if (this.slides.length > 0) this.show(this.index);
    if (!this.loading && this.nextZone < ZONES.length) void this.loadLoop();
    window.clearInterval(this.interval);
    this.interval = window.setInterval(() => this.cycle(), CYCLE_MS);
  }

  pause(): void {
    if (!this.active) return;
    this.active = false;
    window.clearInterval(this.interval);
    this.controller.abort();
  }

  private async loadLoop(): Promise<void> {
    this.loading = true;
    while (this.active && this.nextZone < ZONES.length) {
      const zone = ZONES[this.nextZone++];
      try {
        const svg = await this.renderZone(zone);
        if (!this.active) break;
        if (svg) this.addSlide(svg, `${zone.name} · ${zone.country}`);
      } catch (err) {
        if ((err as Error).name === "AbortError") break;
      }
      await delay(LOAD_GAP_MS);
    }
    this.loading = false;
  }

  private async renderZone(zone: Zone): Promise<string | null> {
    const bbox = bboxOf(zone);
    const { zoom } = pickZoom(bbox);
    const lightZoom = Math.max(MIN_ZOOM, zoom - ZOOM_REDUCTION);

    const tiles = await fetchTiles(bbox, lightZoom, this.controller.signal);
    if (this.controller.signal.aborted) return null;

    const grid = decodeElevationGrid(tiles);
    const blurred = blurGrid(grid, LIGHT_SETTINGS.blurRadius);
    if (blurred.max - blurred.min < 1) return null;

    const thresholds = computeThresholds(
      blurred.min,
      blurred.max,
      LIGHT_SETTINGS,
    );
    const contours = buildContours(blurred, thresholds);
    if (contours.length === 0) return null;

    const render = renderSVG({
      gridWidth: blurred.width,
      gridHeight: blurred.height,
      contours,
      settings: LIGHT_SETTINGS,
    });

    // Plein cadre (cover) pour couvrir le fond de l'accueil.
    return render.svg.replace(
      'preserveAspectRatio="xMidYMid meet"',
      'preserveAspectRatio="xMidYMid slice"',
    );
  }

  private addSlide(svg: string, label: string): void {
    const el = document.createElement("div");
    el.className = "slide";
    el.innerHTML = svg;
    this.container.insertBefore(el, this.caption);
    this.slides.push({ el, label });
    if (this.slides.length === 1) this.show(0);
  }

  private show(i: number): void {
    if (this.slides.length === 0) return;
    this.index = i % this.slides.length;
    this.slides.forEach((s, k) =>
      s.el.classList.toggle("active", k === this.index),
    );
    this.caption.textContent = `◆  ${this.slides[this.index].label}`;
    this.caption.classList.add("show");
  }

  private cycle(): void {
    if (!this.active || this.slides.length < 2) return;
    this.show((this.index + 1) % this.slides.length);
  }
}
