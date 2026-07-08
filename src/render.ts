import type { Settings, RenderResult } from "./types";
import type { ContourPolygon, Ring } from "./contours";
import { chaikinClosed, type Point } from "./smoothing";

const SVG_NS = "http://www.w3.org/2000/svg";

export interface RenderInput {
  gridWidth: number;
  gridHeight: number;
  /** Contours en ordre de seuil croissant. */
  contours: ContourPolygon[];
  settings: Settings;
}

function ringToPath(
  ring: Ring,
  passes: number,
  m: number,
  sx: number,
  sy: number,
): string {
  const pts: Point[] =
    passes > 0 ? chaikinClosed(ring as Point[], passes) : (ring as Point[]);
  if (pts.length < 2) return "";
  let d = "";
  for (let i = 0; i < pts.length; i++) {
    const x = (m + pts[i][0] * sx).toFixed(2);
    const y = (m + pts[i][1] * sy).toFixed(2);
    d += (i === 0 ? "M" : "L") + x + "," + y;
  }
  return d + "Z";
}

/** Construit le document SVG (chaîne) à partir des contours en coords grille. */
export function renderSVG(input: RenderInput): RenderResult {
  const { gridWidth: W, gridHeight: H, contours, settings } = input;

  const margin = (settings.marginPercent / 100) * Math.min(W, H);
  const sx = (W - 2 * margin) / W;
  const sy = (H - 2 * margin) / H;

  const majorEvery = Math.max(1, Math.round(settings.majorEvery));
  const passes = Math.max(0, Math.round(settings.smoothPasses));

  const minorPaths: string[] = [];
  const majorPaths: string[] = [];
  let levels = 0;

  contours.forEach((contour, index) => {
    if (contour.polygons.length === 0) return;
    levels += 1;
    const isMajor = index % majorEvery === 0;
    const target = isMajor ? majorPaths : minorPaths;
    for (const polygon of contour.polygons) {
      for (const ring of polygon) {
        const d = ringToPath(ring, passes, margin, sx, sy);
        if (d) target.push(d);
      }
    }
  });

  const bg =
    settings.transparentBackground
      ? ""
      : `<rect x="0" y="0" width="${W}" height="${H}" fill="${settings.backgroundColor}"/>`;

  const minorGroup =
    minorPaths.length > 0
      ? `<path fill="none" stroke="${settings.minorColor}" stroke-width="${settings.minorWidth}" stroke-linejoin="round" stroke-linecap="round" d="${minorPaths.join(
          "",
        )}"/>`
      : "";

  const majorGroup =
    majorPaths.length > 0
      ? `<path fill="none" stroke="${settings.majorColor}" stroke-width="${settings.majorWidth}" stroke-linejoin="round" stroke-linecap="round" d="${majorPaths.join(
          "",
        )}"/>`
      : "";

  const svg =
    `<svg xmlns="${SVG_NS}" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" preserveAspectRatio="xMidYMid meet">` +
    bg +
    minorGroup +
    majorGroup +
    `</svg>`;

  return { svg, widthPx: W, heightPx: H, levels };
}
