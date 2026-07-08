import maplibregl from "maplibre-gl";
import type { BBox } from "./types";
import { pickZoom } from "./tiles";

export type FrameFormat = "portrait" | "square" | "landscape";

/** Ratio largeur/hauteur du cadre selon le format. */
const FORMAT_ASPECT: Record<FrameFormat, number> = {
  portrait: 210 / 297,
  square: 1,
  landscape: 297 / 210,
};

const OSM_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    },
  },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};

/** Part du conteneur occupée par le cadre-viseur. */
const FRAME_FILL = 0.82;
const SETTLE_DELAY = 800;
const MAX_GUARD_ZOOM = 15;

export interface ViewfinderCallbacks {
  onFrameSettled: (bbox: BBox) => void;
  onFrameMove: () => void;
}

/** Carte plein écran avec un cadre-viseur fixe au centre. */
export class ViewfinderMap {
  private map: maplibregl.Map;
  private container: HTMLElement;
  private frameEl: HTMLDivElement;
  private format: FrameFormat = "portrait";
  private cbs: ViewfinderCallbacks;
  private settleTimer: number | undefined;

  constructor(container: HTMLElement, cbs: ViewfinderCallbacks) {
    this.container = container;
    this.cbs = cbs;

    this.map = new maplibregl.Map({
      container,
      style: OSM_STYLE,
      center: [7.6586, 45.9763], // Cervin
      zoom: 12,
      attributionControl: { compact: true },
      // Cadre-viseur toujours orienté nord : la rotation ou l'inclinaison
      // (faciles à déclencher à deux doigts sur mobile) fausseraient le calcul
      // de la bbox et donneraient un poster au mauvais format.
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
    });
    // Empêche la rotation à deux doigts tout en gardant le zoom pincé.
    this.map.touchZoomRotate.disableRotation();
    this.map.keyboard.disableRotation();
    this.map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      "bottom-right",
    );

    this.frameEl = document.createElement("div");
    this.frameEl.className = "viewfinder";
    container.appendChild(this.frameEl);

    this.map.on("load", () => {
      this.layoutFrame();
      this.scheduleSettle();
    });
    // On n'ordonnance la génération qu'à l'arrêt : tout mouvement annule le
    // minuteur en attente pour éviter de générer en continu (ça fait lagger).
    this.map.on("movestart", () => window.clearTimeout(this.settleTimer));
    this.map.on("move", () => {
      window.clearTimeout(this.settleTimer);
      this.cbs.onFrameMove();
    });
    this.map.on("moveend", () => this.scheduleSettle());
    this.map.on("resize", () => this.layoutFrame());
    window.addEventListener("resize", () => this.layoutFrame());
  }

  setFormat(format: FrameFormat): void {
    this.format = format;
    this.layoutFrame();
    this.scheduleSettle();
  }

  getFormat(): FrameFormat {
    return this.format;
  }

  flyTo(lng: number, lat: number, zoom: number): void {
    this.map.flyTo({ center: [lng, lat], zoom, speed: 1.2, essential: true });
  }

  resize(): void {
    this.map.resize();
    this.layoutFrame();
  }

  /** Dimensionne et centre le cadre selon le format et la taille du conteneur. */
  private layoutFrame(): void {
    const cw = this.container.clientWidth;
    const ch = this.container.clientHeight;
    if (cw === 0 || ch === 0) return;

    const aspect = FORMAT_ASPECT[this.format];
    const maxW = cw * FRAME_FILL;
    const maxH = ch * FRAME_FILL;

    let fw = maxW;
    let fh = fw / aspect;
    if (fh > maxH) {
      fh = maxH;
      fw = fh * aspect;
    }

    const left = (cw - fw) / 2;
    const top = (ch - fh) / 2;
    Object.assign(this.frameEl.style, {
      width: `${fw}px`,
      height: `${fh}px`,
      left: `${left}px`,
      top: `${top}px`,
    });
  }

  private frameRect(): { left: number; top: number; width: number; height: number } {
    const cw = this.container.clientWidth;
    const ch = this.container.clientHeight;
    const aspect = FORMAT_ASPECT[this.format];
    const maxW = cw * FRAME_FILL;
    const maxH = ch * FRAME_FILL;
    let fw = maxW;
    let fh = fw / aspect;
    if (fh > maxH) {
      fh = maxH;
      fw = fh * aspect;
    }
    return { left: (cw - fw) / 2, top: (ch - fh) / 2, width: fw, height: fh };
  }

  /** bbox géographique correspondant au cadre. */
  getBBox(): BBox {
    const r = this.frameRect();
    const p1 = this.map.unproject([r.left, r.top]);
    const p2 = this.map.unproject([r.left + r.width, r.top + r.height]);
    return {
      west: Math.min(p1.lng, p2.lng),
      east: Math.max(p1.lng, p2.lng),
      south: Math.min(p1.lat, p2.lat),
      north: Math.max(p1.lat, p2.lat),
    };
  }

  private scheduleSettle(): void {
    window.clearTimeout(this.settleTimer);
    this.settleTimer = window.setTimeout(() => this.settle(), SETTLE_DELAY);
  }

  private settle(): void {
    const bbox = this.getBBox();
    // Garde-fou : zone trop grande -> resserrer le zoom automatiquement.
    const { capped } = pickZoom(bbox);
    if (capped && this.map.getZoom() < MAX_GUARD_ZOOM) {
      this.map.easeTo({ zoom: this.map.getZoom() + 1, duration: 400 });
      return; // le moveend suivant relancera l'évaluation
    }
    this.cbs.onFrameSettled(bbox);
  }
}
