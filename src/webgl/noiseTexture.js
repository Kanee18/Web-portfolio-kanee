import * as THREE from 'three';

/**
 * A tileable 64³ periodic Perlin-noise volume (R8, trilinear, repeat).
 * Sampling it costs one texture fetch per octave — far cheaper (to run and to
 * compile) than analytic simplex noise for full-screen passes like the sky.
 * In GLSL:  tnoise(p) ≈ snoise(p)  (8 lattice cells per tile, see Sky.js).
 */
export function createNoiseVolume(size = 64, cells = 8, seed = 7) {
  let s = seed;
  const rand = () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
  const n = cells;
  const grads = new Float32Array(n * n * n * 3);
  for (let i = 0; i < n * n * n; i++) {
    const z = rand() * 2 - 1;
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(1 - z * z);
    grads[i * 3] = Math.cos(a) * r;
    grads[i * 3 + 1] = Math.sin(a) * r;
    grads[i * 3 + 2] = z;
  }
  const gi = (x, y, z) => ((((x % n) + n) % n) + (((y % n) + n) % n) * n + (((z % n) + n) % n) * n * n) * 3;
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const lerp = (a, b, t) => a + (b - a) * t;
  const dot = (i, x, y, z) => grads[i] * x + grads[i + 1] * y + grads[i + 2] * z;

  const data = new Uint8Array(size * size * size);
  const k = n / size;
  let p = 0;
  for (let zi = 0; zi < size; zi++) {
    for (let yi = 0; yi < size; yi++) {
      for (let xi = 0; xi < size; xi++) {
        const x = xi * k;
        const y = yi * k;
        const z = zi * k;
        const X = Math.floor(x);
        const Y = Math.floor(y);
        const Z = Math.floor(z);
        const fx = x - X;
        const fy = y - Y;
        const fz = z - Z;
        const u = fade(fx);
        const v = fade(fy);
        const w = fade(fz);
        const n000 = dot(gi(X, Y, Z), fx, fy, fz);
        const n100 = dot(gi(X + 1, Y, Z), fx - 1, fy, fz);
        const n010 = dot(gi(X, Y + 1, Z), fx, fy - 1, fz);
        const n110 = dot(gi(X + 1, Y + 1, Z), fx - 1, fy - 1, fz);
        const n001 = dot(gi(X, Y, Z + 1), fx, fy, fz - 1);
        const n101 = dot(gi(X + 1, Y, Z + 1), fx - 1, fy, fz - 1);
        const n011 = dot(gi(X, Y + 1, Z + 1), fx, fy - 1, fz - 1);
        const n111 = dot(gi(X + 1, Y + 1, Z + 1), fx - 1, fy - 1, fz - 1);
        const val = lerp(lerp(lerp(n000, n100, u), lerp(n010, n110, u), v), lerp(lerp(n001, n101, u), lerp(n011, n111, u), v), w);
        data[p++] = Math.max(0, Math.min(255, Math.round((val * 0.62 + 0.5) * 255)));
      }
    }
  }
  const tex = new THREE.Data3DTexture(data, size, size, size);
  tex.format = THREE.RedFormat;
  tex.type = THREE.UnsignedByteType;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = tex.wrapR = THREE.RepeatWrapping;
  tex.unpackAlignment = 1;
  tex.needsUpdate = true;
  return tex;
}
