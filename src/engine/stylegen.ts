import * as THREE from 'three';
import type { DiceStyle } from './materials';
import { pick, rand, randRange as R } from './rng';

/**
 * Procedural dice: every die gets its own palette, pattern parameters and surface,
 * drawn from a handful of material families so the results stay plausible.
 * Numeral ink is then chosen by luminance contrast against the body it sits on.
 */

type Ink = DiceStyle['ink'];
type Body = DiceStyle['body'];

/* ───────────── numeral inks ───────────── */

// gold · silver · copper leaf, and white · black · oxblood · navy enamel
const INKS: Ink[] = [
  { color: '#e6b85e', metalness: 1, roughness: 0.52 },
  { color: '#e8ecf2', metalness: 1, roughness: 0.5 },
  { color: '#e0a07a', metalness: 1, roughness: 0.5 },
  { color: '#f3ede2', metalness: 0, roughness: 0.34 },
  { color: '#121014', metalness: 0, roughness: 0.32 },
  { color: '#5c0d14', metalness: 0, roughness: 0.32 },
  { color: '#18224a', metalness: 0, roughness: 0.32 },
];

/** Relative luminance (WCAG); THREE.Color already stores linear RGB. */
function lum(c: THREE.Color) {
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}

function contrast(a: THREE.Color, b: THREE.Color) {
  const la = lum(a) + 0.05;
  const lb = lum(b) + 0.05;
  return la > lb ? la / lb : lb / la;
}

/** Rough share of the surface covered by the vein / speckle colour for a given pattern. */
function veinCoverage(b: Body) {
  switch (b.pattern) {
    case 0:
      return 0;
    case 1:
      return Math.min(0.4, b.vein * 2.5);
    case 2:
      return 0.2;
    case 3:
      return 0.12;
    default:
      return THREE.MathUtils.clamp(0.5 - b.vein * 0.9, 0.1, 0.6);
  }
}

/** The colours a numeral might actually sit on, as seen under the lamp. */
function bodySamples(b: Body) {
  const gem = (b.transmission ?? 0) > 0.5;
  // a clear gem shows the dark table through it, so it reads darker than its tint
  const k = gem ? 0.5 : 1;
  const A = new THREE.Color(b.colorA).multiplyScalar(k);
  const C = new THREE.Color(b.colorC).multiplyScalar(k);
  const B = new THREE.Color(b.colorB);
  const cov = veinCoverage(b);
  const mean = A.clone().lerp(C, b.cloud * 0.5).lerp(B, cov);
  return { A, C, B, mean, cov };
}

function inkScore(ink: Ink, b: Body) {
  const s = bodySamples(b);
  const I = new THREE.Color(ink.color);
  const cMean = contrast(I, s.mean);
  const cParts = Math.min(contrast(I, s.A), contrast(I, s.C));
  const cVein = s.cov >= 0.25 ? contrast(I, s.B) : 99;
  // metal numerals on a metal body never read: only enamel there
  const metalOnMetal = ink.metalness > 0.5 && b.metalA > 0.5;
  const ok = !metalOnMetal && cMean >= 3 && cParts >= 2 && cVein >= 1.8;
  return { ok, worst: metalOnMetal ? 0 : Math.min(cMean / 3, cParts / 2, cVein / 1.8) };
}

/** True if the given ink reads clearly on this body. */
export function inkReadable(ink: Ink, b: Body) {
  return inkScore(ink, b).ok;
}

/** Pick a readable ink; dark bodies lean toward metal leaf, light ones toward enamel. */
export function chooseInk(b: Body): Ink {
  const dark = lum(bodySamples(b).mean) < 0.12;
  const passing = INKS.filter((i) => inkScore(i, b).ok);
  if (passing.length) {
    const metals = passing.filter((i) => i.metalness > 0.5);
    const pool = dark && metals.length && rand() < 0.75 ? metals : passing;
    return { ...pick(pool) };
  }
  // nothing clears every bar: take whichever reads best
  let best = INKS[0];
  let bestScore = -1;
  for (const i of INKS) {
    const sc = inkScore(i, b).worst;
    if (sc > bestScore) {
      bestScore = sc;
      best = i;
    }
  }
  return { ...best };
}

/* ───────────── body families ───────────── */

// lightness is meant perceptually (sRGB), not in three's linear working space
const hsl = (h: number, s: number, l: number) =>
  '#' +
  new THREE.Color()
    .setHSL(((h % 1) + 1) % 1, THREE.MathUtils.clamp(s, 0, 1), THREE.MathUtils.clamp(l, 0, 1), THREE.SRGBColorSpace)
    .getHexString();
/**
 * A colour of hue h and saturation s whose relative luminance is `target`.
 * Yellow at a given HSL lightness is far brighter than blue; aiming at luminance
 * instead keeps "dark" dark and "light" light for every hue, so numeral contrast holds.
 */
function tone(h: number, s: number, target: number) {
  const c = new THREE.Color();
  const hh = ((h % 1) + 1) % 1;
  const ss = THREE.MathUtils.clamp(s, 0, 1);
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    c.setHSL(hh, ss, mid, THREE.SRGBColorSpace);
    if (lum(c) < target) lo = mid;
    else hi = mid;
  }
  return '#' + c.setHSL(hh, ss, (lo + hi) / 2, THREE.SRGBColorSpace).getHexString();
}
const scale = (hex: string, k: number) => '#' + new THREE.Color(hex).multiplyScalar(k).getHexString();
const METAL_LEAF = ['#d9a84e', '#d8dde4', '#c98a62'];
const METALS = ['#c39446', '#c27a4a', '#bfc4cc', '#5c6068', '#9a7040', '#cf9c88', '#d4a84c', '#7a7f88'];
const sgn = () => (rand() < 0.5 ? -1 : 1);

interface Family {
  name: string;
  weight: number;
  make(h: number): { body: Body; density: number };
}

const FAMILIES: Family[] = [
  {
    name: '树脂大理石纹',
    // marbled resin: deep translucent colour with fine veins, sometimes of metal leaf
    weight: 3,
    make(h) {
      const leaf = rand() < 0.5;
      const B = leaf ? pick(METAL_LEAF) : tone(h + R(0.35, 0.65), R(0.3, 0.7), R(0.35, 0.6));
      return {
        density: 1,
        body: {
          pattern: 1,
          colorA: tone(h, R(0.45, 0.85), R(0.008, 0.03)),
          colorB: B,
          colorC: tone(h + R(-0.06, 0.06), R(0.4, 0.8), R(0.03, 0.09)),
          scale: R(0.7, 1.3),
          warp: R(0.8, 1.8),
          vein: R(0.03, 0.065),
          cloud: R(0.5, 0.9),
          metalA: 0,
          metalB: leaf ? 1 : 0,
          roughA: R(0.08, 0.16),
          roughB: leaf ? 0.48 : 0.2,
          glitter: R(0.2, 0.9),
          glitterColor: leaf ? B : '#ffffff',
          glitterDensity: R(8, 14),
          clearcoat: R(0.6, 1),
          clearcoatRoughness: 0.04,
          transmission: R(0.15, 0.5),
          ior: 1.5,
          thickness: 2,
          attenuationColor: hsl(h, 0.7, 0.35),
          attenuationDistance: R(1, 2.5),
          maskOpaque: 1,
        },
      };
    },
  },
  {
    name: '流彩树脂',
    // swirled resin: two colours folded into each other
    weight: 2.5,
    make(h) {
      const light = rand() < 0.3;
      const h2 = h + R(0.08, 0.3) * sgn();
      return {
        density: 1,
        body: {
          pattern: 4,
          colorA: light ? tone(h, R(0.3, 0.6), R(0.35, 0.55)) : tone(h, R(0.5, 0.9), R(0.015, 0.05)),
          colorB: light ? tone(h2, R(0.4, 0.7), R(0.22, 0.38)) : tone(h2, R(0.5, 0.9), R(0.05, 0.13)),
          colorC: light ? tone(h, R(0.2, 0.5), R(0.5, 0.7)) : tone(h - 0.04, R(0.5, 0.8), R(0.004, 0.015)),
          scale: R(0.6, 1.1),
          warp: R(1, 2),
          vein: R(-0.1, 0.25),
          cloud: R(0.4, 0.8),
          metalA: 0,
          metalB: 0,
          roughA: 0.1,
          roughB: 0.12,
          glitter: R(0.3, 1.2),
          glitterColor: pick(['#ffffff', '#ffd28a', hsl(h + 0.5, 0.6, 0.8)]),
          glitterDensity: R(9, 15),
          clearcoat: 1,
          clearcoatRoughness: 0.04,
          transmission: R(0.1, 0.45),
          ior: 1.5,
          thickness: 2,
          attenuationColor: hsl(h, 0.7, 0.4),
          attenuationDistance: R(1.2, 2.5),
        },
      };
    },
  },
  {
    name: '星云',
    // nebula: near-black with coloured clouds, bright wisps and star flecks
    weight: 1.5,
    make(h) {
      return {
        density: 1,
        body: {
          pattern: 2,
          colorA: tone(h, R(0.5, 0.8), R(0.002, 0.008)),
          colorB: tone(h + R(0.3, 0.55), R(0.55, 0.85), R(0.15, 0.3)),
          colorC: tone(h + R(0.05, 0.15), R(0.5, 0.8), R(0.02, 0.06)),
          scale: R(0.65, 0.9),
          warp: R(1.6, 2.6),
          vein: R(0.25, 0.38),
          cloud: R(0.8, 1),
          metalA: 0,
          metalB: 0,
          roughA: 0.14,
          roughB: 0.14,
          glitter: R(1.5, 2.6),
          glitterColor: '#ffffff',
          glitterDensity: R(13, 18),
          clearcoat: 1,
          clearcoatRoughness: 0.05,
        },
      };
    },
  },
  {
    name: '宝石',
    // cut gem: clear, coloured, refractive
    weight: 2,
    make(h) {
      return {
        density: R(2.2, 3.6),
        body: {
          pattern: 0,
          colorA: tone(h, R(0.55, 0.85), R(0.12, 0.3)),
          colorB: '#000000',
          colorC: tone(h + R(-0.03, 0.03), R(0.6, 0.9), R(0.04, 0.1)),
          scale: 0.6,
          warp: 0,
          vein: 0,
          cloud: R(0.2, 0.45),
          metalA: 0,
          metalB: 0,
          roughA: R(0.02, 0.05),
          roughB: 0.03,
          transmission: R(0.6, 0.85),
          ior: R(1.5, 1.78),
          thickness: R(1.8, 2.6),
          attenuationColor: hsl(h, 0.75, 0.5),
          attenuationDistance: R(1.8, 3.2),
          dispersion: R(0.25, 0.6),
        },
      };
    },
  },
  {
    name: '斑点石',
    // speckled stone: bloodstone, granite, jasper
    weight: 2,
    make(h) {
      const dark = rand() < 0.55;
      return {
        density: R(2.2, 2.8),
        body: {
          pattern: 3,
          colorA: dark ? tone(h, R(0.2, 0.55), R(0.01, 0.03)) : tone(h, R(0.05, 0.25), R(0.35, 0.55)),
          colorB: tone(h + R(0.3, 0.7), R(0.55, 0.85), dark ? R(0.06, 0.15) : R(0.03, 0.08)),
          colorC: dark ? tone(h, R(0.2, 0.5), R(0.02, 0.05)) : tone(h, 0.2, R(0.22, 0.35)),
          scale: R(1, 2.2),
          warp: 0.6,
          vein: R(0.4, 0.6),
          cloud: R(0.6, 0.9),
          metalA: 0,
          metalB: 0,
          roughA: R(0.1, 0.3),
          roughB: R(0.15, 0.35),
          clearcoat: R(0.4, 1),
          clearcoatRoughness: 0.06,
        },
      };
    },
  },
  {
    name: '细纹石',
    // veined stone: marble, bone, slate
    weight: 1.5,
    make(h) {
      const light = rand() < 0.6;
      const leaf = !light && rand() < 0.5;
      return {
        density: 2.4,
        body: {
          pattern: 1,
          colorA: light ? tone(h, R(0.02, 0.15), R(0.55, 0.75)) : tone(h, R(0.05, 0.3), R(0.003, 0.01)),
          colorB: light ? tone(h + R(-0.1, 0.1), R(0.05, 0.3), R(0.04, 0.12)) : leaf ? pick(METAL_LEAF) : tone(h, 0.1, 0.45),
          colorC: light ? tone(h, 0.1, R(0.38, 0.55)) : tone(h, 0.2, R(0.01, 0.025)),
          scale: R(0.7, 1.2),
          warp: R(1.2, 1.8),
          vein: R(0.02, 0.045),
          cloud: 0.7,
          metalA: 0,
          metalB: leaf ? 1 : 0,
          roughA: 0.16,
          roughB: leaf ? 0.48 : 0.22,
          clearcoat: R(0.5, 0.9),
          clearcoatRoughness: 0.08,
          transmission: 0.06,
          thickness: 2,
          attenuationColor: '#f0e8dc',
          attenuationDistance: 3,
        },
      };
    },
  },
  {
    name: '磨砂金属',
    // brushed metal with tarnish
    weight: 1.3,
    make() {
      const base = pick(METALS);
      return {
        density: 7.5,
        body: {
          pattern: 4,
          colorA: base,
          colorB: scale(base, 0.55),
          colorC: scale(base, 1.12),
          scale: R(1.2, 2),
          warp: 1,
          vein: R(0.15, 0.35),
          cloud: 0.6,
          metalA: 1,
          metalB: R(0.85, 1),
          roughA: R(0.45, 0.58),
          roughB: R(0.6, 0.75),
        },
      };
    },
  },
  {
    name: '铜锈',
    // metal under patina
    weight: 0.8,
    make() {
      const base = pick(['#c4743f', '#9a7040', '#c39446']);
      return {
        density: 7,
        body: {
          pattern: 4,
          colorA: base,
          colorB: tone(R(0.42, 0.55), R(0.35, 0.6), R(0.1, 0.2)),
          colorC: scale(base, 1.12),
          scale: R(0.7, 1.1),
          warp: R(1, 1.6),
          vein: R(-0.05, 0.1),
          cloud: 0.7,
          metalA: 1,
          metalB: 0,
          roughA: 0.5,
          roughB: 0.85,
        },
      };
    },
  },
  {
    name: '熔岩裂纹',
    // ember: charred stone with glowing cracks
    weight: 1,
    make(h) {
      const glow = rand() < 0.7 ? R(0, 0.12) : rand();
      return {
        density: 1.1,
        body: {
          pattern: 1,
          colorA: tone(h, R(0.1, 0.3), R(0.001, 0.004)),
          colorB: hsl(glow, 1, 0.55),
          colorC: tone(h, 0.2, R(0.004, 0.01)),
          scale: R(0.8, 1.2),
          warp: R(1.3, 1.9),
          vein: R(0.05, 0.09),
          cloud: 0.8,
          metalA: 0,
          metalB: 0,
          roughA: 0.55,
          roughB: 0.4,
          emissiveVein: R(1.8, 3),
          clearcoat: 0.25,
          clearcoatRoughness: 0.3,
        },
      };
    },
  },
  {
    name: '珍珠',
    // pearl / opal: pale with shifting iridescence
    weight: 1,
    make(h) {
      const C = tone(h + R(-0.1, 0.1), R(0.2, 0.45), R(0.3, 0.45));
      return {
        density: 2.2,
        body: {
          pattern: 4,
          colorA: tone(h, R(0.05, 0.25), R(0.55, 0.75)),
          colorB: tone(h, R(0.05, 0.2), R(0.8, 0.92)),
          colorC: C,
          scale: 0.8,
          warp: R(0.9, 1.4),
          vein: R(0.05, 0.2),
          cloud: 0.8,
          metalA: 0,
          metalB: 0,
          roughA: 0.18,
          roughB: 0.14,
          clearcoat: 1,
          clearcoatRoughness: 0.05,
          transmission: R(0.15, 0.35),
          ior: 1.52,
          thickness: 2,
          attenuationColor: C,
          attenuationDistance: 2,
          iridescence: R(0.6, 1),
          sheen: R(0.3, 0.7),
          sheenColor: C,
        },
      };
    },
  },
];

const TOTAL = FAMILIES.reduce((s, f) => s + f.weight, 0);

function build(f: Family): DiceStyle {
  const { body, density } = f.make(rand());
  return {
    id: 'generated',
    name: f.name,
    latin: 'Varietas',
    blurb: f.name,
    swatch: '',
    density,
    body,
    ink: chooseInk(body),
  };
}

/** A brand-new, one-off dice style. */
export function generateStyle(): DiceStyle {
  let r = rand() * TOTAL;
  for (const f of FAMILIES) {
    r -= f.weight;
    if (r <= 0) return build(f);
  }
  return build(FAMILIES[0]);
}

/** One example of every family, for shader pre-compilation. */
export function familySamples(): DiceStyle[] {
  return FAMILIES.map(build);
}
