import * as THREE from 'three';
import {
  blotterTexture,
  bookCoverTexture,
  bookSpineTexture,
  deskTexture,
  feltTexture,
  glowTexture,
  leatherTexture,
  pageEdgeTexture,
  parchmentTexture,
  sigilTexture,
  walnutTexture,
  waxTexture,
} from './textures';

/** Scene units are centimetres. The felt surface of the tray is y = 0. */
export const TRAY = {
  innerW: 31,
  innerD: 21,
  wall: 2.6,
  wallH: 3.4,
  base: 1.0,
  innerRadius: 1.6,
  outerRadius: 3.0,
};

export const FELT_COLORS: Record<string, { name: string; nameEn: string; color: string; sheen: string }> = {
  oxblood: { name: '红', nameEn: 'Red', color: '#6a1a22', sheen: '#c0505a' },
  forest: { name: '绿', nameEn: 'Green', color: '#1b3a2b', sheen: '#4f8a68' },
  midnight: { name: '蓝', nameEn: 'Blue', color: '#17213f', sheen: '#4a64a8' },
  ebony: { name: '黑', nameEn: 'Black', color: '#1d1916', sheen: '#6a5a4c' },
  violet: { name: '紫', nameEn: 'Purple', color: '#35193f', sheen: '#7a4a90' },
};

function roundedRect(w: number, h: number, r: number, path: THREE.Path | THREE.Shape) {
  const x = -w / 2;
  const y = -h / 2;
  path.moveTo(x + r, y);
  path.lineTo(x + w - r, y);
  path.quadraticCurveTo(x + w, y, x + w, y + r);
  path.lineTo(x + w, y + h - r);
  path.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  path.lineTo(x + r, y + h);
  path.quadraticCurveTo(x, y + h, x, y + h - r);
  path.lineTo(x, y + r);
  path.quadraticCurveTo(x, y, x + r, y);
  return path;
}

function ringShape(ow: number, oh: number, or: number, iw: number, ih: number, ir: number) {
  const s = roundedRect(ow, oh, or, new THREE.Shape()) as THREE.Shape;
  const hole = roundedRect(iw, ih, ir, new THREE.Path());
  s.holes.push(hole);
  return s;
}

export interface Candle {
  light: THREE.PointLight;
  flames: { mesh: THREE.Mesh; glow: THREE.Sprite; base: THREE.Vector3; phase: number }[];
  baseIntensity: number;
}

export interface Scenery {
  root: THREE.Group;
  felt: THREE.MeshPhysicalMaterial;
  candles: Candle[];
  flameMaterial: THREE.ShaderMaterial;
  dust: THREE.Points;
  lamp: THREE.SpotLight;
  handRing: THREE.Mesh;
  setFelt(id: string): void;
  update(t: number, dt: number): void;
}

const FLAME_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FLAME_FRAG = /* glsl */ `
varying vec2 vUv;
uniform float uTime;
uniform float uPhase;
float hash(float n) { return fract(sin(n) * 43758.5453); }
float noise(float x) { float i = floor(x); float f = fract(x); return mix(hash(i), hash(i + 1.0), f * f * (3.0 - 2.0 * f)); }
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float t = uTime * 1.0 + uPhase;
  float sway = (noise(t * 2.3) - 0.5) * 0.28 * (p.y + 1.0) * 0.5;
  p.x -= sway;
  // teardrop: wide at bottom, pointed at top
  float y = (p.y + 1.0) * 0.5;
  float width = mix(0.55, 0.02, pow(y, 0.9)) * (0.85 + 0.15 * noise(t * 7.0));
  float d = abs(p.x) / max(width, 0.001);
  float shape = smoothstep(1.0, 0.35, d) * smoothstep(0.0, 0.12, y) * smoothstep(1.0, 0.75, y);
  vec3 core = vec3(1.0, 0.95, 0.82);
  vec3 mid = vec3(1.0, 0.62, 0.18);
  vec3 edge = vec3(0.85, 0.22, 0.04);
  vec3 col = mix(edge, mid, smoothstep(0.9, 0.35, d));
  col = mix(col, core, smoothstep(0.55, 0.0, d) * smoothstep(0.85, 0.25, y));
  // blue root
  col = mix(col, vec3(0.25, 0.35, 1.0), smoothstep(0.25, 0.0, y) * 0.7);
  float a = shape;
  gl_FragColor = vec4(col * 3.2 * a, a);
}`;

export function buildScenery(): Scenery {
  const root = new THREE.Group();
  const T = TRAY;

  /* desk */
  const deskTex = deskTexture();
  deskTex.repeat.set(3, 3);
  const desk = new THREE.Mesh(
    new THREE.PlaneGeometry(420, 420),
    new THREE.MeshStandardMaterial({ map: deskTex, roughness: 0.62, metalness: 0, color: '#9a8a7a' }),
  );
  desk.rotation.x = -Math.PI / 2;
  desk.position.y = -T.base - 0.35;
  desk.receiveShadow = true;
  root.add(desk);

  /* leather blotter */
  const bw = T.innerW + 2 * T.wall + 16;
  const bd = T.innerD + 2 * T.wall + 12;
  const blotter = new THREE.Mesh(
    new THREE.BoxGeometry(bw, 0.3, bd),
    [
      new THREE.MeshStandardMaterial({ color: '#0e1a13', roughness: 0.7 }),
      new THREE.MeshStandardMaterial({ color: '#0e1a13', roughness: 0.7 }),
      new THREE.MeshPhysicalMaterial({
        map: blotterTexture(bw / bd),
        roughness: 0.7,
        sheen: 0.4,
        sheenColor: new THREE.Color('#5a7a64'),
      }),
      new THREE.MeshStandardMaterial({ color: '#0e1a13' }),
      new THREE.MeshStandardMaterial({ color: '#0e1a13', roughness: 0.7 }),
      new THREE.MeshStandardMaterial({ color: '#0e1a13', roughness: 0.7 }),
    ],
  );
  blotter.position.y = -T.base - 0.2;
  blotter.receiveShadow = true;
  root.add(blotter);

  /* tray frame */
  const walnut = walnutTexture();
  walnut.repeat.set(1 / 22, 1 / 22);
  const frameMat = new THREE.MeshPhysicalMaterial({
    map: walnut,
    color: '#c8b0a0',
    roughness: 0.62,
    clearcoat: 0.15,
    clearcoatRoughness: 0.6,
  });
  const ow = T.innerW + 2 * T.wall;
  const od = T.innerD + 2 * T.wall;
  const bevel = 0.3;
  const frameGeo = new THREE.ExtrudeGeometry(
    ringShape(ow - 2 * bevel, od - 2 * bevel, T.outerRadius, T.innerW + 2 * bevel, T.innerD + 2 * bevel, T.innerRadius),
    { depth: T.wallH + T.base - 2 * bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 4, curveSegments: 24 },
  );
  frameGeo.rotateX(-Math.PI / 2);
  frameGeo.translate(0, -T.base + bevel, 0);
  const frame = new THREE.Mesh(frameGeo, frameMat);
  frame.castShadow = true;
  frame.receiveShadow = true;
  root.add(frame);

  /* brass inlay band on the rim */
  const brass = new THREE.MeshStandardMaterial({ color: '#c49a4e', metalness: 1, roughness: 0.64 });
  const mid = T.wall / 2;
  const band = new THREE.Mesh(
    new THREE.ExtrudeGeometry(
      ringShape(T.innerW + 2 * (mid + 0.16), T.innerD + 2 * (mid + 0.16), T.innerRadius + mid, T.innerW + 2 * (mid - 0.16), T.innerD + 2 * (mid - 0.16), T.innerRadius + mid - 0.3),
      { depth: 0.06, bevelEnabled: false, curveSegments: 24 },
    ).rotateX(-Math.PI / 2),
    brass,
  );
  band.position.y = T.wallH + 0.005;
  band.receiveShadow = true;
  root.add(band);

  /* brass corner brackets with rivets */
  const cornerShape = new THREE.Shape();
  const L = 6.2;
  const wdt = 1.9;
  cornerShape.moveTo(0, 0);
  cornerShape.lineTo(L, 0);
  cornerShape.quadraticCurveTo(L + 0.8, wdt / 2, L, wdt);
  cornerShape.lineTo(wdt + 0.4, wdt);
  cornerShape.quadraticCurveTo(wdt, wdt, wdt, wdt + 0.4);
  cornerShape.lineTo(wdt, L);
  cornerShape.quadraticCurveTo(wdt / 2, L + 0.8, 0, L);
  cornerShape.lineTo(0, 0);
  const cornerGeo = new THREE.ExtrudeGeometry(cornerShape, {
    depth: 0.12,
    bevelEnabled: true,
    bevelThickness: 0.06,
    bevelSize: 0.06,
    bevelSegments: 2,
  }).rotateX(Math.PI / 2);
  const rivetGeo = new THREE.SphereGeometry(0.22, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  for (const [sx, sz] of [
    [1, 1],
    [-1, 1],
    [1, -1],
    [-1, -1],
  ]) {
    const g = new THREE.Group();
    const c = new THREE.Mesh(cornerGeo, brass);
    c.castShadow = true;
    c.receiveShadow = true;
    g.add(c);
    for (const [rx, rz] of [
      [0.95, 0.95],
      [L - 0.9, 0.95],
      [0.95, L - 0.9],
    ]) {
      const rv = new THREE.Mesh(rivetGeo, brass);
      rv.position.set(rx, 0.03, rz);
      g.add(rv);
    }
    g.position.set((sx * ow) / 2 - sx * 0.25, T.wallH + 0.08, (sz * od) / 2 - sz * 0.25);
    g.rotation.y = sx > 0 ? (sz > 0 ? Math.PI : -Math.PI / 2) : sz > 0 ? Math.PI / 2 : 0;
    root.add(g);
  }

  /* felt */
  const felt = feltTexture();
  felt.map.repeat.set(3, 2);
  felt.bump.repeat.set(3, 2);
  const feltShape = roundedRect(T.innerW + 0.6, T.innerD + 0.6, T.innerRadius, new THREE.Shape()) as THREE.Shape;
  const feltGeo = new THREE.ShapeGeometry(feltShape, 24);
  feltGeo.rotateX(-Math.PI / 2);
  {
    const pos = feltGeo.attributes.position;
    const uv = feltGeo.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / T.innerW + 0.5, -pos.getZ(i) / T.innerD + 0.5);
  }
  const feltMat = new THREE.MeshPhysicalMaterial({
    map: felt.map,
    bumpMap: felt.bump,
    bumpScale: 0.6,
    color: FELT_COLORS.oxblood.color,
    roughness: 0.95,
    sheen: 0.55,
    sheenRoughness: 0.55,
    sheenColor: new THREE.Color(FELT_COLORS.oxblood.sheen),
  });
  const feltMesh = new THREE.Mesh(feltGeo, feltMat);
  feltMesh.receiveShadow = true;
  root.add(feltMesh);

  /* gold-foil sigil printed on the felt */
  const sigilMat = new THREE.MeshStandardMaterial({
    color: '#c9a35a',
    metalness: 0.75,
    roughness: 0.42,
    alphaMap: sigilTexture(),
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const sigil = new THREE.Mesh(new THREE.PlaneGeometry(T.innerD * 0.92, T.innerD * 0.92), sigilMat);
  sigil.rotation.x = -Math.PI / 2;
  sigil.position.y = 0.01;
  sigil.receiveShadow = true;
  root.add(sigil);

  /* hand indicator ring */
  const handRing = new THREE.Mesh(
    new THREE.RingGeometry(2.85, 3.0, 96),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color('#ffcf7a').multiplyScalar(1.4),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  handRing.rotation.x = -Math.PI / 2;
  handRing.position.y = 0.05;
  root.add(handRing);

  /* candles */
  const flameMaterial = new THREE.ShaderMaterial({
    vertexShader: FLAME_VERT,
    fragmentShader: FLAME_FRAG,
    uniforms: { uTime: { value: 0 }, uPhase: { value: 0 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const glowTex = glowTexture('rgba(255,240,210,1)', 'rgba(255,150,60,0.28)');
  const waxEmissive = waxTexture();
  const waxMat = new THREE.MeshStandardMaterial({
    color: '#efe2c4',
    roughness: 0.55,
    emissive: '#ffae60',
    emissiveMap: waxEmissive,
    emissiveIntensity: 1.0,
  });
  const brassDark = new THREE.MeshStandardMaterial({ color: '#a8823e', metalness: 1, roughness: 0.66 });

  const candles: Candle[] = [];
  const addCandleCluster = (x: number, z: number, power: number, specs: [number, number, number, number][]) => {
    const g = new THREE.Group();
    g.position.set(x, -T.base - 0.05, z);
    // dish
    const dishPts: THREE.Vector2[] = [];
    dishPts.push(new THREE.Vector2(0, 0));
    dishPts.push(new THREE.Vector2(6.6, 0));
    dishPts.push(new THREE.Vector2(7.0, 0.35));
    dishPts.push(new THREE.Vector2(7.1, 0.9));
    dishPts.push(new THREE.Vector2(6.8, 0.95));
    dishPts.push(new THREE.Vector2(6.4, 0.5));
    dishPts.push(new THREE.Vector2(0, 0.45));
    const dish = new THREE.Mesh(new THREE.LatheGeometry(dishPts, 48), brassDark);
    dish.castShadow = true;
    dish.receiveShadow = true;
    g.add(dish);
    const flames: Candle['flames'] = [];
    for (const [cx, cz, h, r] of specs) {
      const holder = new THREE.Mesh(
        new THREE.LatheGeometry(
          [
            new THREE.Vector2(0, 0),
            new THREE.Vector2(r + 0.6, 0),
            new THREE.Vector2(r + 0.5, 0.4),
            new THREE.Vector2(r + 0.15, 0.6),
            new THREE.Vector2(r + 0.35, 1.0),
            new THREE.Vector2(r + 0.1, 1.1),
            new THREE.Vector2(0, 1.1),
          ],
          32,
        ),
        brassDark,
      );
      holder.position.set(cx, 0.45, cz);
      holder.castShadow = true;
      g.add(holder);
      const wax = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.96, r, h, 28, 1, false), waxMat);
      wax.position.set(cx, 1.5 + h / 2, cz);
      wax.castShadow = true;
      wax.receiveShadow = true;
      // flip UV so emissive glow sits at the top
      const uv = wax.geometry.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
      g.add(wax);
      // drip ring
      const lip = new THREE.Mesh(new THREE.TorusGeometry(r * 0.88, 0.12, 8, 28), waxMat);
      lip.rotation.x = Math.PI / 2;
      lip.position.set(cx, 1.5 + h - 0.05, cz);
      g.add(lip);
      const wick = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.05, 0.5, 6),
        new THREE.MeshBasicMaterial({ color: '#120a05' }),
      );
      wick.position.set(cx, 1.5 + h + 0.2, cz);
      g.add(wick);
      const fm = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 2.6), flameMaterial.clone());
      const base = new THREE.Vector3(cx, 1.5 + h + 1.25, cz);
      fm.position.copy(base);
      fm.renderOrder = 10;
      g.add(fm);
      const glow = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: glowTex,
          color: new THREE.Color('#ffb060').multiplyScalar(1.4),
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          opacity: 0.7,
        }),
      );
      glow.scale.set(6, 6, 1);
      glow.position.copy(base).add(new THREE.Vector3(0, -0.3, 0));
      glow.renderOrder = 9;
      g.add(glow);
      flames.push({ mesh: fm, glow, base, phase: Math.random() * 100 });
    }
    const top = Math.max(...specs.map((s) => s[2]));
    const light = new THREE.PointLight('#ff9a48', 0, 0, 2);
    light.position.set(0, 1.5 + top + 1.6, 0);
    g.add(light);
    root.add(g);
    candles.push({ light, flames, baseIntensity: power });
  };
  addCandleCluster(-25, -24, 1100, [
    [-2.2, 1.2, 13, 1.15],
    [2.4, 0.4, 9, 1.05],
    [0.2, -2.6, 6.5, 1.25],
  ]);
  addCandleCluster(29, 9, 420, [[0, 0, 7, 1.2]]);

  /* books */
  const books: [number, number, number, number, [number, number, number], string][] = [
    // w, h(thickness), d, rot, color, title
    [17, 3.6, 24, 0.0, [70, 22, 18], 'ARS CONIECTANDI'],
    [15.5, 3.0, 21.5, 0.12, [24, 44, 34], 'DE LUDO ALEAE'],
    [13.5, 2.4, 19, -0.08, [52, 32, 18], 'NECRONOMICON'],
  ];
  const bookGroup = new THREE.Group();
  bookGroup.position.set(24, -T.base - 0.35, -23);
  bookGroup.rotation.y = -0.45;
  let by = 0;
  const pages = pageEdgeTexture();
  books.forEach(([w, h, d, rot, col, title]) => {
    const coverTex = bookCoverTexture(col);
    const spineTex = bookSpineTexture(col, title);
    const leather = leatherTexture(col, 256);
    const coverMat = new THREE.MeshStandardMaterial({ map: coverTex, roughness: 0.7 });
    const spineMat = new THREE.MeshStandardMaterial({ map: spineTex, roughness: 0.68 });
    const plainMat = new THREE.MeshStandardMaterial({ map: leather, roughness: 0.65 });
    const b = new THREE.Group();
    const cover = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [spineMat, plainMat, coverMat, coverMat, plainMat, plainMat]);
    cover.castShadow = true;
    cover.receiveShadow = true;
    b.add(cover);
    const pageMat = new THREE.MeshStandardMaterial({ map: pages, roughness: 0.85 });
    const pageBlock = new THREE.Mesh(new THREE.BoxGeometry(w - 0.6, h - 0.5, d - 0.6), [
      new THREE.MeshStandardMaterial({ color: '#cdbb92' }),
      pageMat,
      pageMat,
      pageMat,
      pageMat,
      pageMat,
    ]);
    pageBlock.position.x = 0.35;
    b.add(pageBlock);
    // the pages are inset; the cover is open at the fore-edge
    cover.scale.set(1, 1, 1);
    b.position.y = by + h / 2;
    b.rotation.y = rot;
    by += h;
    bookGroup.add(b);
  });
  root.add(bookGroup);

  /* parchment */
  const parch = new THREE.Mesh(
    new THREE.PlaneGeometry(21, 28, 24, 24),
    new THREE.MeshStandardMaterial({ map: parchmentTexture(), roughness: 0.9, side: THREE.DoubleSide }),
  );
  {
    const pos = parch.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      pos.setZ(i, Math.sin(y * 0.25) * 0.15 + Math.pow(Math.abs(x) / 10.5, 4) * 0.5);
    }
    parch.geometry.computeVertexNormals();
  }
  parch.rotation.x = -Math.PI / 2;
  parch.rotation.z = 0.32;
  parch.position.set(-30, -T.base - 0.05, 6);
  parch.receiveShadow = true;
  root.add(parch);

  /* inkwell + quill */
  const inkwell = new THREE.Group();
  const glass = new THREE.Mesh(
    new THREE.LatheGeometry(
      [
        new THREE.Vector2(0, 0),
        new THREE.Vector2(2.6, 0),
        new THREE.Vector2(2.8, 0.4),
        new THREE.Vector2(2.7, 2.6),
        new THREE.Vector2(1.6, 3.4),
        new THREE.Vector2(1.0, 3.6),
        new THREE.Vector2(1.05, 4.2),
        new THREE.Vector2(0.8, 4.2),
        new THREE.Vector2(0.8, 3.7),
        new THREE.Vector2(0, 3.7),
      ],
      40,
    ),
    new THREE.MeshPhysicalMaterial({ color: '#1b1520', roughness: 0.4, metalness: 0, transmission: 0.2, thickness: 1 }),
  );
  glass.castShadow = true;
  inkwell.add(glass);
  const collar = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.18, 10, 32), brassDark);
  collar.rotation.x = Math.PI / 2;
  collar.position.y = 4.15;
  inkwell.add(collar);
  // quill: a curved vane and a shaft
  const quill = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.12, 22, 8), new THREE.MeshStandardMaterial({ color: '#e8dcc0', roughness: 0.5 }));
  shaft.position.y = 11;
  quill.add(shaft);
  const vaneShape = new THREE.Shape();
  vaneShape.moveTo(0, 4);
  vaneShape.bezierCurveTo(1.8, 8, 1.6, 16, 0.2, 21.5);
  vaneShape.bezierCurveTo(-1.3, 16, -1.6, 9, 0, 4);
  const vane = new THREE.Mesh(
    new THREE.ShapeGeometry(vaneShape, 24),
    new THREE.MeshStandardMaterial({ color: '#2a2622', roughness: 0.6, side: THREE.DoubleSide }),
  );
  quill.add(vane);
  quill.position.set(0.3, 3.4, 0);
  quill.rotation.z = -0.42;
  quill.rotation.x = 0.15;
  inkwell.add(quill);
  inkwell.position.set(-27, -T.base - 0.05, -13);
  root.add(inkwell);

  /* dust motes drifting in the lamp light */
  const N = 420;
  const dPos = new Float32Array(N * 3);
  const dSeed = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    dPos[i * 3] = (Math.random() - 0.5) * 70;
    dPos[i * 3 + 1] = Math.random() * 40 + 2;
    dPos[i * 3 + 2] = (Math.random() - 0.5) * 50;
    dSeed[i] = Math.random() * 100;
  }
  const dGeo = new THREE.BufferGeometry();
  dGeo.setAttribute('position', new THREE.BufferAttribute(dPos, 3));
  dGeo.setAttribute('aSeed', new THREE.BufferAttribute(dSeed, 1));
  const dust = new THREE.Points(
    dGeo,
    new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uMap: { value: glowTexture() }, uPx: { value: 1 } },
      vertexShader: /* glsl */ `
        attribute float aSeed;
        uniform float uTime;
        uniform float uPx;
        varying float vA;
        void main() {
          vec3 p = position;
          float t = uTime * 0.05 + aSeed;
          p.x += sin(t * 1.3 + aSeed) * 3.0;
          p.y += mod(t * 4.0 + aSeed * 3.0, 40.0) - 20.0 + 20.0;
          p.y = mod(p.y, 42.0) + 1.0;
          p.z += cos(t * 1.1 + aSeed * 2.0) * 3.0;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = uPx * (1.5 + fract(aSeed * 7.13) * 2.5) * (80.0 / -mv.z);
          vA = (0.25 + 0.75 * fract(aSeed * 3.7)) * smoothstep(0.0, 6.0, p.y) * smoothstep(43.0, 36.0, p.y) * (0.6 + 0.4 * sin(uTime * 0.8 + aSeed * 11.0));
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap;
        varying float vA;
        void main() {
          vec4 c = texture2D(uMap, gl_PointCoord);
          gl_FragColor = vec4(vec3(1.0, 0.82, 0.55) * c.a * vA * 0.55, c.a * vA);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  dust.frustumCulled = false;
  root.add(dust);

  /* lights */
  const lamp = new THREE.SpotLight('#ffd8ae', 3800, 0, 0.6, 0.85, 1.6);
  lamp.position.set(-30, 82, 26);
  lamp.target.position.set(2, 0, -2);
  lamp.castShadow = true;
  lamp.shadow.mapSize.set(2048, 2048);
  lamp.shadow.camera.near = 40;
  lamp.shadow.camera.far = 160;
  lamp.shadow.bias = -0.0002;
  lamp.shadow.normalBias = 0.02;
  lamp.shadow.radius = 4;
  root.add(lamp, lamp.target);

  const moon = new THREE.DirectionalLight('#7f95c8', 0.35);
  moon.position.set(40, 60, -50);
  root.add(moon);

  const hemi = new THREE.HemisphereLight('#4a382a', '#0a0705', 0.45);
  root.add(hemi);

  const setFelt = (id: string) => {
    const f = FELT_COLORS[id] ?? FELT_COLORS.oxblood;
    feltMat.color.set(f.color);
    feltMat.sheenColor.set(f.sheen);
  };

  const update = (t: number) => {
    for (const c of candles) {
      let flick = 0;
      for (const f of c.flames) {
        const u = (f.mesh.material as THREE.ShaderMaterial).uniforms;
        u.uTime.value = t;
        u.uPhase.value = f.phase;
        const n = Math.sin(t * 9.1 + f.phase) * 0.5 + Math.sin(t * 23.7 + f.phase * 1.7) * 0.3 + Math.sin(t * 3.3 + f.phase * 0.3) * 0.6;
        flick += n;
        f.glow.material.opacity = 0.34 + n * 0.04;
        const s = 5.6 + n * 0.35;
        f.glow.scale.set(s, s, 1);
      }
      flick /= c.flames.length;
      c.light.intensity = c.baseIntensity * (1 + flick * 0.08);
    }
    (dust.material as THREE.ShaderMaterial).uniforms.uTime.value = t;
  };

  return { root, felt: feltMat, candles, flameMaterial, dust, lamp, handRing, setFelt, update };
}

/** Warm study-room environment for reflections. */
export function buildEnvironmentScene(): THREE.Scene {
  const s = new THREE.Scene();
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(100, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {},
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */ `
        varying vec3 vP;
        void main(){
          vec3 d = normalize(vP);
          vec3 low = vec3(0.025, 0.016, 0.01);
          vec3 high = vec3(0.09, 0.06, 0.04);
          vec3 c = mix(low, high, smoothstep(-0.2, 0.8, d.y));
          gl_FragColor = vec4(c, 1.0);
        }`,
    }),
  );
  s.add(sphere);
  const panel = (color: string, intensity: number, w: number, h: number, pos: [number, number, number]) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide }),
    );
    m.position.set(...pos);
    m.lookAt(0, 0, 0);
    s.add(m);
  };
  panel('#ffd2a0', 9, 30, 30, [-40, 70, 30]); // lamp
  panel('#ff9a50', 6, 12, 12, [-30, 15, -40]); // candles
  panel('#ff9a50', 3, 8, 8, [45, 10, 15]);
  panel('#8aa0d8', 1.4, 26, 50, [70, 30, -40]); // moonlit window
  panel('#c08a5a', 0.8, 120, 12, [0, -5, 80]);
  return s;
}
