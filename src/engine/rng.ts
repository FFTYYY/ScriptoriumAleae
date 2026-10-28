/**
 * Cryptographically sourced randomness. Every random quantity used to throw a die
 * (spawn point, orientation, velocity, spin) comes from here. Nothing ever decides
 * the face that lands up — that is left entirely to the physics.
 */
const POOL = new Uint32Array(256);
let cursor = POOL.length;

export function rand(): number {
  if (cursor >= POOL.length) {
    crypto.getRandomValues(POOL);
    cursor = 0;
  }
  return POOL[cursor++] / 4294967296;
}

export function randRange(a: number, b: number): number {
  return a + (b - a) * rand();
}

export function randInt(n: number): number {
  return Math.floor(rand() * n);
}

export function randSign(): number {
  return rand() < 0.5 ? -1 : 1;
}

/** Uniformly distributed unit vector on the sphere. */
export function randUnitVector(): [number, number, number] {
  const z = rand() * 2 - 1;
  const t = rand() * Math.PI * 2;
  const r = Math.sqrt(1 - z * z);
  return [r * Math.cos(t), r * Math.sin(t), z];
}

/** Uniformly distributed rotation (Shoemake 1992). Returns [x, y, z, w]. */
export function randQuaternion(): [number, number, number, number] {
  const u1 = rand();
  const u2 = rand();
  const u3 = rand();
  const a = Math.sqrt(1 - u1);
  const b = Math.sqrt(u1);
  return [
    a * Math.sin(2 * Math.PI * u2),
    a * Math.cos(2 * Math.PI * u2),
    b * Math.sin(2 * Math.PI * u3),
    b * Math.cos(2 * Math.PI * u3),
  ];
}

export function pick<T>(arr: readonly T[]): T {
  return arr[randInt(arr.length)];
}
