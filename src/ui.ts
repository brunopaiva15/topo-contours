import type { Settings } from "./types";
import type { SettingsStore } from "./state";

const ADVANCED_HTML = `
  <div class="adv-grid">
    <div class="field">
      <span class="field-label">Type de niveaux</span>
      <div class="seg" role="tablist">
        <input type="radio" name="tmode" id="tmode-spacing" value="spacing" />
        <label for="tmode-spacing">Équidistance</label>
        <input type="radio" name="tmode" id="tmode-count" value="count" />
        <label for="tmode-count">Nombre</label>
      </div>
    </div>
    <div class="field mode-row mode-spacing">
      <label for="in-spacing">Équidistance (m) <span class="val" id="val-spacing"></span></label>
      <input type="number" id="in-spacing" min="1" max="1000" step="1" />
    </div>
    <div class="field mode-row mode-count">
      <label for="in-count">Nombre de niveaux <span class="val" id="val-count"></span></label>
      <input type="range" id="in-count" min="10" max="60" step="1" />
    </div>
    <div class="field">
      <label for="in-blur">Lissage de la grille <span class="val" id="val-blur"></span></label>
      <input type="range" id="in-blur" min="0" max="5" step="1" />
    </div>
    <div class="field">
      <label for="in-major-every">Courbe maîtresse toutes les N <span class="val" id="val-major-every"></span></label>
      <input type="number" id="in-major-every" min="1" max="20" step="1" />
    </div>
    <div class="field">
      <label for="in-major-width">Épaisseur maîtresse <span class="val" id="val-major-width"></span></label>
      <input type="range" id="in-major-width" min="0.5" max="6" step="0.1" />
    </div>
    <div class="field">
      <label for="in-minor-width">Épaisseur intermédiaire <span class="val" id="val-minor-width"></span></label>
      <input type="range" id="in-minor-width" min="0.2" max="4" step="0.1" />
    </div>
    <div class="field">
      <label for="in-major-color">Couleur maîtresse</label>
      <input type="color" id="in-major-color" />
    </div>
    <div class="field">
      <label for="in-minor-color">Couleur intermédiaire</label>
      <input type="color" id="in-minor-color" />
    </div>
    <div class="field">
      <label for="in-bg-color">Couleur de fond</label>
      <input type="color" id="in-bg-color" />
    </div>
    <div class="field inline-check">
      <input type="checkbox" id="in-transparent" />
      <label for="in-transparent">Fond transparent</label>
    </div>
    <div class="field">
      <label for="in-margin">Marge intérieure (%) <span class="val" id="val-margin"></span></label>
      <input type="range" id="in-margin" min="0" max="20" step="1" />
    </div>
    <div class="field">
      <label for="in-smooth">Lissage des tracés <span class="val" id="val-smooth"></span></label>
      <input type="range" id="in-smooth" min="0" max="4" step="1" />
    </div>
    <div class="field inline-check">
      <input type="checkbox" id="in-ignore-zero" />
      <label for="in-ignore-zero">Ignorer le niveau 0 m</label>
    </div>
  </div>
`;

function q<T extends HTMLElement>(root: ParentNode, sel: string): T {
  const node = root.querySelector<T>(sel);
  if (!node) throw new Error(`Élément introuvable: ${sel}`);
  return node;
}

/** Panneau technique replié dans « Réglages avancés ». */
export class AdvancedControls {
  private root: HTMLElement;
  private store: SettingsStore;

  constructor(container: HTMLElement, store: SettingsStore) {
    this.root = container;
    this.store = store;
    container.innerHTML = ADVANCED_HTML;

    this.bind();
    this.sync(store.get());
    store.subscribe((s) => this.sync(s));
  }

  private bind(): void {
    const root = this.root;
    const s = this.store;

    q<HTMLInputElement>(root, "#tmode-spacing").addEventListener("change", () =>
      s.patch({ thresholdMode: "spacing" }),
    );
    q<HTMLInputElement>(root, "#tmode-count").addEventListener("change", () =>
      s.patch({ thresholdMode: "count" }),
    );

    const num = (sel: string, key: keyof Settings, valSel?: string): void => {
      const input = q<HTMLInputElement>(root, sel);
      input.addEventListener("input", () => {
        const v = parseFloat(input.value);
        if (Number.isFinite(v)) {
          s.patch({ [key]: v } as Partial<Settings>);
          if (valSel) q(root, valSel).textContent = input.value;
        }
      });
    };
    num("#in-spacing", "spacing", "#val-spacing");
    num("#in-count", "levelCount", "#val-count");
    num("#in-blur", "blurRadius", "#val-blur");
    num("#in-major-every", "majorEvery", "#val-major-every");
    num("#in-major-width", "majorWidth", "#val-major-width");
    num("#in-minor-width", "minorWidth", "#val-minor-width");
    num("#in-margin", "marginPercent", "#val-margin");
    num("#in-smooth", "smoothPasses", "#val-smooth");

    const color = (sel: string, key: keyof Settings): void => {
      const input = q<HTMLInputElement>(root, sel);
      input.addEventListener("input", () =>
        s.patch({ [key]: input.value } as Partial<Settings>),
      );
    };
    color("#in-major-color", "majorColor");
    color("#in-minor-color", "minorColor");
    color("#in-bg-color", "backgroundColor");

    q<HTMLInputElement>(root, "#in-transparent").addEventListener(
      "change",
      (e) =>
        s.patch({
          transparentBackground: (e.target as HTMLInputElement).checked,
        }),
    );
    q<HTMLInputElement>(root, "#in-ignore-zero").addEventListener(
      "change",
      (e) => s.patch({ ignoreZero: (e.target as HTMLInputElement).checked }),
    );
  }

  /** Reflète les réglages courants (ex. après application d'un preset). */
  private sync(s: Settings): void {
    const root = this.root;
    const setVal = (sel: string, value: string): void => {
      const input = root.querySelector<HTMLInputElement>(sel);
      if (input) input.value = value;
    };
    const setText = (sel: string, value: string): void => {
      const node = root.querySelector(sel);
      if (node) node.textContent = value;
    };

    setVal("#in-spacing", String(s.spacing));
    setText("#val-spacing", String(s.spacing));
    setVal("#in-count", String(s.levelCount));
    setText("#val-count", String(s.levelCount));
    setVal("#in-blur", String(s.blurRadius));
    setText("#val-blur", String(s.blurRadius));
    setVal("#in-major-every", String(s.majorEvery));
    setText("#val-major-every", String(s.majorEvery));
    setVal("#in-major-width", String(s.majorWidth));
    setText("#val-major-width", String(s.majorWidth));
    setVal("#in-minor-width", String(s.minorWidth));
    setText("#val-minor-width", String(s.minorWidth));
    setVal("#in-margin", String(s.marginPercent));
    setText("#val-margin", String(s.marginPercent));
    setVal("#in-smooth", String(s.smoothPasses));
    setText("#val-smooth", String(s.smoothPasses));
    setVal("#in-major-color", s.majorColor);
    setVal("#in-minor-color", s.minorColor);
    setVal("#in-bg-color", s.backgroundColor);

    const transparent = root.querySelector<HTMLInputElement>("#in-transparent");
    if (transparent) transparent.checked = s.transparentBackground;
    const ignore = root.querySelector<HTMLInputElement>("#in-ignore-zero");
    if (ignore) ignore.checked = s.ignoreZero;

    const spacingRadio = root.querySelector<HTMLInputElement>("#tmode-spacing");
    const countRadio = root.querySelector<HTMLInputElement>("#tmode-count");
    if (spacingRadio) spacingRadio.checked = s.thresholdMode === "spacing";
    if (countRadio) countRadio.checked = s.thresholdMode === "count";

    root
      .querySelectorAll<HTMLElement>(".mode-row")
      .forEach((r) => r.classList.remove("active"));
    root
      .querySelector<HTMLElement>(`.mode-${s.thresholdMode}`)
      ?.classList.add("active");
  }
}
