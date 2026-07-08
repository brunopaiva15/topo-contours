export type Point = [number, number];

/**
 * Lissage de Chaikin sur un anneau fermé.
 * Chaque passe remplace chaque sommet par deux points aux quarts des arêtes,
 * arrondissant progressivement le tracé tout en conservant sa forme.
 */
export function chaikinClosed(ring: Point[], passes: number): Point[] {
  if (passes <= 0 || ring.length < 3) return ring;

  let current = ring;
  // Retirer le point de fermeture dupliqué s'il existe (ring[0] == ring[n-1]).
  if (
    current.length > 1 &&
    current[0][0] === current[current.length - 1][0] &&
    current[0][1] === current[current.length - 1][1]
  ) {
    current = current.slice(0, -1);
  }

  for (let pass = 0; pass < passes; pass++) {
    const n = current.length;
    if (n < 3) break;
    const next: Point[] = [];
    for (let i = 0; i < n; i++) {
      const p0 = current[i];
      const p1 = current[(i + 1) % n];
      next.push([
        0.75 * p0[0] + 0.25 * p1[0],
        0.75 * p0[1] + 0.25 * p1[1],
      ]);
      next.push([
        0.25 * p0[0] + 0.75 * p1[0],
        0.25 * p0[1] + 0.75 * p1[1],
      ]);
    }
    current = next;
  }

  // Refermer l'anneau.
  current.push([current[0][0], current[0][1]]);
  return current;
}
