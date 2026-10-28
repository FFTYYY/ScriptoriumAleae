import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { DIE_KINDS, getDie, readDie, type DieDef, type DieKind } from './dice';
import { createDieMaterials, DICE_STYLES, STYLE_BY_ID, setMaxAnisotropy, type DiceStyle, type DieMaterials } from './materials';
import { buildEnvironmentScene, buildScenery, TRAY, type Scenery } from './scenery';
import { familySamples, generateStyle } from './stylegen';
import { DiceAudio, type Body as AudioBody, type Surface } from './audio';
import { rand, randQuaternion, randRange, randSign, randUnitVector } from './rng';

export type Quality = 'high' | 'medium' | 'low';

export interface TableSettings {
  styleId: string; // a style id or 'random'
  timeScale: number;
  quality: Quality;
  felt: string;
  sound: boolean;
  volume: number;
}

export interface DieRequest {
  kind: DieKind;
}

export interface SettledDie {
  kind: DieKind;
  value: number;
  label: string;
  styleId: string;
}

export interface DieTag {
  text: string;
  tone?: 'gold' | 'crimson' | 'muted' | 'plain';
}

export interface TableEvents {
  requestDice(): DieRequest[] | null;
  onRollStart(id: number): void;
  onSettled(id: number, dice: SettledDie[], info: { nudged: number; seconds: number }): void;
  onHoldChange(holding: boolean): void;
  onNotice(msg: string): void;
  /** the user took over (true) or handed back (false) the camera */
  onViewChange?(manual: boolean): void;
}

interface LiveDie {
  def: DieDef;
  style: DiceStyle;
  group: THREE.Group;
  mats: DieMaterials;
  body?: CANNON.Body;
  prevPos: THREE.Vector3;
  prevQuat: THREE.Quaternion;
  vBefore: CANNON.Vec3;
  wBefore: CANNON.Vec3;
  lastHit: number;
  /** consecutive observation windows in which the die did not visibly move */
  still: number;
  anchorPos: THREE.Vector3;
  anchorQuat: THREE.Quaternion;
  nudges: number;
  // hand-held motion
  hOffset: THREE.Vector3;
  hVel: THREE.Vector3;
  hSpin: THREE.Vector3;
  tag?: HTMLDivElement;
}

interface Insets {
  left: number;
  right: number;
  top: number;
  bottom: number;
  focusTop: number;
  focusBottom: number;
  /** lay the tray lengthwise down the screen regardless of the free area's shape */
  portrait: boolean;
}

// 300 Hz: a die at full speed travels under a centimetre per step, so impacts never visibly sink in
const STEP = 1 / 300;
const MAX_STEPS = 10;
const GRAVITY = 981; // cm/s²
const HOLD_HEIGHT = 10;
const DEG = Math.PI / 180;
export const MAX_DICE = 40;

/** Device-pixel-ratio ceiling per quality level. Fill rate, not geometry, is what costs here. */
const PIXEL_CAP: Record<Quality, number> = { high: 1.5, medium: 1.25, low: 1 };

const FinishShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uRes: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform vec2 uRes;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec2 q = vUv - 0.5;
      q.x *= uRes.x / uRes.y;
      float v = smoothstep(1.15, 0.2, length(q));
      c.rgb *= mix(0.42, 1.0, v);
      c.rgb = mix(c.rgb, c.rgb * vec3(1.05, 0.98, 0.88), 0.55);
      float g = hash(floor(vUv * uRes) + fract(uTime * 7.0) * 113.0) - 0.5;
      c.rgb += g * 0.03;
      gl_FragColor = c;
    }`,
};

/** A hexagonally packed handful; big handfuls spread wide before they stack, so they land as a layer rather than a tower. */
function clusterOffsets(n: number, spacing: number): THREE.Vector3[] {
  const pts: THREE.Vector3[] = [];
  for (let q = -3; q <= 3; q++)
    for (let r = -3; r <= 3; r++) pts.push(new THREE.Vector3((q + r / 2) * spacing, 0, r * spacing * 0.866));
  pts.sort((a, b) => a.lengthSq() - b.lengthSq() || Math.atan2(a.z, a.x) - Math.atan2(b.z, b.x));
  const perLayer = n <= 7 ? 7 : n <= 24 ? 12 : 19;
  const out: THREE.Vector3[] = [];
  for (let i = 0; i < n; i++) {
    const layer = Math.floor(i / perLayer);
    const p = pts[i % perLayer].clone();
    if (layer % 2 === 1) p.x += spacing / 2; // nest alternate layers
    p.y = layer * spacing * 0.9;
    out.push(p);
  }
  return out;
}

function clusterRadius(offs: THREE.Vector3[], maxR: number) {
  let r = 0;
  for (const o of offs) r = Math.max(r, Math.hypot(o.x, o.z));
  return r + maxR + 0.6;
}

function maxRadius(kinds: DieKind[]) {
  return kinds.reduce((m, k) => Math.max(m, getDie(k).radius), 0);
}

/** Collision data per die kind: vertices, faces, outward normals and the de-duplicated SAT axes. */
const hullCache = new Map<DieKind, { vertices: CANNON.Vec3[]; faces: number[][]; normals: CANNON.Vec3[]; axes: CANNON.Vec3[] }>();
function hullFor(def: DieDef) {
  let h = hullCache.get(def.kind);
  if (!h) {
    const normals = def.faces.map((f) => new CANNON.Vec3(f.normal.x, f.normal.y, f.normal.z));
    // opposite faces share a separating axis; testing it once is enough
    const axes: CANNON.Vec3[] = [];
    for (const n of normals) if (!axes.some((a) => Math.abs(a.dot(n)) > 0.9999)) axes.push(n);
    h = {
      vertices: def.vertices.map((p) => new CANNON.Vec3(p.x, p.y, p.z)),
      faces: def.faces.map((f) => [...f.verts]),
      normals,
      axes,
    };
    hullCache.set(def.kind, h);
  }
  return h;
}

const SURFACE_RANK: Record<Surface, number> = { felt: 1, wood: 2, die: 3 };

export class DiceTable {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, 1, 1, 900);
  private composer!: EffectComposer;
  private bloom!: UnrealBloomPass;
  private finish!: ShaderPass;
  private scenery!: Scenery;
  private world: CANNON.World;
  private matDie = new CANNON.Material('die');
  private surfaceOf = new Map<CANNON.Body, Surface>();
  private dieOf = new Map<CANNON.Body, LiveDie>();
  private dice: LiveDie[] = [];
  private fading: { group: THREE.Group; mats: DieMaterials; t: number; tag?: HTMLDivElement }[] = [];
  private audio = new DiceAudio();
  private settings: TableSettings;
  private state: 'idle' | 'holding' | 'rolling' | 'settled' = 'idle';
  private rollId = 0;
  private simTime = 0;
  private rollStart = 0;
  private acc = 0;
  private time = 0;
  private last = performance.now();
  private raf = 0;
  private frameNo = 0;
  private width = 1;
  private height = 1;
  private insets: Insets = { left: 0, right: 0, top: 0, bottom: 0, focusTop: 0, focusBottom: 0, portrait: false };
  /** Orbit camera: azimuth / elevation / distance around a target on the felt, each easing toward a goal. */
  private view = {
    az: 0,
    el: 54 * DEG,
    dist: 100,
    target: new THREE.Vector3(),
    goalAz: 0,
    goalEl: 54 * DEG,
    goalDist: 100,
    goalTarget: new THREE.Vector3(),
    baseAz: 0,
    baseEl: 54 * DEG,
    baseDist: 100,
    focused: false,
    manual: false,
    moving: false,
    init: false,
  };
  private drag: { mode: 'orbit' | 'pan'; id: number; x: number; y: number } | null = null;
  private touches = new Map<number, { x: number; y: number }>();
  private pinch: { d: number; x: number; y: number } | null = null;
  private parallax = new THREE.Vector2();
  private parallaxS = new THREE.Vector2();
  private hand = { pos: new THREE.Vector3(0, HOLD_HEIGHT, 0), target: new THREE.Vector3(0, HOLD_HEIGHT, 0), samples: [] as { t: number; p: THREE.Vector3 }[], vel: new THREE.Vector3(), lastVel: new THREE.Vector3(), radius: 3, pointerId: -1 };
  private raycaster = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -HOLD_HEIGHT);
  private ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private resizeObs: ResizeObserver;
  private nudgedCount = 0;
  private nudgeRounds = 0;
  private windowT = 0;
  /** every die is (near enough) motionless: the rest of the settle check can run in fast-forward */
  private quiet = false;
  private rollWall = 0;
  /** fastest surface speed of any awake die this step, cm/s */
  private maxSpeed = 0;
  /** the playback rate actually in use; eases toward real time once only a slow creep is left */
  private playScale = 1;
  private disposed = false;
  private dimmed = false;
  private shadowDirty = true;
  /** dynamic resolution: drops when the GPU cannot keep up */
  private resScale = 1;
  private perf = { t: 0, cpu: 0, n: 0, lastAdjust: 0 };
  // scratch objects reused every step / frame
  private partner = new Map<LiveDie, Surface>();
  private onFelt = new Set<LiveDie>();
  private tmpV = new THREE.Vector3();
  private tmpV2 = new THREE.Vector3();
  private tmpQ = new THREE.Quaternion();

  private constructor(
    private container: HTMLElement,
    private tagLayer: HTMLElement,
    private events: TableEvents,
    settings: TableSettings,
  ) {
    this.settings = { ...settings };
    const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', alpha: false, stencil: false });
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    // shadows are redrawn only while something that casts them is moving
    renderer.shadowMap.autoUpdate = false;
    // refraction through gem dice is soft anyway; half resolution is indistinguishable and 4× cheaper
    renderer.transmissionResolutionScale = 0.5;
    this.renderer = renderer;
    setMaxAnisotropy(Math.min(8, renderer.capabilities.getMaxAnisotropy()));
    container.appendChild(renderer.domElement);
    renderer.domElement.classList.add('table-canvas');

    // physics
    const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -GRAVITY, 0), allowSleep: true });
    // Pairwise bounding-sphere broadphase. cannon-es's SAPBroadphase sorts by AABBs it never
    // refreshes for static bodies, then prunes with bounding spheres and stops early — so a die
    // pressed against the left wall by its neighbours could skip the wall entirely and pass
    // through it. With at most a few dozen bodies, testing every pair costs microseconds.
    world.broadphase = new CANNON.NaiveBroadphase();
    const solver = world.solver as CANNON.GSSolver;
    solver.iterations = 12;
    solver.tolerance = 1e-6;
    world.quatNormalizeFast = false;
    world.quatNormalizeSkip = 0;
    this.world = world;
    this.buildStatics();

    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(container);
  }

  static async create(container: HTMLElement, tagLayer: HTMLElement, events: TableEvents, settings: TableSettings): Promise<DiceTable> {
    await Promise.race([
      Promise.all([
        document.fonts.load('700 64px "Cinzel"'),
        document.fonts.load('600 64px "Cinzel"'),
        document.fonts.load('italic 32px "IM Fell English"'),
      ]),
      new Promise((r) => setTimeout(r, 3500)),
    ]);
    const t = new DiceTable(container, tagLayer, events, settings);
    await t.init();
    return t;
  }

  private async init() {
    const { renderer, scene } = this;
    scene.background = new THREE.Color('#060403');
    scene.fog = new THREE.FogExp2('#070504', 0.0062);

    const pmrem = new THREE.PMREMGenerator(renderer);
    const env = pmrem.fromScene(buildEnvironmentScene(), 0.03);
    scene.environment = env.texture;
    scene.environmentIntensity = 0.85;
    pmrem.dispose();
    this.scenery = buildScenery();
    scene.add(this.scenery.root);
    this.scenery.setFelt(this.settings.felt);

    for (const k of DIE_KINDS) getDie(k);

    this.setupComposer();
    this.applyQuality();
    this.audio.enabled = this.settings.sound;
    this.audio.volume = this.settings.volume;
    this.resize();

    // Pre-compile every preset and every generator family so the first throw does not hitch.
    const warm: THREE.Object3D[] = [];
    [...DICE_STYLES, ...familySamples()].forEach((s, i) => {
      const def = getDie(DIE_KINDS[i % DIE_KINDS.length]);
      const m = createDieMaterials(s, def);
      const g = new THREE.Group();
      const b = new THREE.Mesh(def.body, m.body);
      b.castShadow = true;
      g.add(b, new THREE.Mesh(def.inlay, m.ink));
      g.position.set((i - 7) * 3, -40, 0);
      scene.add(g);
      warm.push(g);
    });
    // compile against the composer's HDR target: tone mapping / colour space are part of the program key
    renderer.setRenderTarget(this.composer.readBuffer);
    try {
      await renderer.compileAsync(scene, this.camera);
    } catch {
      renderer.compile(scene, this.camera);
    }
    renderer.setRenderTarget(null);
    renderer.shadowMap.needsUpdate = true;
    this.composer.render();
    warm.forEach((g) => {
      scene.remove(g);
      ((g.children[0] as THREE.Mesh).material as THREE.Material).dispose();
    });
    this.shadowDirty = true;

    this.bindPointer();
    if (import.meta.env.DEV) (window as unknown as { __table: unknown }).__table = this;
    this.raf = requestAnimationFrame(this.frame);
  }

  private buildStatics() {
    const w = this.world;
    const felt = new CANNON.Material('felt');
    const wood = new CANNON.Material('wood');
    // a firm, lively table: dice skitter and bounce rather than die on contact
    w.addContactMaterial(new CANNON.ContactMaterial(this.matDie, felt, { friction: 0.24, restitution: 0.42 }));
    w.addContactMaterial(new CANNON.ContactMaterial(this.matDie, wood, { friction: 0.16, restitution: 0.68 }));
    w.addContactMaterial(new CANNON.ContactMaterial(this.matDie, this.matDie, { friction: 0.26, restitution: 0.5 }));

    const floor = new CANNON.Body({ mass: 0, material: felt, shape: new CANNON.Plane() });
    floor.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    w.addBody(floor);
    this.surfaceOf.set(floor, 'felt');

    // Invisible walls continue far above the wooden rim, and a ceiling caps them:
    // however hard a die bounces, it stays in the tray.
    const H = 30;
    const T = 6;
    // a hair inside the wooden rim, so the instant of contact overlap stays hidden behind it
    const hw = TRAY.innerW / 2 - 0.2;
    const hd = TRAY.innerD / 2 - 0.2;
    const wall = (x: number, z: number, sx: number, sz: number) => {
      const b = new CANNON.Body({ mass: 0, material: wood, shape: new CANNON.Box(new CANNON.Vec3(sx, H, sz)) });
      b.position.set(x, H, z);
      w.addBody(b);
      this.surfaceOf.set(b, 'wood');
    };
    wall(hw + T, 0, T, hd + 2 * T);
    wall(-hw - T, 0, T, hd + 2 * T);
    wall(0, hd + T, hw + 2 * T, T);
    wall(0, -hd - T, hw + 2 * T, T);
    // fill the rounded inner corners
    const s = TRAY.innerRadius * (Math.SQRT2 - 1) * 1.05;
    for (const [sx, sz] of [
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ]) {
      const b = new CANNON.Body({ mass: 0, material: wood, shape: new CANNON.Box(new CANNON.Vec3(s, H, s)) });
      b.position.set(sx * hw, H, sz * hd);
      b.quaternion.setFromEuler(0, Math.PI / 4, 0);
      w.addBody(b);
      this.surfaceOf.set(b, 'wood');
    }
    const ceil = new CANNON.Body({ mass: 0, material: wood, shape: new CANNON.Plane() });
    ceil.quaternion.setFromEuler(Math.PI / 2, 0, 0);
    ceil.position.set(0, 2 * H, 0);
    w.addBody(ceil);
    this.surfaceOf.set(ceil, 'wood');
  }

  private setupComposer() {
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    const composer = new EffectComposer(this.renderer, rt);
    composer.addPass(new RenderPass(this.scene, this.camera));
    // only genuinely emissive things (flames, embers) bloom; specular glints on dice stay crisp
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.45, 0.55, 1.15);
    composer.addPass(this.bloom);
    composer.addPass(new OutputPass());
    this.finish = new ShaderPass(FinishShader);
    composer.addPass(this.finish);
    this.composer = composer;
  }

  private pixelRatio() {
    const dpr = window.devicePixelRatio || 1;
    return Math.max(0.6, Math.min(dpr, PIXEL_CAP[this.settings.quality]) * this.resScale);
  }

  private applyQuality() {
    const q = this.settings.quality;
    this.bloom.enabled = q !== 'low';
    const samples = q === 'low' ? 0 : 4;
    for (const rt of [this.composer.renderTarget1, this.composer.renderTarget2]) {
      if (rt.samples !== samples) {
        rt.samples = samples;
        rt.dispose();
      }
    }
    const size = q === 'high' ? 2048 : 1024;
    const lamp = this.scenery.lamp;
    if (lamp.shadow.mapSize.x !== size) {
      lamp.shadow.mapSize.set(size, size);
      lamp.shadow.map?.dispose();
      (lamp.shadow as { map: THREE.WebGLRenderTarget | null }).map = null;
    }
    lamp.shadow.radius = q === 'low' ? 1 : 3;
    this.shadowDirty = true;
    this.applyPixelRatio();
  }

  private applyPixelRatio() {
    const ratio = this.pixelRatio();
    this.renderer.setPixelRatio(ratio);
    this.composer.setPixelRatio(ratio);
    this.resize();
  }

  /* ───────────────────────── public API ───────────────────────── */

  setSettings(p: Partial<TableSettings>) {
    const prev = this.settings;
    this.settings = { ...prev, ...p };
    if (p.felt && p.felt !== prev.felt) this.scenery.setFelt(p.felt);
    if (p.quality && p.quality !== prev.quality) {
      this.resScale = 1;
      this.applyQuality();
    }
    if (p.sound !== undefined) this.audio.enabled = p.sound;
    if (p.volume !== undefined) this.audio.volume = p.volume;
  }

  /** Screen-space margins of the UI around the table; the `focus*` margins apply when leaning in on settled dice. */
  setInsets(i: { left: number; right: number; top: number; bottom: number; focusTop?: number; focusBottom?: number; portrait?: boolean }) {
    this.insets = { ...i, focusTop: i.focusTop ?? i.top, focusBottom: i.focusBottom ?? i.bottom, portrait: i.portrait ?? false };
    this.fitCamera();
  }

  /** While a dialog covers the table, render sparingly. */
  setDimmed(d: boolean) {
    this.dimmed = d;
  }

  get busy() {
    return this.state === 'rolling' || this.state === 'holding';
  }

  unlockAudio() {
    this.audio.unlock();
  }

  uiSound(kind: 'tick' | 'page' | 'seal' | 'chime') {
    this.audio.ui(kind);
  }

  /** Throw from a random side of the tray. Returns the roll id. */
  roll(reqs: DieRequest[]): number {
    this.audio.unlock();
    if (this.state === 'holding') this.abortHold();
    this.clearDice();
    const n = Math.min(reqs.length, MAX_DICE);
    if (!n) return -1;
    this.homeCamera();
    const maxR = maxRadius(reqs.slice(0, n).map((r) => r.kind));
    const offs = clusterOffsets(n, 2 * maxR + 0.35);
    const cr = clusterRadius(offs, maxR);
    const hw = TRAY.innerW / 2;
    const hd = TRAY.innerD / 2;
    // choose a wall to throw from, and aim across the tray
    const side = Math.floor(rand() * 4);
    const along = randRange(-0.5, 0.5);
    const start = new THREE.Vector3();
    if (side === 0) start.set(along * (hw - cr), 0, hd - cr);
    else if (side === 1) start.set(along * (hw - cr), 0, -hd + cr);
    else if (side === 2) start.set(hw - cr, 0, along * (hd - cr));
    else start.set(-hw + cr, 0, along * (hd - cr));
    const aim = new THREE.Vector3(randRange(-hw * 0.4, hw * 0.4), 0, randRange(-hd * 0.35, hd * 0.35));
    const dir = aim.sub(start).setY(0).normalize();
    // an underhand lob: the dice arc up out of the hand and come down across the tray;
    // big handfuls are thrown more gently and fan out, as a real hand would
    const speed = randRange(140, 215) * (n > 10 ? 0.8 : 1);
    const fan = 0.15 + Math.min(0.55, n * 0.025);
    const height = randRange(7, 10);
    const vy = randRange(25, 85);
    const id = ++this.rollId;
    const yaw = Math.atan2(dir.x, dir.z);
    const up = new THREE.Vector3(0, 1, 0);
    reqs.slice(0, n).forEach((r, i) => {
      const d = this.makeDie(r.kind);
      const o = offs[i].clone().applyAxisAngle(up, yaw);
      d.group.position.set(start.x + o.x, height + o.y, start.z + o.z);
      const q = randQuaternion();
      d.group.quaternion.set(q[0], q[1], q[2], q[3]);
      const s = speed * randRange(0.85, 1.1);
      const di = dir.clone().applyAxisAngle(up, randRange(-fan, fan));
      const v = di.multiplyScalar(s).setY(vy + randRange(-10, 10));
      const axis = randUnitVector();
      const spin = randRange(22, 42);
      this.launch(d, v, new THREE.Vector3(axis[0], axis[1], axis[2]).multiplyScalar(spin));
    });
    this.beginRoll(id);
    return id;
  }

  clear() {
    if (this.state === 'holding') this.abortHold();
    this.clearDice();
    this.state = 'idle';
    if (!this.view.manual) this.unfocus();
  }

  /** Hand the camera back to the automatic framing. */
  resetView() {
    const v = this.view;
    const was = v.manual;
    v.manual = false;
    v.goalAz = v.baseAz;
    v.goalEl = v.baseEl;
    if (this.state === 'settled') this.focusOnDice();
    else this.unfocus();
    if (was) this.events.onViewChange?.(false);
  }

  showTags(id: number, tags: DieTag[]) {
    if (id !== this.rollId) return;
    this.dice.forEach((d, i) => {
      const t = tags[i];
      if (!t) return;
      const el = document.createElement('div');
      el.className = `die-tag tone-${t.tone ?? 'plain'}`;
      const span = document.createElement('span');
      span.textContent = t.text;
      el.appendChild(span);
      el.style.setProperty('--delay', `${i * 45}ms`);
      this.tagLayer.appendChild(el);
      d.tag = el;
    });
    this.updateTags();
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObs.disconnect();
    this.unbindPointer();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  /* ───────────────────────── dice lifecycle ───────────────────────── */

  private resolveStyle(): DiceStyle {
    const id = this.settings.styleId;
    if (id === 'random') return generateStyle();
    return STYLE_BY_ID.get(id) ?? DICE_STYLES[0];
  }

  private makeDie(kind: DieKind): LiveDie {
    const def = getDie(kind);
    const style = this.resolveStyle();
    const mats = createDieMaterials(style, def);
    const group = new THREE.Group();
    const body = new THREE.Mesh(def.body, mats.body);
    body.castShadow = true;
    body.receiveShadow = true;
    const ink = new THREE.Mesh(def.inlay, mats.ink);
    ink.receiveShadow = true;
    group.add(body, ink);
    this.scene.add(group);
    const d: LiveDie = {
      def,
      style,
      group,
      mats,
      prevPos: new THREE.Vector3(),
      prevQuat: new THREE.Quaternion(),
      vBefore: new CANNON.Vec3(),
      wBefore: new CANNON.Vec3(),
      lastHit: 0,
      still: 0,
      anchorPos: new THREE.Vector3(),
      anchorQuat: new THREE.Quaternion(),
      nudges: 0,
      hOffset: new THREE.Vector3(),
      hVel: new THREE.Vector3(),
      hSpin: new THREE.Vector3(),
    };
    this.dice.push(d);
    return d;
  }

  private launch(d: LiveDie, v: THREE.Vector3, w: THREE.Vector3) {
    const def = d.def;
    const hull = hullFor(def);
    const shape = new CANNON.ConvexPolyhedron({
      vertices: hull.vertices,
      faces: hull.faces,
      normals: hull.normals,
      axes: hull.axes,
    });
    const mass = def.volume * d.style.density * 0.085; // about 1 for a resin d6
    const body = new CANNON.Body({
      mass,
      material: this.matDie,
      linearDamping: 0.01,
      angularDamping: 0.03,
      allowSleep: true,
      sleepSpeedLimit: 0.45,
      sleepTimeLimit: 0.35,
    });
    body.addShape(shape);
    // exact uniform-density inertia (cannon's default is a bounding-box estimate)
    body.inertia.set(def.inertia.x * mass, def.inertia.y * mass, def.inertia.z * mass);
    body.invInertia.set(1 / body.inertia.x, 1 / body.inertia.y, 1 / body.inertia.z);
    body.updateInertiaWorld(true);
    const p = d.group.position;
    const q = d.group.quaternion;
    body.position.set(p.x, p.y, p.z);
    body.quaternion.set(q.x, q.y, q.z, q.w);
    body.velocity.set(v.x, v.y, v.z);
    body.angularVelocity.set(w.x, w.y, w.z);
    this.world.addBody(body);
    d.body = body;
    d.prevPos.copy(p);
    d.prevQuat.copy(q);
    this.dieOf.set(body, d);
  }

  private beginRoll(id: number) {
    this.state = 'rolling';
    this.quiet = false;
    this.maxSpeed = Infinity;
    this.playScale = this.settings.timeScale;
    this.rollWall = performance.now();
    this.rollStart = this.simTime;
    this.windowT = 0;
    this.acc = 0;
    this.nudgedCount = 0;
    this.nudgeRounds = 0;
    this.events.onRollStart(id);
  }

  private clearDice() {
    for (const d of this.dice) {
      if (d.body) {
        this.world.removeBody(d.body);
        this.dieOf.delete(d.body);
      }
      this.fading.push({ group: d.group, mats: d.mats, t: 0, tag: d.tag });
      d.tag?.classList.add('leaving');
    }
    this.dice = [];
  }

  /* ───────────────────────── pointer: hand & camera ───────────────────────── */

  private onPointerDown = (e: PointerEvent) => {
    const canvas = this.renderer.domElement;
    if (e.pointerType === 'touch') {
      this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.touches.size === 2) {
        // a second finger turns the gesture into a camera move
        if (this.state === 'holding') this.abortHold();
        this.startPinch();
        e.preventDefault();
        return;
      }
      if (this.touches.size > 2) return;
    }
    if (e.button === 1 || e.button === 2) {
      // middle: orbit (shift: pan) · right: pan
      e.preventDefault();
      this.drag = { mode: e.button === 2 || e.shiftKey ? 'pan' : 'orbit', id: e.pointerId, x: e.clientX, y: e.clientY };
      canvas.setPointerCapture(e.pointerId);
      return;
    }
    if (e.button !== 0 || this.state === 'holding') return;
    this.audio.unlock();
    const reqs = this.events.requestDice();
    if (!reqs || !reqs.length) {
      this.events.onNotice('还没有选择骰子。');
      return;
    }
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    this.hand.pointerId = e.pointerId;
    this.clearDice();
    const n = Math.min(reqs.length, MAX_DICE);
    this.homeCamera();
    const maxR = maxRadius(reqs.slice(0, n).map((r) => r.kind));
    const offs = clusterOffsets(n, 2 * maxR + 0.35);
    this.hand.radius = clusterRadius(offs, maxR);
    this.pointerToHand(e);
    this.hand.pos.copy(this.hand.target);
    this.hand.samples = [{ t: performance.now(), p: this.hand.pos.clone() }];
    this.hand.vel.set(0, 0, 0);
    reqs.slice(0, n).forEach((r, i) => {
      const d = this.makeDie(r.kind);
      d.hOffset.copy(offs[i]);
      d.group.position.copy(this.hand.pos).add(d.hOffset);
      const q = randQuaternion();
      d.group.quaternion.set(q[0], q[1], q[2], q[3]);
      const a = randUnitVector();
      d.hSpin.set(a[0], a[1], a[2]).multiplyScalar(randRange(3, 8));
      d.group.scale.setScalar(0.01);
    });
    this.state = 'holding';
    this.rollId++;
    this.events.onHoldChange(true);
  };

  private onPointerMove = (e: PointerEvent) => {
    const r = this.container.getBoundingClientRect();
    this.parallax.set(((e.clientX - r.left) / r.width) * 2 - 1, ((e.clientY - r.top) / r.height) * 2 - 1);
    const t = this.touches.get(e.pointerId);
    if (t) {
      t.x = e.clientX;
      t.y = e.clientY;
      if (this.pinch && this.touches.size >= 2) this.updatePinch();
    }
    if (this.drag && e.pointerId === this.drag.id) {
      const dx = e.clientX - this.drag.x;
      const dy = e.clientY - this.drag.y;
      this.drag.x = e.clientX;
      this.drag.y = e.clientY;
      if (this.drag.mode === 'orbit') this.orbitBy(dx, dy);
      else this.panBy(dx, dy);
    }
    if (this.state === 'holding' && e.pointerId === this.hand.pointerId) this.pointerToHand(e);
  };

  private onPointerUp = (e: PointerEvent) => {
    if (this.touches.delete(e.pointerId) && this.touches.size < 2) this.pinch = null;
    if (this.drag && e.pointerId === this.drag.id) {
      this.drag = null;
      this.renderer.domElement.releasePointerCapture?.(e.pointerId);
      return;
    }
    if (this.state !== 'holding' || e.pointerId !== this.hand.pointerId) return;
    this.renderer.domElement.releasePointerCapture?.(e.pointerId);
    this.releaseHand();
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
    this.zoomAt(Math.exp(THREE.MathUtils.clamp(dy, -240, 240) * 0.0012), e.clientX, e.clientY);
  };

  private onContextMenu = (e: Event) => e.preventDefault();

  private startPinch() {
    const [a, b] = [...this.touches.values()];
    this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  private updatePinch() {
    const [a, b] = [...this.touches.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    const x = (a.x + b.x) / 2;
    const y = (a.y + b.y) / 2;
    const p = this.pinch!;
    if (d > 1 && p.d > 1) this.zoomAt(p.d / d, x, y);
    this.orbitBy(x - p.x, y - p.y);
    this.pinch = { d, x, y };
  }

  private pointerToHand(e: PointerEvent) {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const hit = this.raycaster.ray.intersectPlane(this.plane, this.tmpV);
    if (!hit) return;
    const m = this.hand.radius;
    const hw = Math.max(0, TRAY.innerW / 2 - m);
    const hd = Math.max(0, TRAY.innerD / 2 - m);
    this.hand.target.set(THREE.MathUtils.clamp(hit.x, -hw, hw), HOLD_HEIGHT, THREE.MathUtils.clamp(hit.z, -hd, hd));
  }

  /** Drop whatever is in the hand without throwing it. */
  private abortHold() {
    if (this.hand.pointerId >= 0) this.renderer.domElement.releasePointerCapture?.(this.hand.pointerId);
    this.hand.pointerId = -1;
    this.clearDice();
    this.state = 'idle';
    this.events.onHoldChange(false);
  }

  private releaseHand() {
    this.events.onHoldChange(false);
    this.hand.pointerId = -1;
    const v = this.hand.vel.clone();
    v.y = 0;
    let speed = v.length();
    if (speed > 340) v.multiplyScalar(340 / speed);
    speed = v.length();
    if (speed < 35) {
      // a gentle drop: let it fall with a little drift
      const a = rand() * Math.PI * 2;
      v.set(Math.cos(a), 0, Math.sin(a)).multiplyScalar(randRange(25, 50));
    } else {
      v.multiplyScalar(1.15);
    }
    const dir = v.clone().normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const roll = up.clone().cross(dir); // topspin axis
    const fan = 0.1 + Math.min(0.5, this.dice.length * 0.022);
    this.dice.forEach((d) => {
      d.group.scale.setScalar(1);
      const vi = v
        .clone()
        .applyAxisAngle(up, randRange(-fan, fan))
        .multiplyScalar(randRange(0.9, 1.1))
        .add(d.hVel.clone().multiplyScalar(0.5))
        .add(new THREE.Vector3(randRange(-12, 12), randRange(-25, 5), randRange(-12, 12)));
      const a = randUnitVector();
      const w = new THREE.Vector3(a[0], a[1], a[2])
        .multiplyScalar(randRange(16, 34))
        .add(d.hSpin.clone().multiplyScalar(1.5))
        .addScaledVector(roll, (v.length() / d.def.radius) * randRange(0.15, 0.4) * randSign());
      this.launch(d, vi, w);
    });
    this.beginRoll(this.rollId);
  }

  private updateHand(dt: number) {
    const h = this.hand;
    const k = 1 - Math.exp(-dt * 16);
    const prevX = h.pos.x;
    const prevZ = h.pos.z;
    h.pos.lerp(h.target, k);
    const now = performance.now();
    h.samples.push({ t: now, p: h.pos.clone() });
    while (h.samples.length > 2 && now - h.samples[0].t > 90) h.samples.shift();
    const s0 = h.samples[0];
    const dtS = (now - s0.t) / 1000;
    if (dtS > 0.005) h.vel.subVectors(h.pos, s0.p).divideScalar(dtS);
    const accel = h.vel.distanceTo(h.lastVel) / Math.max(dt, 1e-3);
    h.lastVel.copy(h.vel);
    const moved = Math.hypot(h.pos.x - prevX, h.pos.z - prevZ) / Math.max(dt, 1e-3);
    // the dice jostle inside the hand
    const shake = Math.min(1, moved / 140 + accel / 6000);
    let rattle = false;
    const target = this.tmpV2;
    for (const d of this.dice) {
      target.copy(h.pos).add(d.hOffset);
      target.y += Math.sin(this.time * 9 + d.hOffset.x) * 0.15;
      const p = d.group.position;
      d.hVel.addScaledVector(target.sub(p), 320 * dt).multiplyScalar(Math.exp(-dt * 22));
      if (rand() < shake * dt * 30) {
        const a = randUnitVector();
        d.hVel.x += a[0] * 18 * shake;
        d.hVel.y += a[1] * 18 * shake;
        d.hVel.z += a[2] * 18 * shake;
        d.hSpin.x += a[2] * 6 * shake;
        d.hSpin.y += a[0] * 6 * shake;
        d.hSpin.z += a[1] * 6 * shake;
        rattle = true;
      }
      d.hSpin.multiplyScalar(Math.exp(-dt * 0.8));
      if (d.hSpin.length() < 3) d.hSpin.multiplyScalar(1.05);
      p.addScaledVector(d.hVel, dt);
      const ang = d.hSpin.length() * dt;
      if (ang > 0) {
        this.tmpV.copy(d.hSpin).normalize();
        d.group.quaternion.premultiply(this.tmpQ.setFromAxisAngle(this.tmpV, ang));
      }
      const sc = d.group.scale.x;
      if (sc < 1) d.group.scale.setScalar(Math.min(1, sc + dt * 5));
    }
    if (rattle && rand() < 0.6) {
      const metal = this.dice.some((d) => d.style.density > 5);
      this.audio.rattle(0.35 + shake * 0.65, metal ? 'metal' : 'resin');
    }
    const ring = this.scenery.handRing;
    ring.position.set(h.pos.x, 0.05, h.pos.z);
    const rs = h.radius / 3.4;
    ring.scale.set(rs, rs, rs);
  }

  /* ───────────────────────── simulation ───────────────────────── */

  private audioBody(d: LiveDie): AudioBody {
    return d.style.density > 5 ? 'metal' : d.style.density > 1.5 ? 'stone' : 'resin';
  }

  private notePartner(d: LiveDie | undefined, other: CANNON.Body) {
    if (!d) return;
    const s: Surface = this.dieOf.has(other) ? 'die' : this.surfaceOf.get(other) ?? 'wood';
    const cur = this.partner.get(d);
    if (!cur || SURFACE_RANK[s] > SURFACE_RANK[cur]) this.partner.set(d, s);
    if (s === 'felt') this.onFelt.add(d);
  }

  private physicsStep() {
    for (const d of this.dice) {
      const b = d.body;
      if (!b) continue;
      d.prevPos.set(b.position.x, b.position.y, b.position.z);
      d.prevQuat.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
      d.vBefore.copy(b.velocity);
      d.wBefore.copy(b.angularVelocity);
    }
    this.world.step(STEP);
    this.simTime += STEP;

    // contact partners for foley and felt rolling resistance
    this.partner.clear();
    this.onFelt.clear();
    for (const c of this.world.contacts) {
      this.notePartner(this.dieOf.get(c.bi), c.bj);
      this.notePartner(this.dieOf.get(c.bj), c.bi);
    }
    // the cloth still takes a little out of a rolling die
    const feltDrag = Math.exp(-0.5 * STEP);
    for (const d of this.onFelt) d.body!.angularVelocity.scale(feltDrag, d.body!.angularVelocity);
    const now = performance.now();
    const gh = GRAVITY * STEP;
    for (const d of this.dice) {
      const b = d.body;
      if (!b) continue;
      const dvx = b.velocity.x - d.vBefore.x;
      const dvy = b.velocity.y - d.vBefore.y;
      const dvz = b.velocity.z - d.vBefore.z;
      const dvA = Math.hypot(dvx, dvy, dvz);
      const dvB = Math.hypot(dvx, dvy + gh, dvz);
      const dw = Math.hypot(b.angularVelocity.x - d.wBefore.x, b.angularVelocity.y - d.wBefore.y, b.angularVelocity.z - d.wBefore.z);
      const impact = Math.min(dvA, dvB) + dw * d.def.radius * 0.35;
      const surf = this.partner.get(d);
      if (surf && impact > 9 && now - d.lastHit > 28) {
        d.lastHit = now;
        const ref = surf === 'felt' ? 220 : 160;
        this.audio.hit(surf, this.audioBody(d), (impact / ref) * (surf === 'die' ? 0.75 : 1), d.def.radius, b.position.x / (TRAY.innerW / 2));
      }
      // safety net: anything that escaped is dropped back in
      const p = b.position;
      if (p.y < -6 || Math.abs(p.x) > TRAY.innerW / 2 + 4 || Math.abs(p.z) > TRAY.innerD / 2 + 4) {
        p.set(randRange(-6, 6), 12, randRange(-4, 4));
        b.velocity.set(randRange(-20, 20), -10, randRange(-20, 20));
        const a = randUnitVector();
        b.angularVelocity.set(a[0] * 20, a[1] * 20, a[2] * 20);
        b.wakeUp();
      }
    }
    let quiet = this.dice.length > 0;
    let maxSpeed = 0;
    for (const d of this.dice) {
      const b = d.body!;
      if (b.sleepState === CANNON.Body.SLEEPING) continue;
      maxSpeed = Math.max(maxSpeed, b.velocity.length() + b.angularVelocity.length() * d.def.radius);
    }
    this.maxSpeed = maxSpeed;
    for (const d of this.dice) {
      const b = d.body!;
      if (b.sleepState === CANNON.Body.SLEEPING) continue;
      // under 5 mm/s and ~6°/s: at most a slow creep that cannot change the face showing
      if (b.velocity.lengthSquared() > 0.25 || b.angularVelocity.lengthSquared() > 0.01) {
        quiet = false;
        break;
      }
    }
    this.quiet = quiet;
    if (this.state === 'rolling') this.checkSettle();
  }

  private checkSettle() {
    const elapsed = this.simTime - this.rollStart;
    if (elapsed < 0.5) return;
    // Judge rest by what an observer would see: displacement over short windows. Instantaneous
    // velocity is too noisy in a pile, where contact solving produces tiny periodic kicks.
    this.windowT += STEP;
    if (this.windowT < 0.15) return;
    this.windowT = 0;
    let allRest = true;
    const q = this.tmpQ;
    for (const d of this.dice) {
      const b = d.body!;
      q.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
      const moved = d.anchorPos.distanceTo(this.tmpV.set(b.position.x, b.position.y, b.position.z));
      const turned = 2 * Math.acos(Math.min(1, Math.abs(q.dot(d.anchorQuat))));
      const still = b.sleepState === CANNON.Body.SLEEPING || (moved < 0.06 && turned < 0.015);
      d.still = still ? d.still + 1 : 0;
      d.anchorPos.copy(this.tmpV);
      d.anchorQuat.copy(q);
      if (d.still < 2) allRest = false;
    }
    const timeout = elapsed > 14;
    if (timeout && import.meta.env.DEV) console.log('[roll] timeout; still moving:', this.dice.filter((d) => d.still < 2).length);
    if (!allRest && !timeout) return;
    let nudged = false;
    if (!timeout && this.nudgeRounds < 3) {
      for (const d of this.dice) {
        const b = d.body!;
        q.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
        const r = readDie(d.def, q);
        if (r.flatness < 0.966 && d.nudges < 2) {
          // a cocked die: give it a small push so it falls one way or the other
          d.nudges++;
          this.nudgedCount++;
          b.wakeUp();
          b.velocity.set(randRange(-10, 10), randRange(20, 32), randRange(-10, 10));
          const a = randUnitVector();
          b.angularVelocity.set(a[0] * 9, a[1] * 9, a[2] * 9);
          d.still = 0;
          nudged = true;
        }
      }
    }
    if (nudged) {
      this.nudgeRounds++;
      return;
    }
    const out: SettledDie[] = this.dice.map((d) => {
      const b = d.body!;
      q.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
      const r = readDie(d.def, q);
      return { kind: d.def.kind, value: r.value, label: r.label, styleId: d.style.id };
    });
    this.state = 'settled';
    this.shadowDirty = true;
    for (const d of this.dice) d.body!.sleep();
    this.focusOnDice();
    if (import.meta.env.DEV) console.log(`[roll] real time to result: ${((performance.now() - this.rollWall) / 1000).toFixed(2)}s`);
    this.events.onSettled(this.rollId, out, { nudged: this.nudgedCount, seconds: elapsed });
  }

  /* ───────────────────────── camera ───────────────────────── */

  private resize() {
    const r = this.container.getBoundingClientRect();
    const w = Math.max(1, Math.floor(r.width));
    const h = Math.max(1, Math.floor(r.height));
    this.width = w;
    this.height = h;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = `${w}px`;
    this.renderer.domElement.style.height = `${h}px`;
    if (this.composer) {
      this.composer.setSize(w, h);
      const pr = this.renderer.getPixelRatio();
      this.bloom?.setSize(w * pr * 0.5, h * pr * 0.5);
      this.finish.uniforms.uRes.value.set(w * pr, h * pr);
    }
    this.fitCamera();
  }

  private static dirOf(az: number, el: number, out = new THREE.Vector3()) {
    return out.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
  }

  /** Smallest camera distance (along `dir`, looking at `target`) that keeps `pts` inside the free region. */
  private fitDistance(pts: THREE.Vector3[], target: THREE.Vector3, dir: THREE.Vector3, ins: { left: number; right: number; top: number; bottom: number }) {
    const { width: W, height: H } = this;
    const cam = this.camera;
    const pad = Math.min(30, Math.min(W - ins.left - ins.right, H - ins.top - ins.bottom) * 0.05);
    const v = new THREE.Vector3();
    const fits = (d: number) => {
      cam.position.copy(target).addScaledVector(dir, d);
      cam.lookAt(target);
      cam.updateMatrixWorld();
      for (const p of pts) {
        v.copy(p).project(cam);
        if (v.z > 1) return false;
        const px = ((v.x + 1) / 2) * W;
        const py = ((1 - v.y) / 2) * H;
        if (px < ins.left + pad || px > W - ins.right - pad || py < ins.top + pad || py > H - ins.bottom - pad) return false;
      }
      return true;
    };
    let lo = 8;
    let hi = 700;
    for (let i = 0; i < 30; i++) {
      const m = (lo + hi) / 2;
      if (fits(m)) hi = m;
      else lo = m;
    }
    return hi;
  }

  private fitCamera() {
    const { width: W, height: H, insets } = this;
    const cam = this.camera;
    const v = this.view;
    const freeW = Math.max(80, W - insets.left - insets.right);
    const freeH = Math.max(80, H - insets.top - insets.bottom);
    const portrait = insets.portrait || freeW / freeH < 0.95;
    cam.aspect = W / H;
    cam.fov = portrait ? 38 : 30;
    const dx = insets.left + freeW / 2 - W / 2;
    const dy = insets.top + freeH / 2 - H / 2;
    cam.setViewOffset(W, H, -dx, -dy, W, H);
    cam.updateProjectionMatrix();
    v.baseEl = (portrait ? 62 : 54) * DEG;
    v.baseAz = portrait ? Math.PI / 2 : 0;
    const ow = TRAY.innerW / 2 + TRAY.wall + 0.4;
    const od = TRAY.innerD / 2 + TRAY.wall + 0.4;
    const pts: THREE.Vector3[] = [];
    for (const x of [-ow, ow]) for (const z of [-od, od]) for (const y of [-1, TRAY.wallH]) pts.push(new THREE.Vector3(x, y, z));
    v.baseDist = this.fitDistance(pts, new THREE.Vector3(), DiceTable.dirOf(v.baseAz, v.baseEl), insets);
    if (!v.manual) {
      v.goalAz = v.baseAz;
      v.goalEl = v.baseEl;
      if (v.focused && this.state === 'settled') this.focusOnDice();
      else {
        v.goalDist = v.baseDist;
        v.goalTarget.set(0, 0, 0);
      }
    }
    if (!v.init) {
      v.init = true;
      v.az = v.goalAz;
      v.el = v.goalEl;
      v.dist = v.goalDist;
      v.target.copy(v.goalTarget);
    }
    this.placeCamera();
  }

  /** Lean in over the table so the settled dice can be admired. */
  private focusOnDice() {
    const v = this.view;
    if (!this.dice.length || v.manual) return;
    const pts: THREE.Vector3[] = [];
    const box = new THREE.Box3();
    for (const d of this.dice) {
      const p = d.group.position;
      const r = d.def.radius * 1.1;
      for (const x of [-r, r])
        for (const z of [-r, r])
          for (const y of [-r, r + 2.6]) {
            const q = new THREE.Vector3(p.x + x, Math.max(0, p.y + y), p.z + z);
            pts.push(q);
            box.expandByPoint(q);
          }
    }
    const target = box.getCenter(new THREE.Vector3()).setY(0);
    const ins = { ...this.insets, top: this.insets.focusTop, bottom: this.insets.focusBottom };
    const minD = v.baseDist * 0.56;
    let dist = this.fitDistance(pts, target, DiceTable.dirOf(v.baseAz, v.baseEl), ins);
    dist = THREE.MathUtils.clamp(dist, minD, v.baseDist);
    // the farther out we stay, the more we drift back toward the tray centre
    const t = (dist - minD) / (v.baseDist - minD);
    target.lerp(new THREE.Vector3(), THREE.MathUtils.clamp(t, 0, 1));
    v.goalTarget.copy(target);
    v.goalDist = dist;
    v.focused = true;
  }

  private unfocus() {
    const v = this.view;
    v.focused = false;
    v.goalDist = v.baseDist;
    v.goalTarget.set(0, 0, 0);
  }

  /** Back to the overview for a new throw, returning any user-driven view to automatic. */
  private homeCamera() {
    if (this.view.manual) this.resetView();
    this.unfocus();
  }

  private takeControl() {
    const v = this.view;
    if (v.manual) return;
    v.manual = true;
    v.focused = false;
    this.events.onViewChange?.(true);
  }

  private clampTarget(t: THREE.Vector3) {
    t.x = THREE.MathUtils.clamp(t.x, -TRAY.innerW / 2 - 6, TRAY.innerW / 2 + 6);
    t.z = THREE.MathUtils.clamp(t.z, -TRAY.innerD / 2 - 6, TRAY.innerD / 2 + 6);
    t.y = 0;
  }

  private orbitBy(dx: number, dy: number) {
    this.takeControl();
    const v = this.view;
    v.goalAz -= dx * 0.0065;
    v.goalEl = THREE.MathUtils.clamp(v.goalEl + dy * 0.005, 14 * DEG, 88 * DEG);
  }

  private panBy(dx: number, dy: number) {
    this.takeControl();
    const v = this.view;
    const k = (2 * v.goalDist * Math.tan((this.camera.fov * DEG) / 2)) / this.height;
    const right = this.tmpV.set(Math.cos(v.goalAz), 0, -Math.sin(v.goalAz));
    const away = this.tmpV2.set(-Math.sin(v.goalAz), 0, -Math.cos(v.goalAz));
    v.goalTarget.addScaledVector(right, -dx * k).addScaledVector(away, (dy * k) / Math.max(0.35, Math.sin(v.goalEl)));
    this.clampTarget(v.goalTarget);
  }

  /** Zoom by `factor` (<1 = closer), keeping the point under the cursor roughly still. */
  private zoomAt(factor: number, cx: number, cy: number) {
    this.takeControl();
    const v = this.view;
    const nd = THREE.MathUtils.clamp(v.goalDist * factor, v.baseDist * 0.28, v.baseDist * 1.7);
    const ratio = nd / v.goalDist;
    const r = this.renderer.domElement.getBoundingClientRect();
    this.ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const hit = this.raycaster.ray.intersectPlane(this.ground, this.tmpV);
    if (hit) {
      v.goalTarget.sub(hit).multiplyScalar(ratio).add(hit);
      this.clampTarget(v.goalTarget);
    }
    v.goalDist = nd;
  }

  private placeCamera() {
    const cam = this.camera;
    const v = this.view;
    const dir = DiceTable.dirOf(v.az, v.el, this.tmpV);
    cam.position.copy(v.target).addScaledVector(dir, v.dist);
    if (!v.manual) {
      // a breath of parallax with the mouse, only while the camera is on autopilot
      const s = v.dist * 0.012;
      const right = this.tmpV2.set(Math.cos(v.az), 0, -Math.sin(v.az));
      cam.position.addScaledVector(right, this.parallaxS.x * s);
      cam.position.y += (-this.parallaxS.y * 0.6 + Math.sin(this.time * 0.35) * 0.08) * s;
    }
    cam.lookAt(v.target);
    cam.updateMatrixWorld();
  }

  private updateCamera(dt: number) {
    this.parallaxS.lerp(this.parallax, 1 - Math.exp(-dt * 2.5));
    const v = this.view;
    const rate = v.manual ? 12 : v.focused ? 1.9 : 3.2;
    const k = 1 - Math.exp(-dt * rate);
    v.az += (v.goalAz - v.az) * k;
    v.el += (v.goalEl - v.el) * k;
    v.dist += (v.goalDist - v.dist) * k;
    v.target.lerp(v.goalTarget, k);
    v.moving =
      Math.abs(v.goalAz - v.az) > 1e-3 ||
      Math.abs(v.goalEl - v.el) > 1e-3 ||
      Math.abs(v.goalDist - v.dist) > v.dist * 1e-3 ||
      v.target.distanceToSquared(v.goalTarget) > 1e-4;
    this.placeCamera();
  }

  private updateTags() {
    if (!this.dice.length) return;
    const W = this.width;
    const H = this.height;
    for (const d of this.dice) {
      if (!d.tag) continue;
      const p = this.tmpV.copy(d.group.position);
      p.y += d.def.radius + 1.1;
      p.project(this.camera);
      const x = ((p.x + 1) / 2) * W;
      const y = ((1 - p.y) / 2) * H;
      d.tag.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
    }
  }

  /* ───────────────────────── loop ───────────────────────── */

  private frame = (now: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    const raw = now - this.last;
    const dt = Math.min(raw / 1000, 1 / 20);
    this.last = now;
    this.time += dt;
    this.frameNo++;

    const diceMoving = this.state === 'rolling' || this.state === 'holding' || this.fading.length > 0;
    const active = diceMoving || this.drag !== null || this.pinch !== null || this.view.moving;
    // idle: render at half rate to stay cool (a third behind an open dialog)
    if (!active && this.frameNo % (this.dimmed ? 3 : 2) !== 0 && dt < 1 / 40) return;

    if (this.state === 'rolling') {
      // Slow motion is for the tumbling. Once every die is down to a crawl (a few cm/s),
      // ease playback up past real time so the dull tail of the roll does not drag.
      const base = this.settings.timeScale;
      const calm = THREE.MathUtils.clamp((10 - this.maxSpeed) / 7, 0, 1);
      const target = base + (Math.max(1, base) * 1.6 - base) * calm;
      this.playScale += (target - this.playScale) * (1 - Math.exp(-dt * 6));
      this.acc += dt * this.playScale;
      let steps = 0;
      while (this.acc >= STEP && steps < MAX_STEPS) {
        this.physicsStep();
        this.acc -= STEP;
        steps++;
        if (this.state !== 'rolling') break;
      }
      // never try to catch up a backlog: better a moment of slow motion than a stalled tab
      if (steps >= MAX_STEPS) this.acc = 0;
      // Once nothing visibly moves, what remains is only confirming the rest (and spotting cocked
      // dice). Don't make the player wait for that in slow motion: fast-forward it, within a
      // small CPU budget. Any die that starts moving again drops us straight back to normal speed.
      if (this.quiet && this.state === 'rolling') {
        const t0 = performance.now();
        let n = 0;
        while (this.quiet && this.state === 'rolling' && n < 240 && performance.now() - t0 < 9) {
          this.physicsStep();
          n++;
        }
        this.acc = 0;
      }
    }
    const alpha = this.state === 'rolling' ? this.acc / STEP : 1;
    for (const d of this.dice) {
      const b = d.body;
      if (!b) continue;
      d.group.position.set(b.position.x, b.position.y, b.position.z);
      d.group.position.lerpVectors(d.prevPos, d.group.position, alpha);
      this.tmpQ.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
      d.group.quaternion.slerpQuaternions(d.prevQuat, this.tmpQ, alpha);
      d.mats.uniforms.uTime.value += dt;
    }
    if (this.state === 'holding') this.updateHand(dt);
    const ringMat = this.scenery.handRing.material as THREE.MeshBasicMaterial;
    ringMat.opacity += ((this.state === 'holding' ? 0.32 : 0) - ringMat.opacity) * (1 - Math.exp(-dt * 10));
    this.scenery.handRing.visible = ringMat.opacity > 0.01;

    for (let i = this.fading.length - 1; i >= 0; i--) {
      const f = this.fading[i];
      f.t += dt * 4;
      const s = Math.max(0, 1 - f.t);
      f.group.scale.setScalar(s * s * (3 - 2 * s) + 0.0001);
      if (f.t >= 1) {
        this.scene.remove(f.group);
        f.mats.body.dispose();
        f.tag?.remove();
        this.fading.splice(i, 1);
      }
    }

    this.scenery.update(this.time, dt);
    this.updateCamera(dt);
    this.updateTags();
    if (diceMoving || this.shadowDirty) {
      this.renderer.shadowMap.needsUpdate = true;
      this.shadowDirty = false;
    }
    this.finish.uniforms.uTime.value = this.time;
    this.composer.render(dt);
    if (active && !this.dimmed) this.governResolution(raw, performance.now() - now);
  };

  /**
   * Dynamic resolution. If frames run long while the CPU is mostly idle, the GPU is the
   * bottleneck (usually fill rate on high-DPI screens), so render fewer pixels.
   */
  private governResolution(frameMs: number, cpuMs: number) {
    const p = this.perf;
    if (frameMs > 250) return; // a tab switch or a stall, not a trend
    p.t += frameMs;
    p.cpu += cpuMs;
    p.n++;
    if (p.n < 40) return;
    const avg = p.t / p.n;
    const cpu = p.cpu / p.n;
    p.t = p.cpu = p.n = 0;
    const now = performance.now();
    if (avg > 24 && cpu < avg * 0.6 && this.resScale > 0.55 && now - p.lastAdjust > 1500) {
      p.lastAdjust = now;
      this.resScale = Math.max(0.55, this.resScale - 0.15);
      if (import.meta.env.DEV) console.log(`[perf] ${avg.toFixed(1)}ms/frame, lowering resolution to ×${this.resScale.toFixed(2)}`);
      this.applyPixelRatio();
    }
  }

  private bindPointer() {
    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', this.onPointerDown);
    el.addEventListener('wheel', this.onWheel, { passive: false });
    el.addEventListener('contextmenu', this.onContextMenu);
    el.addEventListener('auxclick', this.onContextMenu);
    window.addEventListener('pointermove', this.onPointerMove, { passive: true });
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);
  }

  private unbindPointer() {
    const el = this.renderer.domElement;
    el.removeEventListener('pointerdown', this.onPointerDown);
    el.removeEventListener('wheel', this.onWheel);
    el.removeEventListener('contextmenu', this.onContextMenu);
    el.removeEventListener('auxclick', this.onContextMenu);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerUp);
  }
}
