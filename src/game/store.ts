import { create } from "zustand";

export type GameMode = "title" | "playing" | "paused" | "inventory" | "dead" | "settings";

export type GemItem = {
  id: number;
  kind: number;
  name: string;
};

export type HudState = {
  mode: GameMode;
  hp: number;
  maxHp: number;
  armor: number;
  maxArmor: number;
  stamina: number;
  score: number;
  highScore: number;
  ammo: number;
  mag: number;
  magSize: number;
  heals: number;
  slot: number;
  wave: number;
  kills: number;
  gems: GemItem[];
  announce: string;
  hitFlash: number;
  hurtFlash: number;
  blocking: boolean;
  combo: number;
  ready: boolean;
  isTouch: boolean;
  sensitivity: number;
  shake: number;
  volume: number;
  invertY: boolean;
  pixelScale: number;
};

const HIGH_KEY = "vaultbreaker-hiscore-v1";

function readHigh(): number {
  try {
    return Number(localStorage.getItem(HIGH_KEY) || 0) || 0;
  } catch {
    return 0;
  }
}

export function writeHigh(score: number) {
  try {
    const prev = readHigh();
    if (score > prev) localStorage.setItem(HIGH_KEY, String(score));
  } catch {
    /* ignore */
  }
}

export const useHud = create<HudState>(() => ({
  mode: "title",
  hp: 300,
  maxHp: 300,
  armor: 80,
  maxArmor: 100,
  stamina: 100,
  score: 0,
  highScore: typeof window !== "undefined" ? readHigh() : 0,
  ammo: 32,
  mag: 8,
  magSize: 8,
  heals: 3,
  slot: 2,
  wave: 0,
  kills: 0,
  gems: [],
  announce: "",
  hitFlash: 0,
  hurtFlash: 0,
  blocking: false,
  combo: 0,
  ready: false,
  isTouch: false,
  sensitivity: 1,
  shake: 1,
  volume: 0.8,
  invertY: false,
  pixelScale: 2.4,
}));

export const hudApi = {
  get: () => useHud.getState(),
  set: (p: Partial<HudState>) => useHud.setState(p),
  patch: (fn: (s: HudState) => Partial<HudState>) => useHud.setState(fn),
};
