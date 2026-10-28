import * as THREE from 'three';

/** Procedural canvas textures for the study: woods, felt, leather, parchment, sigils. */

type Ctx = CanvasRenderingContext2D;

function canvas(w: number, h: number): [HTMLCanvasElement, Ctx] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

const R = Math.random;

function toTexture(c: HTMLCanvasElement, srgb = true, repeat = false): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (repeat) {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
  }
  t.anisotropy = 8;
  return t;
}

function grain(ctx: Ctx, w: number, h: number, amount: number) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (R() - 0.5) * amount;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

/* ───────────── wood ───────────── */

function woodGrain(ctx: Ctx, x0: number, y0: number, w: number, h: number, base: [number, number, number], lines = 520) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, y0, w, h);
  ctx.clip();
  const [r, g, b] = base;
  const grd = ctx.createLinearGradient(x0, y0, x0, y0 + h);
  grd.addColorStop(0, `rgb(${r * 0.9},${g * 0.9},${b * 0.9})`);
  grd.addColorStop(0.5, `rgb(${r},${g},${b})`);
  grd.addColorStop(1, `rgb(${r * 0.85},${g * 0.85},${b * 0.85})`);
  ctx.fillStyle = grd;
  ctx.fillRect(x0, y0, w, h);
  // broad figure bands
  for (let i = 0; i < 14; i++) {
    const y = y0 + R() * h;
    const bh = 8 + R() * h * 0.12;
    ctx.fillStyle = R() < 0.5 ? `rgba(10,4,2,${0.05 + R() * 0.12})` : `rgba(120,70,40,${0.04 + R() * 0.07})`;
    ctx.beginPath();
    ctx.moveTo(x0, y);
    const ph = R() * 10;
    for (let x = 0; x <= w; x += 16) ctx.lineTo(x0 + x, y + Math.sin(x * 0.004 + ph) * bh * 0.6);
    for (let x = w; x >= 0; x -= 16) ctx.lineTo(x0 + x, y + bh + Math.sin(x * 0.0045 + ph + 1) * bh * 0.6);
    ctx.closePath();
    ctx.fill();
  }
  // fine grain lines
  for (let i = 0; i < lines; i++) {
    const y = y0 + R() * h;
    const amp = 1 + R() * 6;
    const f1 = 0.002 + R() * 0.006;
    const f2 = 0.01 + R() * 0.02;
    const ph = R() * 100;
    const dark = R() < 0.72;
    ctx.strokeStyle = dark ? `rgba(12,5,2,${0.05 + R() * 0.2})` : `rgba(170,110,70,${0.03 + R() * 0.08})`;
    ctx.lineWidth = 0.4 + R() * (dark ? 2.2 : 1.2);
    ctx.beginPath();
    for (let x = -10; x <= w + 10; x += 8) {
      const yy = y + Math.sin(x * f1 + ph) * amp * 3 + Math.sin(x * f2 + ph * 2) * amp * 0.4;
      if (x === -10) ctx.moveTo(x0 + x, yy);
      else ctx.lineTo(x0 + x, yy);
    }
    ctx.stroke();
  }
  // pores
  for (let i = 0; i < w * h * 0.004; i++) {
    ctx.fillStyle = `rgba(0,0,0,${0.1 + R() * 0.25})`;
    ctx.fillRect(x0 + R() * w, y0 + R() * h, 1 + R() * 5, 0.8 + R() * 0.8);
  }
  ctx.restore();
}

export function walnutTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas(1024, 1024);
  woodGrain(ctx, 0, 0, 1024, 1024, [74, 44, 26], 700);
  grain(ctx, 1024, 1024, 10);
  return toTexture(c, true, true);
}

export function deskTexture(): THREE.CanvasTexture {
  const S = 2048;
  const [c, ctx] = canvas(S, S);
  const planks = 6;
  const ph = S / planks;
  for (let i = 0; i < planks; i++) {
    const k = 0.8 + R() * 0.3;
    woodGrain(ctx, 0, i * ph, S, ph, [44 * k, 26 * k, 16 * k], 260);
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.fillRect(0, i * ph, S, 3);
    ctx.fillStyle = 'rgba(160,110,70,0.08)';
    ctx.fillRect(0, i * ph + 3, S, 2);
    // butt joints
    const jx = R() * S;
    ctx.fillStyle = 'rgba(0,0,0,0.8)';
    ctx.fillRect(jx, i * ph, 3, ph);
  }
  grain(ctx, S, S, 8);
  return toTexture(c, true, true);
}

/* ───────────── felt ───────────── */

export function feltTexture(): { map: THREE.CanvasTexture; bump: THREE.CanvasTexture } {
  const S = 1024;
  const [c, ctx] = canvas(S, S);
  ctx.fillStyle = 'rgb(214,214,214)';
  ctx.fillRect(0, 0, S, S);
  // mottling
  for (let i = 0; i < 260; i++) {
    const x = R() * S;
    const y = R() * S;
    const r = 30 + R() * 160;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const light = R() < 0.5;
    g.addColorStop(0, light ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.08)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
      ctx.save();
      ctx.translate(ox, oy);
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
      ctx.restore();
    }
  }
  // fibres
  for (let i = 0; i < 26000; i++) {
    const x = R() * S;
    const y = R() * S;
    const a = R() * Math.PI * 2;
    const l = 2 + R() * 7;
    ctx.strokeStyle = R() < 0.5 ? `rgba(255,255,255,${0.04 + R() * 0.08})` : `rgba(0,0,0,${0.04 + R() * 0.1})`;
    ctx.lineWidth = 0.6 + R() * 0.6;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    ctx.stroke();
  }
  grain(ctx, S, S, 26);
  const map = toTexture(c, true, true);
  const [bc, bctx] = canvas(S, S);
  bctx.drawImage(c, 0, 0);
  const bump = toTexture(bc, false, true);
  return { map, bump };
}

/* ───────────── sigil printed on the felt ───────────── */

export function sigilTexture(): THREE.CanvasTexture {
  const S = 2048;
  const [c, ctx] = canvas(S, S);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, S, S);
  ctx.translate(S / 2, S / 2);
  ctx.strokeStyle = '#fff';
  ctx.fillStyle = '#fff';
  const ring = (r: number, w: number) => {
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
  };
  const U = S / 2;
  ring(U * 0.97, 6);
  ring(U * 0.945, 2.5);
  // degree ticks
  for (let i = 0; i < 360; i += 2) {
    const a = (i * Math.PI) / 180;
    const long = i % 30 === 0;
    const mid = i % 10 === 0;
    const r1 = U * 0.945;
    const r2 = U * (long ? 0.895 : mid ? 0.915 : 0.93);
    ctx.lineWidth = long ? 4 : 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r1, Math.sin(a) * r1);
    ctx.lineTo(Math.cos(a) * r2, Math.sin(a) * r2);
    ctx.stroke();
  }
  ring(U * 0.885, 2.5);
  // inscription
  const text = 'ALEA IACTA EST ✦ FORTUNA AUDACES IUVAT ✦ SORS OMNIA VERSAT ✦ NIHIL CERTUM ✦ ';
  ctx.font = `600 ${U * 0.062}px "Cinzel", serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const chars = [...text];
  const rr = U * 0.825;
  chars.forEach((ch, i) => {
    const a = (i / chars.length) * Math.PI * 2 - Math.PI / 2;
    ctx.save();
    ctx.rotate(a + Math.PI / 2);
    ctx.fillText(ch, 0, -rr);
    ctx.restore();
  });
  ring(U * 0.765, 4);
  ring(U * 0.745, 2);
  // zodiac
  const zodiac = ['♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓'];
  ctx.font = `${U * 0.07}px "Segoe UI Symbol", "Noto Sans Symbols", "Apple Symbols", serif`;
  zodiac.forEach((z, i) => {
    const a = (i / 12) * Math.PI * 2 - Math.PI / 2 + Math.PI / 12;
    const x = Math.cos(a) * U * 0.665;
    const y = Math.sin(a) * U * 0.665;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, U * 0.058, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillText(z, x, y + U * 0.004);
    const b = (i / 12) * Math.PI * 2 - Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(b) * U * 0.745, Math.sin(b) * U * 0.745);
    ctx.lineTo(Math.cos(b) * U * 0.585, Math.sin(b) * U * 0.585);
    ctx.stroke();
  });
  ring(U * 0.585, 3);
  // heptagram {7/3}
  const pts: [number, number][] = [];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 - Math.PI / 2;
    pts.push([Math.cos(a) * U * 0.56, Math.sin(a) * U * 0.56]);
  }
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  for (let i = 0; i <= 7; i++) {
    const p = pts[(i * 3) % 7];
    if (i === 0) ctx.moveTo(p[0], p[1]);
    else ctx.lineTo(p[0], p[1]);
  }
  ctx.stroke();
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  for (let i = 0; i <= 7; i++) {
    const p = pts[(i * 2) % 7];
    if (i === 0) ctx.moveTo(p[0] * 0.92, p[1] * 0.92);
    else ctx.lineTo(p[0] * 0.92, p[1] * 0.92);
  }
  ctx.stroke();
  const planets = ['☉', '☽', '☿', '♀', '♂', '♃', '♄'];
  ctx.font = `${U * 0.06}px "Segoe UI Symbol", "Noto Sans Symbols", "Apple Symbols", serif`;
  pts.forEach((p, i) => {
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(p[0], p[1], U * 0.052, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(p[0], p[1], U * 0.052, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillText(planets[i], p[0], p[1] + U * 0.004);
  });
  ring(U * 0.24, 3);
  ring(U * 0.225, 1.5);
  // central sun
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * Math.PI * 2;
    const long = i % 2 === 0;
    ctx.lineWidth = long ? 3 : 1.5;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * U * 0.09, Math.sin(a) * U * 0.09);
    ctx.lineTo(Math.cos(a) * U * (long ? 0.2 : 0.16), Math.sin(a) * U * (long ? 0.2 : 0.16));
    ctx.stroke();
  }
  ring(U * 0.085, 3);
  ring(U * 0.03, 8);
  // wear: knock back alpha irregularly
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'multiply';
  for (let i = 0; i < 900; i++) {
    const x = R() * S;
    const y = R() * S;
    const r = 4 + R() * 60;
    const v = Math.floor(120 + R() * 135);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgb(${v},${v},${v})`);
    g.addColorStop(1, 'rgb(255,255,255)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  ctx.globalCompositeOperation = 'source-over';
  const t = toTexture(c, false);
  return t;
}

/* ───────────── leather ───────────── */

function leatherBase(ctx: Ctx, w: number, h: number, base: [number, number, number]) {
  ctx.fillStyle = `rgb(${base.join(',')})`;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 160; i++) {
    const x = R() * w;
    const y = R() * h;
    const r = 20 + R() * Math.max(w, h) * 0.12;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const light = R() < 0.4;
    g.addColorStop(0, light ? 'rgba(255,230,200,0.05)' : 'rgba(0,0,0,0.12)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // creases
  for (let i = 0; i < 90; i++) {
    let x = R() * w;
    let y = R() * h;
    ctx.strokeStyle = R() < 0.6 ? 'rgba(0,0,0,0.18)' : 'rgba(255,230,200,0.06)';
    ctx.lineWidth = 0.6 + R();
    ctx.beginPath();
    ctx.moveTo(x, y);
    let a = R() * Math.PI * 2;
    for (let s = 0; s < 8; s++) {
      a += (R() - 0.5) * 1.2;
      x += Math.cos(a) * 9;
      y += Math.sin(a) * 9;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // pores
  for (let i = 0; i < w * h * 0.01; i++) {
    ctx.fillStyle = `rgba(0,0,0,${0.15 + R() * 0.25})`;
    ctx.beginPath();
    ctx.arc(R() * w, R() * h, 0.5 + R() * 1.2, 0, Math.PI * 2);
    ctx.fill();
  }
  grain(ctx, w, h, 14);
}

function goldLine(ctx: Ctx, x: number, y: number, w: number, h: number, lw: number) {
  ctx.strokeStyle = 'rgba(214,170,86,0.9)';
  ctx.lineWidth = lw;
  ctx.strokeRect(x, y, w, h);
}

function fleuron(ctx: Ctx, x: number, y: number, s: number, rot: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.fillStyle = 'rgba(214,170,86,0.9)';
  ctx.strokeStyle = 'rgba(214,170,86,0.9)';
  ctx.lineWidth = s * 0.06;
  for (let i = 0; i < 4; i++) {
    ctx.rotate(Math.PI / 2);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(s * 0.25, -s * 0.15, s * 0.45, -s * 0.05, s * 0.5, 0);
    ctx.bezierCurveTo(s * 0.45, s * 0.05, s * 0.25, s * 0.15, 0, 0);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(s * 0.62, 0, s * 0.06, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(0, 0, s * 0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function blotterTexture(aspect: number): THREE.CanvasTexture {
  const W = 2048;
  const H = Math.round(W / aspect);
  const [c, ctx] = canvas(W, H);
  leatherBase(ctx, W, H, [22, 40, 30]);
  const m = W * 0.035;
  goldLine(ctx, m, m, W - 2 * m, H - 2 * m, 5);
  goldLine(ctx, m + 14, m + 14, W - 2 * m - 28, H - 2 * m - 28, 2);
  const s = W * 0.05;
  fleuron(ctx, m + 7, m + 7, s, 0);
  fleuron(ctx, W - m - 7, m + 7, s, 0);
  fleuron(ctx, m + 7, H - m - 7, s, 0);
  fleuron(ctx, W - m - 7, H - m - 7, s, 0);
  // dotted roll
  ctx.fillStyle = 'rgba(214,170,86,0.75)';
  const inset = m + 30;
  for (let x = inset; x < W - inset; x += 14) {
    ctx.beginPath();
    ctx.arc(x, inset, 2.2, 0, Math.PI * 2);
    ctx.arc(x, H - inset, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let y = inset; y < H - inset; y += 14) {
    ctx.beginPath();
    ctx.arc(inset, y, 2.2, 0, Math.PI * 2);
    ctx.arc(W - inset, y, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
  return toTexture(c);
}

export function leatherTexture(base: [number, number, number], size = 512): THREE.CanvasTexture {
  const [c, ctx] = canvas(size, size);
  leatherBase(ctx, size, size, base);
  return toTexture(c, true, true);
}

export function bookCoverTexture(base: [number, number, number]): THREE.CanvasTexture {
  const W = 768;
  const H = 1024;
  const [c, ctx] = canvas(W, H);
  leatherBase(ctx, W, H, base);
  goldLine(ctx, 40, 40, W - 80, H - 80, 5);
  goldLine(ctx, 56, 56, W - 112, H - 112, 2);
  fleuron(ctx, W / 2, H / 2, 160, 0);
  ctx.strokeStyle = 'rgba(214,170,86,0.85)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.ellipse(W / 2, H / 2, 150, 210, 0, 0, Math.PI * 2);
  ctx.stroke();
  for (const [x, y] of [[56, 56], [W - 56, 56], [56, H - 56], [W - 56, H - 56]] as const) fleuron(ctx, x, y, 70, Math.PI / 4);
  return toTexture(c);
}

export function bookSpineTexture(base: [number, number, number], title: string): THREE.CanvasTexture {
  const W = 1024;
  const H = 192;
  const [c, ctx] = canvas(W, H);
  leatherBase(ctx, W, H, base);
  ctx.fillStyle = 'rgba(214,170,86,0.9)';
  for (const x of [90, 130, W - 130, W - 90]) {
    ctx.fillRect(x, 0, 6, H);
  }
  // raised bands
  for (const x of [250, 420, 600, 780]) {
    const g = ctx.createLinearGradient(x - 14, 0, x + 14, 0);
    g.addColorStop(0, 'rgba(0,0,0,0.4)');
    g.addColorStop(0.5, 'rgba(255,220,180,0.12)');
    g.addColorStop(1, 'rgba(0,0,0,0.4)');
    ctx.fillStyle = g;
    ctx.fillRect(x - 14, 0, 28, H);
    ctx.fillStyle = 'rgba(214,170,86,0.8)';
    ctx.fillRect(x - 16, 0, 2, H);
    ctx.fillRect(x + 14, 0, 2, H);
  }
  ctx.fillStyle = 'rgba(226,184,98,0.95)';
  ctx.font = '600 64px "Cinzel", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(title, 335, H / 2 + 4);
  ctx.font = '600 40px "Cinzel", serif';
  ctx.fillText('✦', 510, H / 2);
  ctx.fillText('✦', 690, H / 2);
  return toTexture(c);
}

export function pageEdgeTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas(512, 128);
  ctx.fillStyle = '#d9c9a2';
  ctx.fillRect(0, 0, 512, 128);
  for (let y = 0; y < 128; y += 1.5) {
    ctx.fillStyle = `rgba(90,60,30,${0.05 + R() * 0.15})`;
    ctx.fillRect(0, y, 512, 0.7);
  }
  const g = ctx.createLinearGradient(0, 0, 512, 0);
  g.addColorStop(0, 'rgba(80,50,20,0.35)');
  g.addColorStop(0.15, 'rgba(0,0,0,0)');
  g.addColorStop(0.85, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(80,50,20,0.35)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 128);
  return toTexture(c);
}

/* ───────────── parchment ───────────── */

const LATIN = [
  'De aleatoribus et sortibus, liber tertius.',
  'Qui iacit, fatum non regit; tantum spectat.',
  'Sex facies habet cubus, viginti icosaedrum,',
  'et omnes aequaliter cadunt, si aequales sunt.',
  'Nota bene: plumbum in alea est fraus antiqua.',
  'Probabilitas est mensura ignorantiae nostrae.',
  'Si centum iacis, centum fata vides.',
  'Momentum, impetus, frictio — tres domini.',
  'Hic finitur capitulum de casu et necessitate.',
];

export function parchmentTexture(): THREE.CanvasTexture {
  const W = 1024;
  const H = 1360;
  const [c, ctx] = canvas(W, H);
  ctx.fillStyle = '#d6c091';
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 70; i++) {
    const x = R() * W;
    const y = R() * H;
    const r = 30 + R() * 220;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${120 + R() * 40},${80 + R() * 30},${30},${0.04 + R() * 0.1})`);
    g.addColorStop(0.7, `rgba(110,70,30,${R() * 0.05})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // ink text
  ctx.fillStyle = 'rgba(48,26,12,0.82)';
  ctx.font = 'italic 46px "IM Fell English", "Cormorant Garamond", serif';
  ctx.fillText('Tractatus de Alea', 90, 150);
  ctx.strokeStyle = 'rgba(48,26,12,0.6)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(90, 175);
  ctx.bezierCurveTo(300, 165, 500, 190, 760, 172);
  ctx.stroke();
  ctx.font = 'italic 31px "IM Fell English", "Cormorant Garamond", serif';
  let y = 250;
  for (let p = 0; p < 2; p++) {
    for (const line of LATIN) {
      ctx.fillStyle = `rgba(48,26,12,${0.55 + R() * 0.3})`;
      ctx.fillText(line, 90 + R() * 8, y);
      y += 46;
      if (y > 760 && p === 0) break;
    }
    y += 20;
    if (p === 0) {
      // a diagram of an icosahedron net, half finished
      ctx.save();
      ctx.translate(560, 1010);
      ctx.strokeStyle = 'rgba(48,26,12,0.7)';
      ctx.lineWidth = 2;
      const s = 70;
      for (let i = 0; i < 5; i++) {
        const x = i * s - 2 * s;
        ctx.beginPath();
        ctx.moveTo(x - s / 2, 0);
        ctx.lineTo(x, -s * 0.866);
        ctx.lineTo(x + s / 2, 0);
        ctx.closePath();
        ctx.moveTo(x - s / 2, 0);
        ctx.lineTo(x + s / 2, 0);
        ctx.lineTo(x, s * 0.866);
        ctx.closePath();
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(-s * 3.6, -s * 0.2, s * 0.9, 0, Math.PI * 2);
      ctx.stroke();
      ctx.font = 'italic 26px "IM Fell English", serif';
      ctx.fillStyle = 'rgba(48,26,12,0.75)';
      ctx.fillText('fig. XX', -s * 4.3, s * 1.5);
      ctx.restore();
      y = 1150;
    }
  }
  // edge burn
  const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.72);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(0.8, 'rgba(90,50,15,0.35)');
  g.addColorStop(1, 'rgba(40,18,4,0.9)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  grain(ctx, W, H, 18);
  return toTexture(c);
}

/* ───────────── small helpers ───────────── */

export function glowTexture(inner = 'rgba(255,255,255,1)', mid = 'rgba(255,200,120,0.35)'): THREE.CanvasTexture {
  const [c, ctx] = canvas(128, 128);
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, inner);
  g.addColorStop(0.25, mid);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return toTexture(c);
}

export function waxTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas(64, 256);
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, 'rgb(255,190,120)');
  g.addColorStop(0.12, 'rgb(150,80,30)');
  g.addColorStop(0.4, 'rgb(30,14,6)');
  g.addColorStop(1, 'rgb(0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 256);
  return toTexture(c);
}
