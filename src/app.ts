import "maplibre-gl/dist/maplibre-gl.css";
import "./style.css";

import { ViewfinderMap, type FrameFormat } from "./map";
import { SettingsStore } from "./state";
import { AdvancedControls } from "./ui";
import { SlideShow } from "./slideshow";
import { PosterEngine, type ComposeResult } from "./engine";
import { exportPNG, exportSVG, makeFilename } from "./export";
import {
  searchPhoton,
  searchNominatim,
  debounce,
  type GeoResult,
  type PlaceType,
} from "./geocode";
import {
  STYLE_PRESETS,
  DETAIL_LEVELS,
  findPreset,
  findDetail,
  DEFAULT_PRESET_ID,
  DEFAULT_DETAIL_ID,
} from "./presets";
import type { PosterOptions } from "./poster";
import type { BBox } from "./types";

const QUICK_CHIPS: GeoResult[] = [
  { name: "Cervin", context: "Valais, Suisse", lat: 45.9763, lng: 7.6586, type: "mountain", zoomHint: 12 },
  { name: "Lac Léman", context: "Suisse / France", lat: 46.45, lng: 6.51, type: "water", zoomHint: 10 },
  { name: "Mont Fuji", context: "Honshū, Japon", lat: 35.3606, lng: 138.7274, type: "mountain", zoomHint: 11 },
  { name: "Grand Canyon", context: "Arizona, États-Unis", lat: 36.1069, lng: -112.1129, type: "place", zoomHint: 11 },
];

const POETIC_MESSAGES = [
  "Lecture du relief…",
  "Tracé des courbes de niveau…",
  "Encrage…",
  "Mise en page…",
];

const PLACE_ICON: Record<PlaceType, string> = {
  mountain: "▲",
  city: "◍",
  water: "≈",
  address: "⌂",
  place: "◆",
};

function $<T extends HTMLElement>(sel: string): T {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`Élément introuvable: ${sel}`);
  return el;
}

export class App {
  private store = new SettingsStore();
  private engine = new PosterEngine();
  private map: ViewfinderMap;
  private slideshow: SlideShow;

  private step = 1;
  private selectedPlace: GeoResult | null = null;
  private presetId = DEFAULT_PRESET_ID;
  private detailId = DEFAULT_DETAIL_ID;
  private titleShow = true;
  private titleText = "";
  private pendingFly: { lng: number; lat: number; zoom: number } | null = null;

  private genController: AbortController | null = null;
  private searchController: AbortController | null = null;
  private generating = false;
  private renderTimer: number | undefined;
  private msgTimer: number | undefined;
  private lastCompose: ComposeResult | null = null;

  private suggestions: GeoResult[] = [];
  private activeSuggestion = -1;

  constructor() {
    // Réglages initiaux : preset + détail par défaut.
    this.store.patch({
      ...findPreset(this.presetId).settings,
      thresholdMode: "spacing",
      spacing: findDetail(this.detailId).spacing,
    });

    this.map = new ViewfinderMap($("#map"), {
      onFrameSettled: (bbox) => {
        if (this.step === 2) void this.runGeneration(bbox);
      },
      onFrameMove: () => this.onFrameMove(),
    });

    new AdvancedControls($("#advanced"), this.store);

    this.slideshow = new SlideShow($("#hero-slideshow"), $("#slide-caption"));

    this.buildQuickChips();
    this.buildPresets();
    this.buildDetail();
    this.bindStepper();
    this.bindSearch();
    this.bindFrame();
    this.bindResultPanel();

    this.store.subscribe(() => this.scheduleRender());
    this.goToStep(1);
  }

  // ---------- Navigation ----------

  private goToStep(n: number): void {
    this.step = n;
    for (const id of [1, 2, 3]) {
      const section = document.getElementById(
        ["", "step-search", "step-frame", "step-result"][id],
      );
      section?.classList.toggle("active", id === n);
      const dot = document.getElementById(`dot-${id}`);
      dot?.classList.toggle("active", id === n);
      dot?.classList.toggle("done", id < n);
    }
    $("#step-back").classList.toggle("hidden", n === 1);

    if (n === 1) this.slideshow.resume();
    else this.slideshow.pause();

    if (n === 2) {
      requestAnimationFrame(() => {
        this.map.resize();
        if (this.pendingFly) {
          this.map.flyTo(
            this.pendingFly.lng,
            this.pendingFly.lat,
            this.pendingFly.zoom,
          );
          this.pendingFly = null;
        }
      });
    }
    if (n === 3) this.enterResult();
  }

  private bindStepper(): void {
    $("#step-back").addEventListener("click", () => {
      if (this.step === 3) this.goToStep(2);
      else if (this.step === 2) this.goToStep(1);
    });
  }

  // ---------- Étape 1 : recherche ----------

  private buildQuickChips(): void {
    const root = $("#quick-chips");
    for (const chip of QUICK_CHIPS) {
      const btn = document.createElement("button");
      btn.className = "chip";
      btn.type = "button";
      btn.textContent = chip.name;
      btn.addEventListener("click", () => this.selectPlace(chip));
      root.appendChild(btn);
    }
  }

  private bindSearch(): void {
    const input = $<HTMLInputElement>("#search-input");
    const runSearch = debounce((value: string) => void this.doSearch(value), 300);

    input.addEventListener("input", () => {
      this.activeSuggestion = -1;
      runSearch(input.value);
    });

    input.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        this.moveActive(1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        this.moveActive(-1);
      } else if (e.key === "Enter") {
        e.preventDefault();
        void this.validateSearch(input.value);
      } else if (e.key === "Escape") {
        this.closeSuggestions();
      }
    });
  }

  private async doSearch(value: string): Promise<void> {
    const q = value.trim();
    if (q.length < 2) {
      this.closeSuggestions();
      return;
    }
    this.searchController?.abort();
    this.searchController = new AbortController();
    try {
      const results = await searchPhoton(q, this.searchController.signal);
      this.renderSuggestions(results);
    } catch (err) {
      if ((err as Error).name !== "AbortError") this.closeSuggestions();
    }
  }

  private renderSuggestions(results: GeoResult[]): void {
    this.suggestions = results;
    this.activeSuggestion = -1;
    const list = $("#suggestions");
    list.innerHTML = "";
    if (results.length === 0) {
      this.closeSuggestions();
      return;
    }
    results.forEach((r, i) => {
      const li = document.createElement("li");
      li.className = "suggestion";
      li.setAttribute("role", "option");
      li.dataset.index = String(i);
      li.innerHTML =
        `<span class="icon">${PLACE_ICON[r.type]}</span>` +
        `<span class="text"><span class="name">${escapeHtml(
          r.name,
        )}</span><span class="ctx">${escapeHtml(r.context)}</span></span>`;
      li.addEventListener("click", () => this.selectPlace(r));
      list.appendChild(li);
    });
    list.classList.add("open");
  }

  private moveActive(delta: number): void {
    if (this.suggestions.length === 0) return;
    this.activeSuggestion =
      (this.activeSuggestion + delta + this.suggestions.length) %
      this.suggestions.length;
    const items = document.querySelectorAll<HTMLElement>(".suggestion");
    items.forEach((el, i) =>
      el.classList.toggle("active", i === this.activeSuggestion),
    );
  }

  private async validateSearch(value: string): Promise<void> {
    if (this.activeSuggestion >= 0 && this.suggestions[this.activeSuggestion]) {
      this.selectPlace(this.suggestions[this.activeSuggestion]);
      return;
    }
    if (this.suggestions.length > 0) {
      this.selectPlace(this.suggestions[0]);
      return;
    }
    // Fallback Nominatim à la validation uniquement.
    const q = value.trim();
    if (q.length < 2) return;
    this.searchController?.abort();
    this.searchController = new AbortController();
    try {
      const results = await searchNominatim(q, this.searchController.signal);
      if (results.length > 0) this.selectPlace(results[0]);
      else this.renderSuggestions([]);
    } catch (err) {
      if ((err as Error).name !== "AbortError") this.renderSuggestions([]);
    }
  }

  private closeSuggestions(): void {
    $("#suggestions").classList.remove("open");
  }

  private selectPlace(place: GeoResult): void {
    this.selectedPlace = place;
    this.titleText = place.name;
    $<HTMLInputElement>("#title-input").value = place.name;
    this.closeSuggestions();
    this.pendingFly = { lng: place.lng, lat: place.lat, zoom: place.zoomHint };
    this.goToStep(2);
  }

  // ---------- Étape 2 : cadrage ----------

  private bindFrame(): void {
    const buttons = document.querySelectorAll<HTMLButtonElement>(".format-btn");
    const setActive = (fmt: FrameFormat): void => {
      buttons.forEach((b) =>
        b.classList.toggle("active", b.dataset.format === fmt),
      );
    };
    setActive(this.map.getFormat());
    buttons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const fmt = btn.dataset.format as FrameFormat;
        this.map.setFormat(fmt);
        setActive(fmt);
      });
    });

    $("#btn-create").addEventListener("click", () => {
      if (!this.engine.hasGrid() && !this.generating) {
        void this.runGeneration(this.map.getBBox());
      }
      this.goToStep(3);
    });
  }

  private onFrameMove(): void {
    if (this.step !== 2) return;
    // Annule toute génération en cours tant que la carte bouge.
    if (this.generating) {
      this.genController?.abort();
      this.generating = false;
    }
    const thumb = $("#thumb");
    thumb.classList.remove("hidden");
    thumb.classList.add("loading");
  }

  // ---------- Génération ----------

  private async runGeneration(bbox: BBox): Promise<void> {
    this.genController?.abort();
    this.genController = new AbortController();
    const signal = this.genController.signal;

    this.generating = true;
    if (this.step === 2) {
      $("#thumb").classList.remove("hidden");
      $("#thumb").classList.add("loading");
    }
    if (this.step === 3) this.showGenOverlay(true);

    try {
      await this.engine.fetchGrid(bbox, signal);
      if (signal.aborted) return;
      this.generating = false;
      this.showGenOverlay(false);
      $("#thumb").classList.remove("loading");
      this.renderPoster(this.step === 3);
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      this.generating = false;
      this.showGenOverlay(false);
      $("#thumb").classList.remove("loading");
      this.showStageMessage(
        "Impossible de récupérer le relief",
        "Vérifiez votre connexion et réessayez.",
      );
    }
  }

  // ---------- Étape 3 : rendu & personnalisation ----------

  private enterResult(): void {
    if (this.generating) {
      this.showGenOverlay(true);
    } else if (this.engine.hasGrid()) {
      this.renderPoster(true);
    } else {
      this.showStageMessage(
        "Rien à afficher",
        "Revenez au cadrage pour choisir une zone.",
      );
    }
  }

  private latLng(): { lat: number; lng: number } {
    if (this.selectedPlace) {
      return { lat: this.selectedPlace.lat, lng: this.selectedPlace.lng };
    }
    const b = this.engine.getBBox();
    if (b) return { lat: (b.north + b.south) / 2, lng: (b.east + b.west) / 2 };
    return { lat: 0, lng: 0 };
  }

  private posterOptions(): PosterOptions {
    const s = this.store.get();
    const { lat, lng } = this.latLng();
    return {
      showTitle: this.titleShow,
      title: this.titleText || this.selectedPlace?.name || "",
      lat,
      lng,
      inkColor: s.majorColor,
      backgroundColor: s.backgroundColor,
      transparentBackground: s.transparentBackground,
    };
  }

  private scheduleRender(): void {
    if (this.step !== 3 || !this.engine.hasGrid()) return;
    window.clearTimeout(this.renderTimer);
    this.renderTimer = window.setTimeout(() => this.renderPoster(false), 90);
  }

  private renderPoster(animate: boolean): void {
    if (!this.engine.hasGrid()) return;
    const result = this.engine.compose(this.store.get(), this.posterOptions());
    this.lastCompose = result;

    if (result.flat || !result.poster) {
      this.setDownloadEnabled(false);
      this.showStageMessage(
        "Ce lieu semble tout plat",
        "Essayez une région avec du relief — montagnes, vallées ou côtes.",
      );
      return;
    }

    const stage = $("#poster-stage");
    stage.innerHTML = animate ? result.poster.previewSvg : result.poster.cleanSvg;

    const thumb = $("#thumb-img");
    thumb.innerHTML = result.poster.cleanSvg;
    $("#thumb-zoom").innerHTML = result.poster.cleanSvg;

    this.setDownloadEnabled(true);
  }

  private buildPresets(): void {
    const root = $("#presets");
    for (const preset of STYLE_PRESETS) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "preset";
      btn.dataset.id = preset.id;
      btn.classList.toggle("active", preset.id === this.presetId);
      btn.innerHTML =
        `<span class="swatch" style="background:${preset.swatch[0]};--swatch-line:${preset.swatch[1]}"></span>` +
        `<span class="preset-label">${preset.label}</span>`;
      btn.addEventListener("click", () => this.applyPreset(preset.id));
      root.appendChild(btn);
    }
  }

  private applyPreset(id: string): void {
    this.presetId = id;
    document
      .querySelectorAll<HTMLElement>(".preset")
      .forEach((el) => el.classList.toggle("active", el.dataset.id === id));
    this.store.patch({ ...findPreset(id).settings });
  }

  private buildDetail(): void {
    const root = $("#detail");
    DETAIL_LEVELS.forEach((lvl, i) => {
      const input = document.createElement("input");
      input.type = "radio";
      input.name = "detail";
      input.id = `detail-${lvl.id}`;
      input.value = lvl.id;
      input.checked = lvl.id === this.detailId;
      const label = document.createElement("label");
      label.setAttribute("for", `detail-${lvl.id}`);
      label.textContent = lvl.label;
      input.addEventListener("change", () => this.applyDetail(lvl.id));
      root.appendChild(input);
      root.appendChild(label);
      void i;
    });
  }

  private applyDetail(id: string): void {
    this.detailId = id;
    this.store.patch({
      thresholdMode: "spacing",
      spacing: findDetail(id).spacing,
    });
  }

  private bindResultPanel(): void {
    const toggle = $<HTMLInputElement>("#title-toggle");
    toggle.checked = this.titleShow;
    const titleInput = $<HTMLInputElement>("#title-input");
    titleInput.disabled = !this.titleShow;

    toggle.addEventListener("change", () => {
      this.titleShow = toggle.checked;
      titleInput.disabled = !this.titleShow;
      this.scheduleRender();
    });
    titleInput.addEventListener("input", () => {
      this.titleText = titleInput.value;
      this.scheduleRender();
    });

    $("#btn-download").addEventListener("click", () => void this.downloadPNG());
    $("#btn-svg").addEventListener("click", () => this.downloadSVG());

    const advToggle = $("#advanced-toggle");
    advToggle.addEventListener("click", () => {
      advToggle.classList.toggle("open");
      $("#advanced").classList.toggle("hidden");
    });
  }

  private async downloadPNG(): Promise<void> {
    const poster = this.lastCompose?.poster;
    const bbox = this.engine.getBBox();
    if (!poster || !bbox) return;
    await exportPNG(
      poster.cleanSvg,
      poster.widthPx,
      poster.heightPx,
      4,
      makeFilename(bbox, "png"),
    );
  }

  private downloadSVG(): void {
    const poster = this.lastCompose?.poster;
    const bbox = this.engine.getBBox();
    if (!poster || !bbox) return;
    exportSVG(poster.cleanSvg, makeFilename(bbox, "svg"));
  }

  // ---------- Overlays & messages ----------

  private setDownloadEnabled(enabled: boolean): void {
    $<HTMLButtonElement>("#btn-download").disabled = !enabled;
    $<HTMLButtonElement>("#btn-svg").disabled = !enabled;
  }

  private showGenOverlay(show: boolean): void {
    const overlay = $("#gen-overlay");
    overlay.classList.toggle("active", show);
    if (show) this.startMessages();
    else this.stopMessages();
  }

  private startMessages(): void {
    const el = $("#gen-message");
    let i = 0;
    el.textContent = POETIC_MESSAGES[0];
    window.clearInterval(this.msgTimer);
    this.msgTimer = window.setInterval(() => {
      i = (i + 1) % POETIC_MESSAGES.length;
      el.style.opacity = "0";
      window.setTimeout(() => {
        el.textContent = POETIC_MESSAGES[i];
        el.style.opacity = "1";
      }, 200);
    }, 1200);
  }

  private stopMessages(): void {
    window.clearInterval(this.msgTimer);
  }

  private showStageMessage(title: string, body: string): void {
    $("#poster-stage").innerHTML = `<div class="poster-message"><strong>${escapeHtml(
      title,
    )}</strong>${escapeHtml(body)}</div>`;
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
