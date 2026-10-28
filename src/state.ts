import type { TableSettings } from './engine/DiceTable';
import type { Badge, Part, Term } from './logic/roll';

export const DEFAULT_SETTINGS: TableSettings = {
  styleId: 'random',
  timeScale: 0.35,
  quality: 'high',
  felt: 'oxblood',
  sound: true,
  volume: 0.7,
};

export interface CocState {
  skill: number;
  name: string;
  bonus: number;
  penalty: number;
}

export interface HistoryEntry {
  id: number;
  at: number;
  mode: 'formula' | 'coc';
  formula?: string;
  coc?: CocState;
  title: string;
  total: number;
  parts: Part[];
  badge?: Badge;
  note?: string;
}

const KEY = 'scriptorium-aleae/v1';

/** Bump when a stored default should be replaced by a new one. */
export const SETTINGS_VERSION = 2;

interface Saved {
  v?: number;
  settings?: Partial<TableSettings>;
  terms?: Term[];
  coc?: CocState;
  mode?: 'formula' | 'coc';
  history?: HistoryEntry[];
}

function read(): Saved {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Saved) : {};
  } catch {
    return {};
  }
}

let cache: Saved | null = null;

export function loadSaved(): Saved {
  if (!cache) cache = read();
  return cache;
}

let timer: number | undefined;
export function save(patch: Saved) {
  cache = { ...loadSaved(), ...patch };
  window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(cache));
    } catch {
      /* storage unavailable: keep working in memory */
    }
  }, 200);
}

export function toRoman(n: number): string {
  if (n <= 0 || n >= 4000) return String(n);
  const map: [number, string][] = [
    [1000, 'M'],
    [900, 'CM'],
    [500, 'D'],
    [400, 'CD'],
    [100, 'C'],
    [90, 'XC'],
    [50, 'L'],
    [40, 'XL'],
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I'],
  ];
  let s = '';
  for (const [v, r] of map)
    while (n >= v) {
      s += r;
      n -= v;
    }
  return s;
}
