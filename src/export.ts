import type { BBox } from "./types";

const MAX_PIXELS = 8000;

/** Nom de fichier `topo_{lat}_{lng}_{date}.ext` basé sur le centre de la bbox. */
export function makeFilename(bbox: BBox, ext: string): string {
  const lat = ((bbox.north + bbox.south) / 2).toFixed(4);
  const lng = ((bbox.east + bbox.west) / 2).toFixed(4);
  const date = new Date().toISOString().slice(0, 10);
  return `topo_${lat}_${lng}_${date}.${ext}`;
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Laisser le temps au navigateur de démarrer le téléchargement.
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Télécharge le SVG vectoriel tel quel. */
export function exportSVG(svg: string, filename: string): void {
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  triggerDownload(blob, filename);
}

/**
 * Rasterise le SVG à l'échelle demandée puis télécharge un PNG net.
 * L'échelle est plafonnée pour ne pas dépasser MAX_PIXELS sur un côté.
 */
export async function exportPNG(
  svg: string,
  widthPx: number,
  heightPx: number,
  scale: number,
  filename: string,
): Promise<void> {
  const maxSide = Math.max(widthPx, heightPx) * scale;
  const effectiveScale =
    maxSide > MAX_PIXELS ? (MAX_PIXELS / Math.max(widthPx, heightPx)) : scale;

  const outW = Math.round(widthPx * effectiveScale);
  const outH = Math.round(heightPx * effectiveScale);

  const svgBlob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);

  try {
    const img = await loadImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D indisponible.");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, outW, outH);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/png"),
    );
    if (!blob) throw new Error("Échec de génération du PNG.");
    triggerDownload(blob, filename);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Impossible de charger le SVG."));
    img.src = url;
  });
}
