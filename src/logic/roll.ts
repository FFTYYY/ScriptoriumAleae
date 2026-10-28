import type { DieKind } from '../engine/dice';
import type { DieTag, SettledDie } from '../engine/DiceTable';

export const ALLOWED_SIDES = [4, 6, 8, 10, 12, 20, 100] as const;
export type Sides = (typeof ALLOWED_SIDES)[number];
export const MAX_PHYSICAL = 36;

export interface DiceTerm {
  type: 'dice';
  sign: 1 | -1;
  count: number;
  sides: Sides;
  keep?: { mode: 'h' | 'l'; n: number };
}
export interface ConstTerm {
  type: 'const';
  sign: 1 | -1;
  value: number;
}
export type Term = DiceTerm | ConstTerm;

/* ───────────── parsing ───────────── */

/** Parse problems as data; the UI words them in the current language. */
export type FormulaError =
  | { code: 'empty' | 'joiner' | 'constTooBig' | 'minCount' | 'keepRange' | 'dropRange' | 'noDice' }
  | { code: 'unrecognized'; text: string }
  | { code: 'badSides'; sides: number }
  | { code: 'maxCount'; max: number }
  | { code: 'tooMany'; need: number; max: number };

function normalise(src: string): string {
  return src
    .replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[－—–]/g, '-')
    .replace(/\s+/g, '')
    .toLowerCase();
}

export function parseFormula(src: string): { terms: Term[] } | { error: FormulaError } {
  const s = normalise(src);
  if (!s) return { error: { code: 'empty' } };
  const re = /([+-]?)(?:(\d*)d(\d+|%)(?:(kh|kl|k|dh|dl)(\d+))?|(\d+))/y;
  const terms: Term[] = [];
  let pos = 0;
  while (pos < s.length) {
    re.lastIndex = pos;
    const m = re.exec(s);
    if (!m || m.index !== pos || m[0] === '' || m[0] === '+' || m[0] === '-') {
      return { error: { code: 'unrecognized', text: s.slice(pos, pos + 6) } };
    }
    if (terms.length && !m[1]) return { error: { code: 'joiner' } };
    const sign: 1 | -1 = m[1] === '-' ? -1 : 1;
    if (m[6] !== undefined) {
      const v = parseInt(m[6], 10);
      if (v > 999) return { error: { code: 'constTooBig' } };
      terms.push({ type: 'const', sign, value: v });
    } else {
      const count = m[2] ? parseInt(m[2], 10) : 1;
      const sides = m[3] === '%' ? 100 : parseInt(m[3], 10);
      if (!(ALLOWED_SIDES as readonly number[]).includes(sides))
        return { error: { code: 'badSides', sides } };
      if (count < 1) return { error: { code: 'minCount' } };
      if (count > MAX_PHYSICAL) return { error: { code: 'maxCount', max: MAX_PHYSICAL } };
      const t: DiceTerm = { type: 'dice', sign, count, sides: sides as Sides };
      if (m[4]) {
        const n = parseInt(m[5], 10);
        const mode = m[4];
        if (mode === 'kh' || mode === 'k' || mode === 'kl') {
          if (n < 1 || n > count) return { error: { code: 'keepRange' } };
          if (n < count) t.keep = { mode: mode === 'kl' ? 'l' : 'h', n };
        } else {
          if (n < 0 || n >= count) return { error: { code: 'dropRange' } };
          if (n > 0) t.keep = { mode: mode === 'dl' ? 'h' : 'l', n: count - n };
        }
      }
      terms.push(t);
    }
    pos = re.lastIndex;
  }
  if (!terms.some((t) => t.type === 'dice')) return { error: { code: 'noDice' } };
  const phys = physicalCount(terms);
  if (phys > MAX_PHYSICAL) return { error: { code: 'tooMany', need: phys, max: MAX_PHYSICAL } };
  return { terms };
}

export function physicalCount(terms: Term[]): number {
  let n = 0;
  for (const t of terms) if (t.type === 'dice') n += t.count * (t.sides === 100 ? 2 : 1);
  return n;
}

export function termText(t: Term): string {
  if (t.type === 'const') return String(t.value);
  let s = `${t.count}d${t.sides}`;
  if (t.keep) s += `k${t.keep.mode}${t.keep.n}`;
  return s;
}

export function formulaText(terms: Term[]): string {
  return terms
    .map((t, i) => {
      const body = termText(t);
      if (i === 0) return t.sign < 0 ? `-${body}` : body;
      return `${t.sign < 0 ? '-' : '+'} ${body}`;
    })
    .join(' ');
}

/* ───────────── editing helpers for the counters ───────────── */

export function countOf(terms: Term[], sides: Sides): number {
  return terms.reduce((n, t) => (t.type === 'dice' && t.sides === sides && t.sign > 0 ? n + t.count : n), 0);
}

export function modifierOf(terms: Term[]): number {
  return terms.reduce((n, t) => (t.type === 'const' ? n + t.sign * t.value : n), 0);
}

export function adjustCount(terms: Term[], sides: Sides, delta: number): Term[] {
  const out = terms.map((t) => ({ ...t })) as Term[];
  if (delta > 0) {
    if (physicalCount(out) + (sides === 100 ? 2 : 1) > MAX_PHYSICAL) return terms;
    const t = out.find((x) => x.type === 'dice' && x.sides === sides && x.sign > 0) as DiceTerm | undefined;
    if (t) t.count += 1;
    else {
      const nt: DiceTerm = { type: 'dice', sign: 1, count: 1, sides };
      // keep canonical order: dice by size, constants last
      let at = out.findIndex((x) => x.type === 'const' || (x.type === 'dice' && x.sides > sides));
      if (at < 0) at = out.length;
      out.splice(at, 0, nt);
    }
  } else {
    for (let i = out.length - 1; i >= 0; i--) {
      const t = out[i];
      if (t.type === 'dice' && t.sides === sides && t.sign > 0) {
        t.count -= 1;
        if (t.keep && t.keep.n >= t.count) delete t.keep;
        if (t.count <= 0) out.splice(i, 1);
        break;
      }
    }
  }
  // constants always read last ("2d6 + 3", never "+3 + 2d6")
  return [...out.filter((x) => x.type !== 'const'), ...out.filter((x) => x.type === 'const')];
}

export function setModifier(terms: Term[], mod: number): Term[] {
  const dice = terms.filter((t) => t.type === 'dice');
  if (mod === 0) return dice;
  return [...dice, { type: 'const', sign: mod < 0 ? -1 : 1, value: Math.abs(mod) }];
}

/* ───────────── plans: which physical dice to throw, and how to read them ───────────── */

export type Role = 'single' | 'tens' | 'units';
export interface PhysDie {
  kind: DieKind;
  role: Role;
  /** formula: term index; coc: 0 */
  group: number;
  /** index within the group (for d100 pairs: pair index) */
  slot: number;
}

export interface FormulaPlan {
  mode: 'formula';
  terms: Term[];
  text: string;
  phys: PhysDie[];
}

export interface CocPlan {
  mode: 'coc';
  skill: number;
  name: string;
  bonus: number;
  penalty: number;
  text: string;
  phys: PhysDie[];
}

export type Plan = FormulaPlan | CocPlan;

const KIND: Record<Sides, DieKind> = { 4: 'd4', 6: 'd6', 8: 'd8', 10: 'd10', 12: 'd12', 20: 'd20', 100: 'd100' };

export function formulaPlan(terms: Term[]): FormulaPlan {
  const phys: PhysDie[] = [];
  terms.forEach((t, g) => {
    if (t.type !== 'dice') return;
    for (let i = 0; i < t.count; i++) {
      if (t.sides === 100) {
        phys.push({ kind: 'd100', role: 'tens', group: g, slot: i });
        phys.push({ kind: 'd10', role: 'units', group: g, slot: i });
      } else phys.push({ kind: KIND[t.sides], role: 'single', group: g, slot: i });
    }
  });
  return { mode: 'formula', terms, text: formulaText(terms), phys };
}

export function cocPlan(skill: number, name: string, bonus: number, penalty: number): CocPlan {
  const net = bonus - penalty;
  const tens = 1 + Math.abs(net);
  const phys: PhysDie[] = [];
  for (let i = 0; i < tens; i++) phys.push({ kind: 'd100', role: 'tens', group: 0, slot: i });
  phys.push({ kind: 'd10', role: 'units', group: 0, slot: 0 });
  return { mode: 'coc', skill, name, bonus, penalty, text: `1d100 ≤ ${skill}`, phys };
}

/* ───────────── outcomes ───────────── */

export type CocLevel = 'critical' | 'extreme' | 'hard' | 'regular' | 'failure' | 'fumble';

export const COC_GOOD: Record<CocLevel, boolean> = {
  critical: true,
  extreme: true,
  hard: true,
  regular: true,
  failure: false,
  fumble: false,
};

export function cocLevel(roll: number, skill: number): CocLevel {
  if (roll === 1) return 'critical';
  if (roll === 100 || (skill < 50 && roll >= 96)) return 'fumble';
  if (roll <= Math.floor(skill / 5)) return 'extreme';
  if (roll <= Math.floor(skill / 2)) return 'hard';
  if (roll <= skill) return 'regular';
  return 'failure';
}

export interface PartDie {
  text: string;
  tone: 'gold' | 'crimson' | 'muted' | 'plain';
}

export interface Part {
  label: string;
  sign: 1 | -1;
  dice: PartDie[];
  value: number;
  isConst?: boolean;
  /** CoC: number of tens dice; the label is worded by the UI */
  coc?: number;
}

export type BadgeKey = CocLevel | 'nat20' | 'nat1';

export interface Badge {
  key?: BadgeKey;
  tone: 'gold' | 'crimson' | 'ink';
  /** pre-i18n saves stored the words themselves */
  text?: string;
  en?: string;
}

export interface Outcome {
  total: number;
  parts: Part[];
  tags: DieTag[];
  badge?: Badge;
  /** CoC: thresholds, worded by the UI */
  cocNote?: { skill: number; half: number; fifth: number };
  /** pre-i18n saves */
  note?: string;
}

/** English name of a badge, used as the stamp's subtitle in Chinese mode */
export const BADGE_EN: Record<BadgeKey, string> = {
  critical: 'Critical',
  extreme: 'Extreme Success',
  hard: 'Hard Success',
  regular: 'Success',
  failure: 'Failure',
  fumble: 'Fumble',
  nat20: 'Natural 20',
  nat1: 'Natural 1',
};

const d10Value = (v: number) => (v === 0 ? 10 : v);
const pct = (t: number, u: number) => (t + u === 0 ? 100 : t + u);
const pad2 = (n: number) => (n === 100 ? '100' : String(n).padStart(2, '0'));

export function evaluate(plan: Plan, dice: SettledDie[]): Outcome {
  const tags: DieTag[] = dice.map((d) => ({ text: d.label, tone: 'plain' as const }));
  if (plan.mode === 'coc') {
    const unitsIdx = plan.phys.findIndex((p) => p.role === 'units');
    const u = dice[unitsIdx].value;
    const tensIdx = plan.phys.map((p, i) => (p.role === 'tens' ? i : -1)).filter((i) => i >= 0);
    const cands = tensIdx.map((i) => ({ i, v: pct(dice[i].value, u) }));
    const net = plan.bonus - plan.penalty;
    let chosen = cands[0];
    for (const c of cands) {
      if (net > 0 && c.v < chosen.v) chosen = c;
      if (net < 0 && c.v > chosen.v) chosen = c;
    }
    const roll = chosen.v;
    const level = cocLevel(roll, plan.skill);
    const good = COC_GOOD[level];
    tensIdx.forEach((i) => (tags[i] = { text: dice[i].label, tone: i === chosen.i ? (good ? 'gold' : 'crimson') : 'muted' }));
    tags[unitsIdx] = { text: dice[unitsIdx].label, tone: good ? 'gold' : 'crimson' };
    const partDice: PartDie[] = tensIdx.map((i) => ({ text: dice[i].label, tone: i === chosen.i ? 'plain' : 'muted' }));
    partDice.push({ text: dice[unitsIdx].label, tone: 'plain' });
    const half = Math.floor(plan.skill / 2);
    const fifth = Math.floor(plan.skill / 5);
    return {
      total: roll,
      parts: [{ label: '', coc: tensIdx.length, sign: 1, dice: partDice, value: roll }],
      tags,
      badge: { key: level, tone: good ? (level === 'critical' ? 'gold' : 'ink') : 'crimson' },
      cocNote: { skill: plan.skill, half, fifth },
    };
  }

  const parts: Part[] = [];
  let total = 0;
  let nat: 'nat20' | 'nat1' | null = null;
  plan.terms.forEach((t, g) => {
    if (t.type === 'const') {
      parts.push({ label: String(t.value), sign: t.sign, dice: [], value: t.value, isConst: true });
      total += t.sign * t.value;
      return;
    }
    // collect the values of this term's logical dice
    const logical: { v: number; idx: number[]; text: string }[] = [];
    for (let s = 0; s < t.count; s++) {
      if (t.sides === 100) {
        const ti = plan.phys.findIndex((p) => p.group === g && p.slot === s && p.role === 'tens');
        const ui = plan.phys.findIndex((p) => p.group === g && p.slot === s && p.role === 'units');
        const v = pct(dice[ti].value, dice[ui].value);
        logical.push({ v, idx: [ti, ui], text: pad2(v) });
      } else {
        const i = plan.phys.findIndex((p) => p.group === g && p.slot === s);
        const raw = dice[i].value;
        const v = t.sides === 10 ? d10Value(raw) : raw;
        logical.push({ v, idx: [i], text: String(v) });
      }
    }
    let kept = logical.map(() => true);
    if (t.keep) {
      const order = logical.map((l, i) => ({ v: l.v, i })).sort((a, b) => (t.keep!.mode === 'h' ? b.v - a.v : a.v - b.v));
      kept = logical.map(() => false);
      order.slice(0, t.keep.n).forEach((o) => (kept[o.i] = true));
    }
    let sub = 0;
    const pd: PartDie[] = logical.map((l, i) => {
      const max = l.v === t.sides;
      const min = l.v === 1;
      const tone: PartDie['tone'] = !kept[i] ? 'muted' : max ? 'gold' : min ? 'crimson' : 'plain';
      if (kept[i]) sub += l.v;
      for (const di of l.idx) {
        const shown = t.sides === 10 ? String(l.v) : dice[di].label;
        tags[di] = { text: shown, tone: t.sides === 100 ? (kept[i] ? 'plain' : 'muted') : tone };
      }
      return { text: l.text, tone };
    });
    if (t.sides === 20 && (t.count === 1 || t.keep?.n === 1)) {
      const k = logical.find((_, i) => kept[i]);
      if (k?.v === 20) nat = 'nat20';
      else if (k?.v === 1) nat = 'nat1';
    }
    parts.push({ label: termText(t), sign: t.sign, dice: pd, value: sub });
    total += t.sign * sub;
  });
  let badge: Badge | undefined;
  if (nat === 'nat20') badge = { key: 'nat20', tone: 'gold' };
  else if (nat === 'nat1') badge = { key: 'nat1', tone: 'crimson' };
  return { total, parts, tags, badge };
}
