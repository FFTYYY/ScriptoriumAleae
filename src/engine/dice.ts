import * as THREE from 'three';

/**
 * Polyhedral dice. Every die is built from its exact vertex set: the convex hull gives
 * the faces, the hull gives the collision shape, and a Minkowski-rounded copy of the
 * same hull gives the visible mesh (so the resting face planes of the picture and of
 * the physics coincide). Mass properties are integrated exactly for uniform density,
 * so the centre of mass is the geometric centre — no loaded dice.
 */

export type DieKind = 'd4' | 'd6' | 'd8' | 'd10' | 'd12' | 'd20' | 'd100';
export const DIE_KINDS: readonly DieKind[] = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'];

export interface DieFace {
  verts: number[];
  normal: THREE.Vector3;
  label: string;
  value: number;
}

export interface DieDef {
  kind: DieKind;
  /** Sharp polyhedron vertices (collision hull), centred on the centre of mass. */
  vertices: THREE.Vector3[];
  faces: DieFace[];
  /** d4 only: value printed at each vertex. */
  vertexValues?: number[];
  radius: number;
  volume: number;
  /** Principal moments of inertia per unit mass (uniform density). */
  inertia: THREE.Vector3;
  body: THREE.BufferGeometry;
  inlay: THREE.BufferGeometry;
  atlas: HTMLCanvasElement;
}

const PHI = (1 + Math.sqrt(5)) / 2;
const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Circumradius in centimetres (scene units are cm). */
const SIZE_SCALE = 1.45;
const SIZE: Record<DieKind, number> = {
  d4: 1.32 * SIZE_SCALE,
  d6: 1.36 * SIZE_SCALE,
  d8: 1.2 * SIZE_SCALE,
  d10: 1.13 * SIZE_SCALE,
  d12: 1.3 * SIZE_SCALE,
  d20: 1.34 * SIZE_SCALE,
  d100: 1.2 * SIZE_SCALE,
};

/** Edge/corner rounding radius as a fraction of circumradius. */
const ROUND: Record<DieKind, number> = {
  d4: 0.055,
  d6: 0.1,
  d8: 0.06,
  d10: 0.05,
  d12: 0.06,
  d20: 0.05,
  d100: 0.05,
};

function rawPoints(kind: DieKind): THREE.Vector3[] {
  switch (kind) {
    case 'd4':
      return [v3(1, 1, 1), v3(1, -1, -1), v3(-1, 1, -1), v3(-1, -1, 1)];
    case 'd6': {
      const p: THREE.Vector3[] = [];
      for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) p.push(v3(x, y, z));
      return p;
    }
    case 'd8':
      return [v3(1, 0, 0), v3(-1, 0, 0), v3(0, 1, 0), v3(0, -1, 0), v3(0, 0, 1), v3(0, 0, -1)];
    case 'd10':
    case 'd100': {
      // Pentagonal trapezohedron. Kite planarity requires h = z (1 + cos36°) / (1 − cos36°).
      const c = Math.cos(Math.PI / 5);
      const z = 0.105;
      const h = (z * (1 + c)) / (1 - c);
      const p = [v3(0, h, 0), v3(0, -h, 0)];
      for (let i = 0; i < 10; i++) {
        const a = (i * Math.PI) / 5;
        p.push(v3(Math.cos(a), i % 2 === 0 ? z : -z, Math.sin(a)));
      }
      return p;
    }
    case 'd12': {
      const p: THREE.Vector3[] = [];
      for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) p.push(v3(x, y, z));
      const a = 1 / PHI;
      for (const s of [-1, 1])
        for (const t of [-1, 1]) {
          p.push(v3(0, s * a, t * PHI));
          p.push(v3(s * a, t * PHI, 0));
          p.push(v3(s * PHI, 0, t * a));
        }
      return p;
    }
    case 'd20': {
      const p: THREE.Vector3[] = [];
      for (const s of [-1, 1])
        for (const t of [-1, 1]) {
          p.push(v3(0, s, t * PHI));
          p.push(v3(s, t * PHI, 0));
          p.push(v3(s * PHI, 0, t));
        }
      return p;
    }
  }
}

interface Hull {
  faces: number[][];
  normals: THREE.Vector3[];
}

/** Brute-force convex hull for a small point set; faces are CCW seen from outside. */
function convexHull(pts: THREE.Vector3[]): Hull {
  const n = pts.length;
  let scale = 0;
  for (const p of pts) scale = Math.max(scale, p.length());
  const eps = 1e-7 * scale;
  const faces: number[][] = [];
  const normals: THREE.Vector3[] = [];
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++)
      for (let k = j + 1; k < n; k++) {
        const nrm = ab.subVectors(pts[j], pts[i]).cross(ac.subVectors(pts[k], pts[i])).clone();
        const len = nrm.length();
        if (len < 1e-9) continue;
        nrm.divideScalar(len);
        let d = nrm.dot(pts[i]);
        let pos = 0;
        let neg = 0;
        for (let m = 0; m < n; m++) {
          const s = nrm.dot(pts[m]) - d;
          if (s > eps) pos++;
          else if (s < -eps) neg++;
        }
        if (pos && neg) continue;
        if (pos) {
          nrm.negate();
          d = -d;
        }
        if (normals.some((q) => q.dot(nrm) > 1 - 1e-7)) continue;
        const verts: number[] = [];
        for (let m = 0; m < n; m++) if (Math.abs(nrm.dot(pts[m]) - d) < eps * 50) verts.push(m);
        const c = new THREE.Vector3();
        for (const m of verts) c.add(pts[m]);
        c.divideScalar(verts.length);
        const u = pts[verts[0]].clone().sub(c).normalize();
        const w = nrm.clone().cross(u);
        const ang = (m: number) => {
          const r = pts[m].clone().sub(c);
          return Math.atan2(r.dot(w), r.dot(u));
        };
        verts.sort((a, b) => ang(a) - ang(b));
        faces.push(verts);
        normals.push(nrm);
      }
  return { faces, normals };
}

function assignValues(kind: DieKind, hull: Hull): { labels: string[]; values: number[] } {
  const nF = hull.faces.length;
  const labels: string[] = new Array(nF).fill('');
  const values: number[] = new Array(nF).fill(0);
  if (kind === 'd4') return { labels, values };

  if (kind === 'd10' || kind === 'd100') {
    const top = hull.normals.map((n, i) => ({ n, i })).filter((f) => f.n.y > 0);
    top.sort((a, b) => Math.atan2(a.n.z, a.n.x) - Math.atan2(b.n.z, b.n.x));
    const seq = [1, 7, 3, 9, 5];
    top.forEach((f, idx) => {
      const opp = hull.normals.findIndex((m) => m.dot(f.n) < -0.999);
      const a = seq[idx];
      const b = 9 - a;
      values[f.i] = a;
      values[opp] = b;
    });
    for (let i = 0; i < nF; i++) {
      if (kind === 'd100') {
        labels[i] = values[i] === 0 ? '00' : String(values[i] * 10);
        values[i] *= 10;
      } else {
        labels[i] = String(values[i]);
      }
    }
    return { labels, values };
  }

  // Opposite faces always sum to n + 1.
  const order = hull.normals
    .map((n, i) => ({ n, i }))
    .sort((a, b) => b.n.y - a.n.y || Math.atan2(a.n.z, a.n.x) - Math.atan2(b.n.z, b.n.x));
  const used = new Set<number>();
  let k = 0;
  for (const { n, i } of order) {
    if (used.has(i)) continue;
    const j = hull.normals.findIndex((m) => m.dot(n) < -0.999);
    used.add(i);
    used.add(j);
    const lo = k + 1;
    const hi = nF - k;
    values[i] = k % 2 === 0 ? lo : hi;
    values[j] = k % 2 === 0 ? hi : lo;
    k++;
  }
  for (let i = 0; i < nF; i++) labels[i] = String(values[i]);
  return { labels, values };
}

/** Exact volume and inertia tensor of a uniform-density convex polyhedron about the origin. */
function massProperties(verts: THREE.Vector3[], faces: number[][]): { volume: number; inertia: THREE.Vector3 } {
  let vol = 0;
  // Second moment C = ∫ x xᵀ dV
  const C = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (const f of faces) {
    const a = verts[f[0]];
    for (let t = 1; t < f.length - 1; t++) {
      const b = verts[f[t]];
      const c = verts[f[t + 1]];
      const det = a.dot(b.clone().cross(c));
      const V = det / 6;
      vol += V;
      const s = a.clone().add(b).add(c);
      const pts = [a, b, c, s];
      const comp = (p: THREE.Vector3, r: number) => (r === 0 ? p.x : r === 1 ? p.y : p.z);
      for (let r = 0; r < 3; r++)
        for (let q = 0; q < 3; q++) {
          let sum = 0;
          for (const p of pts) sum += comp(p, r) * comp(p, q);
          C[r * 3 + q] += (V / 20) * sum;
        }
    }
  }
  const tr = C[0] + C[4] + C[8];
  // I = tr(C)·E − C, per unit mass
  const inertia = new THREE.Vector3(tr - C[0], tr - C[4], tr - C[8]).divideScalar(vol);
  return { volume: vol, inertia };
}

/* ───────────────────────── atlas (numerals) ───────────────────────── */

const CELL = 256;
const NUMERAL_FONT = '"Cinzel", "Cormorant Garamond", "Times New Roman", serif';
let capRatio = 0;

function digitCapRatio(ctx: CanvasRenderingContext2D): number {
  if (capRatio) return capRatio;
  ctx.font = `700 100px ${NUMERAL_FONT}`;
  const m = ctx.measureText('8');
  capRatio = (m.actualBoundingBoxAscent + m.actualBoundingBoxDescent) / 100 || 0.7;
  return capRatio;
}

interface FaceFrame {
  center: THREE.Vector3;
  right: THREE.Vector3;
  up: THREE.Vector3;
  normal: THREE.Vector3;
  /** outer polygon in local 2D coords */
  poly: THREE.Vector2[];
  /** label anchor (local 2D) */
  anchor: THREE.Vector2;
  /** numeral cap height (local units) */
  height: number;
  maxWidth: number;
}

function polyInradius(poly: THREE.Vector2[], p: THREE.Vector2): number {
  let r = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const ab = b.clone().sub(a);
    const t = THREE.MathUtils.clamp(p.clone().sub(a).dot(ab) / ab.lengthSq(), 0, 1);
    r = Math.min(r, a.clone().addScaledVector(ab, t).distanceTo(p));
  }
  return r;
}

function drawNumeral(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  rot: number,
  capPx: number,
  maxW: number,
  underline: boolean,
) {
  const px = capPx / digitCapRatio(ctx);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.font = `700 ${px}px ${NUMERAL_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const m = ctx.measureText(text);
  const w = m.width;
  if (w > maxW) ctx.scale(maxW / w, 1);
  const yOff = (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2;
  ctx.lineJoin = 'round';
  ctx.lineWidth = px * 0.15;
  ctx.strokeStyle = 'rgb(26,26,26)';
  ctx.fillStyle = '#ffffff';
  ctx.strokeText(text, 0, yOff);
  ctx.fillText(text, 0, yOff);
  if (underline) {
    const bw = Math.min(w, maxW) * 0.7;
    const bh = capPx * 0.09;
    const by = yOff + capPx * 0.2;
    ctx.beginPath();
    ctx.rect(-bw / 2, by, bw, bh);
    ctx.stroke();
    ctx.fill();
  }
  ctx.restore();
}

/* ───────────────────────── mesh building ───────────────────────── */

interface Buf {
  pos: number[];
  nor: number[];
  uv: number[];
}

const _e1 = new THREE.Vector3();
const _e2 = new THREE.Vector3();
const _fn = new THREE.Vector3();

function pushTri(
  buf: Buf,
  a: THREE.Vector3,
  b: THREE.Vector3,
  c: THREE.Vector3,
  na: THREE.Vector3,
  nb: THREE.Vector3,
  nc: THREE.Vector3,
  ua: number[],
  ub: number[],
  uc: number[],
) {
  _e1.subVectors(b, a);
  _e2.subVectors(c, a);
  _fn.crossVectors(_e1, _e2);
  if (_fn.lengthSq() < 1e-16) return;
  if (_fn.x * (na.x + nb.x + nc.x) + _fn.y * (na.y + nb.y + nc.y) + _fn.z * (na.z + nb.z + nc.z) < 0) {
    [b, c] = [c, b];
    [nb, nc] = [nc, nb];
    [ub, uc] = [uc, ub];
  }
  buf.pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  buf.nor.push(na.x, na.y, na.z, nb.x, nb.y, nb.z, nc.x, nc.y, nc.z);
  buf.uv.push(ua[0], ua[1], ub[0], ub[1], uc[0], uc[1]);
}

function toGeometry(buf: Buf): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(buf.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(buf.nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(buf.uv, 2));
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

const nlerp = (a: THREE.Vector3, b: THREE.Vector3, t: number) => a.clone().lerp(b, t).normalize();

export function buildDie(kind: DieKind): DieDef {
  const raw = rawPoints(kind);
  const hull = convexHull(raw);
  let rmax = 0;
  for (const p of raw) rmax = Math.max(rmax, p.length());
  const radius = SIZE[kind];
  const verts = raw.map((p) => p.clone().multiplyScalar(radius / rmax));
  const { labels, values } = assignValues(kind, hull);
  const faces: DieFace[] = hull.faces.map((f, i) => ({
    verts: f,
    normal: hull.normals[i].clone(),
    label: labels[i],
    value: values[i],
  }));
  const vertexValues = kind === 'd4' ? verts.map((_, i) => i + 1) : undefined;

  const { volume, inertia } = massProperties(verts, hull.faces);

  // Minkowski rounding: shrink the hull by r along every face plane, then add a sphere of radius r.
  const r = ROUND[kind] * radius;
  const faceDist = hull.normals[0].dot(verts[hull.faces[0][0]]);
  const k = (faceDist - r) / faceDist;
  const core = verts.map((p) => p.clone().multiplyScalar(k));

  // Face frames for numeral layout.
  const frames: FaceFrame[] = faces.map((f) => {
    const n = f.normal;
    const pts = f.verts.map((i) => core[i].clone().addScaledVector(n, r));
    const center = new THREE.Vector3();
    pts.forEach((p) => center.add(p));
    center.divideScalar(pts.length);
    let target: THREE.Vector3;
    if (kind === 'd6') target = pts[0].clone().add(pts[1]).multiplyScalar(0.5);
    else if (kind === 'd10' || kind === 'd100') {
      let best = 0;
      f.verts.forEach((vi, j) => {
        if (Math.abs(verts[vi].y) > Math.abs(verts[f.verts[best]].y)) best = j;
      });
      target = pts[best];
    } else target = pts[0];
    const up = target.clone().sub(center);
    up.addScaledVector(n, -up.dot(n)).normalize();
    const right = up.clone().cross(n).normalize();
    const poly = pts.map((p) => {
      const d = p.clone().sub(center);
      return new THREE.Vector2(d.dot(right), d.dot(up));
    });
    return { center, right, up, normal: n, poly, anchor: new THREE.Vector2(), height: 0, maxWidth: 0 };
  });

  let rl = 0;
  frames.forEach((fr) => fr.poly.forEach((p) => (rl = Math.max(rl, p.length()))));
  const rpad = rl * 1.06;

  // Label anchors & sizes.
  frames.forEach((fr) => {
    const rho = polyInradius(fr.poly, new THREE.Vector2());
    switch (kind) {
      case 'd4':
        fr.height = rho * 0.62;
        fr.maxWidth = rho;
        break;
      case 'd6':
        fr.height = rho * 0.98;
        fr.maxWidth = rho * 1.5;
        break;
      case 'd8':
        fr.height = rho * 1.02;
        fr.maxWidth = rho * 1.5;
        break;
      case 'd12':
        fr.height = rho * 0.74;
        fr.maxWidth = rho * 1.5;
        break;
      case 'd20':
        fr.height = rho * 0.86;
        fr.maxWidth = rho * 1.62;
        break;
      case 'd10':
      case 'd100': {
        // kite: apex is the vertex with greatest local y; the two side vertices define the wide chord
        const ys = fr.poly.map((p) => p.y);
        const apexIdx = ys.indexOf(Math.max(...ys));
        const tipIdx = ys.indexOf(Math.min(...ys));
        const sides = fr.poly.filter((_, j) => j !== apexIdx && j !== tipIdx);
        const width = sides[0].distanceTo(sides[1]);
        const my = (sides[0].y + sides[1].y) / 2;
        const ay = fr.poly[apexIdx].y;
        fr.anchor.set(0, my + (ay - my) * 0.2);
        fr.height = width * (kind === 'd100' ? 0.3 : 0.36);
        fr.maxWidth = width * 0.78;
        break;
      }
    }
  });

  // Atlas layout.
  const nF = faces.length;
  const cols = Math.ceil(Math.sqrt(nF));
  const rows = Math.ceil(nF / cols);
  const W = cols * CELL;
  const H = rows * CELL;
  const cellUV = (fi: number, lx: number, ly: number): number[] => {
    const cx = fi % cols;
    const cy = Math.floor(fi / cols);
    const X = (cx + 0.5 + lx / (2 * rpad)) * CELL;
    const Y = (cy + 0.5 - ly / (2 * rpad)) * CELL;
    return [X / W, 1 - Y / H];
  };
  const EMPTY = cellUV(0, -rpad * 0.97, -rpad * 0.97);

  const atlas = document.createElement('canvas');
  atlas.width = W;
  atlas.height = H;
  const ctx = atlas.getContext('2d')!;
  ctx.clearRect(0, 0, W, H);
  const pxPerUnit = CELL / (2 * rpad);
  const hasAmbiguous = labels.includes('6') && labels.includes('9');
  frames.forEach((fr, fi) => {
    const cx = fi % cols;
    const cy = Math.floor(fi / cols);
    const toCanvas = (lx: number, ly: number) => [
      (cx + 0.5 + lx / (2 * rpad)) * CELL,
      (cy + 0.5 - ly / (2 * rpad)) * CELL,
    ];
    if (kind === 'd4') {
      faces[fi].verts.forEach((vi, j) => {
        const p = fr.poly[j];
        const [x, y] = toCanvas(p.x * 0.56, p.y * 0.56);
        const rot = Math.atan2(p.x, p.y);
        drawNumeral(ctx, String(vertexValues![vi]), x, y, rot, fr.height * pxPerUnit, fr.maxWidth * pxPerUnit, false);
      });
    } else {
      const [x, y] = toCanvas(fr.anchor.x, fr.anchor.y);
      const lab = faces[fi].label;
      drawNumeral(
        ctx,
        lab,
        x,
        y,
        0,
        fr.height * pxPerUnit,
        fr.maxWidth * pxPerUnit,
        hasAmbiguous && (lab === '6' || lab === '9'),
      );
    }
  });

  // Mesh: flat faces (textured), cylindrical edges and spherical corners (smooth).
  const body: Buf = { pos: [], nor: [], uv: [] };
  const inlay: Buf = { pos: [], nor: [], uv: [] };
  const seg = kind === 'd6' ? 5 : 4;

  faces.forEach((f, fi) => {
    const n = f.normal;
    const fr = frames[fi];
    const pts = f.verts.map((i) => core[i].clone().addScaledVector(n, r));
    const uvs = pts.map((p) => {
      const d = p.clone().sub(fr.center);
      return cellUV(fi, d.dot(fr.right), d.dot(fr.up));
    });
    for (let t = 1; t < pts.length - 1; t++) {
      pushTri(body, pts[0], pts[t], pts[t + 1], n, n, n, uvs[0], uvs[t], uvs[t + 1]);
      pushTri(inlay, pts[0], pts[t], pts[t + 1], n, n, n, uvs[0], uvs[t], uvs[t + 1]);
    }
  });

  const edges = new Map<string, { a: number; b: number; f: number[] }>();
  faces.forEach((f, fi) =>
    f.verts.forEach((a, j) => {
      const b = f.verts[(j + 1) % f.verts.length];
      const key = a < b ? `${a}_${b}` : `${b}_${a}`;
      const e = edges.get(key) ?? { a: Math.min(a, b), b: Math.max(a, b), f: [] };
      e.f.push(fi);
      edges.set(key, e);
    }),
  );
  for (const e of edges.values()) {
    if (e.f.length !== 2) continue;
    const n1 = faces[e.f[0]].normal;
    const n2 = faces[e.f[1]].normal;
    const A = core[e.a];
    const B = core[e.b];
    for (let s = 0; s < seg; s++) {
      const m0 = nlerp(n1, n2, s / seg);
      const m1 = nlerp(n1, n2, (s + 1) / seg);
      const a0 = A.clone().addScaledVector(m0, r);
      const b0 = B.clone().addScaledVector(m0, r);
      const a1 = A.clone().addScaledVector(m1, r);
      const b1 = B.clone().addScaledVector(m1, r);
      pushTri(body, a0, b0, b1, m0, m0, m1, EMPTY, EMPTY, EMPTY);
      pushTri(body, a0, b1, a1, m0, m1, m1, EMPTY, EMPTY, EMPTY);
    }
  }

  core.forEach((c, vi) => {
    const adj = faces.map((f, fi) => (f.verts.includes(vi) ? fi : -1)).filter((x) => x >= 0);
    const axis = new THREE.Vector3();
    adj.forEach((fi) => axis.add(faces[fi].normal));
    axis.normalize();
    const u = faces[adj[0]].normal.clone().addScaledVector(axis, -faces[adj[0]].normal.dot(axis)).normalize();
    const w = axis.clone().cross(u);
    const ang = (fi: number) => Math.atan2(faces[fi].normal.dot(w), faces[fi].normal.dot(u));
    adj.sort((p, q) => ang(p) - ang(q));
    const L = seg;
    for (let s = 0; s < adj.length; s++) {
      const Bn = faces[adj[s]].normal;
      const Cn = faces[adj[(s + 1) % adj.length]].normal;
      const P = (i: number, j: number) =>
        axis
          .clone()
          .multiplyScalar(1 - i / L)
          .addScaledVector(Bn, (i - j) / L)
          .addScaledVector(Cn, j / L)
          .normalize();
      for (let i = 0; i < L; i++) {
        for (let j = 0; j <= i; j++) {
          const p0 = P(i, j);
          const p1 = P(i + 1, j);
          const p2 = P(i + 1, j + 1);
          pushTri(
            body,
            c.clone().addScaledVector(p0, r),
            c.clone().addScaledVector(p1, r),
            c.clone().addScaledVector(p2, r),
            p0,
            p1,
            p2,
            EMPTY,
            EMPTY,
            EMPTY,
          );
          if (j < i) {
            const p3 = P(i, j + 1);
            pushTri(
              body,
              c.clone().addScaledVector(p0, r),
              c.clone().addScaledVector(p2, r),
              c.clone().addScaledVector(p3, r),
              p0,
              p2,
              p3,
              EMPTY,
              EMPTY,
              EMPTY,
            );
          }
        }
      }
    }
  });

  return {
    kind,
    vertices: verts,
    faces,
    vertexValues,
    radius,
    volume,
    inertia,
    body: toGeometry(body),
    inlay: toGeometry(inlay),
    atlas,
  };
}

const _q = new THREE.Quaternion();
const _up = new THREE.Vector3();
const _vd = new THREE.Vector3();

/**
 * Read a die as a person would: the face whose outward normal points most nearly
 * upward (for a d4, the vertex pointing up). `flatness` is the cosine between that
 * face normal and vertical — 1 for a die lying perfectly flat.
 */
export function readDie(def: DieDef, quat: THREE.Quaternion): { value: number; label: string; flatness: number } {
  _q.copy(quat).invert();
  _up.set(0, 1, 0).applyQuaternion(_q);
  if (def.kind === 'd4') {
    let best = 0;
    let bestDot = -Infinity;
    def.vertices.forEach((p, i) => {
      const d = _vd.copy(p).normalize().dot(_up);
      if (d > bestDot) {
        bestDot = d;
        best = i;
      }
    });
    let minDot = Infinity;
    def.faces.forEach((f) => (minDot = Math.min(minDot, f.normal.dot(_up))));
    const value = def.vertexValues![best];
    return { value, label: String(value), flatness: -minDot };
  }
  let best = 0;
  let bestDot = -Infinity;
  def.faces.forEach((f, i) => {
    const d = f.normal.dot(_up);
    if (d > bestDot) {
      bestDot = d;
      best = i;
    }
  });
  return { value: def.faces[best].value, label: def.faces[best].label, flatness: bestDot };
}

const cache = new Map<DieKind, DieDef>();
export function getDie(kind: DieKind): DieDef {
  let d = cache.get(kind);
  if (!d) {
    d = buildDie(kind);
    cache.set(kind, d);
  }
  return d;
}

export const DIE_SIDES: Record<DieKind, number> = {
  d4: 4,
  d6: 6,
  d8: 8,
  d10: 10,
  d12: 12,
  d20: 20,
  d100: 100,
};
