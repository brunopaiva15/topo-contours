import type { RenderResult } from "./types";

export interface PosterOptions {
  showTitle: boolean;
  title: string;
  lat: number;
  lng: number;
  /** Couleur du texte de légende (généralement la couleur maîtresse). */
  inkColor: string;
  backgroundColor: string;
  transparentBackground: boolean;
}

export interface PosterResult {
  /** SVG propre pour l'export. */
  cleanSvg: string;
  /** SVG avec attributs d'animation pour l'aperçu écran. */
  previewSvg: string;
  widthPx: number;
  heightPx: number;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Formate les coordonnées façon "46.02° N, 7.75° E". */
export function formatCoords(lat: number, lng: number): string {
  const ns = lat >= 0 ? "N" : "S";
  const ew = lng >= 0 ? "E" : "O";
  return `${Math.abs(lat).toFixed(2)}° ${ns}, ${Math.abs(lng).toFixed(2)}° ${ew}`;
}

/** Espace les lettres d'un titre pour l'effet capitales étirées. */
function spacedUpper(s: string): string {
  return s.toUpperCase();
}

/** Isole le contenu interne d'un `<svg>…</svg>`. */
function innerOf(svg: string): string {
  const openEnd = svg.indexOf(">");
  const closeStart = svg.lastIndexOf("</svg>");
  if (openEnd === -1 || closeStart === -1) return svg;
  return svg.slice(openEnd + 1, closeStart);
}

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * Compose le poster final à partir de la sortie de `renderSVG`.
 * Ajoute une bande de légende sous les contours si un titre est demandé,
 * sans modifier `render.ts`.
 */
export function buildPoster(
  render: RenderResult,
  opts: PosterOptions,
): PosterResult {
  const W = render.widthPx;
  const H = render.heightPx;
  const inner = innerOf(render.svg);

  const bandH = opts.showTitle ? Math.round(W * 0.11) : 0;
  const totalH = H + bandH;

  const bandBg =
    opts.showTitle && !opts.transparentBackground
      ? `<rect x="0" y="${H}" width="${W}" height="${bandH}" fill="${opts.backgroundColor}"/>`
      : "";

  let caption = "";
  if (opts.showTitle) {
    const titleSize = bandH * 0.34;
    const coordsSize = bandH * 0.19;
    const titleY = H + bandH * 0.46;
    const coordsY = H + bandH * 0.8;
    const spacing = titleSize * 0.22;
    const fontStack =
      "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    caption =
      `<text x="${W / 2}" y="${titleY}" fill="${opts.inkColor}" ` +
      `font-family="${fontStack}" font-size="${titleSize.toFixed(1)}" ` +
      `font-weight="600" letter-spacing="${spacing.toFixed(2)}" ` +
      `text-anchor="middle" dominant-baseline="middle">${escapeXml(
        spacedUpper(opts.title),
      )}</text>` +
      `<text x="${W / 2}" y="${coordsY}" fill="${opts.inkColor}" ` +
      `font-family="${fontStack}" font-size="${coordsSize.toFixed(1)}" ` +
      `letter-spacing="${(coordsSize * 0.12).toFixed(2)}" ` +
      `fill-opacity="0.75" text-anchor="middle" dominant-baseline="middle">${escapeXml(
        formatCoords(opts.lat, opts.lng),
      )}</text>`;
  }

  const open =
    `<svg xmlns="${SVG_NS}" viewBox="0 0 ${W} ${totalH}" ` +
    `width="${W}" height="${totalH}" preserveAspectRatio="xMidYMid meet">`;

  const cleanSvg = open + inner + bandBg + caption + "</svg>";

  // Variante animée : marquer les tracés pour l'animation de dessin.
  const animatedInner = inner.replace(
    /<path fill="none"/g,
    '<path class="ink" pathLength="1" fill="none"',
  );
  const previewSvg = open + animatedInner + bandBg + caption + "</svg>";

  return { cleanSvg, previewSvg, widthPx: W, heightPx: totalH };
}
