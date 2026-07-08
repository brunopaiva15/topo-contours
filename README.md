# Générateur de posters de contours topographiques

Application web qui transforme n'importe quelle zone du globe en poster minimaliste
de courbes de niveau. Tout tourne dans le navigateur : **aucun backend, aucune clé API**.

## Installation

```bash
npm i
npm run dev
```

Ouvrez l'URL indiquée par Vite (par défaut `http://localhost:5173`).

Build de production :

```bash
npm run build
npm run preview
```

## Utilisation

Le parcours se fait en 3 étapes guidées :

1. **Où ?** Tapez un lieu (adresse, montagne, ville) dans le champ de recherche —
   autocomplétion via Photon (OSM), sans clé API — ou choisissez une suggestion rapide
   (Cervin, Lac Léman, Mont Fuji, Grand Canyon).
2. **Cadrez.** La carte s'affiche plein écran avec un cadre-viseur central. Déplacez et
   zoomez la carte sous le cadre, choisissez le format (Portrait / Carré / Paysage).
   Une miniature du poster se dessine automatiquement pendant que vous cadrez.
3. **Votre poster.** Choisissez un style (Encre, Minuit, Sable, Glacier, Carbone), un niveau
   de détail (Épuré / Équilibré / Détaillé), activez le titre du lieu, puis
   **téléchargez le poster** en PNG haute résolution (ou en SVG). Changer de style ou de titre
   met à jour l'aperçu instantanément, **sans re-télécharger** les données. Un accordéon
   « Réglages avancés » expose les contrôles techniques (équidistance, lissage, couleurs, marges).

Essayez **Cervin** (centré par défaut) pour des contours denses et reconnaissables.

## Pipeline

```
bbox → zoom auto → fetch tuiles Terrarium → décodage RGB → grille Float32
     → flou gaussien (blur2) → seuils → d3.contours → lissage Chaikin → SVG → PNG/SVG
```

1. **Zoom automatique** (`tiles.ts`) : choisi pour viser 512–1024 px sur le plus grand côté,
   plafonné à ~64 tuiles (au-delà, la résolution est réduite et l'utilisateur averti).
2. **Téléchargement** (`tiles.ts`) : tuiles [Terrarium](https://registry.opendata.aws/terrain-tiles/)
   (`s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png`), en parallèle
   (concurrence 6), avec `AbortController` (annulation d'une génération obsolète) et un
   réessai par tuile. Les tuiles composées sont recadrées exactement sur la bbox. Une tuile
   manquante (404, pleine mer) est traitée comme 0 m.
3. **Décodage** (`elevation.ts`) : `élévation (m) = R*256 + G + B/256 − 32768`.
4. **Lissage de grille** (`contours.ts`) : `d3.blur2` (rayon paramétrable) pour des courbes fluides.
5. **Seuils** (`contours.ts`) : par équidistance (ex. 10 m) ou par nombre de niveaux.
6. **Contours** (`contours.ts`) : `d3.contours()` (marching squares) → MultiPolygons.
7. **Rendu** (`render.ts` + `smoothing.ts`) : lissage Chaikin des tracés, un trait par isoligne,
   courbes maîtresses (épaisses) toutes les N lignes, intermédiaires fines.
8. **Export** (`export.ts`) : SVG direct, ou SVG → `Image` → `canvas` à l'échelle → PNG net.

## Structure

Couche pipeline (inchangée) :

| Fichier | Rôle |
| --- | --- |
| `src/tiles.ts` | Zoom, calcul et téléchargement des tuiles, recadrage bbox |
| `src/elevation.ts` | Décodage Terrarium → `Float32Array` |
| `src/contours.ts` | Flou `blur2`, seuils, `d3.contours` |
| `src/smoothing.ts` | Lissage de Chaikin |
| `src/render.ts` | Génération du SVG (major/minor, marge, fond) |
| `src/export.ts` | Export PNG / SVG |

Couche expérience (parcours guidé) :

| Fichier | Rôle |
| --- | --- |
| `src/app.ts` | Contrôleur des 3 étapes, transitions, cache partagé |
| `src/geocode.ts` | Recherche de lieu (Photon + fallback Nominatim) |
| `src/map.ts` | Carte MapLibre plein écran avec cadre-viseur et formats |
| `src/engine.ts` | Orchestration du pipeline avec cache grille/contours |
| `src/poster.ts` | Compositeur du SVG final (titre) + variante animée |
| `src/presets.ts` | 5 styles et 3 niveaux de détail |
| `src/state.ts` | Store de réglages observable |
| `src/ui.ts` | Contrôles techniques (accordéon « Réglages avancés ») |
| `src/main.ts` | Point d'entrée (instancie `App`) |

## Données & attribution

- Fond de carte : © OpenStreetMap contributors.
- Élévation : Terrain Tiles on AWS (Mapzen / AWS Open Data), domaine public / sources ouvertes.

## Notes techniques

- Pour des zones de taille raisonnable, le rendu travaille directement en espace pixel
  Web Mercator des tuiles : pas de reprojection.
- TypeScript strict, aucune dépendance de backend, aucune clé API.
