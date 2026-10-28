import * as THREE from 'three';
import type { DieDef, DieKind } from './dice';
import { rand, randRange } from './rng';
import { chooseInk, inkReadable } from './stylegen';

/**
 * Dice "sets". Every body is shaded procedurally in object space (no UV seams across
 * the rounded edges), so two dice of the same set still carry unique veins and flecks.
 * Numerals are a separate metallic/enamel inlay driven by the per-die numeral atlas.
 * Density is per set (brass is heavy, amber is light) but always uniform within a die.
 */

export type Pattern = 0 | 1 | 2 | 3 | 4; // solid · marble · nebula · speckle · patina

export interface DiceStyle {
  id: string;
  name: string;
  latin: string;
  blurb: string;
  nameEn?: string;
  blurbEn?: string;
  swatch: string;
  /** relative density, resin = 1 */
  density: number;
  body: {
    pattern: Pattern;
    colorA: string;
    colorB: string;
    colorC: string;
    scale: number;
    warp: number;
    vein: number;
    cloud: number;
    metalA: number;
    metalB: number;
    roughA: number;
    roughB: number;
    glitter?: number;
    glitterColor?: string;
    glitterDensity?: number;
    emissiveVein?: number;
    clearcoat?: number;
    clearcoatRoughness?: number;
    transmission?: number;
    ior?: number;
    thickness?: number;
    attenuationColor?: string;
    attenuationDistance?: number;
    iridescence?: number;
    sheen?: number;
    sheenColor?: string;
    dispersion?: number;
    maskOpaque?: number;
  };
  ink: {
    color: string;
    metalness: number;
    roughness: number;
    emissive?: string;
    emissiveIntensity?: number;
  };
}

const GOLD = { color: '#e6b85e', metalness: 1, roughness: 0.52 };
const SILVER = { color: '#e8ecf2', metalness: 1, roughness: 0.5 };
const BLACK_ENAMEL = { color: '#121014', metalness: 0, roughness: 0.32 };

export const DICE_STYLES: DiceStyle[] = [
  {
    id: 'sanguis',
    name: '红金树脂',
    latin: 'Resina Rubra',
    blurb: '半透明深红树脂，内含金色纹路',
    nameEn: 'Red & Gold Resin',
    blurbEn: 'Translucent deep red resin with gold veins',
    swatch: 'radial-gradient(circle at 30% 28%, #c0283a 0%, #6d0b16 42%, #2a0307 100%)',
    density: 1,
    body: {
      pattern: 1,
      colorA: '#5c0712',
      colorB: '#d6a24a',
      colorC: '#9a1626',
      scale: 0.9,
      warp: 1.25,
      vein: 0.045,
      cloud: 0.75,
      metalA: 0,
      metalB: 1,
      roughA: 0.1,
      roughB: 0.5,
      glitter: 0.6,
      glitterColor: '#ffd28a',
      glitterDensity: 9,
      clearcoat: 1,
      clearcoatRoughness: 0.04,
      transmission: 0.55,
      ior: 1.5,
      thickness: 1.8,
      attenuationColor: '#9a0f1e',
      attenuationDistance: 1.1,
      maskOpaque: 1,
    },
    ink: GOLD,
  },
  {
    id: 'obsidian',
    name: '黑曜石',
    latin: 'Obsidianus',
    blurb: '黑色玻璃质，带一层虹彩',
    nameEn: 'Obsidian',
    blurbEn: 'Black volcanic glass with an iridescent sheen',
    swatch: 'conic-gradient(from 210deg at 60% 40%, #0a0a0c, #2b1d3a, #0b0b0d, #183041, #0a0a0c)',
    density: 2.1,
    body: {
      pattern: 0,
      colorA: '#040405',
      colorB: '#000000',
      colorC: '#16101c',
      scale: 0.8,
      warp: 0,
      vein: 0,
      cloud: 0.6,
      metalA: 0,
      metalB: 0,
      roughA: 0.05,
      roughB: 0.05,
      clearcoat: 1,
      clearcoatRoughness: 0.02,
      iridescence: 0.9,
    },
    ink: GOLD,
  },
  {
    id: 'nebula',
    name: '星云',
    latin: 'Nebula',
    blurb: '深蓝紫色云纹，带细小闪点',
    nameEn: 'Nebula',
    blurbEn: 'Deep blue-violet clouds with fine sparkles',
    swatch: 'radial-gradient(circle at 70% 30%, #3fd0c9 0%, transparent 28%), radial-gradient(circle at 30% 70%, #6a2bb3 0%, transparent 45%), #070a26',
    density: 1,
    body: {
      pattern: 2,
      colorA: '#060920',
      colorB: '#38c4c4',
      colorC: '#4a1d86',
      scale: 0.75,
      warp: 2.2,
      vein: 0.32,
      cloud: 0.95,
      metalA: 0,
      metalB: 0,
      roughA: 0.14,
      roughB: 0.14,
      glitter: 2.2,
      glitterColor: '#ffffff',
      glitterDensity: 15,
      clearcoat: 1,
      clearcoatRoughness: 0.05,
    },
    ink: { ...SILVER, emissive: '#9fb8ff', emissiveIntensity: 0.18 },
  },
  {
    id: 'ivory',
    name: '象牙白',
    latin: 'Eburneus',
    blurb: '米白色，带浅褐色细纹',
    nameEn: 'Ivory',
    blurbEn: 'Off-white with fine brown veining',
    swatch: 'linear-gradient(135deg, #f1e6cc 0%, #d8c49a 55%, #a88a5a 100%)',
    density: 1.6,
    body: {
      pattern: 1,
      colorA: '#e8dabb',
      colorB: '#8a6a40',
      colorC: '#c9b183',
      scale: 1.3,
      warp: 0.9,
      vein: 0.02,
      cloud: 0.85,
      metalA: 0,
      metalB: 0,
      roughA: 0.36,
      roughB: 0.5,
      clearcoat: 0.35,
      clearcoatRoughness: 0.2,
      sheen: 0.3,
      sheenColor: '#fff3d8',
    },
    ink: { color: '#701414', metalness: 0, roughness: 0.3 },
  },
  {
    id: 'jade',
    name: '翡翠',
    latin: 'Iaspis',
    blurb: '深绿色半透明，带浅色絮纹',
    nameEn: 'Jade',
    blurbEn: 'Translucent deep green with pale clouding',
    swatch: 'radial-gradient(circle at 35% 30%, #9fd8b0 0%, #2f8a5a 38%, #0f3a24 100%)',
    density: 2.8,
    body: {
      pattern: 1,
      colorA: '#0f4a2c',
      colorB: '#06180e',
      colorC: '#3f8a5e',
      scale: 0.8,
      warp: 1.6,
      vein: 0.07,
      cloud: 0.75,
      metalA: 0,
      metalB: 0,
      roughA: 0.16,
      roughB: 0.2,
      clearcoat: 0.6,
      clearcoatRoughness: 0.08,
      transmission: 0.2,
      ior: 1.62,
      thickness: 2.4,
      attenuationColor: '#1f6e44',
      attenuationDistance: 1.4,
    },
    ink: GOLD,
  },
  {
    id: 'amethyst',
    name: '紫水晶',
    latin: 'Amethystus',
    blurb: '透明紫色',
    nameEn: 'Amethyst',
    blurbEn: 'Clear violet',
    swatch: 'linear-gradient(160deg, #c9a4ff 0%, #7b3fd0 45%, #2c0f5a 100%)',
    density: 2.2,
    body: {
      pattern: 0,
      colorA: '#9a64e8',
      colorB: '#000000',
      colorC: '#6c38bc',
      scale: 0.6,
      warp: 0,
      vein: 0,
      cloud: 0.35,
      metalA: 0,
      metalB: 0,
      roughA: 0.04,
      roughB: 0.04,
      transmission: 0.6,
      ior: 1.54,
      thickness: 2.2,
      attenuationColor: '#8250dc',
      attenuationDistance: 2.2,
      dispersion: 0.5,
    },
    ink: SILVER,
  },
  {
    id: 'moonstone',
    name: '月光石',
    latin: 'Selenites',
    blurb: '乳白色，随角度泛蓝色光晕',
    nameEn: 'Moonstone',
    blurbEn: 'Milky white with a blue glow at an angle',
    swatch: 'radial-gradient(circle at 40% 35%, #ffffff 0%, #c9d6f2 40%, #7f93c4 100%)',
    density: 2.2,
    body: {
      pattern: 4,
      colorA: '#dfe4ee',
      colorB: '#fbfcff',
      colorC: '#9fb3dc',
      scale: 0.8,
      warp: 1.1,
      vein: 0.15,
      cloud: 0.8,
      metalA: 0,
      metalB: 0,
      roughA: 0.18,
      roughB: 0.14,
      clearcoat: 1,
      clearcoatRoughness: 0.05,
      transmission: 0.3,
      ior: 1.52,
      thickness: 2,
      attenuationColor: '#c4d3ff',
      attenuationDistance: 2,
      iridescence: 1,
      sheen: 0.6,
      sheenColor: '#a6c2ff',
    },
    ink: { color: '#1c2648', metalness: 0, roughness: 0.3 },
  },
  {
    id: 'orichalcum',
    name: '黄铜',
    latin: 'Orichalcum',
    blurb: '磨砂黄铜，金属质地，较重',
    nameEn: 'Brass',
    blurbEn: 'Brushed solid brass; heavy',
    swatch: 'linear-gradient(135deg, #f3d48a 0%, #b5893c 45%, #5e4318 100%)',
    density: 7,
    body: {
      pattern: 4,
      colorA: '#c09245',
      colorB: '#6a4c1f',
      colorC: '#e2b866',
      scale: 1.6,
      warp: 1,
      vein: 0.3,
      cloud: 0.6,
      metalA: 1,
      metalB: 0.9,
      roughA: 0.5,
      roughB: 0.66,
    },
    ink: BLACK_ENAMEL,
  },
  {
    id: 'bloodstone',
    name: '血石',
    latin: 'Heliotropium',
    blurb: '深绿色，带红色斑点',
    nameEn: 'Bloodstone',
    blurbEn: 'Dark green with red flecks',
    swatch: 'radial-gradient(circle at 30% 40%, #a01818 0 6%, transparent 7%), radial-gradient(circle at 65% 60%, #8a1414 0 5%, transparent 6%), linear-gradient(135deg, #24503a, #0d2418)',
    density: 2.2,
    body: {
      pattern: 3,
      colorA: '#0f281c',
      colorB: '#8e1515',
      colorC: '#1f4a34',
      scale: 1.3,
      warp: 0.6,
      vein: 0.42,
      cloud: 0.85,
      metalA: 0,
      metalB: 0,
      roughA: 0.1,
      roughB: 0.16,
      clearcoat: 1,
      clearcoatRoughness: 0.04,
    },
    ink: GOLD,
  },
  {
    id: 'infernal',
    name: '熔岩',
    latin: 'Lava',
    blurb: '黑色，裂纹透出橙色光',
    nameEn: 'Lava',
    blurbEn: 'Black with glowing orange cracks',
    swatch: 'radial-gradient(circle at 50% 50%, #ff7a2a 0%, #a8240a 22%, #120806 60%)',
    density: 1.1,
    body: {
      pattern: 1,
      colorA: '#0b0605',
      colorB: '#ff5212',
      colorC: '#22110b',
      scale: 1,
      warp: 1.6,
      vein: 0.075,
      cloud: 0.8,
      metalA: 0,
      metalB: 0,
      roughA: 0.6,
      roughB: 0.42,
      emissiveVein: 2.6,
      clearcoat: 0.25,
      clearcoatRoughness: 0.3,
    },
    ink: { color: '#e2b867', metalness: 1, roughness: 0.5 },
  },
  {
    id: 'amber',
    name: '琥珀',
    latin: 'Succinum',
    blurb: '半透明橙黄色，带深色杂质',
    nameEn: 'Amber',
    blurbEn: 'Translucent honey orange with dark inclusions',
    swatch: 'radial-gradient(circle at 35% 30%, #ffd27a 0%, #d8801c 45%, #6e3406 100%)',
    density: 0.9,
    body: {
      pattern: 3,
      colorA: '#c46c14',
      colorB: '#2e1404',
      colorC: '#f0aa48',
      scale: 2.2,
      warp: 0.8,
      vein: 0.62,
      cloud: 0.8,
      metalA: 0,
      metalB: 0,
      roughA: 0.06,
      roughB: 0.3,
      clearcoat: 1,
      clearcoatRoughness: 0.03,
      transmission: 0.75,
      ior: 1.54,
      thickness: 2,
      attenuationColor: '#d2780e',
      attenuationDistance: 1,
      maskOpaque: 1,
    },
    ink: { color: '#2a1406', metalness: 0, roughness: 0.25 },
  },
  {
    id: 'sapphire',
    name: '蓝宝石',
    latin: 'Sapphirus',
    blurb: '透明深蓝色',
    nameEn: 'Sapphire',
    blurbEn: 'Clear deep blue',
    swatch: 'linear-gradient(160deg, #7aa2ff 0%, #1d3fa8 45%, #050f3a 100%)',
    density: 3.4,
    body: {
      pattern: 0,
      colorA: '#2446b8',
      colorB: '#000000',
      colorC: '#0e2068',
      scale: 0.6,
      warp: 0,
      vein: 0,
      cloud: 0.4,
      metalA: 0,
      metalB: 0,
      roughA: 0.025,
      roughB: 0.025,
      transmission: 1,
      ior: 1.76,
      thickness: 2.4,
      attenuationColor: '#1a3ac0',
      attenuationDistance: 0.9,
      dispersion: 0.4,
    },
    ink: GOLD,
  },
  {
    id: 'verdigris',
    name: '铜锈',
    latin: 'Aerugo',
    blurb: '磨砂红铜，带青绿色锈斑',
    nameEn: 'Verdigris',
    blurbEn: 'Brushed copper with blue-green patina',
    swatch: 'radial-gradient(circle at 30% 35%, #5cc3a8 0 18%, transparent 36%), radial-gradient(circle at 70% 70%, #3a9a84 0 14%, transparent 30%), linear-gradient(135deg, #c27a48, #6a3418)',
    density: 7,
    body: {
      pattern: 4,
      colorA: '#c4743f',
      colorB: '#4fae96',
      colorC: '#d98d55',
      scale: 0.8,
      warp: 1.4,
      vein: 0.04,
      cloud: 0.7,
      metalA: 1,
      metalB: 0,
      roughA: 0.52,
      roughB: 0.85,
    },
    ink: BLACK_ENAMEL,
  },
  {
    id: 'marmor',
    name: '白大理石',
    latin: 'Marmor',
    blurb: '白色，带灰色纹路',
    nameEn: 'White Marble',
    blurbEn: 'White with grey veining',
    swatch: 'linear-gradient(120deg, #f4f1ea 0%, #f4f1ea 40%, #8f8f94 42%, #f4f1ea 44%, #e5e1d8 70%, #9a9aa0 72%, #efece4 74%)',
    density: 2.2,
    body: {
      pattern: 1,
      colorA: '#efebe2',
      colorB: '#5f6168',
      colorC: '#d9d4c8',
      scale: 0.85,
      warp: 1.5,
      vein: 0.035,
      cloud: 0.7,
      metalA: 0,
      metalB: 0,
      roughA: 0.16,
      roughB: 0.22,
      clearcoat: 0.7,
      clearcoatRoughness: 0.08,
      transmission: 0.08,
      thickness: 2,
      attenuationColor: '#f0e8dc',
      attenuationDistance: 3,
    },
    ink: BLACK_ENAMEL,
  },
];

export const STYLE_BY_ID = new Map(DICE_STYLES.map((s) => [s.id, s]));

/* ───────────────────────── shader injection ───────────────────────── */

const NOISE_GLSL = /* glsl */ `
varying vec3 vObjPos;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform vec3 uColorC;
uniform float uScale;
uniform float uWarp;
uniform float uVein;
uniform float uCloud;
uniform float uMetalA;
uniform float uMetalB;
uniform float uRoughA;
uniform float uRoughB;
uniform float uGlitter;
uniform float uGlitterDensity;
uniform vec3 uGlitterColor;
uniform float uEmissiveVein;
uniform float uMaskOpaque;
uniform float uTime;
uniform vec3 uSeed;

vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 10.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.5 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 105.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

float fbm(vec3 p) {
  float a = 0.5;
  float s = 0.0;
  for (int i = 0; i < 3; i++) {
    s += a * snoise(p);
    p = p * 2.03 + vec3(1.7, 9.2, 3.1);
    a *= 0.5;
  }
  return s * 1.15;
}

vec3 hash33(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}

void diePattern(vec3 p, out float m, out float c) {
  m = 0.0;
  c = 0.0;
#if DIE_PATTERN == 0
  c = (0.5 + 0.5 * fbm(p * 0.9)) * uCloud;
#elif DIE_PATTERN == 1
  vec3 q = p + uWarp * vec3(fbm(p), snoise(p * 1.7 + 3.7) * 0.6, fbm(p + 7.1));
  float n = snoise(q * 0.9);
  m = 1.0 - smoothstep(0.0, uVein, abs(n));
  float n2 = snoise(q * 2.4 + 11.0);
  m = max(m, 0.55 * (1.0 - smoothstep(0.0, uVein * 0.55, abs(n2))));
  c = smoothstep(-0.6, 0.8, snoise(p * 0.6 + 2.0) * 0.7 + snoise(p * 1.3) * 0.3) * uCloud;
#elif DIE_PATTERN == 2
  vec3 q = vec3(fbm(p), fbm(p + vec3(5.2, 1.3, 2.8)), snoise(p * 1.4 + vec3(1.7, 9.2, 4.1)) * 0.6);
  float f = fbm(p + uWarp * q);
  c = smoothstep(-0.45, 0.55, f) * uCloud;
  m = smoothstep(1.0 - uVein, 1.0, 0.5 + 0.55 * f + 0.4 * length(q)) * 0.9;
#elif DIE_PATTERN == 3
  float n = snoise(p * 3.0) * 0.6 + snoise(p * 7.0 + 3.0) * 0.4;
  m = smoothstep(uVein, uVein + 0.12, n);
  c = smoothstep(-0.5, 0.7, snoise(p * 0.7) * 0.7 + snoise(p * 1.5 + 4.0) * 0.3) * uCloud;
#else
  float f = fbm(p + uWarp * snoise(p * 1.3 + 4.0));
  m = smoothstep(uVein - 0.12, uVein + 0.12, f);
  c = smoothstep(-0.4, 0.4, snoise(p * 2.0 + 9.0)) * uCloud;
#endif
}
`;

function injectDieShader(shader: THREE.WebGLProgramParametersWithUniforms, uniforms: Record<string, THREE.IUniform>) {
  Object.assign(shader.uniforms, uniforms);
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vObjPos;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjPos = position;');

  const transmission = THREE.ShaderChunk.transmission_fragment.replace(
    'material.transmission = transmission;',
    'material.transmission = transmission * (1.0 - dMask * uMaskOpaque);',
  );

  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>\n${NOISE_GLSL}`)
    .replace(
      '#include <color_fragment>',
      /* glsl */ `#include <color_fragment>
      vec3 dP = vObjPos * uScale + uSeed;
      float dMask; float dCloud;
      diePattern(dP, dMask, dCloud);
      vec3 dCol = mix(uColorA, uColorC, dCloud);
      dCol = mix(dCol, uColorB, dMask);
      diffuseColor.rgb = dCol;`,
    )
    .replace(
      '#include <roughnessmap_fragment>',
      '#include <roughnessmap_fragment>\nroughnessFactor = mix(uRoughA, uRoughB, dMask);',
    )
    .replace(
      '#include <metalnessmap_fragment>',
      '#include <metalnessmap_fragment>\nmetalnessFactor = mix(uMetalA, uMetalB, dMask);',
    )
    .replace(
      '#include <emissivemap_fragment>',
      /* glsl */ `#include <emissivemap_fragment>
      totalEmissiveRadiance += uColorB * dMask * uEmissiveVein * (0.78 + 0.22 * sin(uTime * 1.9 + dP.x * 2.7 + dP.z * 1.3));
      #if DIE_GLITTER
      {
        vec3 gp = vObjPos * uGlitterDensity + uSeed * 7.0;
        vec3 gc = floor(gp);
        vec3 gh = hash33(gc);
        float gd = length(fract(gp) - (0.25 + 0.5 * gh));
        float flake = smoothstep(0.2, 0.0, gd) * step(0.45, gh.z);
        vec3 fn = normalize(normal + (hash33(gc + 17.0) - 0.5) * 1.7);
        float sp = pow(max(dot(fn, normalize(vViewPosition)), 0.0), 28.0);
        totalEmissiveRadiance += uGlitterColor * flake * sp * uGlitter;
      }
      #endif`,
    )
    .replace('#include <transmission_fragment>', transmission);
}

export interface DieMaterials {
  body: THREE.MeshPhysicalMaterial;
  ink: THREE.MeshPhysicalMaterial;
  uniforms: Record<string, THREE.IUniform>;
}

const atlasTextures = new Map<DieKind, { color: THREE.Texture; bump: THREE.Texture }>();
const inkCache = new Map<string, THREE.MeshPhysicalMaterial>();
let maxAniso = 8;

export function setMaxAnisotropy(a: number) {
  maxAniso = a;
}

function atlasFor(def: DieDef) {
  let t = atlasTextures.get(def.kind);
  if (!t) {
    const color = new THREE.CanvasTexture(def.atlas);
    color.colorSpace = THREE.SRGBColorSpace;
    color.anisotropy = maxAniso;
    const blurred = document.createElement('canvas');
    blurred.width = def.atlas.width;
    blurred.height = def.atlas.height;
    const bctx = blurred.getContext('2d')!;
    bctx.fillStyle = '#000';
    bctx.fillRect(0, 0, blurred.width, blurred.height);
    bctx.filter = 'blur(2.5px)';
    bctx.drawImage(def.atlas, 0, 0);
    const bump = new THREE.CanvasTexture(blurred);
    bump.colorSpace = THREE.NoColorSpace;
    bump.anisotropy = maxAniso;
    t = { color, bump };
    atlasTextures.set(def.kind, t);
  }
  return t;
}

/** Presets keep their designed ink unless it fails the contrast test against their own body. */
const presetInk = new Map<string, DiceStyle['ink']>();
function resolveInk(style: DiceStyle): DiceStyle['ink'] {
  if (style.id === 'generated') return style.ink;
  let ink = presetInk.get(style.id);
  if (!ink) {
    ink = inkReadable(style.ink, style.body) ? style.ink : chooseInk(style.body);
    presetInk.set(style.id, ink);
  }
  return ink;
}

function inkMaterial(ink: DiceStyle['ink'], def: DieDef): THREE.MeshPhysicalMaterial {
  const key = `${def.kind}|${ink.color}|${ink.metalness}|${ink.roughness}|${ink.emissive ?? ''}|${ink.emissiveIntensity ?? ''}`;
  let m = inkCache.get(key);
  if (!m) {
    const tex = atlasFor(def);
    m = new THREE.MeshPhysicalMaterial({
      color: ink.color,
      metalness: ink.metalness,
      roughness: Math.max(ink.roughness, MATTE.inkRough),
      map: tex.color,
      bumpMap: tex.bump,
      bumpScale: 1.2,
      alphaTest: 0.5,
      clearcoat: 0,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    // a whisper of self-illumination keeps gilt numerals legible when a face turns away from the lamp
    m.emissive = new THREE.Color(ink.emissive ?? ink.color);
    m.emissiveMap = tex.color;
    m.emissiveIntensity = ink.emissiveIntensity ?? (ink.metalness > 0.5 ? 0.12 : 0);
    inkCache.set(key, m);
  }
  return m;
}

/**
 * Everything is satin-finished: no surface is allowed to be glossy enough to throw back
 * a hard image of the lamp. Gems become frosted, resin and lacquer become eggshell.
 */
const MATTE = { rough: 0.42, clearcoat: 0.35, clearcoatRough: 0.5, inkRough: 0.58 };

/** A fresh body material (unique seed → unique veins) plus the shared inlay material. */
export function createDieMaterials(style: DiceStyle, def: DieDef): DieMaterials {
  const b = style.body;
  const roughA = Math.max(b.roughA, MATTE.rough);
  const roughB = Math.max(b.roughB, MATTE.rough);
  const clearcoat = Math.min(b.clearcoat ?? 0, MATTE.clearcoat);
  const clearcoatRoughness = Math.max(b.clearcoatRoughness ?? 0.1, MATTE.clearcoatRough);
  const uniforms: Record<string, THREE.IUniform> = {
    uColorA: { value: new THREE.Color(b.colorA) },
    uColorB: { value: new THREE.Color(b.colorB) },
    uColorC: { value: new THREE.Color(b.colorC) },
    uScale: { value: b.scale },
    uWarp: { value: b.warp },
    uVein: { value: b.vein },
    uCloud: { value: b.cloud },
    uMetalA: { value: b.metalA },
    uMetalB: { value: b.metalB },
    uRoughA: { value: roughA },
    uRoughB: { value: roughB },
    uGlitter: { value: b.glitter ?? 0 },
    uGlitterDensity: { value: b.glitterDensity ?? 10 },
    uGlitterColor: { value: new THREE.Color(b.glitterColor ?? '#ffffff') },
    uEmissiveVein: { value: b.emissiveVein ?? 0 },
    uMaskOpaque: { value: b.maskOpaque ?? 0 },
    uTime: { value: rand() * 100 },
    uSeed: { value: new THREE.Vector3(randRange(-50, 50), randRange(-50, 50), randRange(-50, 50)) },
  };
  const body = new THREE.MeshPhysicalMaterial({
    color: '#ffffff',
    metalness: b.metalA,
    roughness: roughA,
    clearcoat,
    clearcoatRoughness,
    specularIntensity: 0.75,
    transmission: b.transmission ?? 0,
    ior: b.ior ?? 1.5,
    thickness: b.thickness ?? 0,
    attenuationColor: new THREE.Color(b.attenuationColor ?? '#ffffff'),
    attenuationDistance: b.attenuationDistance ?? Infinity,
    iridescence: b.iridescence ?? 0,
    iridescenceIOR: 1.45,
    iridescenceThicknessRange: [180, 620],
    sheen: b.sheen ?? 0,
    sheenColor: new THREE.Color(b.sheenColor ?? '#ffffff'),
    sheenRoughness: 0.4,
    dispersion: b.dispersion ?? 0,
    emissive: '#000000',
  });
  const glitter = (b.glitter ?? 0) > 0 ? 1 : 0;
  body.defines = { ...body.defines, DIE_PATTERN: b.pattern, DIE_GLITTER: glitter };
  body.onBeforeCompile = (shader) => injectDieShader(shader, uniforms);
  body.customProgramCacheKey = () => `die-body-${b.pattern}-${glitter}`;
  return { body, ink: inkMaterial(resolveInk(style), def), uniforms };
}
