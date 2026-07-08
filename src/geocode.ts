export type PlaceType = "mountain" | "city" | "water" | "address" | "place";

export interface GeoResult {
  name: string;
  /** Contexte lisible : ville, région, pays. */
  context: string;
  lat: number;
  lng: number;
  type: PlaceType;
  /** Zoom conseillé pour cadrer ce type de lieu. */
  zoomHint: number;
}

const PHOTON_URL = "https://photon.komoot.io/api/";
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";

interface PhotonProps {
  name?: string;
  street?: string;
  housenumber?: string;
  city?: string;
  county?: string;
  state?: string;
  country?: string;
  osm_key?: string;
  osm_value?: string;
  type?: string;
}

interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: PhotonProps;
}

function classify(p: PhotonProps): { type: PlaceType; zoomHint: number } {
  const key = p.osm_key ?? "";
  const value = p.osm_value ?? "";

  if (key === "natural" && ["peak", "volcano", "saddle"].includes(value)) {
    return { type: "mountain", zoomHint: 12 };
  }
  if (
    (key === "natural" && ["water", "bay", "glacier"].includes(value)) ||
    key === "waterway"
  ) {
    return { type: "water", zoomHint: 11 };
  }
  if (p.street || p.housenumber || key === "highway") {
    return { type: "address", zoomHint: 15 };
  }
  if (key === "place") {
    if (["city", "town"].includes(value)) return { type: "city", zoomHint: 12 };
    if (["village", "hamlet", "suburb"].includes(value)) {
      return { type: "city", zoomHint: 14 };
    }
    return { type: "place", zoomHint: 12 };
  }
  return { type: "place", zoomHint: 13 };
}

function joinContext(parts: Array<string | undefined>): string {
  return parts.filter((x): x is string => Boolean(x)).join(", ");
}

function nameFromProps(p: PhotonProps): string {
  if (p.name) return p.name;
  if (p.street) {
    return p.housenumber ? `${p.street} ${p.housenumber}` : p.street;
  }
  return p.city ?? p.county ?? p.state ?? "Lieu";
}

/** Autocomplétion via Photon. Renvoie [] en cas d'échec (le fallback prend le relais). */
export async function searchPhoton(
  query: string,
  signal: AbortSignal,
): Promise<GeoResult[]> {
  const url = `${PHOTON_URL}?q=${encodeURIComponent(query)}&lang=fr&limit=5`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Photon HTTP ${res.status}`);
  const data = (await res.json()) as { features?: PhotonFeature[] };
  const features = data.features ?? [];

  return features.map((f) => {
    const p = f.properties;
    const { type, zoomHint } = classify(p);
    const [lng, lat] = f.geometry.coordinates;
    return {
      name: nameFromProps(p),
      context: joinContext([p.city, p.state, p.country]),
      lat,
      lng,
      type,
      zoomHint,
    };
  });
}

interface NominatimItem {
  lat: string;
  lon: string;
  display_name: string;
  name?: string;
  type?: string;
  class?: string;
  address?: Record<string, string>;
}

/**
 * Fallback Nominatim : une seule requête, uniquement à la validation.
 * Le navigateur ne permet pas de fixer User-Agent (header interdit) ; on
 * s'appuie sur le Referer automatique et on évite l'autocomplétion.
 */
export async function searchNominatim(
  query: string,
  signal: AbortSignal,
): Promise<GeoResult[]> {
  const url = `${NOMINATIM_URL}?format=jsonv2&limit=5&accept-language=fr&q=${encodeURIComponent(
    query,
  )}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);
  const items = (await res.json()) as NominatimItem[];

  return items.map((it) => {
    const cls = it.class ?? "";
    const value = it.type ?? "";
    const pseudo: PhotonProps = { osm_key: cls, osm_value: value };
    if (cls === "highway" || it.address?.road) pseudo.street = it.address?.road;
    const { type, zoomHint } = classify(pseudo);
    const addr = it.address ?? {};
    const first = it.name || it.display_name.split(",")[0];
    return {
      name: first,
      context: joinContext([
        addr.city ?? addr.town ?? addr.village,
        addr.state,
        addr.country,
      ]),
      lat: parseFloat(it.lat),
      lng: parseFloat(it.lon),
      type,
      zoomHint,
    };
  });
}

/** Debounce générique typé. */
export function debounce<A extends unknown[]>(
  fn: (...args: A) => void,
  delay: number,
): (...args: A) => void {
  let timer: number | undefined;
  return (...args: A) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), delay);
  };
}
