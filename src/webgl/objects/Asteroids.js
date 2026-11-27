import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * ASTEROID BELT — realistic edition
 * ─────────────────────────────────
 * Geometry: subdivided icosahedra displaced on the CPU by multi-octave noise,
 * ridges and crater fields (bowls + raised rims), with per-vertex ambient
 * occlusion baked from concavity. Hero rocks (near the flight path) get
 * ~20k triangles, field rocks ~5k.
 *
 * Shading (GPU, instanced): dark regolith albedo with mottling and fresh bright
 * ejecta, Lommel–Seeliger + Lambert reflectance (the flat, dusty look of real
 * airless bodies), micro relief from a 3D noise volume, a warm rim light from
 * the black hole's accretion disk, cool nebula fill, and distance haze so far
 * rocks melt into the background instead of ending at a hard edge.
 *
 * Motion (all in the vertex shader): every rock falls in from above or the
 * sides — accelerating like it is under gravity, then captured softly into the
 * belt — tumbling faster while it falls. Driven by `state.enter` (scroll), so it
 * reverses perfectly when you scroll back up. The whole belt slowly orbits.
 */

/* ── tiny seeded noise for CPU displacement ───────────────────────────── */
function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function makePerlin(seed) {
  const rand = mulberry32(seed);
  const perm = new Uint8Array(512);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const grad = [
    [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0], [1, 0, 1], [-1, 0, 1],
    [1, 0, -1], [-1, 0, -1], [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1],
  ];
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const lerp = (a, b, t) => a + (b - a) * t;
  const dot = (h, x, y, z) => {
    const g = grad[h % 12];
    return g[0] * x + g[1] * y + g[2] * z;
  };
  return (x, y, z) => {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255;
    x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
    const u = fade(x), v = fade(y), w = fade(z);
    const A = perm[X] + Y, AA = perm[A] + Z, AB = perm[A + 1] + Z;
    const B = perm[X + 1] + Y, BA = perm[B] + Z, BB = perm[B + 1] + Z;
    return lerp(
      lerp(lerp(dot(perm[AA], x, y, z), dot(perm[BA], x - 1, y, z), u), lerp(dot(perm[AB], x, y - 1, z), dot(perm[BB], x - 1, y - 1, z), u), v),
      lerp(lerp(dot(perm[AA + 1], x, y, z - 1), dot(perm[BA + 1], x - 1, y, z - 1), u), lerp(dot(perm[AB + 1], x, y - 1, z - 1), dot(perm[BB + 1], x - 1, y - 1, z - 1), u), v),
      w
    );
  };
}

/* ── rock geometry ─────────────────────────────────────────────────────── */
function rockGeometry(seed, detail) {
  let g = new THREE.IcosahedronGeometry(1, detail);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g);
  const noise = makePerlin(seed);
  const rand = mulberry32(seed * 977 + 13);
  const fbm = (x, y, z, oct) => {
    let s = 0, a = 0.5, f = 1, n = 0;
    for (let o = 0; o < oct; o++) {
      s += a * noise(x * f, y * f, z * f);
      n += a;
      a *= 0.5;
      f *= 2.03;
    }
    return s / n;
  };
  // crater set: angular radius, depth
  const craters = [];
  const nC = 9 + Math.floor(rand() * 12);
  for (let k = 0; k < nC; k++) {
    const z = rand() * 2 - 1;
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(1 - z * z);
    const rad = 0.1 + Math.pow(rand(), 2.2) * 0.42;
    craters.push([Math.cos(a) * r, Math.sin(a) * r, z, rad, rad * (0.22 + rand() * 0.25)]);
  }
  const pos = g.attributes.position;
  const ao = new Float32Array(pos.count);
  const v = new THREE.Vector3();
  const lumpScale = 0.9 + rand() * 0.6;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    const low = fbm(v.x * lumpScale + seed, v.y * lumpScale, v.z * lumpScale, 3) * 0.42;
    let h = low;
    h += fbm(v.x * 3.1, v.y * 3.1 + seed, v.z * 3.1, 4) * 0.12;
    h += (1 - Math.abs(noise(v.x * 5.3 + 7, v.y * 5.3, v.z * 5.3 - seed))) ** 3 * 0.05;
    let cav = 0;
    for (const [cx, cy, cz, cr, cd] of craters) {
      const ang = Math.acos(Math.min(1, Math.max(-1, v.x * cx + v.y * cy + v.z * cz)));
      const t = ang / cr;
      if (t < 1) {
        const bowl = -cd * (1 - t * t);
        h += bowl;
        cav += -bowl;
      } else if (t < 1.8) {
        h += cd * 0.32 * Math.exp(-(((t - 1) / 0.25) ** 2));
      }
    }
    const rad = 1 + h;
    pos.setXYZ(i, v.x * rad, v.y * rad, v.z * rad);
    // concavity relative to the smooth lumps → baked occlusion
    ao[i] = Math.min(1, Math.max(0.3, 1 - (low - h) * 2.2 - cav * 1.4));
  }
  g.setAttribute('aAO', new THREE.BufferAttribute(ao, 1));
  g.computeVertexNormals();
  return g;
}

/* ── shaders ───────────────────────────────────────────────────────────── */
const vertex = /* glsl */ `
attribute float aAO;
attribute vec4 aBase;   // xyz belt position (relative), w size
attribute vec4 aShape;  // xyz axis scales, w seed
attribute vec4 aSpin;   // xyz tumble axis, w angular speed
attribute vec4 aEntry;  // xyz entry offset, w delay
uniform float uTime;
uniform float uEnter;
uniform vec3 uCenter;
uniform float uBeltSpin;
varying vec3 vObj;
varying vec3 vNormalW;
varying vec3 vPosW;
varying float vAO;
varying float vAlpha;
varying float vSeed;
varying float vSize;

mat3 axisAngle(vec3 a, float t) {
  float s = sin(t), c = cos(t), oc = 1.0 - c;
  return mat3(oc * a.x * a.x + c, oc * a.x * a.y + a.z * s, oc * a.z * a.x - a.y * s,
              oc * a.x * a.y - a.z * s, oc * a.y * a.y + c, oc * a.y * a.z + a.x * s,
              oc * a.z * a.x + a.y * s, oc * a.y * a.z - a.x * s, oc * a.z * a.z + c);
}

void main() {
  float p = clamp((uEnter - aEntry.w) / 0.42, 0.0, 1.0);
  // gravity: starts from rest and accelerates (p^1.6), then a soft capture
  float g = 1.0 - pow(1.0 - pow(p, 1.6), 3.0);
  float drift = 1.0 - pow(1.0 - p, 3.0);
  vec3 base = aBase.xyz;
  float ba = uTime * uBeltSpin * (0.6 + 0.8 * fract(aShape.w * 7.13));
  float cb = cos(ba), sb = sin(ba);
  base.xy = vec2(cb * base.x - sb * base.y, sb * base.x + cb * base.y);
  vec3 pos = base + vec3(aEntry.x * (1.0 - drift), aEntry.y * (1.0 - g), aEntry.z * (1.0 - drift));

  mat3 R = axisAngle(aSpin.xyz, aShape.w * 6.2832 + uTime * aSpin.w * (1.0 + 3.0 * (1.0 - g)));
  vec3 local = position * aShape.xyz * aBase.w;
  vec3 world = uCenter + pos + R * local;

  vNormalW = normalize(R * (normal / aShape.xyz));
  vObj = position;
  vPosW = world;
  vAO = aAO;
  vAlpha = smoothstep(0.0, 0.24, p);
  vSeed = aShape.w;
  vSize = aBase.w;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`;

const fragment = /* glsl */ `
uniform highp sampler3D uNoise;
uniform vec3 uKeyDir;
uniform vec3 uKeyColor;
uniform vec3 uRimPos;
uniform vec3 uRimColor;
uniform float uRimStrength;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform float uExposure;
varying vec3 vObj;
varying vec3 vNormalW;
varying vec3 vPosW;
varying float vAO;
varying float vAlpha;
varying float vSeed;
varying float vSize;

#include <cosmos_bump>

float tn(vec3 p) { return (texture(uNoise, p * 0.125).r - 0.5) * 2.1; }

void main() {
  if (vAlpha < 0.004) discard;
  // micro relief in object space (moves with the rock)
  vec3 q = vObj * 3.4 + vSeed * 17.0;
  float h = tn(q) * 0.55 + tn(q * 2.63) * 0.28 + tn(q * 6.9) * 0.12;
  vec3 N = normalize(vNormalW);
  N = perturbNormalArb(vPosW, N, vec2(dFdx(h), dFdy(h)) * 0.034 * vSize);

  vec3 V = normalize(cameraPosition - vPosW);
  // regolith: charcoal-grey, mottled, with brighter fresh ejecta (like Bennu / Ryugu)
  float m = tn(vObj * 1.7 + vSeed * 9.0);
  vec3 albedo = mix(vec3(0.052, 0.051, 0.05), vec3(0.11, 0.104, 0.097), smoothstep(-0.45, 0.6, m));
  albedo *= 0.82 + 0.36 * fract(vSeed * 3.71);
  albedo *= mix(vec3(1.0), vec3(1.07, 1.0, 0.92), step(0.7, fract(vSeed * 11.3)));
  albedo += vec3(0.05) * smoothstep(0.55, 0.8, h);

  // hard sunlight, no atmosphere: mostly Lambert with a dusty Lommel–Seeliger flattening
  float mu0 = max(dot(N, uKeyDir), 0.0);
  float mu = max(dot(N, V), 0.0);
  float ls = mu0 / (mu0 + mu + 1e-4);
  float diff = mix(mu0, ls * 1.6, 0.35);
  vec3 col = albedo * uKeyColor * diff;

  // warm back/rim light from the accretion disk ahead
  vec3 Lr = normalize(uRimPos - vPosW);
  float rim = pow(1.0 - mu, 3.0) * smoothstep(-0.25, 0.6, dot(N, Lr));
  col += uRimColor * rim * uRimStrength * (0.2 + albedo * 3.0);
  // faint cool fill — shadows stay deep, as they are in space
  col += albedo * vec3(0.022, 0.026, 0.05) * (0.55 + 0.45 * N.y);

  col *= vAO * (0.7 + 0.3 * smoothstep(-0.5, 0.5, h));

  // atmospheric perspective → melt into the deep-space haze, never a hard cut-off
  float dist = length(cameraPosition - vPosW);
  float fog = smoothstep(uFogNear, uFogFar, dist);
  col = mix(col, uFogColor, fog * 0.92);
  float alpha = vAlpha * (1.0 - smoothstep(uFogFar * 0.85, uFogFar * 1.12, dist));
  gl_FragColor = vec4(col * uExposure, alpha);
}
`;

export class Asteroids {
  constructor({ count = 320, heroCount = 18, zStart = -700, zEnd = -1000, noise = null, detail = 1 } = {}) {
    this.group = new THREE.Group();
    this.group.name = 'asteroids';
    this.state = { enter: 0 };
    this.center = new THREE.Vector3(0, 2.6, 0);

    this.uniforms = {
      uTime: { value: 0 },
      uEnter: { value: 0 },
      uCenter: { value: this.center },
      uBeltSpin: { value: 0.012 },
      uNoise: { value: noise },
      uKeyDir: { value: new THREE.Vector3(-0.58, 0.52, 0.42).normalize() },
      uKeyColor: { value: new THREE.Color(3.4, 3.15, 2.85) },
      uRimPos: { value: new THREE.Vector3(0, 0, -1150) },
      uRimColor: { value: new THREE.Color(1.0, 0.56, 0.26) },
      uRimStrength: { value: 0 },
      uFogColor: { value: new THREE.Color(0.012, 0.012, 0.028) },
      uFogNear: { value: 70 },
      uFogFar: { value: 360 },
      uExposure: { value: 1.0 },
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: vertex,
      fragmentShader: fragment,
      transparent: true,
      depthWrite: true,
    });

    const rand = mulberry32(4242);
    // detail: 1 = desktop (5 / 4), 0 = mobile (4 / 3)
    const heroDetail = detail ? 5 : 4;
    const fieldDetail = detail ? 4 : 3;
    const heroGeos = [11, 23, 37].map((s) => rockGeometry(s, heroDetail));
    const fieldGeos = [5, 17, 29, 41].map((s) => rockGeometry(s, fieldDetail));

    const span = zStart - zEnd;
    const makeInstances = (n, near) => {
      const data = { base: [], shape: [], spin: [], entry: [] };
      for (let i = 0; i < n; i++) {
        const z = zStart - rand() * span;
        const ang = rand() * Math.PI * 2;
        const rad = near ? 7 + rand() * 18 : 9 + Math.pow(rand(), 1.3) * 80;
        const size = near ? 1.6 + Math.pow(rand(), 1.4) * 4.2 : 0.16 + Math.pow(rand(), 3.2) * 2.4;
        data.base.push(Math.cos(ang) * rad, Math.sin(ang) * rad * 0.62, z, size);
        data.shape.push(0.85 + rand() * 0.3, 0.62 + rand() * 0.3, 0.6 + rand() * 0.35, rand());
        const ax = new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize();
        data.spin.push(ax.x, ax.y, ax.z, (0.04 + rand() * 0.3) * (near ? 0.6 : 1) * (rand() < 0.5 ? -1 : 1));
        // entry: 65% fall from above, the rest come in from the sides
        const fromSide = rand() < 0.35;
        const sx = rand() < 0.5 ? -1 : 1;
        const ex = fromSide ? sx * (70 + rand() * 90) : (rand() - 0.5) * 50;
        const ey = fromSide ? 18 + rand() * 40 : 80 + rand() * 120;
        const ez = (rand() - 0.5) * 40;
        // rocks nearer the start of the corridor arrive first
        const order = (zStart - z) / span;
        const delay = Math.min(0.56, order * 0.38 + rand() * 0.2 + (near ? 0.04 : 0));
        data.entry.push(ex, ey, ez, delay);
      }
      return data;
    };

    const build = (geos, total, near) => {
      const per = Math.ceil(total / geos.length);
      geos.forEach((geo) => {
        const inst = makeInstances(per, near);
        const ig = new THREE.InstancedBufferGeometry();
        ig.index = geo.index;
        ig.setAttribute('position', geo.attributes.position);
        ig.setAttribute('normal', geo.attributes.normal);
        ig.setAttribute('aAO', geo.attributes.aAO);
        ig.setAttribute('aBase', new THREE.InstancedBufferAttribute(new Float32Array(inst.base), 4));
        ig.setAttribute('aShape', new THREE.InstancedBufferAttribute(new Float32Array(inst.shape), 4));
        ig.setAttribute('aSpin', new THREE.InstancedBufferAttribute(new Float32Array(inst.spin), 4));
        ig.setAttribute('aEntry', new THREE.InstancedBufferAttribute(new Float32Array(inst.entry), 4));
        ig.instanceCount = per;
        const mesh = new THREE.Mesh(ig, this.material);
        mesh.frustumCulled = false;
        mesh.renderOrder = 0; // before the additive stars, so rocks occlude them
        this.group.add(mesh);
      });
    };
    build(heroGeos, heroCount, true);
    build(fieldGeos, count, false);
  }

  update(time, rimStrength = 0) {
    if (!this.group.visible) return;
    this.uniforms.uTime.value = time;
    this.uniforms.uEnter.value = this.state.enter;
    this.uniforms.uRimStrength.value = rimStrength;
  }
}
