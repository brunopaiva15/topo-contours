import type { Settings } from "./types";

export const DEFAULT_SETTINGS: Settings = {
  thresholdMode: "spacing",
  spacing: 10,
  levelCount: 25,
  blurRadius: 2,
  majorEvery: 5,
  majorWidth: 2.5,
  minorWidth: 1,
  majorColor: "#2b3a67",
  minorColor: "#2b3a67",
  backgroundColor: "#fafaf8",
  transparentBackground: false,
  marginPercent: 6,
  smoothPasses: 2,
  ignoreZero: false,
};

type Listener = (settings: Settings) => void;

/** Petit store observable pour les réglages d'apparence. */
export class SettingsStore {
  private settings: Settings;
  private listeners = new Set<Listener>();

  constructor(initial: Settings = DEFAULT_SETTINGS) {
    this.settings = { ...initial };
  }

  get(): Settings {
    return this.settings;
  }

  /** Met à jour un sous-ensemble de réglages et notifie les abonnés. */
  patch(partial: Partial<Settings>): void {
    this.settings = { ...this.settings, ...partial };
    for (const listener of this.listeners) listener(this.settings);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
